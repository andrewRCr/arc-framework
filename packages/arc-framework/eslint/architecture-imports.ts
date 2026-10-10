/** Module-local architecture checks for native ESLint configuration. */

import type { Rule } from "eslint";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import ts from "typescript";
// Native ESLint loads source TypeScript; production imports keep emitted .js paths.
const { syntaxBindingLookup } = await import(new URL("../src/lib/syntax-bindings.ts", import.meta.url).href) as
  typeof import("../src/lib/syntax-bindings.js");

/** Predicates whose existing violations are recorded as a suppression floor that rerouting drains to zero. */
const RATCHET_PREDICATES = ["store-raw-state", "surface-names"] as const;

/** Predicate IDs accepted by the native configuration schema. */
export const ARCHITECTURE_PREDICATES = ["clack", "neverthrow", "kernel", "store-production", "store-tests",
  "layout-dependencies", "layout-private", "layout-downward", "store-concurrency", "store-reference", "configured-identity",
  ...RATCHET_PREDICATES] as const;

/** A named module-local architecture predicate. */
export type ArchitecturePredicate = typeof ARCHITECTURE_PREDICATES[number];

function isRatchet(predicate: ArchitecturePredicate): boolean {
  return RATCHET_PREDICATES.some((ratchet) => ratchet === predicate);
}

/**
 * Native rule IDs with the predicates each accepts. Suppressions are counted per file and rule, so each ratchet
 * reports under its own ID: its floor then lends no slack to the fail-closed predicates or to the other ratchet.
 */
export const ARCHITECTURE_RULES: Readonly<Record<string, readonly ArchitecturePredicate[]>> = {
  "architecture-imports": ARCHITECTURE_PREDICATES.filter((predicate) => !isRatchet(predicate)),
  ...Object.fromEntries(RATCHET_PREDICATES.map((predicate) => [predicate, [predicate]])),
};

/**
 * Name the native rule that reports a predicate.
 * @param predicate - Module-local predicate ID.
 * @returns The rule ID, without the plugin prefix.
 */
export function architectureRuleFor(predicate: ArchitecturePredicate): string {
  return isRatchet(predicate) ? predicate : "architecture-imports";
}

/**
 * Modules that read or write operational state beneath the storage contract, relative to the source root. Production
 * code reaches them through `lib/store/`; the modules may still import one another.
 */
const RAW_STATE_MODULES = [
  "lib/active/meta-reader.ts",
  "lib/work-unit/lifecycle-index.ts",
  "lib/work-unit/composed-lifecycle-index.ts",
  "lib/git/ref-tree.ts",
  "lib/errand/ref-tree.ts",
  "lib/work-unit/candidate-record-store.ts",
  "lib/work-unit/transition-record-store.ts",
  "lib/errand/identity-snapshot.ts",
  "lib/errand/identity-transaction.ts",
  "lib/user-sync/inbox-writer.ts",
] as const;

/**
 * Presentation names and path fragments of ARC surfaces, which only the layout resolver spells. The meta filename
 * prefix leaves aside a whole kebab-case code such as `meta-read-failed`, which names no file.
 */
const SURFACE_NAME = /USER-INBOX|ATOMIC-INBOX|ROADMAP|STATUS\.USER|\.arc\/active\/|(?:^|[/^])meta-(?![a-z0-9]+(?:-[a-z0-9]+)*$)/u;

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

interface NodeFactoryOwners { factories: Set<ts.Node>; namespaces: Set<ts.Node> }
interface NodeFactoryContext {
  owners: NodeFactoryOwners;
  lookup: ReturnType<typeof syntaxBindingLookup>;
}

function unparenthesized(expression: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  return expression;
}

function nodeModuleSpecifier(node: ts.Node | undefined): boolean {
  const name = literal(node);
  return name === "node:module" || name === "module";
}

function collectNodeImport(statement: ts.Statement, owners: NodeFactoryOwners): void {
  if (!ts.isImportDeclaration(statement) || !nodeModuleSpecifier(statement.moduleSpecifier)) return;
  const clause = statement.importClause;
  if (clause === undefined || clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return;
  if (clause.name !== undefined) owners.namespaces.add(clause);
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamespaceImport(bindings)) owners.namespaces.add(bindings);
  if (bindings === undefined || !ts.isNamedImports(bindings)) return;
  for (const binding of bindings.elements) {
    if (binding.isTypeOnly) continue;
    const name = (binding.propertyName ?? binding.name).text;
    if (name === "createRequire") owners.factories.add(binding);
    else if (name === "default" || name === "Module") owners.namespaces.add(binding);
  }
}

