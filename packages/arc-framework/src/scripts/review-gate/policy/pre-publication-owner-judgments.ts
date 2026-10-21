/** Bind Owner authorization and native extra-pass judgments to the selected pre-publication invocation. */
import { SlugSchema } from "../../../lib/kernel/index.js";
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import type { ReviewInFlightPort } from "../core/ports.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import type { ReviewInvocationInput } from "../runtime/invocation.js";
import { resolveNativeInvocationExtraPassJudgment } from "../runtime/native-extra-pass.js";
import { prepareNativeReviewTerminus, type PreparedNativeReviewTerminus } from "../runtime/native-terminus-write.js";
import type { PrePublicationReviewRequest } from "./pre-publication-procedure.js";
import { resolveNativeReviewTerminus } from "../runtime/native-terminus.js";
import type { ReviewLaneJudgment, ReviewPolicyBoundRequest } from "./review-policy-driver.js";
import type { NativeOwnerAcceptedReviewTerminus } from "./review-terminus.js";
import type { OwnerTerminusAuthorityRead, ReviewLane, PrePublicationCompositionDependencies } from "./pre-publication-request.js";

/** Preserve Owner-only terminus authorization while recording ordinary judgments under the active identity. */
export function createPrePublicationOwnerJudgments(input: ReviewInvocationInput, store: ReviewInFlightPort):
  Pick<PrePublicationCompositionDependencies, "readOwnerTerminusAuthority" | "resolveExtraPassJudgment" | "resolveNativeTerminus" | "prepareNativeTerminusDecision"> {
  return { readOwnerTerminusAuthority: async workUnit => {
    const name = SlugSchema.parse(workUnit);
    let live: Awaited<ReturnType<typeof readLocalReviewLiveContext>>;
    try { live = await readLocalReviewLiveContext(input); }
    catch (error) {
      if (error instanceof ProjectIdentityError) throw error;
      return { status: "refused", reason: `The Work Unit Owner could not be resolved: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (live.context.workUnit?.identity !== name) {
      return { status: "refused", reason: "The current checkout does not resolve the requested work unit." };
    }
    if (live.context.activeIdentity === null) {
      return { status: "refused", reason: "No active ARC identity is configured for Owner authorization." };
    }
    if (live.context.activeIdentity !== live.context.workUnit.owner) {
      return { status: "refused", reason: "The active identity does not match the Work Unit Owner." };
    }
    return { status: "authorized", ownerIdentity: live.context.workUnit.owner };
  }, ...(input.store?.capabilities.stateOffBranch !== true ? {} : {
    prepareNativeTerminusDecision: async context => {
      const facts = store.nativeFacts;
      if (facts === undefined) throw new Error("Resolve the selected native review facts before recording its terminus.");
      return prepareNativeReviewTerminus({ facts, ...context, now: new Date().toISOString() });
    },
    resolveNativeTerminus: async context => {
      const facts = store.nativeFacts;
      if (facts === undefined) throw new Error("Resolve the selected native review facts before reading its terminus.");
      return resolveNativeReviewTerminus({ facts, ...context });
    },
    resolveExtraPassJudgment: async context => {
      const facts = store.nativeFacts;
      if (facts === undefined) throw new Error("Resolve the selected native review facts before reading extra-pass judgments.");
      const result = await resolveNativeInvocationExtraPassJudgment(input, facts, { ...context,
        repositoryId: context.repositoryId ?? await facts.readProjectId() });
      return result.judgment;
    },
  }) };
}


/** Preserve stored provenance unless this call supplies a newly authorized Owner judgment. */
export function projectPrePublicationTerminus(input: {
  lane: ReviewLane; judgment?: ReviewLaneJudgment; authority: OwnerTerminusAuthorityRead | null;
  completedPasses: number; stored?: NativeOwnerAcceptedReviewTerminus;
}): Pick<ReviewPolicyBoundRequest, "terminus"> {
  if (input.lane !== "standard") return {};
  if (input.judgment?.terminus === undefined) return input.stored === undefined ? {} : { terminus: input.stored };
  if (input.authority?.status !== "authorized") return {};
  return { terminus: { schemaVersion: 1, semanticsVersion: "review-terminus/v1", kind: "owner-accepted", lane: "standard",
    acceptedBy: input.authority.ownerIdentity, completedPasses: input.completedPasses } };
}


/** Prepare native persistence only for the fresh judgment whose existing Owner check authorized it. */
export async function preparePrePublicationTerminusDecision(input: {
  request: PrePublicationReviewRequest; judgment?: ReviewLaneJudgment; authority: OwnerTerminusAuthorityRead | null;
  dependencies: PrePublicationCompositionDependencies;
}): Promise<PreparedNativeReviewTerminus | undefined> {
  if (input.judgment?.terminus === undefined || input.authority?.status !== "authorized"
    || input.dependencies.prepareNativeTerminusDecision === undefined) return undefined;
  return input.dependencies.prepareNativeTerminusDecision({ subject: {
    lineage: { kind: "candidate", candidateId: input.request.candidateId }, headSha: null,
    subjectDigest: input.request.candidate.subjectDigest }, acceptedBy: input.authority.ownerIdentity,
    completedPasses: input.request.standard.completedPasses });
}
