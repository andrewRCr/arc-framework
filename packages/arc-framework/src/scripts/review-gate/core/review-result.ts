/** Immutable producer results normalized across local, frontline, and hosted review sources. */

import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import type { FrontlineExecutableIdentity } from "./advisory-records.js";
import type { BoundFrontlineResponseBinding } from "./frontline-response-binding.js";
import type { NormalizedReviewFinding } from "./finding-records.js";
import type {
  ReviewRequestV2,
  ReviewRequirementV2,
  ReviewTarget,
} from "./gate-contract-v2-schema.js";
import type { LaneSubjectLineage } from "./lane-admission.js";
import type { LocalReviewState } from "./operation-state-schema.js";
import type { DeliveryLocalReviewAdmission } from
  "../policy/delivery-local-review-admission.js";
import type { FrontlineExecutionOutcome } from "../policy/frontline-outcome.js";
import type { HostedCoverageEvidence } from "../hosted/await.js";
import type { HostedReviewCoverage, HostedTarget } from "../hosted/request.js";
import type { ReviewScopeMode } from "./review-primitives.js";
import type { IncrementalReviewScope } from "./incremental-review-scope.js";

/** Admission facts shared by every terminal producer. */
export interface ReviewResultAdmissionContext {
  lineage: LaneSubjectLineage;
  logicalPass: number;
  retryGeneration: number;
  requestedCoverage: HostedReviewCoverage;
  effectiveCoverage: HostedReviewCoverage | null;
  scopeMode: ReviewScopeMode;
  policyVersion: string;
  correctionScope?: IncrementalReviewScope;
}

interface ReviewResultBase {
  producerId: string;
  repositoryId: string;
  target: ReviewTarget;
  sourceIdentity: string;
  originalOutcome: "clean" | "findings";
  findings: readonly NormalizedReviewFinding[];
  resultDigest: string;
  admission: ReviewResultAdmissionContext;
}

/** Complete immutable local receipt and its admitted execution context. */
export interface LocalReviewResult extends ReviewResultBase {
  kind: "attested-local";
  vehicle: LocalReviewState["vehicle"];
  receiptRef: string;
  localSourceRef: string;
  requirement: ReviewRequirementV2;
  request: ReviewRequestV2;
  deliveryAdmission?: DeliveryLocalReviewAdmission;
}

/** Complete immutable frontline outcome and its executable admission context. */
export interface FrontlineReviewResult extends ReviewResultBase {
  kind: "frontline";
  outcomeRef: string;
  sourceBindingId: string;
  executableIdentity: FrontlineExecutableIdentity | null;
  outcome: FrontlineExecutionOutcome;
  responseBinding?: BoundFrontlineResponseBinding;
}

/** Complete immutable hosted result and its admitted request/settlement context. */
export interface HostedReviewResult extends ReviewResultBase {
  kind: "hosted";
  laneOperationId: string;
  actorIdentity: string;
  hostedTarget: HostedTarget;
  requirement: ReviewRequirementV2;
  coverageEvidence?: HostedCoverageEvidence;
  vehicle?: DeliveryReviewMemberVehicle;
  hostSettlementFindingIds: readonly string[];
  noHostSettlementFindingIds: readonly string[];
  settled: boolean;
}

/** One source-neutral immutable terminal producer result. */
export type ReviewResult = LocalReviewResult | FrontlineReviewResult | HostedReviewResult;
