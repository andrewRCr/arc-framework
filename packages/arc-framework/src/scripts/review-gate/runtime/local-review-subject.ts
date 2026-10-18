/** Shared checkout vehicle, lineage, and Candidate inheritance resolution for local review consumers. */
import type { GitExec } from "../../../lib/git/exec.js";
import type { CandidateManagedRecordV1, CandidateSupersessionAncestor } from "../../../lib/work-unit/candidate-attestation.js";
import { LaneSubjectLineageSchema } from "../core/lane-admission.js";
import { resolveLocalReviewVehicle } from "../hosts/local/review-authority.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import type { ResolvedLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { readLocalWorkUnitBoundary } from "./local-reserved-obligation.js";
import type { LocalPrepareDependencies } from "./local-prepare.js";

/** Existing Candidate record and validated inheritance reads supplied by the repository adapter. */
export interface LocalReviewCandidateReader {
  read(workUnitId: string): Promise<CandidateManagedRecordV1 | null>;
  readSupersessionAncestors(workUnitId: string, candidateId: string): Promise<readonly CandidateSupersessionAncestor[]>;
}

/** Bind the same authenticated subject resolver to prepare and read-only commands. */
export function createLocalReviewSubjectResolver(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly readOnly?: boolean;
  readonly candidateReader: LocalReviewCandidateReader;
  readonly readLive: () => Promise<ResolvedLocalReviewLiveContext>;
}): Pick<LocalPrepareDependencies, "resolveVehicle" | "resolveLineage" | "resolveSupersessionAncestors"> {
  const memberLookup = new RepositoryDeliveryMemberLookup(input);
  return {
    resolveVehicle: (memberHeadObjectId, deliveryAdmission) => resolveLocalReviewVehicle({
      ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
      ...(deliveryAdmission === undefined ? {} : { deliveryAdmission }),
    }, { readLiveContext: async () => (await input.readLive()).context, memberLookup }),
    resolveLineage: async (vehicle, headSha, deliveryAdmission, member) => {
      if (vehicle.kind === "delivery-member") {
        if (member === undefined) {
          throw new Error("delivery-member lineage authority is unavailable");
        }
        return LaneSubjectLineageSchema.parse({
          kind: "delivery-member",
          planId: deliveryAdmission?.vehicle.planId ?? member.planId,
          workUnitId: deliveryAdmission?.vehicle.workUnitId ?? member.workUnitId,
          deliverableId: deliveryAdmission?.vehicle.deliverableId ?? member.deliverableId,
        });
      }
      if (vehicle.kind === "work-unit") {
        const boundary = await readLocalWorkUnitBoundary(input.cwd, vehicle.identity);
        return LaneSubjectLineageSchema.parse({
          kind: "candidate",
          candidateId: boundary.candidateId,
        });
      }
      const claim = (await input.readLive()).context.errand;
      if (claim?.identity !== vehicle.identity || claim.claimId !== vehicle.claimId) {
        throw new Error("Errand claim authority is unavailable for local review");
      }
      return LaneSubjectLineageSchema.parse({
        kind: "head-bound",
        vehicleKind: "errand",
        vehicleIdentity: claim.claimId,
        headSha,
      });
    },
    resolveSupersessionAncestors: (workUnitId, candidateId) => input.candidateReader.readSupersessionAncestors(workUnitId, candidateId),
  };
}