function awaitedNodeNamespace(expression: ts.Expression | undefined): boolean {
  if (expression === undefined || !ts.isAwaitExpression(expression)) return false;
  const call = unparenthesized(expression.expression);
  return ts.isCallExpression(call) && call.expression.kind === ts.SyntaxKind.ImportKeyword
    && nodeModuleSpecifier(call.arguments[0]);
}

function nodeLoaderValue(expression: ts.Expression, context: NodeFactoryContext, seen: ReadonlySet<ts.Node>): boolean {
  expression = unparenthesized(expression);
  if (ts.isCallExpression(expression)) return nodeFactoryValue(expression.expression, context, seen);
  const declaration = ts.isIdentifier(expression) ? context.lookup(expression) : undefined;
  return declaration !== undefined && ts.isVariableDeclaration(declaration)
    && declaration.initializer !== undefined && ts.isCallExpression(unparenthesized(declaration.initializer))
    && nodeFactoryValue((unparenthesized(declaration.initializer) as ts.CallExpression).expression, context, seen);
}

function nodeNamespaceValue(expression: ts.Expression, context: NodeFactoryContext, seen: ReadonlySet<ts.Node>): boolean {
  expression = unparenthesized(expression);
  if (awaitedNodeNamespace(expression)) return true;
  if (ts.isPropertyAccessExpression(expression) && ["default", "Module"].includes(expression.name.text)) {
    return nodeNamespaceValue(expression.expression, context, seen);
  }
  if (ts.isCallExpression(expression)) {
    return nodeModuleSpecifier(expression.arguments[0]) && nodeLoaderValue(expression.expression, context, seen);
  }
  const declaration = ts.isIdentifier(expression) ? context.lookup(expression) : undefined;
  if (declaration === undefined) return false;
  if (context.owners.namespaces.has(declaration)) return true;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined || seen.has(declaration)) return false;
  return nodeNamespaceValue(declaration.initializer, context, new Set(seen).add(declaration));
}

function literalPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isComputedPropertyName(name)) return literal(unparenthesized(name.expression));
  return ts.isIdentifier(name) ? name.text : literal(name);
}

function nodeObjectFactoryValue(expression: ts.Expression, context: NodeFactoryContext, seen: ReadonlySet<ts.Node>): boolean {
  expression = unparenthesized(expression);
  if (ts.isIdentifier(expression)) {
    const declaration = context.lookup(expression);
    return declaration !== undefined && ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined
      && !seen.has(declaration) && nodeObjectFactoryValue(declaration.initializer, context, new Set(seen).add(declaration));
  }
  if (!ts.isObjectLiteralExpression(expression)) return false;
  // Later properties replace earlier ones; an opaque spread cannot establish an owner.
  for (let index = expression.properties.length - 1; index >= 0; index--) {
    const property = expression.properties[index];
    if (property === undefined) continue;
    if (ts.isSpreadAssignment(property)) return false;
    if (literalPropertyName(property.name) !== "createRequire") continue;
    if (ts.isPropertyAssignment(property)) return nodeFactoryValue(property.initializer, context, seen);
    return ts.isShorthandPropertyAssignment(property) && nodeFactoryValue(property.name, context, seen);
  }
  return false;
}

function nodeFactoryValue(expression: ts.Expression, context: NodeFactoryContext, seen: ReadonlySet<ts.Node>): boolean {
  expression = unparenthesized(expression);
  if (ts.isIdentifier(expression)) {
    const declaration = context.lookup(expression);
    if (declaration === undefined) return false;
    if (context.owners.factories.has(declaration)) return true;
    return ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined && !seen.has(declaration)
      && nodeFactoryValue(declaration.initializer, context, new Set(seen).add(declaration));
  }
  return ts.isPropertyAccessExpression(expression) && expression.name.text === "createRequire"
    && (nodeNamespaceValue(expression.expression, context, seen)
      || nodeObjectFactoryValue(expression.expression, context, seen));
}

function nodeFactoryLookup(source: ts.SourceFile, lookup: ReturnType<typeof syntaxBindingLookup>): (expression: ts.Expression) => boolean {
  const owners: NodeFactoryOwners = { factories: new Set(), namespaces: new Set() };
  for (const statement of source.statements) collectNodeImport(statement, owners);
  const context: NodeFactoryContext = { owners, lookup };
  return (expression) => nodeFactoryValue(expression, context, new Set());
}

