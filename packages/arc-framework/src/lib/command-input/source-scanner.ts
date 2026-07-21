/**
 * TypeScript-AST discovery for Commander syntax and interaction-capable source sites.
 */

import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

import ts from "typescript";

interface SourceInput {
  readonly file: string;
  readonly sourceText: string;
}

/** Stable source locus emitted by the scanner. */
export interface DiscoveredSourceLocus {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** Commander operand syntax owned by a canonical command path. */
export interface DiscoveredOperand extends DiscoveredSourceLocus {
  readonly name: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

/** Commander option syntax owned by a canonical command path. */
export interface DiscoveredOption extends DiscoveredSourceLocus {
  readonly flags: string;
  readonly valueName: string | null;
  readonly required: boolean;
  readonly variadic: boolean;
  readonly choices: readonly string[];
  readonly defaultValue?: string | number | boolean;
  readonly conflicts: readonly string[];
}

/** Handler adapter reached by a command's action callback. */
export interface DiscoveredAction extends DiscoveredSourceLocus {
  readonly symbol: string;
  readonly interactionContext: boolean;
}

/** Canonical command and its syntax-discovered input surface. */
export interface DiscoveredCommand {
  readonly path: string;
  readonly aliases: readonly string[];
  readonly hidden: boolean;
  readonly operands: readonly DiscoveredOperand[];
  readonly options: readonly DiscoveredOption[];
  readonly allowUnknownOption: boolean;
  readonly action: DiscoveredAction | null;
  readonly source: DiscoveredSourceLocus;
}

/** Result of scanning the Commander entry module. */
export interface CommanderSourceScan {
  readonly commands: readonly DiscoveredCommand[];
}

/** Interaction-capable syntax class found outside the Commander tree. */
export type DiscoveredInteractionKind =
  | "prompt"
  | "prompt-helper"
  | "environment-policy"
  | "explicit-stdin"
  | "subprocess";

/** One prompt, explicit-stdin, or process-launch source site. */
export interface DiscoveredInteractionSite extends DiscoveredSourceLocus {
  readonly kind: DiscoveredInteractionKind;
  readonly callee: string;
}

/** Result of scanning one source module for interaction-capable sites. */
export interface InteractionSourceScan {
  readonly sites: readonly DiscoveredInteractionSite[];
}

/** Complete source discovery used by inventory reconciliation. */
export interface CommandInputSourceInventory {
  readonly commands: readonly DiscoveredCommand[];
  readonly interactions: readonly DiscoveredInteractionSite[];
}

function sourceFile(input: SourceInput): ts.SourceFile {
  return ts.createSourceFile(input.file, input.sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function locus(file: ts.SourceFile, node: ts.Node, path: string): DiscoveredSourceLocus {
  const point = file.getLineAndCharacterOfPosition(node.getStart(file));
  return { file: path, line: point.line + 1, column: point.character + 1 };
}

function stringValue(node: ts.Node | undefined): string | undefined {
  return node !== undefined && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;
}

function literalValue(node: ts.Node | undefined): string | number | boolean | undefined {
  if (node === undefined) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

function methodCall(node: ts.CallExpression): { receiver: ts.Expression; name: string } | undefined {
  return ts.isPropertyAccessExpression(node.expression)
    ? { receiver: node.expression.expression, name: node.expression.name.text }
    : undefined;
}

function commandName(syntax: string): string {
  return syntax.trim().split(/\s+/u)[0] ?? syntax;
}

function parseOperandSyntax(syntax: string): { name: string; required: boolean; variadic: boolean } | undefined {
  const match = /([<[\]])([^<>[\]]+)([>\]])/u.exec(syntax);
  if (match === null) return undefined;
  const rawName = match[2] ?? "";
  return {
    name: rawName.replace(/\.\.\.$/u, ""),
    required: match[1] === "<",
    variadic: rawName.endsWith("..."),
  };
}

function commandOperand(syntax: string, source: DiscoveredSourceLocus): DiscoveredOperand | undefined {
  const parsed = parseOperandSyntax(syntax);
  return parsed === undefined ? undefined : { ...parsed, ...source };
}

function chainedCalls(commandCall: ts.CallExpression): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  let current: ts.Node = commandCall;
  while (
    ts.isPropertyAccessExpression(current.parent)
    && current.parent.expression === current
    && ts.isCallExpression(current.parent.parent)
  ) {
    const call = current.parent.parent;
    calls.push(call);
    current = call;
  }
  return calls;
}

function stringsFromArray(node: ts.Node | undefined): readonly string[] {
  if (node === undefined) return [];
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.flatMap((element) => {
      const value = stringValue(element);
      return value === undefined ? [] : [value];
    });
  }
  const scalar = stringValue(node);
  return scalar === undefined ? [] : [scalar];
}

function optionConstructor(expression: ts.Expression | undefined): ts.NewExpression | undefined {
  let current = expression;
  while (current !== undefined && ts.isCallExpression(current)) {
    const method = methodCall(current);
    if (method === undefined) return undefined;
    current = method.receiver;
  }
  return current !== undefined && ts.isNewExpression(current) ? current : undefined;
}

function optionDecorators(expression: ts.Expression): readonly ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  let current: ts.Expression = expression;
  while (ts.isCallExpression(current)) {
    calls.unshift(current);
    const method = methodCall(current);
    if (method === undefined) break;
    current = method.receiver;
  }
  return calls;
}

function parseOption(
  call: ts.CallExpression,
  file: ts.SourceFile,
  path: string,
): DiscoveredOption | undefined {
  const method = methodCall(call);
  if (method === undefined || (method.name !== "option" && method.name !== "addOption")) return undefined;
  let flags: string | undefined;
  let decorators: readonly ts.CallExpression[] = [];
  if (method.name === "option") {
    flags = stringValue(call.arguments[0]);
  } else {
    const optionExpression = call.arguments[0];
    const constructor = optionConstructor(optionExpression);
    flags = stringValue(constructor?.arguments?.[0]);
    if (constructor !== undefined && optionExpression !== undefined) decorators = optionDecorators(optionExpression);
  }
  if (flags === undefined) return undefined;

  const value = parseOperandSyntax(flags);
  let choices: readonly string[] = [];
  let defaultValue: string | number | boolean | undefined;
  let conflicts: readonly string[] = [];
  for (const decorator of decorators) {
    const decoratorMethod = methodCall(decorator);
    if (decoratorMethod?.name === "choices") choices = stringsFromArray(decorator.arguments[0]);
    if (decoratorMethod?.name === "default") defaultValue = literalValue(decorator.arguments[0]);
    if (decoratorMethod?.name === "conflicts") conflicts = stringsFromArray(decorator.arguments[0]);
  }
  return {
    flags,
    valueName: value?.name ?? null,
    required: value?.required ?? false,
    variadic: value?.variadic ?? false,
    choices,
    ...(defaultValue === undefined ? {} : { defaultValue }),
    conflicts,
    ...locus(file, call, path),
  };
}

function actionSymbol(call: ts.CallExpression): string {
  const candidate = call.arguments[0];
  if (candidate === undefined) return "anonymous";
  if (ts.isIdentifier(candidate)) return candidate.text;
  let found: string | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return;
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      const name = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
      if (name?.startsWith("handle") === true || name?.startsWith("run") === true) found = name;
    }
    ts.forEachChild(node, visit);
  };
  visit(candidate);
  return found ?? "anonymous";
}

