import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../../../..");
const sourceRoot = join(packageRoot, "src");
const ownerModules = [
  "lib/change-facts.schema.ts",
  "scripts/review-gate/core/gate-contract-v2-schema.ts",
  "scripts/review-gate/core/review-primitives.ts",
  "scripts/review-gate/policy/assurance-schema.ts",
  "scripts/review-gate/policy/standard-review-projection-schema.ts",
  "scripts/review-gate/policy/standard-review-schema.ts",
  "scripts/review-gate/policy/project-promotion-schema.ts",
  "scripts/review-gate/policy/routing-schema.ts",
];
const permittedLegacyValidatorFiles = [
  "scripts/review-gate/core/contracts.ts",
  "scripts/review-gate/core/evidence.ts",
  "scripts/review-gate/core/execution.ts",
  "scripts/review-gate/core/receipt-payload.ts",
];

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return extname(entry.name) === ".ts" ? [path] : [];
  });
}

function isExported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword) === true;
}

function isZodInfer(node: ts.TypeNode): boolean {
  return ts.isTypeReferenceNode(node)
    && ts.isQualifiedName(node.typeName)
    && ts.isIdentifier(node.typeName.left)
    && node.typeName.left.text === "z"
    && node.typeName.right.text === "infer";
}

function walk(node: ts.Node, visit: (candidate: ts.Node) => void): void {
  visit(node);
  node.forEachChild((child) => walk(child, visit));
}

describe("review schema ownership boundary", () => {
  it("derives every exported owner type from Zod and exposes only registrar functions", () => {
    for (const ownerModule of ownerModules) {
      const source = readFileSync(join(sourceRoot, ownerModule), "utf8");
      const parsed = ts.createSourceFile(ownerModule, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

      expect(source).not.toMatch(/validation\.js/u);
      walk(parsed, (node) => {
        expect(ts.isInterfaceDeclaration(node), ownerModule).toBe(false);
        if (ts.isFunctionDeclaration(node) && /^(?:parse|project|validate)/u.test(node.name?.text ?? "")) {
          expect.fail(`${ownerModule} defines handwritten validator or projection ${node.name?.text ?? ""}`);
        }
        if (ts.isVariableDeclaration(node)
          && ts.isIdentifier(node.name)
          && /^(?:parse|project|validate)/u.test(node.name.text)) {
          expect.fail(`${ownerModule} defines handwritten validator or projection ${node.name.text}`);
        }
      });
      for (const statement of parsed.statements) {
        if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
          expect(isZodInfer(statement.type), `${ownerModule}:${statement.name.text}`).toBe(true);
        }
        if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
          expect(statement.name?.text, ownerModule).toMatch(/^register/u);
        }
        if (ts.isVariableStatement(statement) && isExported(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            expect(ts.isIdentifier(declaration.name) ? declaration.name.text : "", ownerModule).toMatch(/Schema$/u);
          }
        }
      }
    }
  });

  it("pins every handwritten validator importer to the schema-v1 compatibility boundary", () => {
    const importers = sourceFiles(join(sourceRoot, "scripts/review-gate"))
      .filter((path) => /from\s+["'](?:[^"']*\/)?validation\.js["']/u.test(readFileSync(path, "utf8")))
      .map((path) => relative(sourceRoot, path))
      .sort();

    expect(importers).toEqual(permittedLegacyValidatorFiles);
  });
});
