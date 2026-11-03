/** Read and revalidate versioned review progress at pre-publication boundaries. */
import type { CanonicalDigest } from "../lib/kernel/index.js";
import type { ReviewReadinessBinding } from "../lib/store/kinds/review/integration-boundary/readiness.js";
import type { CandidateRead } from "../scripts/review-gate/policy/pre-publication-request.js";
import type { PrePublicationReplayInput } from "../scripts/review-gate/policy/pre-publication-replay.js";
import { PublishedIntegrationBoundaryLocusSchema, type PublishedIntegrationBoundaryLocus } from "../scripts/review-gate/policy/integration-boundary-locus.js";
import { PrePublicationReviewEnvelopeSchema, type PrePublicationReviewEnvelope } from "../scripts/review-gate/policy/pre-publication-procedure.js";

export interface PrePublicationProgressAccess {
  boundarySchemaVersion?(root: string): 1 | 2;
  readStandardLaneOwnerVersion(root: string, candidateId: CanonicalDigest, headSha: string): Promise<number>;
  readReadinessBinding?(root: string, candidateId: CanonicalDigest, headSha: string): Promise<ReviewReadinessBinding>;
}
export type PrePublicationProgress = { schemaVersion: 1; version: number }
  | { schemaVersion: 2; digest: CanonicalDigest };
/** An incomplete observation must be repaired before it can bind readiness. */
class PrePublicationProgressError extends Error {
  readonly code = "corrupt-state";
}

/** Read the selected backend's complete standard-lane publication basis. */
export async function readPrePublicationProgress(access: PrePublicationProgressAccess, root: string,
  candidateId: CanonicalDigest, headSha: string, schemaVersion = access.boundarySchemaVersion?.(root) ?? 1): Promise<PrePublicationProgress> {
  if (schemaVersion === 1) return { schemaVersion: 1, version: await access.readStandardLaneOwnerVersion(root, candidateId, headSha) };
  const binding = await access.readReadinessBinding?.(root, candidateId, headSha);
  if (binding?.status !== "complete") throw new PrePublicationProgressError(
    `Publication readiness listing is incomplete: ${binding?.condition ?? "the current binding is unavailable"}. Restore complete review listings and retry pre-publication review.`);
  return { schemaVersion: 2, digest: binding.digest };
}

/** Carry only a complete matching-format observation into a ready envelope. */
export function bindPrePublicationProgress(envelope: PrePublicationReviewEnvelope, progress: PrePublicationProgress): PrePublicationReviewEnvelope {
  if (envelope.locus !== "candidate-publish-ready") return envelope;
  if (envelope.schemaVersion !== progress.schemaVersion) throw new PrePublicationProgressError("The publication storage mode changed. Retry pre-publication review.");
  return PrePublicationReviewEnvelopeSchema.parse({ ...envelope, ...(progress.schemaVersion === 1
    ? { standardLaneOwnerVersion: progress.version } : { readinessBinding: progress.digest }) });
}

/** Revalidate a ready observation while holding the existing lane lock. */
export async function prePublicationProgressUnchanged(access: PrePublicationProgressAccess, root: string,
  boundary: Extract<PublishedIntegrationBoundaryLocus, { locus: "candidate-publish-ready" | "publication-pending" }>,
  headSha: string): Promise<boolean> {
  const current = await readPrePublicationProgress(access, root, boundary.candidateId, headSha, boundary.schemaVersion);
  return boundary.schemaVersion === 1 ? current.schemaVersion === 1 && boundary.standardLaneOwnerVersion === current.version
    : current.schemaVersion === 2 && boundary.readinessBinding !== null && boundary.readinessBinding === current.digest;
}

type AdvancedBoundary = Extract<PublishedIntegrationBoundaryLocus, { locus: "candidate-publish-ready" | "publication-pending" }>;
type AdvancedReentry = { status: "compose" } | { status: "ordering-conflict" | "replay-refused"; message: string }
  | { status: "continued"; envelope: unknown };

/** Preserve an exact advanced boundary without replacing its saved author judgment. */
export async function readAdvancedPrePublicationReentry(input: {
  root: string; workUnit: string; currentHead: string; boundary: AdvancedBoundary;
  replay: PrePublicationReplayInput | null; orderingRecoveryPresent: boolean; plainReentry: boolean;
}, access: PrePublicationProgressAccess & { readCandidate(root: string, workUnit: string): Promise<CandidateRead> }): Promise<AdvancedReentry> {
  const { boundary, replay } = input;
  const candidate = await access.readCandidate(input.root, input.workUnit);
  const matching = candidate.status === "current" && (boundary.schemaVersion === 2 || candidate.headSha === input.currentHead)
    && candidate.candidateId === boundary.candidateId && candidate.subjectDigest === boundary.candidateSubjectDigest;
  if (input.orderingRecoveryPresent) return { status: "ordering-conflict",
    message: "The attestation-ordering recovery input is stale after the Candidate boundary advanced." };
  if (replay !== null && (replay.candidateId === undefined || replay.candidateId !== boundary.candidateId
    || replay.candidateSubjectDigest !== boundary.candidateSubjectDigest || !matching)) {
    return { status: "replay-refused", message: "The saved command is unbound or stale for the current Candidate and subject." };
  }
  const unchanged = !matching || await prePublicationProgressUnchanged(access, input.root, boundary, input.currentHead);
  if (!matching || !unchanged || replay?.scopeJudgmentTarget !== undefined) return { status: "compose" };
  if (!input.plainReentry && replay === null) return { status: "replay-refused",
    message: "A settled Candidate boundary cannot replace its saved author judgment." };
  return { status: "continued", envelope: advancedContinuation(boundary) };
}

function advancedContinuation(boundary: AdvancedBoundary): unknown {
  if (boundary.locus !== "candidate-publish-ready") return PublishedIntegrationBoundaryLocusSchema.parse(boundary);
  return PrePublicationReviewEnvelopeSchema.parse({ ...boundary, target: null,
    ...(boundary.schemaVersion === 2 ? { policy: null } : {}) });
}
