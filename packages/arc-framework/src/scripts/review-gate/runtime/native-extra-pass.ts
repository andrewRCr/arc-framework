/** Record and resolve the Owner's stored ceiling and additional review-pass judgments. */
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";
import { readConfiguredIdentity } from "../../../lib/git/identity.js";
import type { ReviewInvocationInput } from "./invocation.js";
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
}

/** Resolve a lane's stored extra-pass authority before applying pure review policy. */
export async function resolveNativeExtraPassJudgment(input: NativeExtraPassInput): Promise<NativeExtraPassResolution> {
  const decisions = await readExtraPassDecisions(input);
  const requests = requestedExtraPasses(input);
  await validateExtraPassReferences(input, decisions, requests);
  for (const request of requests) {
    if (request.decisionKey !== undefined) continue;
    const recorded = await recordExtraPassDecision(input, request.choice, decisions);
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
  return Object.keys(judgment).length === 0 ? {} : { judgment };
}

/** Require each supplied ordinary decision reference to name the live grant of its kind within this invocation's reach. */
export async function validateNativeExtraPassReferences(input: NativeExtraPassInput): Promise<void> {
  await validateExtraPassReferences(input, await readExtraPassDecisions(input), requestedExtraPasses(input));
}

async function readExtraPassDecisions(input: NativeExtraPassInput): Promise<ReviewDecision[]> {
  if (await input.facts.readProjectId() !== input.repositoryId) throw new Error("Restore the selected review project's identity, then retry its extra-pass judgment.");
  const listing = await input.facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  return listing.records.map(({ value }) => value);
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

async function recordExtraPassDecision(input: NativeExtraPassInput, choice: ExtraPassChoice, decisions: readonly ReviewDecision[]): Promise<ReviewDecision> {
  if (input.actor === undefined || input.now === undefined || input.subject.headSha === null || input.subject.subjectDigest === null) {
    throw new Error("Resolve the active identity and exact review subject before recording its extra pass.");
  }
  const value = ReviewDecisionSchema.parse({ schemaVersion: 1, subject: input.subject, lane: input.lane,
    choice,
    decidedBy: input.actor, decidedAt: input.now, basis: null });
  const key = reviewDecisionKey(value);
  if (withdrawnExtraPassKeys(decisions).has(key)) refuseExtraPass("This extra-pass decision was withdrawn.");
  const prior = await input.facts.decisions.read(key);
  if (prior !== null && !liveExtraPasses(decisions, input).some(value => reviewDecisionKey(value) === key)) {
    refuseExtraPass("The stored extra-pass decision is superseded or outside this target's reach; restore current live authority and retry.");
  }
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