function actionUsesInteractionContext(call: ts.CallExpression): boolean {
  const candidate = call.arguments[0];
  return candidate !== undefined
    && ts.isCallExpression(candidate)
    && ts.isIdentifier(candidate.expression)
    && candidate.expression.text === "withInteractionContext";
}

/** Extract the canonical Commander tree and its syntax-owned values. */
export function scanCommanderSource(input: SourceInput): CommanderSourceScan {
  const file = sourceFile(input);
  const initializers = new Map<string, ts.Expression>();
  const visitInitializers = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      initializers.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visitInitializers);
  };
  visitInitializers(file);

  const resolveExpression = (expression: ts.Expression, seen = new Set<string>()): readonly string[] | undefined => {
    if (ts.isIdentifier(expression)) {
      if (expression.text === "program") return [];
      if (seen.has(expression.text)) return undefined;
      const initializer = initializers.get(expression.text);
      if (initializer === undefined) return undefined;
      return resolveExpression(initializer, new Set([...seen, expression.text]));
    }
    if (!ts.isCallExpression(expression)) return undefined;
    const method = methodCall(expression);
    if (method === undefined) return undefined;
    const parent = resolveExpression(method.receiver, seen);
    if (parent === undefined) return undefined;
    if (method.name !== "command") return parent;
    const syntax = stringValue(expression.arguments[0]);
    return syntax === undefined ? undefined : [...parent, commandName(syntax)];
  };

  const commands: DiscoveredCommand[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const method = methodCall(node);
      if (method?.name === "command") {
        const syntax = stringValue(node.arguments[0]);
        const parent = resolveExpression(method.receiver);
        if (syntax !== undefined && parent !== undefined) {
          const pathParts = [...parent, commandName(syntax)];
          const calls = chainedCalls(node);
          const aliases: string[] = [];
          const operands: DiscoveredOperand[] = [];
          const inlineOperand = commandOperand(syntax, locus(file, node, input.file));
          if (inlineOperand !== undefined) operands.push(inlineOperand);
          const options: DiscoveredOption[] = [];
          let allowUnknownOption = false;
          let action: DiscoveredAction | null = null;
          for (const call of calls) {
            const chainedMethod = methodCall(call);
            if (chainedMethod?.name === "alias") {
              const alias = stringValue(call.arguments[0]);
              if (alias !== undefined) aliases.push([...parent, alias].join(" "));
            }
            if (chainedMethod?.name === "argument") {
              const argumentSyntax = stringValue(call.arguments[0]);
              const operand = argumentSyntax === undefined
                ? undefined
                : commandOperand(argumentSyntax, locus(file, call, input.file));
              if (operand !== undefined) operands.push(operand);
            }
            const option = parseOption(call, file, input.file);
            if (option !== undefined) options.push(option);
            if (chainedMethod?.name === "allowUnknownOption") allowUnknownOption = true;
            if (chainedMethod?.name === "action") {
              action = {
                symbol: actionSymbol(call),
                interactionContext: actionUsesInteractionContext(call),
                ...locus(file, call, input.file),
              };
            }
          }
          const hiddenArgument = node.arguments[1];
          commands.push({
            path: pathParts.join(" "),
            aliases,
            hidden: hiddenArgument !== undefined && hiddenArgument.getText(file).includes("hidden: true"),
            operands,
            options,
            allowUnknownOption,
            action,
            source: locus(file, node, input.file),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  commands.sort((left, right) => left.source.line - right.source.line);
  return { commands };
}

function calleeText(call: ts.CallExpression, file: ts.SourceFile): string {
  return call.expression.getText(file);
}

function isExplicitStdinUse(node: ts.PropertyAccessExpression): boolean {
  if (
    ts.isPropertyAccessExpression(node.parent)
    && node.parent.expression === node
    && node.parent.name.text === "setEncoding"
    && ts.isCallExpression(node.parent.parent)
  ) return true;
  let current: ts.Node = node;
  while (!ts.isStatement(current.parent)) current = current.parent;
  return ts.isForOfStatement(current.parent) && current.parent.awaitModifier !== undefined;
}

/** Discover prompt, helper, explicit-stdin, and process-launch source sites. */
export function scanInteractionSource(input: SourceInput): InteractionSourceScan {
  const file = sourceFile(input);
  const promptNamespaces = new Set<string>();
  const processFunctions = new Set<string>();
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const clause = statement.importClause;
    if (statement.moduleSpecifier.text === "@clack/prompts" && clause?.namedBindings !== undefined) {
      if (ts.isNamespaceImport(clause.namedBindings)) promptNamespaces.add(clause.namedBindings.name.text);
    }
    if (["execa", "node:child_process"].includes(statement.moduleSpecifier.text)) {
      if (clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) processFunctions.add(element.name.text);
      }
    }
  }
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      if (
        ts.isCallExpression(declaration.initializer)
        && ts.isIdentifier(declaration.initializer.expression)
        && declaration.initializer.expression.text === "promisify"
      ) {
        const target = declaration.initializer.arguments[0];
        if (target !== undefined && ts.isIdentifier(target) && processFunctions.has(target.text)) {
          processFunctions.add(declaration.name.text);
        }
      }
    }
  }

  const sites: Array<DiscoveredInteractionSite & { readonly position: number }> = [];
  const promptNames = new Set([
    "text",
    "select",
    "multiselect",
    "autocompleteMultiselect",
    "confirm",
    "password",
    "group",
  ]);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeText(node, file);
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = node.expression.expression.getText(file);
        const name = node.expression.name.text;
        if (promptNamespaces.has(receiver) && promptNames.has(name)) {
          sites.push({ kind: "prompt", callee, position: node.getStart(file), ...locus(file, node, input.file) });
        } else if (/\.output$/u.test(receiver) && ["confirm", "select", "text"].includes(name)) {
          sites.push({ kind: "prompt-helper", callee, position: node.getStart(file), ...locus(file, node, input.file) });
        }
      }
      if (ts.isIdentifier(node.expression) && processFunctions.has(node.expression.text)) {
        sites.push({ kind: "subprocess", callee, position: node.getStart(file), ...locus(file, node, input.file) });
      }
    }
    if (
      ts.isPropertyAccessExpression(node)
      && node.expression.getText(file) === "process"
      && node.name.text === "stdin"
    ) {
      const isTtyRead = ts.isPropertyAccessExpression(node.parent) && node.parent.name.text === "isTTY";
      if (isTtyRead || isExplicitStdinUse(node)) {
        sites.push({
          kind: isTtyRead ? "environment-policy" : "explicit-stdin",
          callee: "process.stdin",
          position: node.getStart(file),
          ...locus(file, node, input.file),
        });
      }
    }
    if (
      ts.isPropertyAccessExpression(node)
      && node.getText(file) === "process.env.CI"
      // The shared resolver is the policy boundary, not a command-owned
      // acquisition site. Raw CI reads anywhere else remain inventory sites.
      && input.file !== "lib/command-input/interaction-context.ts"
    ) {
      sites.push({
        kind: "environment-policy",
        callee: "process.env.CI",
        position: node.getStart(file),
        ...locus(file, node, input.file),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  sites.sort((left, right) => left.position - right.position);
  return {
    sites: sites.map((site) => ({
      kind: site.kind,
      callee: site.callee,
      file: site.file,
      line: site.line,
      column: site.column,
    })),
  };
}

async function typescriptFiles(root: string): Promise<readonly string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") ? [path] : [];
  }));
  return nested.flat().sort();
}

