/** Prepare publication claims against the exact native boundary and live review progress. */
import type { Store } from "../../../contract.js";
import type { OwnerIdentity } from "../../../identity.js";
import type { Mutation } from "../../../write.js";
import type { IntegrationBoundaryLocusV2 } from "./schema.js";
import type { ReviewReadinessBinding } from "./readiness.js";
import { prepareSubmissionBoundaryPut, readSubmissionBoundaryVersioned, SubmissionBoundaryVersionConflictError } from "./access.js";

export interface NativePublicationClaimInput {
  store: Store;
  cwd: string;
  owner: OwnerIdentity;
  boundary: IntegrationBoundaryLocusV2;
  expectedVersion: string | null;
  readReadinessBinding(): Promise<ReviewReadinessBinding>;
}

/** Prepare a claim without publishing any record before the lifecycle batch. */
export async function prepareNativePublicationClaim(input: NativePublicationClaimInput): Promise<Extract<Mutation, { action: "put" }>> {
  const snapshot = await readSubmissionBoundaryVersioned(input.cwd, input.boundary.workUnit, { store: input.store, owner: input.owner });
  if (snapshot.version !== input.expectedVersion) throw new SubmissionBoundaryVersionConflictError();
  const stored = snapshot.boundary;
  if (input.boundary.locus !== "publication-pending" || stored?.schemaVersion !== 2
    || (stored.locus !== "candidate-publish-ready" && stored.locus !== "publication-pending")) {
    throw new Error("Record native publication readiness before preparing its claim.");
  }
  if (stored.candidateId !== input.boundary.candidateId || stored.candidateSubjectDigest !== input.boundary.candidateSubjectDigest) {
    throw new Error("The publication Candidate changed. Run pre-publication review again.");
  }
  const binding = await input.readReadinessBinding();
  if (binding.status !== "complete") throw new Error(`Publication readiness is incomplete: ${binding.condition} Restore complete review listings, then retry publication.`);
  if (stored.readinessBinding === null || input.boundary.readinessBinding !== stored.readinessBinding
    || binding.digest !== stored.readinessBinding) throw new Error(`Standard review progress changed after publication readiness. Run arc review pre-publication ${input.boundary.workUnit}, then retry publication.`);
  return prepareSubmissionBoundaryPut(input.boundary, input.expectedVersion, input.owner);
}
