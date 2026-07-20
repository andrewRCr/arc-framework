import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../../..");
const viewerLibFiles = [
  "src/lib/view-artifact.ts",
  "src/lib/view-renderer.ts",
  "src/lib/view/types.ts",
  "src/lib/view/format.ts",
  "src/lib/view/clock.ts",
];

function importsOf(relativePath: string): string[] {
  const path = join(packageRoot, relativePath);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    return statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [];
  });
}

function productionGlobalReadsOf(relativePath: string): string[] {
  const path = join(packageRoot, relativePath);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const reads: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "process"
    ) reads.push(node.getText(source));
    ts.forEachChild(node, visit);
  };
  visit(source);
  return reads;
}

describe("viewer import boundary", () => {
  it("keeps corrected lib modules free of command imports and directly bound production effects", () => {
    for (const file of viewerLibFiles) {
      const imports = importsOf(file);
      expect(imports.filter((specifier) => specifier.includes("/commands/")), file).toEqual([]);
      expect(imports.filter((specifier) => [
        "node:child_process",
        "node:fs",
        "node:fs/promises",
        "../io-context.js",
      ].includes(specifier)), file).toEqual([]);
      expect(productionGlobalReadsOf(file), file).toEqual([]);
    }
  });

  it("keeps compatibility exports pointed at the relocated lib symbols", async () => {
    const publicTypes = await import("../../../src/commands/view/types.js");
    const publicFormat = await import("../../../src/commands/view/format.js");
    expect(publicTypes.VIEW_KINDS).toContain("tasks");
    expect(publicFormat.prepareViewDocument).toBeTypeOf("function");
    expect(publicFormat.formatArtifactHeader("spec", "feature", new Date(2026, 0, 2, 9, 5)))
      .toBe("spec · feature · rendered 09:05");
  });
});
