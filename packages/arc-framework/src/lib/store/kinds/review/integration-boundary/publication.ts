/** Prepare publication claims against the exact native boundary and live review progress. */
import type { Store } from "../../../contract.js";
import type { OwnerIdentity } from "../../../identity.js";
import type { Mutation } from "../../../write.js";
import type { Remedy } from "../../../refusal.js";
import type { IntegrationBoundaryLocusV2 } from "./schema.js";
import type { ReviewReadinessBinding } from "./readiness.js";
import { prepareSubmissionBoundaryPut, readSubmissionBoundaryVersioned, SubmissionBoundaryVersionConflictError } from "./access.js";

interface NativePublicationClaimInput {
  store: Store;
  cwd: string;
  owner: OwnerIdentity;
  boundary: IntegrationBoundaryLocusV2;
  expectedVersion: string | null;
  readReadinessBinding(): Promise<ReviewReadinessBinding>;
}

/** A claim the stored boundary or live review progress no longer supports, with the remedy that repairs it. */
export class PublicationClaimRefusal extends Error {
  constructor(readonly condition: string, readonly remedy: Remedy) {
    super(`${condition} ${remedy.text}`);
    this.name = "PublicationClaimRefusal";
  }
}

function prePublicationRefusal(workUnit: string, condition: string): PublicationClaimRefusal {
  return new PublicationClaimRefusal(condition, { text: `Run arc review pre-publication ${workUnit}, then retry publication.`,
    argv: ["arc", "review", "pre-publication", workUnit] });
}

/** Prepare a claim without publishing any record before the lifecycle batch. */
export async function prepareNativePublicationClaim(input: NativePublicationClaimInput): Promise<Extract<Mutation, { action: "put" }>> {
  const snapshot = await readSubmissionBoundaryVersioned(input.cwd, input.boundary.workUnit, { store: input.store, owner: input.owner });
  if (snapshot.version !== input.expectedVersion) throw new SubmissionBoundaryVersionConflictError();
  const stored = snapshot.boundary;
  if (input.boundary.locus !== "publication-pending" || stored?.schemaVersion !== 2
    || (stored.locus !== "candidate-publish-ready" && stored.locus !== "publication-pending")) {
    throw prePublicationRefusal(input.boundary.workUnit, "The stored publication boundary records no native publication readiness.");
  }
  if (stored.candidateId !== input.boundary.candidateId || stored.candidateSubjectDigest !== input.boundary.candidateSubjectDigest) {
    throw prePublicationRefusal(input.boundary.workUnit, "The publication Candidate changed after readiness was recorded.");
  }
  const binding = await input.readReadinessBinding();
  if (binding.status !== "complete") throw new PublicationClaimRefusal(`Publication readiness is incomplete: ${binding.condition}`,
    { text: "Restore complete review listings, then retry publication." });
  if (stored.readinessBinding === null || input.boundary.readinessBinding !== stored.readinessBinding
    || binding.digest !== stored.readinessBinding) {
    throw prePublicationRefusal(input.boundary.workUnit, "Standard review progress changed after publication readiness.");
  }
  return prepareSubmissionBoundaryPut(input.boundary, input.expectedVersion, input.owner);
}
