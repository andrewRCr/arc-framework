/** Architecture coverage for the layout subsystem's pure dependency boundary. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("layout import boundary", () => {
  it("depends only on local modules, the kernel, Zod, and host path semantics", () => {
    const packageRoot = resolve(import.meta.dirname, "../../..");
    const sourceRoot = join(packageRoot, "src");
    const layoutRoot = join(sourceRoot, "lib/layout");
    const forbidden: { file: string; specifier: string }[] = [];

    for (const file of sourceFiles(layoutRoot)) {
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (specifier === undefined || !ts.isStringLiteralLike(specifier)) continue;
        const value = specifier.text;
        const allowed = value === "zod"
          || value === "node:path"
          || value.startsWith("./")
          || value === "../kernel/index.js";
        if (!allowed) forbidden.push({ file: relative(sourceRoot, file), specifier: value });
      }
    }

    expect(forbidden).toEqual([]);
  });
});
