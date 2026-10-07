/** Single-file syntax bindings for exported prompt constants and their passing calls. */
import { posix } from "node:path";
import ts from "typescript";
import { ArcError } from "../kernel/index.js";

interface ImportedBinding { readonly file: string; readonly exported: string }
interface ModuleBindings {
  readonly file: ts.SourceFile;
  readonly imports: ReadonlyMap<string, ImportedBinding>;
  readonly sites: Map<string, { id: string; declaration: ts.VariableDeclaration }>;
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

function importedBindings(file: ts.SourceFile, sources: Readonly<Record<string, string>>): Map<string, ImportedBinding> {
  const result = new Map<string, ImportedBinding>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined) continue;
    const base = posix.normalize(posix.join(posix.dirname(file.fileName), statement.moduleSpecifier.text.replace(/\.js$/u, "")));
    const target = `${base}.ts` in sources ? `${base}.ts` : `${base}/index.ts` in sources ? `${base}/index.ts` : `${base}.ts`;
    if (ts.isNamespaceImport(bindings)) result.set(bindings.name.text, { file: target, exported: "*" });
    else for (const binding of bindings.elements) result.set(binding.name.text,
      { file: target, exported: binding.propertyName?.text ?? binding.name.text });
  }
  return result;
}
function canonicalImport(module: ModuleBindings, expression: ts.Expression, symbol: "declarePromptSite" | "prompt"): boolean {
  const owner = ts.isPropertyAccessExpression(expression) && expression.name.text === symbol
    ? expression.expression : ts.isElementAccessExpression(expression)
      && ts.isStringLiteralLike(expression.argumentExpression) && expression.argumentExpression.text === symbol
      ? expression.expression : undefined;
  const binding = ts.isIdentifier(expression) ? module.imports.get(expression.text)
    : owner !== undefined && ts.isIdentifier(owner) ? module.imports.get(owner.text) : undefined;
  return binding !== undefined && binding.exported === (owner === undefined ? symbol : "*")
    && ["lib/command-input/declaration.ts", "lib/command-input/prompter.ts",
    "lib/command-input/index.ts"].includes(binding.file);
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
    return [path, { file, imports: importedBindings(file, sources), sites: new Map() }] as const;
  }));
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
