/** Required public-library consumers for the layout subsystem. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../../..");

describe("layout consumer presence", () => {
  it.each(["src/commands/init.ts", "src/handlers/start.ts"])("keeps the public layout import in %s", (file) => {
    const source = ts.createSourceFile(file, readFileSync(resolve(packageRoot, file), "utf8"), ts.ScriptTarget.Latest, true);
    expect(source.statements.some((statement) =>
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)
      && statement.moduleSpecifier.text.includes("lib/layout/index.js"))).toBe(true);
  });
});
