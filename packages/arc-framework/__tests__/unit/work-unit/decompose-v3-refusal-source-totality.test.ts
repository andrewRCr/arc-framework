/** Source-totality proof for decomposition refusal codes and reason producers. */

import { readdirSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import {
  isV3DecomposeMappedReason,
  v3DecomposeRemedy,
  type V3DecomposeInvocation,
} from "../../../src/lib/work-unit/decompose-v3-refusal.js";

/** Timeout for measured repository scans on slower hosted runners. */
const REPOSITORY_SCAN_TIMEOUT = 10_000;

const PACKAGE_ROOT = resolve(import.meta.dirname, "../../..");
const SOURCE_ROOT = join(PACKAGE_ROOT, "src");
const WORK_UNIT_ROOT = join(SOURCE_ROOT, "lib/work-unit");

const INVOCATIONS: readonly V3DecomposeInvocation[] = [
  { mode: "preflight", origin: "origin" },
  { mode: "execute", origin: "origin", cutMapPath: "map.json" },
  { mode: "extract", origin: "origin", cutMapPath: "map.json" },
  { mode: "finish-preview", origin: "origin", cutMapPath: "map.json" },
  {
    mode: "finish-apply",
    origin: "origin",
    cutMapPath: "map.json",
    applyAuthority: `sha256:${"a".repeat(64)}`,
  },
  { mode: "advance-base", origin: "origin", cutMapPath: "map.json" },
];

const FINISH_INVOCATIONS = INVOCATIONS.filter((invocation) =>
  invocation.mode === "finish-preview" || invocation.mode === "finish-apply");

const REFUSAL_STATUSES = new Set(["refused", "rejected", "reauthor", "stale"]);
const REFUSAL_TYPE_NAME = /(?:Mismatch|RefusalCode|DecomposeResultOccupationRefusal)$/u;
const REASON_FORWARDERS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  "lib/work-unit/decompose-v3-conservation.ts": { refuse: 1 },
  "lib/work-unit/decompose-v3-finish-operation.ts": { refuseAfterRestoration: 0 },
  "lib/work-unit/decompose-v3-repository-plan.ts": { refuse: 1 },
  "lib/work-unit/decompose-v3-thinning.ts": { refuse: 0 },
  "lib/work-unit/git-decompose-transition-base-advancement.ts": { refuse: 0 },
  "lib/work-unit/git-decompose-v3-finish.ts": { refused: 0 },
  "lib/work-unit/git-decompose-v3-repository-plan.ts": { gitRefusal: 0 },
};
const APPROVED_WIDE_REASON_PRODUCERS = new Set([
  "lib/work-unit/decompose-v3-execution-preflight.ts"
    + "#revalidateV3DecomposeExecutionPreflight:refreshed.reason",
  "lib/work-unit/decompose-v3-finish-operation.ts#execute:result.reason",
  "lib/work-unit/decompose-v3-operation.ts#prepareV3Operation:revalidated.reason",
  "lib/work-unit/decompose-v3-operation.ts#classifyPostStageRefusal:stagedValidation.reason",
  "lib/work-unit/git-decompose-transition-base-advancement.ts"
    + "#advanceGitDecomposeTransitionBase:preReturnBindingMismatch.reason",
  "lib/work-unit/git-decompose-transition-base-advancement.ts"
    + "#advanceGitDecomposeTransitionBase:preMergeBindingMismatch.reason",
  "lib/work-unit/git-decompose-v3-operation.ts#executeGitV3DecomposeCommand:revalidated.reason",
  "lib/work-unit/git-decompose-v3-operation.ts#executeGitV3ExtractionCommand:revalidated.reason",
]);

interface RefusalSourceInventory {
  literals: Map<string, Set<string>>;
  unsafeProducers: string[];
}

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function isDecomposeRefusalSource(file: string): boolean {
  const name = basename(file);
  return name !== "decompose-v3-refusal.ts"
    && (name === "decompose-result-occupation.ts"
      || name === "git-decompose-transition-base-advancement.ts"
      || /^(?:git-)?decompose-v3-/u.test(name));
}

function propertyName(node: ts.ObjectLiteralElementLike | ts.TypeElement): string | null {
  if (!("name" in node) || node.name === undefined) return null;
  return ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
}

