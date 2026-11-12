/** Errand response admission and recovery guidance derived from the producer's existing claim. */
import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { RespondEnvelopeSchema } from "../core/review-command-envelope.js";
import type { ErrandReviewBinding } from "../core/advisory-records.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";

/** A response producer's Errand claim is not active on the current branch. */
export class ErrandResponseContextError extends Error {
  readonly code = "invalid-input";
  readonly remedy: SpineRemedy;
  constructor(claimId: string, local: boolean) {
    super(local ? "local review Errand claim does not match the active Errand"
      : `review source Errand claim ${claimId} does not match the active Errand`);
    this.name = "ErrandResponseContextError";
    this.remedy = spineRemedy("An Errand review response must belong to the active Errand on its owning branch.",
      `Switch to the owning branch for Errand claim ${claimId}, keeping that claim active and HEAD attached, `
      + "then retry the same response. Locate the claim and its owning checkout with", ["arc", "locus", "--json"]);
  }
}

/** Refuse an Errand producer outside its exact active claim before any proposal or approval can be written. */
export async function requireResponseErrand(result: ReviewResult,
  resolveActiveErrand: () => Promise<ErrandReviewBinding | null>): Promise<ErrandReviewBinding | null> {
  const local = result.kind === "attested-local" && result.vehicle.kind === "errand" ? result.vehicle : null;
  const lineage = result.admission.lineage;
  const claimId = local?.claimId ?? (lineage.kind === "head-bound" && lineage.vehicleKind === "errand" ? lineage.vehicleIdentity : null);
  if (claimId === null) return null;
  const active = await resolveActiveErrand();
  if (active === null || active.claimId !== claimId || (local !== null && active.key !== local.identity)) {
    throw new ErrandResponseContextError(claimId, local !== null);
  }
  return active;
}

/** Stop a first response at a moved Errand target, preserving a human-directed route back to the reviewed head. */
export function staleErrandResponseEnvelope(operationId: string, attemptedTarget: ReviewTarget,
  currentTarget: ReviewTarget, errand: ErrandReviewBinding): ReturnType<typeof RespondEnvelopeSchema.parse> {
  return RespondEnvelopeSchema.parse({ schemaVersion: 1, mode: "review-respond", diagnostics: [],
    state: "stale-target", nextAction: "stop", payload: { operationId, attemptedTarget, currentTarget, errand,
      detail: `The current target ${currentTarget.headSha} differs from reviewed target ${attemptedTarget.headSha}. `
        + "The initial response must be recorded and approved at the reviewed target before applying and committing its fix. "
        + "No response was recorded by this call. If the fix was committed first, stop and obtain Owner direction to preserve "
        + `those commits and restore this same Errand branch (${errand.branch}) to the reviewed target with a clean worktree. `
        + "Keep the owning Errand claim active and remain on its branch; do not detach HEAD. Then retry the initial response. "
        + "After approval, reapply the preserved fix through the normal checks and commit interlock, and submit the verified-fix response." } });
}
