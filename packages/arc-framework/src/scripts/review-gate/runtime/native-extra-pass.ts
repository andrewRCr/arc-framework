/** Record and resolve the Owner's stored ceiling and additional review-pass judgments. */
import { readConfiguredIdentity } from "../../../lib/git/identity.js";
import type { ReviewInvocationInput } from "./invocation.js";
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import { liveExtraPasses, withdrawnExtraPassKeys } from "./native-extra-pass-reach.js";
import type { ReviewLaneJudgment } from "../policy/review-policy-driver.js";
import { requestedExtraPasses, refuseExtraPass, type ExtraPassChoice, type RequestedExtraPass } from "./native-extra-pass-input.js";
import type { ReviewPolicyRequest, ReviewCeilingOverride, ReviewAdditionalPassAuthorization } from "../policy/review-policy-driver.js";
import type { NativeReviewFactPorts } from "../core/ports.js";

export interface NativeExtraPassInput {
  facts: Pick<NativeReviewFactPorts, "decisions" | "readProjectId">;
  repositoryId: string;
  subject: ReviewDecision["subject"];
  lane: ReviewDecision["lane"];
  completedPasses: number;
  policyTarget: ReviewPolicyRequest["target"];
  ceilingOverride?: ReviewCeilingOverride;
  additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
  judgment?: ReviewLaneJudgment;
  actor?: string;
  now?: string;
}
export interface NativeExtraPassResolution {
  judgment?: ReviewLaneJudgment;
  ceilingDecisionKey?: CanonicalDigest;
  additionalDecisionKey?: CanonicalDigest;
}

/** Resolve a lane's stored extra-pass authority before applying pure review policy. */
export async function resolveNativeExtraPassJudgment(input: NativeExtraPassInput): Promise<NativeExtraPassResolution> {
  if (await input.facts.readProjectId() !== input.repositoryId) throw new Error("Restore the selected review project's identity, then retry its extra-pass judgment.");
  const listing = await input.facts.decisions.list();
  if (listing.status !== "complete") throw new Error(listing.reason);
  const decisions = listing.records.map(({ value }) => value);
  const requests = requestedExtraPasses(input);
  await validateExtraPassReferences(input, decisions, requests);
  const withdrawn = withdrawnExtraPassKeys(decisions);
  for (const request of requests) {
    if (request.decisionKey !== undefined) continue;
    const recorded = await recordExtraPassDecision(input, request.choice, withdrawn);
    if (!decisions.some(value => reviewDecisionKey(value) === reviewDecisionKey(recorded))) decisions.push(recorded);
  }
  const live = liveExtraPasses(decisions, input);
  const ceiling = input.judgment?.ceilingOverride?.conditionalPassAuthorizationId === undefined
    && input.ceilingOverride?.conditionalPassAuthorizationId === undefined
    ? live.find(value => value.choice.kind === "extra-pass" && value.choice.precondition.kind === "ceiling") : undefined;
  const additional = live.find(value => value.choice.kind === "extra-pass" && value.choice.precondition.kind === "additional");
  const judgment = { ...input.judgment, ...(ceiling?.choice.kind !== "extra-pass" ? {} : {
    ceilingOverride: { exhaustedPassCount: ceiling.choice.passCount, nextPass: ceiling.choice.passCount + 1, decisionKey: reviewDecisionKey(ceiling) },
  }), ...(additional?.choice.kind !== "extra-pass" || additional.choice.precondition.kind !== "additional"
    || additional.subject.headSha === null ? {} : { additionalPassAuthorization: {
      headSha: additional.subject.headSha, precedingProducerId: additional.choice.precondition.precedingProducerId,
      completedPasses: additional.choice.passCount, nextPass: additional.choice.passCount + 1, decisionKey: reviewDecisionKey(additional),
    } }) };
  return { ...(Object.keys(judgment).length === 0 ? {} : { judgment }),
    ...(ceiling?.choice.kind === "extra-pass" && ceiling.choice.passCount === input.completedPasses
      ? { ceilingDecisionKey: reviewDecisionKey(ceiling) } : {}),
    ...(additional === undefined ? {} : { additionalDecisionKey: reviewDecisionKey(additional) }) };
}

async function validateExtraPassReferences(input: NativeExtraPassInput, decisions: readonly ReviewDecision[], requests: readonly RequestedExtraPass[]): Promise<void> {
  const live = liveExtraPasses(decisions, input);
  for (const request of requests) {
    if (request.decisionKey === undefined) continue;
    const record = await input.facts.decisions.read(request.decisionKey);
    const selected = live.find(value => value.choice.kind === "extra-pass"
      && value.choice.precondition.kind === request.choice.precondition.kind);
    if (record === null || selected === undefined || reviewDecisionKey(selected) !== request.decisionKey) {
      refuseExtraPass("The extra-pass decision reference is missing, stale, superseded, withdrawn, or outside this target's reach.");
    }
    const choice = record.value.choice;
    if (choice.kind !== "extra-pass" || choice.precondition.kind !== request.choice.precondition.kind
      || choice.passCount !== request.choice.passCount || (choice.precondition.kind === "additional"
        && request.choice.precondition.kind === "additional" && choice.precondition.precedingProducerId !== request.choice.precondition.precedingProducerId)) {
      refuseExtraPass("The extra-pass decision reference does not match the supplied grant values.");
    }
  }
}

async function recordExtraPassDecision(input: NativeExtraPassInput, choice: ExtraPassChoice, withdrawn: ReadonlySet<CanonicalDigest>): Promise<ReviewDecision> {
  if (input.actor === undefined || input.now === undefined || input.subject.headSha === null || input.subject.subjectDigest === null) {
    throw new Error("Resolve the active identity and exact review subject before recording its extra pass.");
  }
  const value = ReviewDecisionSchema.parse({ schemaVersion: 1, subject: input.subject, lane: input.lane,
    choice,
    decidedBy: input.actor, decidedAt: input.now, basis: null });
  const key = reviewDecisionKey(value);
  if (withdrawn.has(key)) refuseExtraPass("This extra-pass decision was withdrawn.");
  const prior = await input.facts.decisions.read(key);
  return prior?.value ?? (await input.facts.decisions.create(value)).value;
}

/** Resolve the active identity only when this invocation supplies a new ordinary extra-pass choice. */
export async function resolveNativeInvocationExtraPassJudgment(
  invocation: ReviewInvocationInput,
  facts: NativeExtraPassInput["facts"],
  input: Omit<NativeExtraPassInput, "facts" | "actor" | "now">,
): Promise<NativeExtraPassResolution> {
  const supplied = requestedExtraPasses({ ...input, facts }).some(request => request.decisionKey === undefined);
  const actor = supplied ? await readConfiguredIdentity(invocation.exec, invocation.cwd) : null;
  if (supplied && actor === null) throw new Error("Set git config --local arc.identity <identity>, then retry the extra-pass judgment.");
  return resolveNativeExtraPassJudgment({ ...input, facts, ...(actor === null ? {} : { actor }), now: new Date().toISOString() });
}
