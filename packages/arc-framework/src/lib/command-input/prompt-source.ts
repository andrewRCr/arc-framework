/** Single-file syntax bindings for exported prompt constants and their passing calls. */
import { posix } from "node:path";
import ts from "typescript";
import { ArcError } from "../kernel/index.js";
import { isSyntaxValueReference, syntaxBindingLookup } from "../syntax-bindings.js";

interface ImportedBinding { readonly file: string; readonly exported: string; readonly declaration: ts.Node }
const canonicalFiles = ["lib/command-input/declaration.ts", "lib/command-input/prompter.ts", "lib/command-input/index.ts"];
interface ModuleBindings {
  readonly file: ts.SourceFile;
  readonly imports: ReadonlyMap<string, ImportedBinding>;
  readonly sites: Map<string, { id: string; declaration: ts.VariableDeclaration }>;
  readonly lookup: ReturnType<typeof syntaxBindingLookup>;
}
/** Parsed source and declaration identities at concrete passing-call positions. */
export interface PromptSourceBinding {
  readonly id: string;
  readonly source: { readonly file: string; readonly symbol: string };
}
/** Parsed source and resolved prompt constants at concrete passing-call positions. */
export interface PromptSourceIndex {
  readonly files: ReadonlyMap<string, ts.SourceFile>;
  readonly calls: ReadonlyMap<string, ReadonlyMap<number, PromptSourceBinding>>;
}

