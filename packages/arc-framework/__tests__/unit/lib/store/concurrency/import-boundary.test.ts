/** Dependency reachability for the pure concurrency library. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../../../../..");
const sourceRoot = join(packageRoot, "src");
const concurrencyRoot = join(sourceRoot, "lib/store/concurrency");

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

function allowed(file: string, specifier: string): boolean {
  if (specifier === "node-diff3") return true;
  if (!specifier.startsWith(".")) return false;
  const target = resolve(dirname(file), specifier);
  return target.startsWith(`${concurrencyRoot}/`)
    || target.startsWith(`${join(sourceRoot, "lib/kernel")}/`)
    || dirname(target) === join(sourceRoot, "lib/store");
}

function imports(source: ts.SourceFile): string[] {
  const result: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined && ts.isStringLiteralLike(node.moduleSpecifier)) {
        result.push(node.moduleSpecifier.text);
      }
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const argument = node.arguments[0];
      result.push(argument !== undefined && ts.isStringLiteralLike(argument) ? argument.text : "<computed import>");
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}

describe("concurrency dependency boundary", () => {
  it("imports only its own modules, kernel, store core, and the line merge dependency", () => {
    const violations = files(concurrencyRoot).flatMap((file) => {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      return imports(source).filter((specifier) => !allowed(file, specifier))
        .map((specifier) => ({ file: relative(sourceRoot, file), specifier }));
    });
    expect(violations).toEqual([]);
  });

  it("keeps the line merge runtime exact and property testing development-only", () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    expect(manifest.dependencies["node-diff3"]).toBe("3.2.1");
    expect(manifest.devDependencies["fast-check"]).toBeDefined();
    expect(manifest.dependencies["fast-check"]).toBeUndefined();
    const dependency = JSON.parse(readFileSync(join(packageRoot, "../../node_modules/node-diff3/package.json"), "utf8"));
    expect(dependency.license).toBe("MIT");
    expect(dependency.dependencies ?? {}).toEqual({});
  });
});