function moduleReferences(source: ts.SourceFile): { node: ts.Node; specifier: string }[] {
  const lookup = syntaxBindingLookup(source);
  const factory = nodeFactoryLookup(source, lookup);
  const loaders = new Set<ts.Node>();
  const isFactoryCall = (node: ts.Node | undefined): node is ts.CallExpression =>
    node !== undefined && ts.isCallExpression(node) && factory(node.expression);
  const isLoader = (node: ts.Expression): boolean => ts.isIdentifier(node) && loaders.has(lookup(node) ?? source);
  const collect = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && isFactoryCall(node.initializer)) {
      loaders.add(node);
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
      const returnedRequire = isLoader(node.expression) || isFactoryCall(node.expression);
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword || directRequire || moduleRequire || returnedRequire) {
        specifier = literal(node.arguments[0]);
      }
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      specifier = literal(node.moduleReference.expression);
    }
    if (specifier !== undefined) references.push({ node, specifier });
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === "require") || isLoader(node.expression)
      || (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === "module" && node.expression.name.text === "require")
      || isFactoryCall(node.expression))) references.push({ node, specifier: "<computed import>" });
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

function typeOnlyReference(node: ts.Node): boolean {
  if (ts.isImportTypeNode(node)) return true;
  if (ts.isImportEqualsDeclaration(node)) return node.isTypeOnly;
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    const names = clause?.namedBindings;
    return clause?.phaseModifier === ts.SyntaxKind.TypeKeyword || (clause !== undefined && clause.name === undefined
      && names !== undefined && ts.isNamedImports(names) && names.elements.length > 0
      && names.elements.every((entry) => entry.isTypeOnly));
  }
  if (ts.isExportDeclaration(node)) {
    const names = node.exportClause;
    return node.isTypeOnly || (names !== undefined && ts.isNamedExports(names) && names.elements.length > 0
      && names.elements.every((entry) => entry.isTypeOnly));
  }
  return false;
}

function rawStateViolations(source: ts.SourceFile, filename: string, sourceRoot: string): ArchitectureImportViolation[] {
  const file = resolve(filename);
  const owners = new Set(RAW_STATE_MODULES.map((path) => join(sourceRoot, path)));
  if (within(join(sourceRoot, "lib/store"), file) || owners.has(file)) return [];
  return moduleReferences(source).flatMap(({ node, specifier }): ArchitectureImportViolation[] => {
    if (!specifier.startsWith(".") || typeOnlyReference(node)) return [];
    const target = resolve(dirname(filename), specifier.replace(/\.js$/u, ".ts"));
    if (!owners.has(target)) return [];
    const helper = relative(sourceRoot, target).replaceAll("\\", "/");
    return [{ node, predicate: "store-raw-state", reason: `raw state helper ${helper} outside the store` }];
  });
}

