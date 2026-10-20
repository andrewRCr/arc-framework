/** Validate original ordinary grant inputs before any native decision write. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { ReviewLaneJudgmentSchema } from "../policy/review-policy-driver.js";
import { ReviewCeilingOverrideSchema } from "../policy/review-ceiling-override.js";
import { ReviewAdditionalPassAuthorizationSchema } from "../policy/review-additional-pass.js";
import type { NativeExtraPassInput } from "./native-extra-pass.js";

export type ExtraPassChoice = Extract<ReviewDecision["choice"], { kind: "extra-pass" }>;
export interface RequestedExtraPass { choice: ExtraPassChoice; decisionKey?: CanonicalDigest }

/** Refuse invalid authority with a repair route rather than replacing it with a fresh judgment. */
export function refuseExtraPass(reason: string): never {
  throw Object.assign(new Error(`${reason} Supply a matching live decision reference or repair the grant and retry.`), { code: "invalid-input" });
}

function referenceKey(full: { decisionKey?: CanonicalDigest } | undefined, targetless: { decisionKey?: CanonicalDigest } | undefined):
  CanonicalDigest | undefined {
  if (full?.decisionKey !== undefined && targetless?.decisionKey !== undefined && full.decisionKey !== targetless.decisionKey) {
    refuseExtraPass("Full and targetless extra-pass decision references disagree.");
  }
  return full?.decisionKey ?? targetless?.decisionKey;
}

function binding(full: { target: NativeExtraPassInput["policyTarget"] } | undefined):
  { kind: "call-target" } | { kind: "policy-target"; repository: string; pullRequest: number | null } {
  return full === undefined ? { kind: "call-target" }
    : { kind: "policy-target", repository: full.target.repository, pullRequest: full.target.pullRequest };
}

function validateTarget(input: NativeExtraPassInput, full: { target: NativeExtraPassInput["policyTarget"]; lane: string }, kind: string): void {
  const left = full.target, right = input.policyTarget;
  const matchesRepository = kind === "additional" ? left.repository.toLowerCase() === right.repository.toLowerCase()
    : left.repository === right.repository;
  if (!matchesRepository || left.pullRequest !== right.pullRequest || left.headSha !== right.headSha || full.lane !== input.lane) {
    refuseExtraPass("The full extra-pass target or lane does not match the current policy target.");
  }
}

function ceilingRequest(input: NativeExtraPassInput): RequestedExtraPass | undefined {
  const full = input.ceilingOverride === undefined ? undefined : ReviewCeilingOverrideSchema.parse(input.ceilingOverride);
  const targetless = input.judgment?.ceilingOverride;
  if (full !== undefined) validateTarget(input, full, "ceiling");
  if (full !== undefined && targetless !== undefined && (full.exhaustedPassCount !== targetless.exhaustedPassCount
    || full.nextPass !== targetless.nextPass)) refuseExtraPass("Full and targetless ceiling grant values disagree.");
  const key = referenceKey(full, targetless), value = full ?? targetless;
  if (value === undefined) return;
  const conditional = full?.conditionalPassAuthorizationId ?? targetless?.conditionalPassAuthorizationId;
  if (conditional !== undefined) {
    if (key !== undefined || (full?.conditionalPassAuthorizationId !== undefined && targetless?.conditionalPassAuthorizationId !== undefined
      && full.conditionalPassAuthorizationId !== targetless.conditionalPassAuthorizationId)) refuseExtraPass("Ceiling grant references disagree.");
    return;
  }
  if ((value.exhaustedPassCount !== input.completedPasses && !(key !== undefined && value.exhaustedPassCount + 1 === input.completedPasses))
    || value.nextPass !== value.exhaustedPassCount + 1) refuseExtraPass("Bind the ceiling judgment to the current completed logical count and its next pass.");
  return { choice: { kind: "extra-pass", passCount: value.exhaustedPassCount,
    precondition: { kind: "ceiling", targetBinding: binding(full) } }, ...(key === undefined ? {} : { decisionKey: key }) };
}

function additionalRequest(input: NativeExtraPassInput): RequestedExtraPass | undefined {
  const full = input.additionalPassAuthorization === undefined ? undefined : ReviewAdditionalPassAuthorizationSchema.parse(input.additionalPassAuthorization);
  const targetless = input.judgment?.additionalPassAuthorization;
  if (full !== undefined) validateTarget(input, full, "additional");
  if (full !== undefined && targetless !== undefined && (full.completedPasses !== targetless.completedPasses
    || full.nextPass !== targetless.nextPass || full.precedingProducerId !== targetless.precedingProducerId
    || full.target.headSha !== targetless.headSha)) refuseExtraPass("Full and targetless additional grant values disagree.");
  const key = referenceKey(full, targetless), value = full ?? targetless;
  if (value === undefined) return;
  const headSha = full?.target.headSha ?? targetless?.headSha;
  if (input.lane !== "standard" || headSha !== input.subject.headSha || value.completedPasses !== input.completedPasses
    || value.nextPass !== value.completedPasses + 1) refuseExtraPass("Bind the additional judgment to the current standard-lane head, logical count and next pass.");
  return { choice: { kind: "extra-pass", passCount: value.completedPasses,
    precondition: { kind: "additional", precedingProducerId: value.precedingProducerId, targetBinding: binding(full) } },
    ...(key === undefined ? {} : { decisionKey: key }) };
}

/** Normalize full and targetless forms together, retaining the original full binding for new grants. */
export function requestedExtraPasses(input: NativeExtraPassInput): RequestedExtraPass[] {
  const parsed = { ...input, judgment: input.judgment === undefined ? undefined : ReviewLaneJudgmentSchema.parse(input.judgment) };
  return [ceilingRequest(parsed), additionalRequest(parsed)].filter((value): value is RequestedExtraPass => value !== undefined);
}
