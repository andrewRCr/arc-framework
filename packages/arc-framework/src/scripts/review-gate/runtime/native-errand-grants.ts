/** Record Errand status judgments before early returns and retain their projection's origin. */
import { reviewFactListingError } from "../../../lib/store/kinds/review/fact-access.js";
import type { ReviewInFlightPort } from "../core/ports.js";
import { readLaneProgress } from "../lane-progress.js";
import { createReviewTarget } from "../core/gate-contract-v2.js";
import type { ReviewCeilingOverride, ReviewAdditionalPassAuthorization } from "../policy/review-policy-driver.js";
import type { ReviewInvocationInput } from "./invocation.js";
import { currentErrandDiffBase } from "./errand-review-target.js";
import { resolveNativeInvocationExtraPassJudgment } from "./native-extra-pass.js";

interface ErrandGrantFields {
  ceilingOverride?: ReviewCeilingOverride;
  additionalPassAuthorization?: ReviewAdditionalPassAuthorization;
}
export interface NativeAutomaticGrants { ceiling: boolean; additional: boolean }

/** Read the claim-wide logical owner and bind status inputs before any unrecorded-head return. */
export async function readErrandStatusPassGrants(input: ReviewInvocationInput & ErrandGrantFields & {
  operationStore: ReviewInFlightPort; repositoryId: string; claimId: string;
  target: { repository: string; headSha: string }; pullRequest: number;
  currentBaseOid?: string; changeRequestCandidate?: { baseRefName: string };
}): Promise<{ progress: Awaited<ReturnType<typeof readLaneProgress>>;
  grants: ErrandGrantFields & { automaticGrants?: NativeAutomaticGrants } }> {
  const progress = await readLaneProgress(input.operationStore, { lane: "standard", repositoryId: input.repositoryId,
    headSha: input.target.headSha, lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: input.claimId,
      headSha: input.target.headSha } });
  const resolved = await resolveNativeErrandPassGrants({ ...input,
    completedPasses: progress.status === "recorded" ? progress.completedPasses : 0,
    policyTarget: { repository: input.target.repository, pullRequest: input.pullRequest, headSha: input.target.headSha },
    currentBaseRef: input.changeRequestCandidate?.baseRefName });
  return { progress, grants: { ceilingOverride: input.ceilingOverride,
    additionalPassAuthorization: input.additionalPassAuthorization, ...resolved } };
}

/** Omit automatically discovered grants from an incremental pass while retaining explicit inputs for validation. */
export function errandPolicyGrants(input: ErrandGrantFields & { automaticGrants?: NativeAutomaticGrants },
  incremental: boolean): ErrandGrantFields {
  return { ...(incremental && input.automaticGrants?.ceiling ? {} : { ceilingOverride: input.ceilingOverride }),
    ...(incremental && input.automaticGrants?.additional ? {} : { additionalPassAuthorization: input.additionalPassAuthorization }) };
}

/** Use the checked claim's actual head, base, logical count and policy binding for every status-carried judgment. */
async function resolveNativeErrandPassGrants(input: ReviewInvocationInput & ErrandGrantFields & {
  operationStore: ReviewInFlightPort; repositoryId: string; claimId: string; completedPasses: number;
  policyTarget: { repository: string; pullRequest: number; headSha: string };
  currentBaseOid?: string; currentBaseRef?: string;
}): Promise<ErrandGrantFields & { automaticGrants?: NativeAutomaticGrants }> {
  const facts = input.operationStore.nativeFacts;
  if (input.operationStore.stateOffBranch !== true) return {};
  if (facts === undefined) throw new Error("Restore the selected native Errand review facts and retry status.");
  const listing = await facts.decisions.list();
  if (listing.status !== "complete") throw reviewFactListingError(listing);
  if (input.ceilingOverride === undefined && input.additionalPassAuthorization === undefined
    && !listing.records.some(({ value }) => value.choice.kind === "extra-pass" && value.choice.precondition.kind !== "approved-fix")) return {};
  const coordinates = await currentErrandDiffBase(input.exec, input.policyTarget.headSha, input.currentBaseOid, input.currentBaseRef);
  if (coordinates === null) throw new Error("Resolve the Errand change request's exact current base and retry status with the same judgment.");
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: input.repositoryId, ...coordinates });
  const resolved = await resolveNativeInvocationExtraPassJudgment(input, facts, { repositoryId: input.repositoryId,
    subject: { lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: input.claimId, headSha: target.headSha },
      headSha: target.headSha, subjectDigest: target.targetId }, lane: "standard", completedPasses: input.completedPasses,
    policyTarget: input.policyTarget, ceilingOverride: input.ceilingOverride, additionalPassAuthorization: input.additionalPassAuthorization });
  const ceiling = resolved.judgment?.ceilingOverride, additional = resolved.judgment?.additionalPassAuthorization;
  return { ...(ceiling === undefined ? {} : { ceilingOverride: { ...ceiling, target: input.policyTarget, lane: "standard" } }),
    ...(additional === undefined ? {} : { additionalPassAuthorization: { target: { ...input.policyTarget, headSha: additional.headSha },
      lane: "standard", precedingProducerId: additional.precedingProducerId, completedPasses: additional.completedPasses,
      nextPass: additional.nextPass, decisionKey: additional.decisionKey } }),
    automaticGrants: { ceiling: input.ceilingOverride === undefined, additional: input.additionalPassAuthorization === undefined } };
}
