/** Live import-boundary contract for the activated locus foundation. */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../..");

const foundationModules = [
  "src/lib/locus/derived-lifecycle-evidence.ts",
  "src/lib/locus/derived-reader.ts",
  "src/lib/locus/derived-roster.ts",
  "src/lib/locus/occupancy-marker.ts",
  "src/lib/locus/role-corroboration.ts",
  "src/lib/locus/role-derivation.ts",
  "src/lib/locus/role-topology.ts",
] as const;

interface ModuleReference {
  readonly consumer: string;
  readonly target: string;
  readonly kind: "static" | "dynamic";
}

let sourceReferences: readonly ModuleReference[] | undefined;

describe("activated locus foundation import boundaries", () => {
  it("has no dynamic production reference to a foundation module", () => {
    const dynamic = productionReferences()
      .filter((reference) => reference.kind === "dynamic" && isFoundation(reference.target));
    expect(dynamic).toEqual([]);
  });

  it("keeps the activated reader boundary free of legacy record, lock, and process authority", () => {
    const activated = new Set([
      "src/handlers/derived-locus-state-probe.ts",
      "src/lib/locus/derived-evidence.ts",
      "src/lib/locus/derived-reader.ts",
    ]);
    const forbidden = new Set([
      "src/lib/locus/evidence.ts",
      "src/lib/locus/lock.ts",
      "src/lib/locus/process-inspector.ts",
      "src/lib/locus/reader.ts",
      "src/lib/locus/record-store.ts",
      "src/lib/locus/root.ts",
      "src/lib/locus/roster.ts",
      "src/lib/locus/state.ts",
    ]);
    expect(productionReferences().filter((reference) =>
      activated.has(reference.consumer) && forbidden.has(reference.target))).toEqual([]);
  });
});

function productionReferences(): readonly ModuleReference[] {
  if (sourceReferences !== undefined) return sourceReferences;
  const moduleNames = foundationModules.map((path) => path.split("/").at(-1)?.replace(/\.ts$/u, "") ?? path);
  const references = typescriptFiles(join(packageRoot, "src")).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    return moduleNames.some((name) => content.includes(name)) ? referencesOf(path, content) : [];
  });
  sourceReferences = references;
  return references;
}

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function referencesOf(path: string, content: string): ModuleReference[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const consumer = packageRelative(path);
  const references: ModuleReference[] = [];
  const add = (specifier: string, kind: ModuleReference["kind"]): void => {
    const target = resolveRelativeModule(path, specifier);
    if (target !== null) references.push({ consumer, target, kind });
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, "static");
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        add(argument.text, "dynamic");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function resolveRelativeModule(consumer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const absolute = resolve(dirname(consumer), specifier.replace(/\.js$/u, ".ts"));
  return absolute.startsWith(packageRoot) ? packageRelative(absolute) : null;
}

function packageRelative(path: string): string {
  return relative(packageRoot, path).split(sep).join("/");
}

function isFoundation(path: string): boolean {
  return foundationModules.includes(path as (typeof foundationModules)[number]);
}