function surfaceNameViolations(source: ts.SourceFile): ArchitectureImportViolation[] {
  const violations: ArchitectureImportViolation[] = [];
  const specifiers = new Set<ts.Node>();
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier !== undefined) {
      specifiers.add(node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      specifiers.add(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined) {
      specifiers.add(node.arguments[0]);
    } else if (ts.isExternalModuleReference(node)) {
      specifiers.add(node.expression);
    } else if (!specifiers.has(node)
      && (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node))) {
      const name = SURFACE_NAME.exec(node.text)?.[0];
      if (name !== undefined) {
        violations.push({ node, predicate: "surface-names", reason: `surface name ${name} outside the layout resolver` });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function configuredIdentityViolations(source: ts.SourceFile): ArchitectureImportViolation[] {
  const violations: ArchitectureImportViolation[] = [];
  const orderedLiterals = (nodes: readonly ts.Node[]): (string | undefined)[] =>
    nodes.flatMap((node) => ts.isArrayLiteralExpression(node) ? orderedLiterals(node.elements) : [literal(node)]);
  const isGitRead = (nodes: readonly ts.Node[]): boolean => {
    const values = orderedLiterals(nodes);
    const config = values.indexOf("config");
    const get = values.indexOf("--get", config + 1);
    return config >= 0 && get > config && values.indexOf("arc.identity", get + 1) > get;
  };
  const visit = (node: ts.Node): void => {
    const direct = ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === "gitConfigGet" && node.arguments.some((argument) => literal(argument) === "arc.identity");
    const argumentsRead = ts.isArrayLiteralExpression(node) ? isGitRead(node.elements)
      : ts.isCallExpression(node) && isGitRead(node.arguments);
    if (direct || argumentsRead) violations.push({ node, predicate: "configured-identity", reason: "direct configured identity read outside identity owner" });
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

function additionalDependencyViolations(
  references: ReturnType<typeof moduleReferences>, filename: string, sourceRoot: string, predicates: readonly ArchitecturePredicate[],
): ArchitectureImportViolation[] {
  const enabled = predicates.filter((predicate) => ["layout-dependencies", "layout-private", "layout-downward",
    "store-concurrency", "store-reference"].includes(predicate));
  if (!enabled.length) return [];
  const violations: ArchitectureImportViolation[] = [];
  const concurrencyRoot = join(sourceRoot, "lib/store/concurrency");
  const referenceRoot = resolve(sourceRoot, "../__tests__/helpers/store");
  for (const { node, specifier } of references) {
    for (const predicate of enabled) {
      let forbidden = false;
      if (predicate === "layout-dependencies") {
        forbidden = !["zod", "node:path", "../kernel/index.js"].includes(specifier) && !specifier.startsWith("./");
      } else if (predicate === "layout-private") {
        forbidden = specifier.includes("layout/") && !specifier.endsWith("layout/index.js");
      } else if (predicate === "layout-downward") {
        forbidden = specifier.includes("layout/") && !specifier.includes("lib/layout/index.js");
      } else if (predicate === "store-concurrency") {
        const target = resolve(dirname(filename), specifier);
        forbidden = specifier !== "node-diff3" && (!specifier.startsWith(".") ||
          !(target.startsWith(concurrencyRoot + sep) || target.startsWith(join(sourceRoot, "lib/kernel") + sep)
            || dirname(target) === join(sourceRoot, "lib/store")));
      } else if (predicate === "store-reference") {
        // Static, dynamic and type imports are already refused by the compiler's source root.
        if (!ts.isCallExpression(node) || node.expression.kind === ts.SyntaxKind.ImportKeyword) continue;
        const target = ts.resolveModuleName(specifier, filename, { moduleResolution: ts.ModuleResolutionKind.Node16 }, ts.sys)
          .resolvedModule?.resolvedFileName ?? resolve(dirname(filename), specifier);
        const path = relative(referenceRoot, target);
        forbidden = path === "" || (!path.startsWith(".." + sep) && path !== ".." && !isAbsolute(path));
      }
      if (forbidden) violations.push({ node, predicate, reason: `forbidden module reference ${specifier}` });
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
  const references = predicates.some((predicate) => predicate === "clack" || predicate === "neverthrow" || predicate.startsWith("layout-")
    || predicate === "store-concurrency" || predicate === "store-reference") ? moduleReferences(source) : [];
  if (predicates.includes("clack")) {
    violations.push(...references.filter(({ specifier }) => specifier === "@clack/prompts")
      .map(({ node }): ArchitectureImportViolation => ({ node, predicate: "clack", reason: "raw prompt import outside terminal/renderer owners" })));
  }
  if (predicates.includes("neverthrow") && !within(join(sourceRoot, "lib/kernel"), resolve(filename))) {
    violations.push(...references.filter(({ specifier }) => specifier === "neverthrow")
      .map(({ node }): ArchitectureImportViolation => ({ node, predicate: "neverthrow", reason: "neverthrow import outside kernel Result seam" })));
  }
  if (predicates.includes("store-production") || predicates.includes("store-tests")) {
    violations.push(...storeViolations(source, filename, sourceRoot, predicates));
  }
  violations.push(...additionalDependencyViolations(references, filename, sourceRoot, predicates));
  if (predicates.includes("configured-identity")) violations.push(...configuredIdentityViolations(source));
  if (predicates.includes("store-raw-state")) violations.push(...rawStateViolations(source, filename, sourceRoot));
  if (predicates.includes("surface-names")) violations.push(...surfaceNameViolations(source));
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
 * @param accepted - Predicate IDs this rule accepts; every predicate by default.
 * @returns ESLint rule definition consuming predicate IDs.
 */
export function createArchitectureImportsRule(
  sourceRoot: string, accepted: readonly ArchitecturePredicate[] = ARCHITECTURE_PREDICATES,
): Rule.RuleModule {
  return {
    meta: {
      type: "problem",
      schema: [{ type: "array", items: { enum: [...accepted] }, uniqueItems: true }],
      messages: { boundary: "{{predicate}}: {{reason}}" },
    },
    create(context) {
      const options: unknown = context.options[0];
      if (!Array.isArray(options) || !options.every((value): value is ArchitecturePredicate =>
        accepted.some((predicate) => predicate === value))) {
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