function importedModuleSpecifiers(sourceText: string, fileName: string): readonly string[] {
  const file = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return file.statements.flatMap((statement) => {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      && statement.moduleSpecifier !== undefined
      && ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      return statement.moduleSpecifier.text.startsWith(".") ? [statement.moduleSpecifier.text] : [];
    }
    return [];
  });
}

async function cliReachableTypescriptFiles(sourceRoot: string, cliFile: string): Promise<readonly string[]> {
  const allFiles = await typescriptFiles(sourceRoot);
  const byPath = new Map(allFiles.map((file) => [resolve(file), file]));
  const pending = [resolve(cliFile)];
  const reachable = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || reachable.has(file)) continue;
    reachable.add(file);
    const sourceText = await readFile(file, "utf8");
    for (const specifier of importedModuleSpecifiers(sourceText, file)) {
      const base = resolve(file, "..", specifier.replace(/\.js$/u, ""));
      const target = byPath.get(`${base}.ts`) ?? byPath.get(resolve(base, "index.ts"));
      if (target !== undefined && !reachable.has(resolve(target))) pending.push(resolve(target));
    }
  }
  return [...reachable].sort();
}

/**
 * Scan the canonical CLI module and its reachable TypeScript module graph.
 *
 * @param options - Package source root and optional CLI module path.
 * @returns Deterministically ordered command and interaction discoveries.
 */
export async function scanCommandInputSources(options: {
  readonly sourceRoot: string;
  readonly cliFile?: string;
}): Promise<CommandInputSourceInventory> {
  const sourceRoot = resolve(options.sourceRoot);
  const cliFile = resolve(options.cliFile ?? resolve(sourceRoot, "cli.ts"));
  const cliText = await readFile(cliFile, "utf8");
  const commands = scanCommanderSource({
    file: relative(sourceRoot, cliFile).replaceAll("\\", "/"),
    sourceText: cliText,
  }).commands;
  const files = await cliReachableTypescriptFiles(sourceRoot, cliFile);
  const interactions = (await Promise.all(files.map(async (file) => scanInteractionSource({
    file: relative(sourceRoot, file).replaceAll("\\", "/"),
    sourceText: await readFile(file, "utf8"),
  }).sites))).flat().sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    return left.column - right.column;
  });
  return { commands, interactions };
}
