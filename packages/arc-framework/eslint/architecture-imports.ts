/** Module-local architecture checks for native ESLint configuration. */

import type { Rule } from "eslint";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import ts from "typescript";

/** Predicate IDs accepted by the native configuration schema. */
export const ARCHITECTURE_PREDICATES = ["neverthrow", "kernel", "store-production", "store-tests"] as const;

/** A named module-local architecture predicate. */
export type ArchitecturePredicate = typeof ARCHITECTURE_PREDICATES[number];

/** A source reference violating an enabled architecture predicate. */
export interface ArchitectureImportViolation {
  node: ts.Node;
  predicate: ArchitecturePredicate;
  reason: string;
}

function literal(node: ts.Node | undefined): string | undefined {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : undefined;
}

function createRequireBindings(source: ts.SourceFile): Set<string> {
  const bindings = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || literal(statement.moduleSpecifier) !== "node:module") continue;
    const names = statement.importClause?.namedBindings;
    if (names === undefined || !ts.isNamedImports(names)) continue;
    for (const name of names.elements) {
      if ((name.propertyName ?? name.name).text === "createRequire") bindings.add(name.name.text);
    }
  }
  return bindings;
}

function isFactory(expression: ts.Expression, bindings: ReadonlySet<string>): boolean {
  return (ts.isIdentifier(expression) && bindings.has(expression.text))
    || (ts.isPropertyAccessExpression(expression) && expression.name.text === "createRequire");
}

