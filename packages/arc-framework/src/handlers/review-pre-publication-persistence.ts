/** Commit pre-publication outcomes while preserving their readiness guard and native decision batch. */
import type { CanonicalDigest } from "../lib/kernel/index.js";
import { SubmissionBoundaryVersionConflictError } from "../lib/store/kinds/review/integration-boundary/access.js";
import type { ReviewFactPut } from "../scripts/review-gate/core/ports.js";
import type { PublishedIntegrationBoundaryLocus } from "../scripts/review-gate/policy/integration-boundary-locus.js";
import { prePublicationBoundary, type PrePublicationReviewEnvelope } from "../scripts/review-gate/policy/pre-publication-procedure.js";
import { prePublicationProgressUnchanged, type PrePublicationProgressAccess } from "./review-pre-publication-progress.js";

export interface PrePublicationPersistenceAccess extends PrePublicationProgressAccess {
  withStandardLaneLock<T>(root: string, candidateId: CanonicalDigest, headSha: string, action: () => Promise<T>): Promise<T>;
  persistBoundary(root: string, boundary: PublishedIntegrationBoundaryLocus, decision?: ReviewFactPut): Promise<void>;
  persistTerminusDecision?(root: string, decision: ReviewFactPut): Promise<void>;
  recoverAttestationOrdering(root: string, boundary: PublishedIntegrationBoundaryLocus,
    expectedVersion: string, decision?: ReviewFactPut): Promise<void>;
}
interface PersistenceInput {
  root: string;
  envelope: PrePublicationReviewEnvelope;
  currentHead: string;
  recoveryVersion?: string;
  decision?: ReviewFactPut;
}
type PersistenceResult = "written" | "lane-moved" | SubmissionBoundaryVersionConflictError;

/** Record an accepted native terminus decision alone, outside any boundary write. */
export async function persistPrePublicationTerminusDecision(
  access: Pick<PrePublicationPersistenceAccess, "persistTerminusDecision">, root: string, decision: ReviewFactPut,
): Promise<void> {
  if (access.persistTerminusDecision === undefined) {
    throw new Error("Restore native terminus persistence on the selected backend before retrying pre-publication review.");
  }
  await access.persistTerminusDecision(root, decision);
}

/** Persist a settled boundary, or its accepted native decision alone while review remains unfinished. */
export async function persistPrePublicationOutcome(access: PrePublicationPersistenceAccess,
  input: PersistenceInput): Promise<PersistenceResult> {
  const { envelope, root, decision } = input;
  if (envelope.locus !== "candidate-publish-ready" && envelope.locus !== "candidate-convergence-verification-pending") {
    if (decision !== undefined) await persistPrePublicationTerminusDecision(access, root, decision);
    return "written";
  }
  const persist = () => persistBoundaryOutcome(access, input);
  return envelope.locus === "candidate-publish-ready"
    ? access.withStandardLaneLock(root, envelope.candidateId, input.currentHead, persist) : persist();
}

async function persistBoundaryOutcome(access: PrePublicationPersistenceAccess, input: PersistenceInput): Promise<PersistenceResult> {
  const { root, envelope, decision, recoveryVersion } = input;
  if (envelope.locus === "candidate-publish-ready"
    && !await prePublicationProgressUnchanged(access, root, envelope, input.currentHead)) return "lane-moved";
  const boundary = prePublicationBoundary(envelope);
  if (recoveryVersion !== undefined) {
    try {
      if (decision === undefined) await access.recoverAttestationOrdering(root, boundary, recoveryVersion);
      else await access.recoverAttestationOrdering(root, boundary, recoveryVersion, decision);
    } catch (error) {
      if (error instanceof SubmissionBoundaryVersionConflictError) return error;
      throw error;
    }
  } else if (decision === undefined) await access.persistBoundary(root, boundary);
  else await access.persistBoundary(root, boundary, decision);
  return "written";
}
