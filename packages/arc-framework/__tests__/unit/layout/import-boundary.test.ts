/** Architecture coverage for the layout subsystem's pure dependency boundary. */

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

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

  it("exposes layout consumers only through the downward public library barrel", () => {
    const packageRoot = resolve(import.meta.dirname, "../../..");
    const sourceRoot = join(packageRoot, "src");
    const violations: { file: string; specifier: string }[] = [];
    const directConsumers: string[] = [];

    for (const file of sourceFiles(sourceRoot)) {
      if (file.includes(`${join("lib", "layout")}${sep}`)) continue;
      const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
      for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
        const specifier = statement.moduleSpecifier;
        if (specifier === undefined || !ts.isStringLiteralLike(specifier)) continue;
        const value = specifier.text;
        if (!value.includes("layout/")) continue;

        const sourcePath = relative(sourceRoot, file);
        if (!value.endsWith("layout/index.js")) violations.push({ file: sourcePath, specifier: value });
        if (sourcePath.startsWith(`commands${sep}`) || sourcePath.startsWith(`handlers${sep}`)) {
          directConsumers.push(sourcePath);
          if (!value.includes("lib/layout/index.js")) violations.push({ file: sourcePath, specifier: value });
        }
      }
    }

    expect(violations).toEqual([]);
    expect(directConsumers).toEqual(expect.arrayContaining([
      join("commands", "init.ts"),
      join("handlers", "start.ts"),
    ]));
  });
});
