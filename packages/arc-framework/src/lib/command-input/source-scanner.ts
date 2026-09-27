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
  /** Whether Commander requires the option itself to be present. */
  readonly presenceRequired: boolean;
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

function parseOperandSyntax(syntax: string): readonly { name: string; required: boolean; variadic: boolean }[] {
  const operands: { name: string; required: boolean; variadic: boolean }[] = [];
  const pattern = /([<[])([^<>[\]]+)([>\]])/gu;
  for (const match of syntax.matchAll(pattern)) {
    const rawName = match[2] ?? "";
    operands.push({
      name: rawName.replace(/\.\.\.$/u, ""),
      required: match[1] === "<",
      variadic: rawName.endsWith("..."),
    });
  }
  return operands;
}

function commandOperands(syntax: string, source: DiscoveredSourceLocus): readonly DiscoveredOperand[] {
  return parseOperandSyntax(syntax).map((parsed) => ({ ...parsed, ...source }));
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
    if (methodCall(call)?.name === "command") break;
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
  if (
    method === undefined
    || (method.name !== "option" && method.name !== "requiredOption" && method.name !== "addOption")
  ) return undefined;
  let flags: string | undefined;
  let decorators: readonly ts.CallExpression[] = [];
  if (method.name === "option" || method.name === "requiredOption") {
    flags = stringValue(call.arguments[0]);
  } else {
    const optionExpression = call.arguments[0];
    const constructor = optionConstructor(optionExpression);
    flags = stringValue(constructor?.arguments?.[0]);
    if (constructor !== undefined && optionExpression !== undefined) decorators = optionDecorators(optionExpression);
  }
  if (flags === undefined) return undefined;

  const value = parseOperandSyntax(flags)[0];
  let choices: readonly string[] = [];
  let defaultValue = method.name === "option" || method.name === "requiredOption"
    ? literalValue(call.arguments[2])
    : undefined;
  let conflicts: readonly string[] = [];
  let presenceRequired = method.name === "requiredOption";
  for (const decorator of decorators) {
    const decoratorMethod = methodCall(decorator);
    if (decoratorMethod?.name === "choices") choices = stringsFromArray(decorator.arguments[0]);
    if (decoratorMethod?.name === "default") defaultValue = literalValue(decorator.arguments[0]);
    if (decoratorMethod?.name === "conflicts") conflicts = stringsFromArray(decorator.arguments[0]);
    if (decoratorMethod?.name === "makeOptionMandatory") {
      presenceRequired = literalValue(decorator.arguments[0]) !== false;
    }
  }
  if (defaultValue !== undefined) presenceRequired = false;
  return {
    flags,
    valueName: value?.name ?? null,
    required: value?.required ?? false,
    presenceRequired,
    variadic: value?.variadic ?? false,
    choices,
    ...(defaultValue === undefined ? {} : { defaultValue }),
    conflicts,
    ...locus(file, call, path),
  };
}

function rejectsJsonOption(calls: readonly ts.CallExpression[]): boolean {
  return calls.some((call) => {
    const method = methodCall(call);
    const handler = call.arguments[1];
    if (handler === undefined || !ts.isIdentifier(handler)) return false;
    return (
      method?.name === "on"
      && stringValue(call.arguments[0]) === "option:json"
      && handler.text === "rejectUnsupportedReviewOutputJson"
    ) || (
      method?.name === "hook"
      && stringValue(call.arguments[0]) === "preAction"
      && handler.text === "rejectUnsupportedReviewJson"
    );
  });
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
          const rejectsJson = rejectsJsonOption(calls);
          const aliases: string[] = [];
          const operands: DiscoveredOperand[] = [];
          operands.push(...commandOperands(syntax, locus(file, node, input.file)));
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
              if (argumentSyntax !== undefined) {
                operands.push(...commandOperands(argumentSyntax, locus(file, call, input.file)));
              }
            }
            const option = parseOption(call, file, input.file);
            // A flag wired solely to an explicit refusal is not an accepted command input.
            if (option !== undefined && !(rejectsJson && option.flags === "--json")) options.push(option);
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

