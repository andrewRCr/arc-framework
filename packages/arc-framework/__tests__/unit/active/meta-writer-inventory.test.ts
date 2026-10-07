import { readdirSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { META_FIELDS } from "../../../src/lib/active/meta-reader.js";

/** Timeout for measured repository scans on slower hosted runners. */
const REPOSITORY_SCAN_TIMEOUT = 10_000;

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(testDirectory, "../../../src");

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return extname(entry.name) === ".ts" ? [path] : [];
  });
}

const producerPaths = [
  "lib/errand/promote.ts",
  "lib/git/worktree-scaffold.ts",
  "lib/work-unit/pointer-record.ts",
  "lib/work-unit/verbs/park-resume.ts",
  "lib/work-unit/verbs/stub.ts",
] as const;

describe("semantic meta writer boundary", () => {
  it("keeps full-record producers off projection override contracts", () => {
    for (const relativePath of producerPaths) {
      const source = readFileSync(resolve(sourceRoot, relativePath), "utf8");
      expect(source, relativePath).not.toMatch(/MetaProjectionOverrides|renderMetaProjectionFile/u);
    }
  });

  it("rejects display labels in inline renderMetaFile override objects and the retired override type", () => {
    const displayLabels = new Set<string>(META_FIELDS.map(({ name }) => name));
    const violations: string[] = [];

    for (const path of typescriptFiles(sourceRoot)) {
      const sourceText = readFileSync(path, "utf8");
      if (sourceText.includes("MetaFieldOverrides")) {
        violations.push(`${path}: retired MetaFieldOverrides type`);
      }

      const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && node.expression.text === "renderMetaFile"
        ) {
          const overrides = node.arguments[1];
          if (overrides !== undefined && ts.isObjectLiteralExpression(overrides)) {
            for (const property of overrides.properties) {
              if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) continue;
              const name = property.name.getText(sourceFile).replace(/^["']|["']$/gu, "");
              if (displayLabels.has(name)) violations.push(`${path}: renderMetaFile override ${name}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(violations).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
});
