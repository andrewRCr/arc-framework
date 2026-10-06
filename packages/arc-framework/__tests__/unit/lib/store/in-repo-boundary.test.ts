/** Source boundaries keep implementation modules private and heavyweight projections lazy. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve("src");
const testRoot = resolve("__tests__");
const REPOSITORY_SCAN_TIMEOUT = 15_000;
async function sourceFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}
function imports(path: string, content: string): { target: string; eager: boolean }[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const found: { target: string; eager: boolean }[] = [];
  const add = (specifier: string, eager: boolean) => {
    if (specifier.startsWith(".")) found.push({ target: resolve(dirname(path), specifier.replace(/\.js$/u, ".ts")), eager });
  };
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause?.namedBindings;
      const typesOnly = clause?.isTypeOnly === true || (clause?.name === undefined && names !== undefined
        && ts.isNamedImports(names) && names.elements.every((entry) => entry.isTypeOnly));
      if (!typesOnly) add(node.moduleSpecifier.text, true);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, true);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] !== undefined
      && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text, false);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return found;
}
async function staticClosure(start: string): Promise<Set<string>> {
  const paths = new Set<string>();
  const pending = [start];
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || paths.has(path)) continue;
    paths.add(path);
    const content = await readFile(path, "utf8");
    pending.push(...imports(path, content).filter((item) => item.eager).map((item) => item.target));
  }
  return paths;
}
describe("repository store import boundaries", () => {
  it("keeps backend implementation imports inside the store and reaches the backend entry only through its factory", async () => {
    const violations: string[] = [];
    for (const path of await sourceFiles(sourceRoot)) {
      for (const item of imports(path, await readFile(path, "utf8"))) {
        if (item.target.includes("/lib/store/in-repo/") && !path.includes("/lib/store/")) violations.push(relative(sourceRoot, path));
        if (item.target.endsWith("/store/in-repo/backend.ts") && path !== join(sourceRoot, "lib/store/create.ts")) violations.push(relative(sourceRoot, path));
      }
    }
    expect(violations).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
  it("keeps tests on the public composition and fixture boundaries", async () => {
    const violations: string[] = [];
    for (const path of await sourceFiles(testRoot)) {
      for (const item of imports(path, await readFile(path, "utf8"))) {
        if (item.target.includes("/lib/store/in-repo/")) violations.push(relative(testRoot, path));
      }
    }
    expect(violations).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
  it("defers every heavy active projection until a kind or operation needs it", async () => {
    const closure = await staticClosure(join(sourceRoot, "lib/store/in-repo/backend.ts"));
    const deferred = ["lib/config/status-reader.ts", "lib/work-unit/submission-boundary-store.ts",
      "lib/work-unit/candidate-record-store.ts", "lib/work-unit/candidate-attestation.ts",
      "lib/work-unit/git-candidate-effective-target.ts", "scripts/review-gate/policy/integration-boundary-locus.ts",
      "scripts/review-gate/policy/candidate-review-fix-continuation.ts", "lib/work-unit/transition-record-store.ts",
      "commands/user/save-load.ts", "commands/user/push-fetch.ts"];
    expect(deferred.filter((path) => closure.has(join(sourceRoot, path)))).toEqual([]);
  });
});