/**
 * Collect relative module specifiers that contribute to one source module's reachable graph.
 *
 * @param sourceText - TypeScript source to inspect.
 * @param fileName - Filename used for TypeScript parsing and diagnostics.
 * @returns Relative module specifiers in source order.
 */
export function importedModuleSpecifiers(sourceText: string, fileName: string): readonly string[] {
  const file = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const specifiers: Array<{ readonly position: number; readonly value: string }> = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteral(node.moduleSpecifier)
      && node.moduleSpecifier.text.startsWith(".")
    ) {
      specifiers.push({ position: node.getStart(file), value: node.moduleSpecifier.text });
    } else if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
    ) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteral(argument) && argument.text.startsWith(".")) {
        specifiers.push({ position: node.getStart(file), value: argument.text });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return specifiers.sort((left, right) => left.position - right.position).map(({ value }) => value);
}

async function loadTypescriptSources(sourceRoot: string): Promise<Readonly<Record<string, string>>> {
  const files = await typescriptFiles(sourceRoot);
  const entries = await Promise.all(files.map(async (file) => [
    relative(sourceRoot, file).replaceAll("\\", "/"),
    await readFile(file, "utf8"),
  ] as const));
  return Object.fromEntries(entries);
}

function cliReachableTypescriptFiles(
  sourceRoot: string,
  cliFile: string,
  sourceFiles: Readonly<Record<string, string>>,
): readonly string[] {
  const byPath = new Map(Object.keys(sourceFiles).map((file) => [resolve(sourceRoot, file), file]));
  const pending = [resolve(cliFile)];
  const reachable = new Set<string>();
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined || reachable.has(file)) continue;
    reachable.add(file);
    const relativeFile = relative(sourceRoot, file).replaceAll("\\", "/");
    const sourceText = sourceFiles[relativeFile];
    if (sourceText === undefined) continue;
    for (const specifier of importedModuleSpecifiers(sourceText, file)) {
      const base = resolve(file, "..", specifier.replace(/\.js$/u, ""));
      const target = byPath.get(`${base}.ts`) ?? byPath.get(resolve(base, "index.ts"));
      if (target !== undefined) {
        const absoluteTarget = resolve(sourceRoot, target);
        if (!reachable.has(absoluteTarget)) pending.push(absoluteTarget);
      }
    }
  }
  return [...reachable].map((file) => relative(sourceRoot, file).replaceAll("\\", "/")).sort();
}

/** One filesystem snapshot shared by discovery and declaration-source checks. */
export interface CommandInputSourceSnapshot {
  readonly source: CommandInputSourceInventory;
  readonly sourceFiles: Readonly<Record<string, string>>;
}

/**
 * Read the TypeScript source tree once and derive every command-input discovery
 * from that immutable text snapshot.
 *
 * @param options - Package source root and optional CLI module path.
 * @returns Source discoveries and the exact texts from which they were derived.
 */
export async function loadCommandInputSourceSnapshot(options: {
  readonly sourceRoot: string;
  readonly cliFile?: string;
}): Promise<CommandInputSourceSnapshot> {
  const sourceRoot = resolve(options.sourceRoot);
  const cliFile = resolve(options.cliFile ?? resolve(sourceRoot, "cli.ts"));
  const sourceFiles = await loadTypescriptSources(sourceRoot);
  const cliPath = relative(sourceRoot, cliFile).replaceAll("\\", "/");
  const cliText = sourceFiles[cliPath];
  if (cliText === undefined) throw new Error(`CLI source is outside the source snapshot: ${cliFile}`);
  const commands = scanCommanderSource({ file: cliPath, sourceText: cliText }).commands;
  const files = cliReachableTypescriptFiles(sourceRoot, cliFile, sourceFiles);
  const interactions = files.flatMap((file) => scanInteractionSource({
    file,
    sourceText: sourceFiles[file] ?? "",
  }).sites).sort((left, right) => {
    if (left.file !== right.file) return left.file < right.file ? -1 : 1;
    if (left.line !== right.line) return left.line - right.line;
    return left.column - right.column;
  });
  return { source: { commands, interactions }, sourceFiles };
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
  return (await loadCommandInputSourceSnapshot(options)).source;
}
