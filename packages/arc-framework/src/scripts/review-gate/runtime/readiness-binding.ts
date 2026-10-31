/** Read live durable and working review progress for one Candidate's publication binding. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import type { Store } from "../../../lib/store/contract.js";
import { reviewListingRefusal } from "../../../lib/store/kinds/review/fact-access.js";
import { rethrowNativeRefusal } from "../../../lib/store/native-refusal.js";
import { StoreRefusalError } from "../../../lib/store/refusal-error.js";
import type { OwnerIdentity } from "../../../lib/store/identity.js";
import { deriveReviewReadinessBinding, type ReviewReadinessBinding } from
  "../../../lib/store/kinds/review/integration-boundary/readiness.js";
import { readLaneProgressOwner } from "../lane-progress.js";
import type { ReviewInFlightPort } from "../core/ports.js";

/** Invocation-selected authority and the Candidate whose standard lane is being bound. */
interface ReviewReadinessReadInput {
  store: Store;
  workItem: OwnerIdentity;
  inFlight: Pick<ReviewInFlightPort, "readOperation">;
  repositoryId: string;
  candidateId: CanonicalDigest;
  headSha: string;
}

/** Recompute publication readiness from the selected work item's current review records. */
export async function readReviewReadinessBinding(input: ReviewReadinessReadInput): Promise<ReviewReadinessBinding> {
  try {
    const list = async (kind: "review/outcome" | "review/evidence" | "review/decision") => {
      const read = await input.store.list({ family: "review", kind, owner: input.workItem });
      if (read.status === "refused") throw new StoreRefusalError(read.refusal, true);
      const refusal = reviewListingRefusal(read);
      if (refusal !== null) throw new StoreRefusalError(refusal, true);
      return read.result;
    };
    const [outcomes, evidence, decisions] = await Promise.all([
      list("review/outcome"), list("review/evidence"), list("review/decision"),
    ]);
    const owner = await readLaneProgressOwner(input.inFlight, { lane: "standard", repositoryId: input.repositoryId,
      headSha: input.headSha, lineage: { kind: "candidate", candidateId: input.candidateId } });
    return deriveReviewReadinessBinding({ subjectOwner: { kind: "candidate", candidateId: input.candidateId },
      outcomes, evidence, decisions, inFlight: owner?.attempts.filter(({ outcome }) => outcome === "pending") ?? [] });
  } catch (error) {
    // A native typed refusal reaches the command whole; only the derivation's content failures stay incomplete.
    rethrowNativeRefusal(error);
    return { status: "incomplete", condition: error instanceof Error ? error.message : String(error) };
  }
}
