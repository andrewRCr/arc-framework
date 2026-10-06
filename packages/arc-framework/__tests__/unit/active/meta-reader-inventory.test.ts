import { readdirSync, readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { META_FIELDS } from "../../../src/lib/active/meta-reader.js";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const sourceRoot = resolve(testDirectory, "../../../src");
const projectionAuthority = "lib/active/meta-reader.ts";
// Creation admission reads only placement fields and preserves unrelated raw meta content.
const placementCreationReader = "lib/store/in-repo/write-admission.ts";
const rawListPolicyReader = "scripts/validate-meta-spec.ts";
const REPOSITORY_SCAN_TIMEOUT = 15_000;

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
    const displayLabels = new Set<string>(META_FIELDS.map(({ name }) => name));

    for (const path of typescriptFiles(sourceRoot)) {
      const relativePath = sourcePath(path);
      const sourceText = readFileSync(path, "utf8");
      const sourceFile = ts.createSourceFile(path, sourceText, ts.ScriptTarget.Latest, true);
      const semanticRecords = new Set<string>();
      const collectSemanticRecords = (node: ts.Node): void => {
        if (
          ts.isVariableDeclaration(node)
          && ts.isIdentifier(node.name)
          && node.initializer !== undefined
          && ts.isCallExpression(node.initializer)
          && ts.isIdentifier(node.initializer.expression)
          && node.initializer.expression.text === "parseMetaRecord"
        ) {
          semanticRecords.add(node.name.text);
        }
        ts.forEachChild(node, collectSemanticRecords);
      };
      collectSemanticRecords(sourceFile);

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
        if (
          ts.isElementAccessExpression(node)
          && ts.isIdentifier(node.expression)
          && semanticRecords.has(node.expression.text)
          && node.argumentExpression !== undefined
          && ts.isStringLiteral(node.argumentExpression)
          && displayLabels.has(node.argumentExpression.text)
        ) {
          violations.push(`${relativePath}: semantic record display-label index ${node.argumentExpression.text}`);
        }
        if (
          ts.isPropertyAccessExpression(node)
          && ts.isIdentifier(node.expression)
          && semanticRecords.has(node.expression.text)
          && displayLabels.has(node.name.text)
        ) {
          violations.push(`${relativePath}: semantic record display-label property ${node.name.text}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    expect(violations).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
});
