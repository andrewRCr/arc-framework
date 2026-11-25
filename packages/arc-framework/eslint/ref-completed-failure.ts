/** Require completed Git failure before ref-backend exit-code decisions. */

import { dirname, resolve } from "node:path";
import type { Rule } from "eslint";
import ts from "typescript";

type Helper = { parameter: string; expression: ts.Expression; declaration: ts.FunctionDeclaration };
const refRoot = resolve(import.meta.dirname, "../src/lib/store/ref");

/**
 * This is a conservative syntax guard, not a replacement for execution tests of process outcomes. It follows direct
 * const projections of an exit code; it does not infer `let` or reassigned aliases, or chains of aliases.
 */
function findUnguardedExitCodes(source: ts.SourceFile, filename: string): ts.Node[] {
  const helpers = new Map<string, Helper>();
  const completionNames = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)
      && statement.moduleSpecifier.text.startsWith(".")
      && resolve(refRoot, dirname(filename), statement.moduleSpecifier.text) === resolve(refRoot, "../../git/process-error.js")) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === "isCompletedGitFailure") completionNames.add(binding.name.text);
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body
      && statement.parameters.length === 1 && statement.body.statements.length === 1) {
      const parameter = statement.parameters[0]?.name;
      const result = statement.body.statements[0];
      if (parameter && ts.isIdentifier(parameter) && result && ts.isReturnStatement(result) && result.expression) {
        helpers.set(statement.name.text, { parameter: parameter.text, expression: result.expression, declaration: statement });
      }
    }
  }
  // Fail closed on any local binding of a canonical import or top-level helper name. This deliberately
  // rejects even non-overlapping shadows rather than pretending to resolve scopes.
  function rejectShadowedNames(node: ts.Node): void {
    if ((ts.isParameter(node) || ts.isVariableDeclaration(node) || ts.isBindingElement(node)
      || ts.isFunctionDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      completionNames.delete(node.name.text);
      if (helpers.get(node.name.text)?.declaration !== node) helpers.delete(node.name.text);
    }
    ts.forEachChild(node, rejectShadowedNames);
  }
  rejectShadowedNames(source);

  function operand(node: ts.Expression, aliases: ReadonlyMap<string, string>): string {
    return ts.isIdentifier(node) ? aliases.get(node.text) ?? node.text : node.getText(source);
  }
  // A true conjunction needs either side to prove completion; a true disjunction needs both.
  // The inverse applies to false conditions (the continuation after an early throw).
  function proves(node: ts.Expression, truth: boolean, error: string,
    aliases: ReadonlyMap<string, string> = new Map(), seen: ReadonlySet<string> = new Set()): boolean {
    if (ts.isParenthesizedExpression(node)) return proves(node.expression, truth, error, aliases, seen);
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
      return proves(node.operand, !truth, error, aliases, seen);
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      if (operator === ts.SyntaxKind.AmpersandAmpersandToken || operator === ts.SyntaxKind.BarBarToken) {
        const left = proves(node.left, truth, error, aliases, seen);
        const right = proves(node.right, truth, error, aliases, seen);
        return (operator === ts.SyntaxKind.AmpersandAmpersandToken) === truth ? left || right : left && right;
      }
    }
    if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
    const name = node.expression.text;
    const argument = node.arguments[0];
    if (!argument || node.arguments.length !== 1) return false;
    if (completionNames.has(name)) return truth && operand(argument, aliases) === error;
    const helper = helpers.get(name);
    if (!helper || seen.has(name)) return false;
    return proves(helper.expression, truth, error,
      new Map([...aliases, [helper.parameter, operand(argument, aliases)]]), new Set([...seen, name]));
  }
  function throws(statement: ts.Statement): boolean {
    return ts.isThrowStatement(statement) || ts.isBlock(statement)
      && statement.statements.length === 1 && !!statement.statements[0] && throws(statement.statements[0]);
  }
  function guardsBefore(node: ts.Node, error: string): boolean {
    if (!ts.isBlock(node.parent) && !ts.isSourceFile(node.parent)) return false;
    for (const statement of node.parent.statements) {
      if (statement === node) break;
      if (ts.isIfStatement(statement) && throws(statement.thenStatement) && proves(statement.expression, false, error)) return true;
    }
    return false;
  }
  const classificationOperators = new Set([
    ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken,
  ]);
  function isClassification(node: ts.Node): boolean {
    for (let ancestor = node; ancestor.parent && !ts.isStatement(ancestor); ancestor = ancestor.parent) {
      const parent = ancestor.parent;
      if (ts.isBinaryExpression(parent) && classificationOperators.has(parent.operatorToken.kind)) return true;
      if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return true;
      if (ts.isConditionalExpression(parent) && parent.condition === ancestor) return true;
      if ((ts.isIfStatement(parent) || ts.isSwitchStatement(parent)) && parent.expression === ancestor) return true;
    }
    return false;
  }
  function exitCodeReceiver(node: ts.Node): ts.Expression | undefined {
    return ts.isPropertyAccessExpression(node) && node.name.text === "exitCode" ? node.expression
      : ts.isElementAccessExpression(node) && node.argumentExpression
        && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === "exitCode" ? node.expression : undefined;
  }
  function binds(name: ts.BindingName, identifier: string): boolean {
    return ts.isIdentifier(name) ? name.text === identifier
      : name.elements.some(element => ts.isBindingElement(element) && binds(element.name, identifier));
  }
  function takesExitCode(element: ts.BindingElement): boolean {
    const property = element.propertyName ?? element.name;
    return !element.dotDotDotToken && (ts.isIdentifier(property) || ts.isStringLiteral(property)) && property.text === "exitCode";
  }
  // An exit code destructured by a parameter or catch binding leaves no receiver to prove completion of (null).
  function boundReceiver(name: ts.BindingName, identifier: string): null | undefined {
    return ts.isObjectBindingPattern(name) && name.elements.some(element => ts.isIdentifier(element.name)
      && element.name.text === identifier && takesExitCode(element)) ? null : undefined;
  }
  // Follow direct const projections in their nearest lexical statement block; ordinary shadowing stops lookup.
  function aliasReceiver(node: ts.Identifier): ts.Expression | null | undefined {
    if (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) return undefined;
    for (let ancestor: ts.Node | undefined = node.parent; ancestor; ancestor = ancestor.parent) {
      const parameter = ts.isFunctionLike(ancestor) ? ancestor.parameters.find(candidate => binds(candidate.name, node.text)) : undefined;
      if (parameter) return boundReceiver(parameter.name, node.text);
      if (ts.isCatchClause(ancestor) && ancestor.variableDeclaration && binds(ancestor.variableDeclaration.name, node.text)) {
        return boundReceiver(ancestor.variableDeclaration.name, node.text);
      }
      if (!ts.isBlock(ancestor) && !ts.isSourceFile(ancestor)) continue;
      for (const statement of ancestor.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
          if (!binds(declaration.name, node.text)) continue;
          if (!(statement.declarationList.flags & ts.NodeFlags.Const) || !declaration.initializer
            || declaration.getStart(source) > node.getStart(source)) return undefined;
          if (ts.isIdentifier(declaration.name)) return exitCodeReceiver(declaration.initializer);
          if (!ts.isObjectBindingPattern(declaration.name)) return undefined;
          const element = declaration.name.elements.find(binding => ts.isIdentifier(binding.name) && binding.name.text === node.text);
          return element && !element.initializer && takesExitCode(element) ? declaration.initializer : undefined;
        }
      }
    }
    return undefined;
  }
  const violations: ts.Node[] = [];
  function visit(node: ts.Node): void {
    const receiver = exitCodeReceiver(node) ?? (ts.isIdentifier(node) ? aliasReceiver(node) : undefined);
    if (receiver !== undefined && isClassification(node)) {
      // No call argument has empty text, so an exit code with no receiver is never proven complete.
      const error = receiver === null ? "" : operand(receiver, new Map());
      let guarded = false;
      // A dominating early-throw guard also protects nested decisions in its continuation.
      for (let ancestor: ts.Node = node; ancestor.parent && !ts.isFunctionLike(ancestor); ancestor = ancestor.parent) {
        if (guardsBefore(ancestor, error)) guarded = true;
        const parent = ancestor.parent;
        if (ts.isIfStatement(parent) && parent.expression === ancestor) {
          guarded ||= proves(parent.expression, !throws(parent.thenStatement), error);
        }
        if (ts.isReturnStatement(parent) && parent.expression === ancestor) guarded ||= proves(ancestor as ts.Expression, true, error);
        if (ts.isConditionalExpression(parent) && parent.condition === ancestor) guarded ||= proves(parent.condition, true, error);
      }
      if (!guarded) {
        violations.push(node);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}


function parsedModule(context: Rule.RuleContext): ts.SourceFile {
  const services: unknown = context.sourceCode.parserServices;
  if (services === null || typeof services !== "object" || !("esTreeNodeToTSNodeMap" in services)) {
    throw new Error("The completed-failure guard requires the TypeScript parser's node map");
  }
  const map: unknown = services.esTreeNodeToTSNodeMap;
  if (map === null || typeof map !== "object" || !("get" in map) || typeof map.get !== "function") {
    throw new Error("The completed-failure guard requires the TypeScript parser's node map");
  }
  const node: unknown = (map as { get(node: unknown): unknown }).get(context.sourceCode.ast);
  if (node === null || typeof node !== "object" || !("kind" in node) || node.kind !== ts.SyntaxKind.SourceFile) {
    throw new Error("The completed-failure guard requires the parser's original TypeScript source file");
  }
  return node as ts.SourceFile;
}

/** Enforce completion proof before an exit code controls absence or a no-op. */
export const refCompletedFailureRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: { unguarded: "Prove completed Git failure with isCompletedGitFailure before classifying its exit code" },
  },
  create(context) {
    return {
      Program() {
        const source = parsedModule(context);
        for (const node of findUnguardedExitCodes(source, context.filename)) {
          const start = source.getLineAndCharacterOfPosition(node.getStart(source));
          const end = source.getLineAndCharacterOfPosition(node.getEnd());
          context.report({
            loc: { start: { line: start.line + 1, column: start.character }, end: { line: end.line + 1, column: end.character } },
            messageId: "unguarded",
          });
        }
      },
    };
  },
};
