/** Exact immutable target derivation for hosted reservation continuations. */
import type { GitExec } from "../../../lib/git/exec.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import { deriveLocalReviewTargetFromCoordinates } from "../hosts/local/repository-target.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";

/** Resolve the approved member or singleton head against its actual base coordinate. */
export async function deriveHostedReviewTarget(input: {
  readonly exec: GitExec;
  readonly cwd: string;
  readonly currentRepositoryId: string;
  readonly approvedHeadSha: string;
  readonly baseRevision: string;
  readonly vehicle?: DeliveryReviewMemberVehicle;
}): Promise<ReviewTarget> {
  const { settings } = await readConfigSettings(input.cwd);
  return deriveLocalReviewTargetFromCoordinates({
    exec: input.exec, cwd: input.cwd, repositoryId: input.currentRepositoryId,
    coordinates: { kind: input.vehicle === undefined ? "change-set" : "delivery-member",
      baseRef: settings["branch.base"], diffBaseSha: input.baseRevision, headSha: input.approvedHeadSha },
  });
}
