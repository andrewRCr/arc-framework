/** Source contract for import-time effects at the CLI implementation boundary. */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const cliPath = join(packageRoot, "src", "cli.ts");
const implementationPrefixes = ["./handlers/", "./commands/", "./scripts/"] as const;
const expectedImplementationModules = [
  "./handlers/init.js",
  "./handlers/join.js",
  "./handlers/start.js",
  "./handlers/errand.js",
  "./handlers/housekeep.js",
  "./handlers/base.js",
  "./handlers/plan.js",
  "./handlers/delivery.js",
  "./handlers/delivery-execution.js",
  "./handlers/delivery-entry.js",
  "./handlers/delivery-transfer.js",
  "./handlers/candidate.js",
  "./handlers/installation.js",
  "./handlers/lifecycle.js",
  "./handlers/user.js",
  "./handlers/extensions.js",
  "./handlers/config.js",
  "./handlers/active.js",
  "./handlers/status.js",
  "./handlers/locus.js",
  "./handlers/view.js",
  "./handlers/recover.js",
  "./handlers/sync.js",
  "./handlers/user-sync.js",
  "./handlers/log.js",
  "./handlers/integration.js",
  "./handlers/review.js",
  "./handlers/reconcile.js",
  "./commands/check.js",
  "./commands/release.js",
  "./scripts/remedy-roadmap-conflict.js",
] as const;

interface ImplementationModule {
  specifier: string;
  eager: boolean;
  lazy: boolean;
}

function isImplementationSpecifier(specifier: string): boolean {
  return implementationPrefixes.some((prefix) => specifier.startsWith(prefix));
}

function collectImplementationModules(source: string): ImplementationModule[] {
  const sourceFile = ts.createSourceFile("cli.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const modules = new Map<string, ImplementationModule>();
  const entryFor = (specifier: string): ImplementationModule => {
    const existing = modules.get(specifier);
    if (existing !== undefined) return existing;
    const created = { specifier, eager: false, lazy: false };
    modules.set(specifier, created);
    return created;
  };

  const visit = (node: ts.Node): void => {
    const [argument] = ts.isCallExpression(node) ? node.arguments : [];
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && argument !== undefined
      && ts.isStringLiteral(argument)
      && isImplementationSpecifier(argument.text)
    ) {
      entryFor(argument.text).lazy = true;
    }
    ts.forEachChild(node, visit);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (!isImplementationSpecifier(specifier)) continue;
      const clause = statement.importClause;
      const named = clause?.namedBindings;
      const hasRuntimeBinding = clause === undefined
        || (!clause.isTypeOnly && (
          clause.name !== undefined
          || (named !== undefined && ts.isNamespaceImport(named))
          || (named !== undefined && ts.isNamedImports(named) && named.elements.some((element) => !element.isTypeOnly))
        ));
      if (hasRuntimeBinding) entryFor(specifier).eager = true;
      else entryFor(specifier);
    }
  }
  visit(sourceFile);

  return [...modules.values()];
}

function findTopLevelRegistrationCalls(source: string): string[] {
  const sourceFile = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: string[] = [];

  const visitExecutedNode = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : null;
      if (name !== null && /^register/u.test(name)) calls.push(node.getText(sourceFile));
    }
    ts.forEachChild(node, visitExecutedNode);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (declaration.initializer !== undefined) visitExecutedNode(declaration.initializer);
      }
    } else if (
      !ts.isImportDeclaration(statement)
      && !ts.isExportDeclaration(statement)
      && !ts.isFunctionDeclaration(statement)
      && !ts.isClassDeclaration(statement)
      && !ts.isInterfaceDeclaration(statement)
      && !ts.isTypeAliasDeclaration(statement)
    ) {
      visitExecutedNode(statement);
    }
  }

  return calls;
}

describe("CLI loading boundary", () => {
  it("detects registrations that execute while a module loads", () => {
    const source = `
      registerImmediate();
      export function deferred(): void { registerDeferred(); }
      export const alsoDeferred = (): void => { registry.registerDeferred(); };
    `;

    expect(findTopLevelRegistrationCalls(source)).toEqual(["registerImmediate()"]);
  });

  it("keeps import-time registrations outside the lazy module set", async () => {
    const modules = collectImplementationModules(await readFile(cliPath, "utf8"));
    expect(modules.map(({ specifier }) => specifier)).toEqual(expectedImplementationModules);

    const violations: string[] = [];
    for (const module of modules) {
      if (!module.lazy) continue;
      const sourcePath = resolve(dirname(cliPath), module.specifier.replace(/\.js$/u, ".ts"));
      const registrations = findTopLevelRegistrationCalls(await readFile(sourcePath, "utf8"));
      if (registrations.length > 0) violations.push(`${module.specifier}: ${registrations.join(", ")}`);
    }

    expect(violations).toEqual([]);
  });
});