function literalText(node: ts.Expression): string | null {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function addLiteral(
  literals: Map<string, Set<string>>,
  value: string,
  source: ts.SourceFile,
  node: ts.Node,
): void {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  const locus = `${relative(SOURCE_ROOT, source.fileName)}:${position.line + 1}`;
  const loci = literals.get(value) ?? new Set<string>();
  loci.add(locus);
  literals.set(value, loci);
}

function collectLiteralTypes(
  node: ts.Node,
  literals: Map<string, Set<string>>,
  source: ts.SourceFile,
): void {
  if (ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal)) {
    addLiteral(literals, node.literal.text, source, node.literal);
  }
  ts.forEachChild(node, (child) => collectLiteralTypes(child, literals, source));
}

function collectReasonExpressionLiterals(
  expression: ts.Expression,
  literals: Map<string, Set<string>>,
  source: ts.SourceFile,
): void {
  const literal = literalText(expression);
  if (literal !== null) {
    addLiteral(literals, literal, source, expression);
    return;
  }
  if (ts.isConditionalExpression(expression)) {
    collectReasonExpressionLiterals(expression.whenTrue, literals, source);
    collectReasonExpressionLiterals(expression.whenFalse, literals, source);
    return;
  }
  if (ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    collectReasonExpressionLiterals(expression.left, literals, source);
    collectReasonExpressionLiterals(expression.right, literals, source);
  }
}

function objectStatus(node: ts.ObjectLiteralExpression): string | null {
  const status = node.properties.find((property) => propertyName(property) === "status");
  return status !== undefined && ts.isPropertyAssignment(status) ? literalText(status.initializer) : null;
}

function belongsToRefusalObject(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isObjectLiteralExpression(current) && REFUSAL_STATUSES.has(objectStatus(current) ?? "")) return true;
    if (ts.isFunctionLike(current)) {
      const returnType = current.type?.getText() ?? "";
      return REFUSAL_TYPE_NAME.test(returnType) || returnType.includes('status: "refused"');
    }
  }
  return false;
}

function enclosingFunctionName(node: ts.Node): string | null {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) return current.name.text;
  }
  return null;
}

function reasonProducerKey(sourcePath: string, node: ts.Node, expression: ts.Node): string {
  return sourcePath
    + "#"
    + (enclosingFunctionName(node) ?? "<module>")
    + ":"
    + expression.getText().replace(/\s+/gu, " ");
}

function isFiniteStringType(type: ts.Type): boolean {
  if (type.isStringLiteral()) return true;
  return type.isUnion() && type.types.length > 0 && type.types.every((member) => member.isStringLiteral());
}

function isStablePassThrough(expression: ts.Expression, checker: ts.TypeChecker): boolean {
  if (isFiniteStringType(checker.getTypeAtLocation(expression))) return true;
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isSatisfiesExpression(expression)) {
    return isStablePassThrough(expression.expression, checker);
  }
  if (ts.isConditionalExpression(expression)) {
    return isStablePassThrough(expression.whenTrue, checker)
      && isStablePassThrough(expression.whenFalse, checker);
  }
  if (ts.isBinaryExpression(expression)
    && expression.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    return isStablePassThrough(expression.left, checker)
      && isStablePassThrough(expression.right, checker);
  }
  if (ts.isTemplateExpression(expression)) {
    const fragments = [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)];
    return fragments.every((fragment) => /^[-a-z]*:?$/u.test(fragment))
      && expression.templateSpans.every((span) => {
        const value = span.expression;
        return ts.isPropertyAccessExpression(value)
          && (value.name.text === "reason" || value.name.text === "code" || value.name.text === "stage");
      });
  }
  return false;
}

