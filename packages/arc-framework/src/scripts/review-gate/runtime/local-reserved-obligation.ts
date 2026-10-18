/** Bind ordinary work-unit preparation and replay to the live reserved review obligation. */
import { readSubmissionBoundaryVersioned } from "../../../lib/work-unit/submission-boundary-store.js";
import type { IntegrationBoundaryLocus } from "../policy/integration-boundary-locus.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { LocalReviewState } from "../core/operation-state-schema.js";
import { resolveReviewRouting } from "../policy/routing.js";
import { projectStandardReviewObligation } from "../policy/standard-review-projection.js";
import type { StandardReviewObligationProjection } from "../policy/standard-review-projection-schema.js";
import type { LocalPrepareDependencies, LocalPrepareRequest } from "./local-prepare.js";
import { LocalPrepareCommandError } from "./local-prepare-error.js";

/** Read one work unit's current Candidate boundary, optionally requiring an already resolved lineage. */
export async function readLocalWorkUnitBoundary(
  cwd: string, workUnitId: string, candidateId?: string,
): Promise<IntegrationBoundaryLocus> {
  const boundary = (await readSubmissionBoundaryVersioned(cwd, workUnitId)).boundary;
  if (boundary === null || boundary.workUnit !== workUnitId) {
    throw new Error("Candidate lineage authority is unavailable for local review");
  }
  if (candidateId !== undefined && boundary.candidateId !== candidateId) {
    throw new LocalPrepareCommandError("reserved work-unit Candidate lineage changed before preparation");
  }
  return boundary;
}

/** Return the live reservation's policy for an ordinary work-unit review in the same Candidate lineage. */
export async function readReservedWorkUnitObligation(
  cwd: string, vehicle: LocalReviewAuthority["vehicle"], lineage: LaneSubjectLineage,
): Promise<StandardReviewObligationProjection | undefined> {
  if (vehicle.kind !== "work-unit") return undefined;
  if (lineage.kind !== "candidate") throw new LocalPrepareCommandError("reserved work-unit Candidate lineage is unavailable");
  const boundary = await readLocalWorkUnitBoundary(cwd, vehicle.identity, lineage.candidateId);
  return boundary.reservation?.obligation;
}

function obligationFields(projection: StandardReviewObligationProjection) {
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = projection;
  return { obligation, reasons: [...reasons].sort(), rubricVersion, rubricDigest, retrigger, count };
}

/** Require caller routing and replayed requirements to denote the reservation's same logical policy. */
export function assertReservedLocalObligation(
  reserved: StandardReviewObligationProjection,
  observed: StandardReviewObligationProjection,
): void {
  if (canonicalize(obligationFields(reserved)) !== canonicalize(obligationFields(observed))) {
    throw new LocalPrepareCommandError("local review routing does not match the reserved work-unit obligation");
  }
}

/** Re-confirm the live reservation before a pending or completed operation can answer ordinary local prepare. */
export async function confirmReservedLocalReplay(input: {
  readonly request: Pick<LocalPrepareRequest, "routingFacts">;
  readonly state: LocalReviewState;
  readonly lineage: LaneSubjectLineage;
  readonly dependencies: Pick<LocalPrepareDependencies,
    "readReservedWorkUnitObligation" | "resolveAuthority" | "composeAssurance">;
}): Promise<void> {
  if (input.state.deliveryAdmission !== undefined || input.state.vehicle.kind !== "work-unit") return;
  const reserved = await input.dependencies.readReservedWorkUnitObligation(input.state.vehicle, input.lineage);
  if (reserved === undefined) return;
  assertReservedLocalObligation(reserved, input.state.requirement);
  const { authority } = await input.dependencies.resolveAuthority(input.state.request.evaluatorIdentity);
  const assurance = await input.dependencies.composeAssurance(authority);
  if (assurance.status === "refused") {
    throw new LocalPrepareCommandError("reserved work-unit review assurance is unavailable: " + assurance.diagnostics.join("; "));
  }
  const routed = projectStandardReviewObligation(resolveReviewRouting({ schemaVersion: 1, ...input.request.routingFacts,
    changeSetState: "known", assurance: assurance.assurance, activity: assurance.activity }).decision);
  assertReservedLocalObligation(reserved, routed);
}