function moduleReferences(source: ts.SourceFile): { node: ts.Node; specifier: string }[] {
  const factories = createRequireBindings(source);
  const loaders = new Set<string>();
  const isFactoryCall = (node: ts.Node | undefined): node is ts.CallExpression =>
    node !== undefined && ts.isCallExpression(node) && isFactory(node.expression, factories);
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFactoryCall(node.initializer)) {
      loaders.add(node.name.text);
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const references: { node: ts.Node; specifier: string }[] = [];
  const visit = (node: ts.Node): void => {
    let specifier: string | undefined;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      specifier = literal(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifier = literal(node.argument.literal);
    } else if (ts.isCallExpression(node)) {
      const directRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      const moduleRequire = ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "module"
        && node.expression.name.text === "require";
      const returnedRequire = (ts.isIdentifier(node.expression) && loaders.has(node.expression.text))
        || isFactoryCall(node.expression);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || directRequire || moduleRequire || returnedRequire) {
        specifier = literal(node.arguments[0]);
      }
    }
    if (specifier !== undefined) references.push({ node, specifier });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function within(root: string, file: string): boolean {
  const path = relative(root, file);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function kernelViolations(source: ts.SourceFile, filename: string, sourceRoot: string): ArchitectureImportViolation[] {
  const root = join(sourceRoot, "lib/kernel");
  const result = join(root, "result.ts");
  const factories = createRequireBindings(source);
  const violations: ArchitectureImportViolation[] = [];
  const report = (node: ts.Node, reason: string): void => { violations.push({ node, predicate: "kernel", reason }); };
  const inspect = (node: ts.Node, specifier: string): void => {
    if (specifier === "neverthrow") {
      if (resolve(filename) !== result) report(node, "neverthrow import outside kernel Result seam");
      return;
    }
    if (specifier === "zod" || specifier.startsWith("node:")) return;
    if (!specifier.startsWith(".")) {
      report(node, "unapproved external package");
      return;
    }
    const target = ts.resolveModuleName(specifier, filename, {
      module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16, target: ts.ScriptTarget.ES2022,
    }, ts.sys).resolvedModule;
    if (target === undefined) report(node, "unresolved source import");
    else if (!within(root, resolve(target.resolvedFileName))) report(node, "source import escapes kernel");
  };
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = literal(node.arguments[0]);
        if (specifier === undefined) report(node, "non-literal dynamic import");
        else inspect(node, specifier);
      } else if ((ts.isIdentifier(node.expression) && node.expression.text === "require")
        || (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
          && node.expression.expression.text === "module" && node.expression.name.text === "require")) {
        report(node, "CommonJS require loader");
      } else if (isFactory(node.expression, factories)) {
        report(node, "createRequire loader acquisition");
      }
    } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = literal(node.moduleSpecifier);
      if (specifier !== undefined) inspect(node, specifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      const specifier = literal(node.argument.literal);
      if (specifier !== undefined) inspect(node, specifier);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function storeReferences(source: ts.SourceFile): { node: ts.Node; specifier: string }[] {
  const references: { node: ts.Node; specifier: string }[] = [];
  const add = (node: ts.Node, specifier: string): void => { references.push({ node, specifier }); };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const names = clause?.namedBindings;
      const typesOnly = clause?.phaseModifier === ts.SyntaxKind.TypeKeyword || (clause?.name === undefined && names !== undefined
        && ts.isNamedImports(names) && names.elements.every((entry) => entry.isTypeOnly));
      if (!typesOnly) add(node, node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)) {
      add(node, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined && ts.isStringLiteral(node.arguments[0])) {
      add(node, node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function storeViolations(
  source: ts.SourceFile, filename: string, sourceRoot: string, predicates: readonly ArchitecturePredicate[],
): ArchitectureImportViolation[] {
  const violations: ArchitectureImportViolation[] = [];
  const file = resolve(filename).replaceAll("\\", "/");
  for (const { node, specifier } of storeReferences(source)) {
    if (!specifier.startsWith(".")) continue;
    const target = resolve(dirname(filename), specifier.replace(/\.js$/u, ".ts")).replaceAll("\\", "/");
    if (predicates.includes("store-production")) {
      if (target.includes("/lib/store/in-repo/") && !file.includes("/lib/store/")) {
        violations.push({ node, predicate: "store-production", reason: "private store implementation outside store" });
      } else if (target.endsWith("/store/in-repo/backend.ts") && resolve(filename) !== join(sourceRoot, "lib/store/create.ts")) {
        violations.push({ node, predicate: "store-production", reason: "store implementation entry outside public factory" });
      }
    }
    if (predicates.includes("store-tests") && target.includes("/lib/store/in-repo/")) {
      violations.push({ node, predicate: "store-tests", reason: "test imports private store implementation" });
    }
  }
  return violations;
}

/**
 * Inspect the linter's already-parsed module against its enabled predicates.
 * @param source - TypeScript source supplied by the native parser.
 * @param filename - Absolute importing filename.
 * @param sourceRoot - Absolute production source root.
 * @param predicates - Enabled module-local predicate IDs.
 * @returns Violations with their original source nodes.
 */
export function findArchitectureImportViolations(
  source: ts.SourceFile,
  filename: string,
  sourceRoot: string,
  predicates: readonly ArchitecturePredicate[],
): ArchitectureImportViolation[] {
  const violations = predicates.includes("kernel") ? kernelViolations(source, filename, sourceRoot) : [];
  if (predicates.includes("neverthrow") && !within(join(sourceRoot, "lib/kernel"), resolve(filename))) {
    violations.push(...moduleReferences(source).filter(({ specifier }) => specifier === "neverthrow")
      .map(({ node }): ArchitectureImportViolation => ({ node, predicate: "neverthrow", reason: "neverthrow import outside kernel Result seam" })));
  }
  if (predicates.includes("store-production") || predicates.includes("store-tests")) {
    violations.push(...storeViolations(source, filename, sourceRoot, predicates));
  }
  return violations;
}

function parsedModule(context: Rule.RuleContext): ts.SourceFile {
  const services: unknown = context.sourceCode.parserServices;
  if (services === null || typeof services !== "object" || !("esTreeNodeToTSNodeMap" in services)) {
    throw new Error("Architecture predicates require the TypeScript parser's node map");
  }
  const map: unknown = services.esTreeNodeToTSNodeMap;
  if (map === null || typeof map !== "object" || !("get" in map) || typeof map.get !== "function") {
    throw new Error("Architecture predicates require the TypeScript parser's node map");
  }
  const node: unknown = (map as { get(node: unknown): unknown }).get(context.sourceCode.ast);
  if (node === null || typeof node !== "object" || !("kind" in node) || node.kind !== ts.SyntaxKind.SourceFile) {
    throw new Error("Architecture predicates require the parser's original TypeScript source file");
  }
  return node as ts.SourceFile;
}

/**
 * Create the native rule for named architecture predicates.
 * @param sourceRoot - Absolute production source root.
 * @returns ESLint rule definition consuming predicate IDs.
 */
export function createArchitectureImportsRule(sourceRoot: string): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      schema: [{ type: "array", items: { enum: [...ARCHITECTURE_PREDICATES] }, uniqueItems: true }],
      messages: { boundary: "{{predicate}}: {{reason}}" },
    },
    create(context) {
      const options: unknown = context.options[0];
      if (!Array.isArray(options) || !options.every((value): value is ArchitecturePredicate =>
        ARCHITECTURE_PREDICATES.some((predicate) => predicate === value))) {
        throw new Error("Architecture predicates require supported predicate IDs");
      }
      return {
        Program() {
          const source = parsedModule(context);
          for (const violation of findArchitectureImportViolations(source, context.filename, sourceRoot, options)) {
            const start = source.getLineAndCharacterOfPosition(violation.node.getStart(source));
            const end = source.getLineAndCharacterOfPosition(violation.node.getEnd());
            context.report({
              loc: { start: { line: start.line + 1, column: start.character }, end: { line: end.line + 1, column: end.character } },
              messageId: "boundary",
              data: { predicate: violation.predicate, reason: violation.reason },
            });
          }
        },
      };
    },
  };
}
