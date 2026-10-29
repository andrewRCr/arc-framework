/** Exit-code decisions in the ref backend must prove completed Git failure before suppressing it. */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Helper = { parameter: string; expression: ts.Expression; declaration: ts.FunctionDeclaration };
const refRoot = resolve(import.meta.dirname, "../../../../src/lib/store/ref");

/**
 * This is a conservative syntax guard, not a replacement for execution tests of process outcomes. It follows direct
 * const projections of an exit code; it does not infer `let` or reassigned aliases, or chains of aliases.
 */
function unguardedExitCodes(text: string, filename = "fixture.ts"): string[] {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
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
  const violations: string[] = [];
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
        const position = source.getLineAndCharacterOfPosition(node.getStart(source));
        violations.push(`${filename}:${position.line + 1}:${position.character + 1} ${node.getText(source)}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return violations;
}

const canonicalImport = 'import { isCompletedGitFailure } from "../../git/process-error.js";\n';

const safe = [
  'const code = error.exitCode; if (isCompletedGitFailure(error) && code === 1) return null;',
  'const { exitCode: code } = error; if (!isCompletedGitFailure(error)) throw error; if (code === 1) return null;',
  'const code = error.exitCode; throw new Error(String(code));',
  'const { exitCode: code } = error; return { status: "failed", exitCode: code };',
  'const code = error.exitCode; { const code = 2; if (code === 1) return null; }',

  'throw new Error(String(error.exitCode));',
  'return { status: "failed", exitCode: error.exitCode };',
  'if (isCompletedGitFailure(error) && error.exitCode === 1) return "";',
  'if (!isCompletedGitFailure(error) || error.exitCode !== 5) throw error;',
  'if (!isCompletedGitFailure(error)) throw error; if (error.exitCode === 1) return null;',
  'if (!isCompletedGitFailure(error)) { throw error; } return error.exitCode === 1;',
  'function complete(e: unknown) { return isCompletedGitFailure(e); } if (complete(error) && error.exitCode === 1) return false;',
  'function complete(e: unknown) { return isCompletedGitFailure(e); } function done(x: unknown) { return complete(x); } if (done(error) && error.exitCode === 1) return false;',
  'import { isCompletedGitFailure as done } from "../../git/process-error.js"; if (done(error) && error["exitCode"] === 1) return null;',
  'return isCompletedGitFailure(error) && error.exitCode === 1;',
  'return isCompletedGitFailure(error) && error.exitCode === 1 ? null : fail(error);',
  'promise.catch(({ stderr }) => stderr === "" ? null : fail());',
  'promise.catch((caught) => isCompletedGitFailure(caught) && caught.exitCode === 1 ? null : fail(caught));',
];
const unsafe = [
  'const code = error.exitCode; if (code === 1) return null;',
  'const { exitCode: code } = error; if (code === 1) return null;',
  'const { exitCode } = error; if (exitCode === 1) return null;',
  'const code = error.exitCode; if (isCompletedGitFailure(other) && code === 1) return null;',

  'if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) return "";',
  'if (!isGitProcessError(error) || error.kind !== "nonzero-exit" || error.exitCode !== 5) throw error;',
  '// isCompletedGitFailure(error)\nif (error.exitCode === 1) return false;',
  'if (isCompletedGitFailure(other) && error.exitCode === 1) return null;',
  'if (isCompletedGitFailure(error) || error.exitCode === 1) return null;',
  'if (flag) isCompletedGitFailure(error); if (error.exitCode === 1) return null;',
  'if (error.exitCode === 1) { isCompletedGitFailure(error); return null; }',
  'function complete(e: unknown) { return isCompletedGitFailure(other); } if (complete(error) && error.exitCode === 1) return false;',
  'function complete(e: unknown) { return complete(e); } if (complete(error) && error.exitCode === 1) return false;',
  'if (!isCompletedGitFailure(error) && error.exitCode !== 5) throw error;',
  'if (error["exitCode"] === 1) return null;',
  'try { run(); } catch ({ exitCode }) { if (exitCode === 1) return null; }',
  'promise.catch(({ exitCode }) => exitCode === 1 ? null : fail());',
  'promise.catch(({ exitCode: code }) => { if (code === 1) return null; });',
];

const untrusted = [
  'if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  'function isCompletedGitFailure(e: unknown) { return true; } if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  'import { isCompletedGitFailure } from "../../fake/git/process-error.js"; if (isCompletedGitFailure(error) && error.exitCode === 1) return null;',
  canonicalImport + 'function classify(isCompletedGitFailure: (e: unknown) => boolean) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function classify() { const isCompletedGitFailure = () => true; if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'try { run(); } catch ({ isCompletedGitFailure }) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function classify([isCompletedGitFailure]: Array<(e: unknown) => boolean>) { if (isCompletedGitFailure(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function complete(e: unknown) { return isCompletedGitFailure(e); } function classify() { const complete = (e: unknown) => true; if (complete(error) && error.exitCode === 1) return null; }',
  canonicalImport + 'function complete(e: unknown) { return isCompletedGitFailure(e); } function classify({ complete }: Checks) { if (complete(error) && error.exitCode === 1) return null; }',
];

describe("ref completed-failure guard fixtures", () => {
  it.each(untrusted)("rejects untrusted or shadowed completion: %s", (source) => {
    expect(unguardedExitCodes(source)).toHaveLength(1);
  });
  it.each(safe)("accepts proven completion: %s", (source) => {
    expect(unguardedExitCodes(canonicalImport + source)).toEqual([]);
  });
  it.each(unsafe)("rejects incomplete completion: %s", (source) => {
    expect(unguardedExitCodes(canonicalImport + source)).toHaveLength(1);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

it("routes ref-backend exit-code suppression through isCompletedGitFailure", () => {
  const files = sourceFiles(refRoot).sort();
  expect(files.length).toBeGreaterThan(0);
  const violations = files.flatMap(file => unguardedExitCodes(readFileSync(file, "utf8"), relative(refRoot, file)));
  expect(violations, "Prove completed Git failure before treating its exit code as absence or a no-op").toEqual([]);
});