function decomposeRefusalInventory(): RefusalSourceInventory {
  const files = sourceFiles(WORK_UNIT_ROOT).filter(isDecomposeRefusalSource);
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.Node16,
    moduleResolution: ts.ModuleResolutionKind.Node16,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  });
  const checker = program.getTypeChecker();
  const literals = new Map<string, Set<string>>();
  const unsafeProducers: string[] = [];

  for (const file of files) {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`TypeScript did not load ${file}.`);
    const sourceFile = source;
    const sourcePath = relative(SOURCE_ROOT, file);
    const forwarders = REASON_FORWARDERS[sourcePath] ?? {};
    function visit(node: ts.Node): void {
      if (ts.isTypeAliasDeclaration(node) && REFUSAL_TYPE_NAME.test(node.name.text)) {
        collectLiteralTypes(node.type, literals, sourceFile);
      }
      if (ts.isPropertySignature(node) && propertyName(node) === "reason" && node.type !== undefined) {
        collectLiteralTypes(node.type, literals, sourceFile);
      }
      if (ts.isPropertyAssignment(node) && propertyName(node) === "reason") {
        collectReasonExpressionLiterals(node.initializer, literals, sourceFile);
        const producerKey = reasonProducerKey(sourcePath, node, node.initializer);
        if (belongsToRefusalObject(node)
          && literalText(node.initializer) === null
          && !isStablePassThrough(node.initializer, checker)
          && !APPROVED_WIDE_REASON_PRODUCERS.has(producerKey)) {
          const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          unsafeProducers.push(
            `${relative(SOURCE_ROOT, file)}#${enclosingFunctionName(node) ?? "<module>"}`
              + `:${position.line + 1} ${node.initializer.getText(sourceFile)}`,
          );
        }
      }
      if (ts.isShorthandPropertyAssignment(node)
        && propertyName(node) === "reason"
        && belongsToRefusalObject(node)
        && forwarders[enclosingFunctionName(node) ?? ""] === undefined
        && !isFiniteStringType(checker.getTypeAtLocation(node.name))) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        unsafeProducers.push(
          `${relative(SOURCE_ROOT, file)}#${enclosingFunctionName(node) ?? "<module>"}`
            + `:${position.line + 1} ${node.getText(sourceFile)}`,
        );
      }
      if (ts.isPropertyAssignment(node)
        && propertyName(node) === "code"
        && belongsToRefusalObject(node)) {
        collectReasonExpressionLiterals(node.initializer, literals, sourceFile);
      }
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const reasonIndex = forwarders[node.expression.text];
        const reason = reasonIndex === undefined ? undefined : node.arguments[reasonIndex];
        if (reason !== undefined) {
          collectReasonExpressionLiterals(reason, literals, sourceFile);
          const producerKey = reasonProducerKey(sourcePath, node, reason);
          if (!isStablePassThrough(reason, checker)
            && !APPROVED_WIDE_REASON_PRODUCERS.has(producerKey)) {
            const position = sourceFile.getLineAndCharacterOfPosition(reason.getStart(sourceFile));
            unsafeProducers.push(
              `${sourcePath}#${enclosingFunctionName(node) ?? "<module>"}`
                + `:${position.line + 1} ${node.expression.text}(${reason.getText(sourceFile)})`,
            );
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return { literals, unsafeProducers };
}

describe("decomposition refusal source totality", () => {
  it("maps every production refusal literal to a specific remedy", () => {
    const { literals } = decomposeRefusalInventory();
    expect(literals.has("uncovered-retirement-content")).toBe(true);
    literals.delete("unexpected-error");

    const failures = [...literals].flatMap(([reason, loci]) => {
      if (!isV3DecomposeMappedReason(reason)) return [`${reason} is unmapped (${[...loci].join(", ")})`];
      const finishReachable = [...loci].some((locus) =>
        locus.startsWith("lib/work-unit/git-decompose-v3-finish.ts:"))
      const candidateInvocations = finishReachable ? FINISH_INVOCATIONS : INVOCATIONS;
      const remedies = candidateInvocations.flatMap((invocation) => {
        try {
          return [{
            invocation,
            remedy: v3DecomposeRemedy({ invocation, reason, locus: "reported-locus" }),
          }];
        } catch {
          return [];
        }
      });
      if (finishReachable && remedies.length !== candidateInvocations.length) {
        return [`${reason} is not mapped for every required mode (${[...loci].join(", ")})`];
      }
      if (remedies.length === 0) return [`${reason} has no invocable remedy (${[...loci].join(", ")})`];
      const isSpecific = ({ invocation, remedy }: (typeof remedies)[number]): boolean => {
        const retry = v3DecomposeRemedy({ invocation, reason: "unexpected-error" });
        return remedy.invariant !== retry.invariant;
      };
      const specific = finishReachable ? remedies.every(isSpecific) : remedies.some(isSpecific);
      return specific ? [] : [`${reason} maps only to the unexpected-error retry (${[...loci].join(", ")})`];
    });

    expect(failures).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);

  it("admits only stable outward reason producers", () => {
    expect(decomposeRefusalInventory().unsafeProducers).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
});
