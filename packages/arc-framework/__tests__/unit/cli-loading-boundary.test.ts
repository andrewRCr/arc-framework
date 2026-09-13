/** Source contract for import-time effects at the CLI implementation boundary. */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const cliPath = join(packageRoot, "src", "cli.ts");
const activeStatusPath = join(packageRoot, "src", "commands", "active", "status.ts");
const viewHandlerPath = join(packageRoot, "src", "handlers", "view.ts");
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
const deferredActiveProjectionModules = [
  "../../lib/config/status-reader.js",
  "../../lib/work-unit/submission-boundary-store.js",
  "../../lib/work-unit/candidate-record-store.js",
  "../../lib/work-unit/candidate-attestation.js",
  "../../lib/work-unit/git-candidate-effective-target.js",
  "../../scripts/review-gate/policy/integration-boundary-locus.js",
  "../../scripts/review-gate/policy/candidate-review-fix-continuation.js",
] as const;

interface ModuleLoading {
  specifier: string;
  eager: boolean;
  lazy: boolean;
}

function isImplementationSpecifier(specifier: string): boolean {
  return implementationPrefixes.some((prefix) => specifier.startsWith(prefix));
}

function collectModuleLoading(
  source: string,
  fileName: string,
  included: (specifier: string) => boolean,
): ModuleLoading[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const modules = new Map<string, ModuleLoading>();
  const entryFor = (specifier: string): ModuleLoading => {
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
      && included(argument.text)
    ) {
      entryFor(argument.text).lazy = true;
    }
    ts.forEachChild(node, visit);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      if (!included(specifier)) continue;
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

function collectImplementationModules(source: string): ModuleLoading[] {
  return collectModuleLoading(source, "cli.ts", isImplementationSpecifier);
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
    expect(modules.map(({ specifier }) => specifier).sort()).toEqual([...expectedImplementationModules].sort());

    const violations: string[] = [];
    for (const module of modules) {
      if (!module.lazy) continue;
      const sourcePath = resolve(dirname(cliPath), module.specifier.replace(/\.js$/u, ".ts"));
      const registrations = findTopLevelRegistrationCalls(await readFile(sourcePath, "utf8"));
      if (registrations.length > 0) violations.push(`${module.specifier}: ${registrations.join(", ")}`);
    }

    expect(violations).toEqual([]);
  });

  it("loads the representative view handler only when its command runs", async () => {
    const modules = collectImplementationModules(await readFile(cliPath, "utf8"));
    expect(modules.find(({ specifier }) => specifier === "./handlers/view.js")).toEqual({
      specifier: "./handlers/view.js",
      eager: false,
      lazy: true,
    });
  });

  it("loads every implementation module only when its command runs", async () => {
    const modules = collectImplementationModules(await readFile(cliPath, "utf8"));
    expect(modules.filter(({ eager }) => eager).map(({ specifier }) => specifier)).toEqual([]);
    expect(modules.filter(({ lazy }) => lazy).map(({ specifier }) => specifier).sort()).toEqual(
      [...expectedImplementationModules].sort(),
    );
  });

  it("defers path-conditional active candidate projection modules", async () => {
    const included = new Set<string>(deferredActiveProjectionModules);
    const modules = collectModuleLoading(
      await readFile(activeStatusPath, "utf8"),
      "status.ts",
      (specifier) => included.has(specifier),
    );

    expect(modules.filter(({ eager }) => eager).map(({ specifier }) => specifier)).toEqual([]);
    expect(modules.filter(({ lazy }) => lazy).map(({ specifier }) => specifier).sort()).toEqual(
      [...deferredActiveProjectionModules].sort(),
    );
  });

  it("loads the active status authority without initializing the broader command barrel", async () => {
    const activeModules = new Set(["../commands/active.js", "../commands/active/status.js"]);
    const modules = collectModuleLoading(
      await readFile(viewHandlerPath, "utf8"),
      "view.ts",
      (specifier) => activeModules.has(specifier),
    );

    expect(modules).toEqual([{
      specifier: "../commands/active/status.js",
      eager: true,
      lazy: false,
    }]);
  });

  it("loads git operations from their owning modules instead of the broad barrel", async () => {
    const viewGitModules = new Set([
      "../lib/git/index.js",
      "../lib/git/exec.js",
      "../lib/git/identity.js",
    ]);
    const statusGitModules = new Set(["../../lib/git/index.js", "../../lib/git/exec.js"]);

    expect(collectModuleLoading(
      await readFile(viewHandlerPath, "utf8"),
      "view.ts",
      (specifier) => viewGitModules.has(specifier),
    )).toEqual([
      { specifier: "../lib/git/exec.js", eager: true, lazy: false },
      { specifier: "../lib/git/identity.js", eager: true, lazy: false },
    ]);
    expect(collectModuleLoading(
      await readFile(activeStatusPath, "utf8"),
      "status.ts",
      (specifier) => statusGitModules.has(specifier),
    )).toEqual([
      { specifier: "../../lib/git/exec.js", eager: true, lazy: false },
    ]);
  });
});
