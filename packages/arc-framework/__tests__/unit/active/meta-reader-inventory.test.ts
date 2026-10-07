import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(testDirectory, "../../../src");
const projectionAuthority = "lib/active/meta-reader.ts";
// Creation admission reads only placement fields and preserves unrelated raw meta content.
const placementCreationReader = "lib/store/in-repo/write-admission.ts";
const rawListPolicyReader = "scripts/validate-meta-spec.ts";
const REPOSITORY_SCAN_TIMEOUT = 20_000;

function typescriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return extname(entry.name) === ".ts" ? [path] : [];
  });
}

function sourcePath(path: string): string {
  return relative(sourceRoot, path).replaceAll("\\", "/");
}

describe("semantic meta reader boundary", () => {
  it("keeps first-party consumers on semantic fields and normalized identifier arrays", () => {
    const violations: string[] = [];

    for (const path of typescriptFiles(sourceRoot)) {
      const relativePath = sourcePath(path);
      const sourceText = readFileSync(path, "utf8");
      const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          if (
            node.expression.text === "parseMetaProjectionRecord"
            && relativePath !== projectionAuthority
            && relativePath !== placementCreationReader
          ) {
            violations.push(`${relativePath}: projection record parse`);
          }
          if (
            node.expression.text === "parseIdentifierList"
            && relativePath !== projectionAuthority
            && relativePath !== rawListPolicyReader
          ) {
            violations.push(`${relativePath}: repeated identifier-list parse`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(violations).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
});