function moduleTarget(file: ts.SourceFile, specifier: string, sources: Readonly<Record<string, string>>): string {
  const base = posix.normalize(posix.join(posix.dirname(file.fileName), specifier.replace(/\.js$/u, "")));
  return `${base}.ts` in sources ? `${base}.ts` : `${base}/index.ts` in sources ? `${base}/index.ts` : `${base}.ts`;
}
function importedBindings(file: ts.SourceFile, sources: Readonly<Record<string, string>>): Map<string, ImportedBinding> {
  const result = new Map<string, ImportedBinding>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || statement.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword) continue;
    const target = moduleTarget(file, statement.moduleSpecifier.text, sources);
    if (ts.isNamespaceImport(bindings)) result.set(bindings.name.text, { file: target, exported: "*", declaration: bindings });
    else for (const binding of bindings.elements) if (!binding.isTypeOnly) result.set(binding.name.text,
      { file: target, exported: binding.propertyName?.text ?? binding.name.text, declaration: binding });
  }
  return result;
}
function refuseReexports(file: ts.SourceFile, sources: Readonly<Record<string, string>>): void {
  if (canonicalFiles.includes(file.fileName)) return;
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly || statement.moduleSpecifier === undefined
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || !canonicalFiles.includes(moduleTarget(file, statement.moduleSpecifier.text, sources))) continue;
    const clause = statement.exportClause;
    const exportsFunctions = clause === undefined || !ts.isNamedExports(clause)
      || clause.elements.some((element) => !element.isTypeOnly && ["declarePromptSite", "prompt"].includes((element.propertyName ?? element.name).text));
    if (exportsFunctions) throw new ArcError("Canonical prompt functions cannot be re-exported from another facade",
      "command-input.inventory.unclassified");
  }
}
function canonicalBinding(module: ModuleBindings, identifier: ts.Identifier): ImportedBinding | undefined {
  const binding = module.imports.get(identifier.text);
  return binding !== undefined && module.lookup(identifier) === binding.declaration && canonicalFiles.includes(binding.file)
    ? binding : undefined;
}
function memberOwner(expression: ts.Expression, symbol: string): ts.Expression | undefined {
  return ts.isPropertyAccessExpression(expression) && expression.name.text === symbol
    ? expression.expression : ts.isElementAccessExpression(expression)
      && ts.isStringLiteralLike(expression.argumentExpression) && expression.argumentExpression.text === symbol
      ? expression.expression : undefined;
}
function canonicalImport(module: ModuleBindings, expression: ts.Expression, symbol: "declarePromptSite" | "prompt"): boolean {
  while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
  const owner = memberOwner(expression, symbol);
  const identifier = ts.isIdentifier(expression) ? expression : owner !== undefined && ts.isIdentifier(owner) ? owner : undefined;
  const binding = identifier === undefined ? undefined : canonicalBinding(module, identifier);
  return binding?.exported === (owner === undefined ? symbol : "*");
}
function namespaceFunction(module: ModuleBindings, identifier: ts.Identifier): ts.Expression | undefined {
  const parent = identifier.parent;
  if (!(ts.isPropertyAccessExpression(parent) && parent.expression === identifier)
    && !(ts.isElementAccessExpression(parent) && parent.expression === identifier && ts.isStringLiteralLike(parent.argumentExpression))) {
    throw new ArcError("Unsupported canonical prompt namespace reference", "command-input.inventory.unclassified");
  }
  return canonicalImport(module, parent, "declarePromptSite") || canonicalImport(module, parent, "prompt") ? parent : undefined;
}
function refuseUnsupportedReferences(module: ModuleBindings): void {
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && isSyntaxValueReference(node)) {
      const binding = canonicalBinding(module, node);
      if (binding !== undefined && ["*", "declarePromptSite", "prompt"].includes(binding.exported)) {
        let expression = binding.exported === "*" ? namespaceFunction(module, node) : node;
        if (expression !== undefined) {
          while (ts.isParenthesizedExpression(expression.parent)) expression = expression.parent;
          if (!ts.isCallExpression(expression.parent) || expression.parent.expression !== expression) {
            throw new ArcError("Canonical prompt function must be called directly", "command-input.inventory.unclassified");
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(module.file);
}
function exportedInitializer(node: ts.CallExpression): ts.VariableDeclaration | undefined {
  const declaration = node.parent;
  if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== node || !ts.isIdentifier(declaration.name)) return undefined;
  const list = declaration.parent;
  if (!ts.isVariableDeclarationList(list) || !(list.flags & ts.NodeFlags.Const)) return undefined;
  const statement = list.parent;
  return ts.isVariableStatement(statement) && ts.isSourceFile(statement.parent)
    && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ? declaration : undefined;
}
function collectDeclarations(module: ModuleBindings): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && canonicalImport(module, node.expression, "declarePromptSite")) {
      const declaration = exportedInitializer(node);
      const id = node.arguments[0];
      if (declaration === undefined || !ts.isIdentifier(declaration.name) || id === undefined || !ts.isStringLiteralLike(id)) {
        throw new ArcError("Prompt declaring-function call requires a literal id and an exported constant initializer",
          "command-input.inventory.unclassified");
      }
      module.sites.set(declaration.name.text, { id: id.text, declaration });
    }
    ts.forEachChild(node, visit);
  };
  visit(module.file);
}
function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) => ts.isOmittedExpression(element) ? [] : bindingNames(element.name));
}
function localDeclaration(block: ts.Block | ts.SourceFile, name: string): ts.Node | undefined {
  for (const statement of block.statements) {
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find((entry) => bindingNames(entry.name).includes(name));
      if (declaration !== undefined) return declaration;
    } else if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name) {
      return statement;
    }
  }
  return undefined;
}
function argumentBinding(module: ModuleBindings, argument: ts.Expression, modules: ReadonlyMap<string, ModuleBindings>):
  { kind: "site"; binding: PromptSourceBinding } | { kind: "parameter" } | { kind: "unresolved" } {
  if (!ts.isIdentifier(argument)) return { kind: "unresolved" };
  for (let scope = argument.parent; ; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      const declaration = localDeclaration(scope, argument.text);
      if (declaration !== undefined) {
        const site = module.sites.get(argument.text);
        return site?.declaration === declaration ? { kind: "site", binding: {
          id: site.id, source: { file: module.file.fileName, symbol: argument.text },
        } } : { kind: "unresolved" };
      }
    }
    if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => bindingNames(parameter.name).includes(argument.text))) {
      return { kind: "parameter" };
    }
    if (ts.isSourceFile(scope)) break;
  }
  const imported = module.imports.get(argument.text);
  const site = imported === undefined ? undefined : modules.get(imported.file)?.sites.get(imported.exported);
  return site === undefined || imported === undefined ? { kind: "unresolved" } : { kind: "site", binding: {
    id: site.id, source: { file: imported.file, symbol: imported.exported },
  } };
}
function passingCalls(module: ModuleBindings, modules: ReadonlyMap<string, ModuleBindings>,
  claimed: Map<string, string>): Map<number, PromptSourceBinding> {
  const calls = new Map<number, PromptSourceBinding>();
  const siteNames = new Set(module.sites.keys());
  for (const [name, binding] of module.imports) {
    if (modules.get(binding.file)?.sites.has(binding.exported)) siteNames.add(name);
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const prompt = canonicalImport(module, node.expression, "prompt");
      const argumentsToCheck = prompt ? node.arguments.slice(0, 1) : node.arguments;
      if (prompt && argumentsToCheck.length === 0) throw new ArcError("Unresolved prompt site argument", "command-input.inventory.unclassified");
      for (const argument of argumentsToCheck) {
        if (!prompt && (!ts.isIdentifier(argument) || !siteNames.has(argument.text))) continue;
        const binding = argumentBinding(module, argument, modules);
        if (prompt && binding.kind === "unresolved") {
          throw new ArcError(`Unresolved prompt site argument in ${module.file.fileName}`, "command-input.inventory.unclassified");
        }
        if (binding.kind !== "site") continue;
        if (claimed.has(binding.binding.id)) {
          throw new ArcError(`Prompt site ${binding.binding.id} is passed by more than one call`, "command-input.inventory.duplicate");
        }
        claimed.set(binding.binding.id, module.file.fileName);
        calls.set(node.getStart(module.file), binding.binding);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(module.file);
  return calls;
}

/**
 * Resolve prompt constant bindings and concrete calls from one immutable text snapshot.
 * @param sources - Source-relative module texts
 * @returns Reusable parsed files and passing-call identities
 */
export function buildPromptSourceIndex(sources: Readonly<Record<string, string>>): PromptSourceIndex {
  const modules = new Map<string, ModuleBindings>(Object.entries(sources).map(([path, text]) => {
    const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    refuseReexports(file, sources);
    return [path, { file, imports: importedBindings(file, sources), sites: new Map(), lookup: syntaxBindingLookup(file) }] as const;
  }));
  for (const module of modules.values()) refuseUnsupportedReferences(module);
  for (const module of modules.values()) collectDeclarations(module);
  const declarations = new Set<string>();
  for (const module of modules.values()) for (const site of module.sites.values()) {
    if (declarations.has(site.id)) {
      throw new ArcError(`Prompt site ${site.id} is declared by more than one constant`, "command-input.inventory.duplicate");
    }
    declarations.add(site.id);
  }
  const claimed = new Map<string, string>();
  const calls = new Map([...modules].map(([path, module]) => [path, passingCalls(module, modules, claimed)]));
  return { files: new Map([...modules].map(([path, module]) => [path, module.file])), calls };
}
