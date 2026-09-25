/** Cross-attempt invariants for one durable lane owner. */

import { z } from "zod";
import { laneSubjectOwnerMatches } from "./lane-admission.js";
import type { LaneProgressState } from "./operation-state-schema.js";

type Attempt = LaneProgressState["attempts"][number];

function issue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: "custom", path, message });
}

function validateAuthorizations(
  state: LaneProgressState,
  attempt: Attempt,
  index: number,
  context: z.RefinementCtx,
): void {
  for (const [authorizationIndex, authorization] of
    (attempt.conditionalPassAuthorizations?.authorizations ?? []).entries()) {
    const ownerMatches = authorization.repositoryId === state.repositoryId
      && authorization.lane === state.lane
      && laneSubjectOwnerMatches(authorization.lineage, state.lineage);
    const producerMatches = authorization.producerId === attempt.attemptId
      && authorization.originatingHeadSha === attempt.headSha
      && authorization.exhaustedPassCount === attempt.logicalPass
      && authorization.nextPass === attempt.logicalPass + 1
      && attempt.terminalProducer;
    if (!ownerMatches || !producerMatches) {
      issue(context, ["attempts", index, "conditionalPassAuthorizations", "authorizations", authorizationIndex],
        "conditional pass authorization must bind its terminal producer and lane owner");
    }
  }
}

function validateAttemptLineage(
  state: LaneProgressState,
  attempt: Attempt,
  index: number,
  context: z.RefinementCtx,
): void {
  if (state.lane === "frontline" && attempt.frontline === undefined) {
    issue(context, ["attempts", index, "frontline"], "frontline lane attempts require durable admission");
  }
  if (state.lineage.kind === "head-bound"
    && state.lineage.vehicleKind === "review-target"
    && attempt.headSha !== state.lineage.headSha) {
    issue(context, ["attempts", index, "headSha"], "attempt target must remain inside its head-bound lineage");
  }
  if (state.lineage.kind !== "delivery-member") return;
  const hostedMatches = hostedVehicleMatchesLineage(state, attempt);
  const localDeliverableId = attempt.local?.vehicle.kind === "delivery-member"
    ? attempt.local.vehicle.identity : null;
  if (!hostedMatches || (localDeliverableId !== null && localDeliverableId !== state.lineage.deliverableId)) {
    issue(context, ["attempts", index], "delivery attempt must remain inside its member lineage");
  }
}

function hostedVehicleMatchesLineage(state: LaneProgressState, attempt: Attempt): boolean {
  if (state.lineage.kind !== "delivery-member") return true;
  const vehicle = attempt.hosted?.vehicle;
  return vehicle === undefined
    || (vehicle.planId === state.lineage.planId
      && vehicle.workUnitId === state.lineage.workUnitId
      && vehicle.deliverableId === state.lineage.deliverableId);
}

function validateAttemptCoverage(attempt: Attempt, index: number, context: z.RefinementCtx): void {
  const local = attempt.local;
  if (local === undefined) return;
  if (attempt.terminalProducer && local.effectiveCoverage !== local.requestedCoverage) {
    issue(context, ["attempts", index, "local", "effectiveCoverage"],
      "terminal local coverage must equal its admitted requested coverage");
  }
  if (!attempt.terminalProducer && local.effectiveCoverage !== null) {
    issue(context, ["attempts", index, "local", "effectiveCoverage"],
      "nonterminal local attempts cannot claim effective coverage");
  }
}

function validateAttemptAdmission(
  state: LaneProgressState,
  attempt: Attempt,
  index: number,
  context: z.RefinementCtx,
): void {
  const frontline = attempt.frontline;
  if (frontline !== undefined
    && (state.lane !== "frontline"
      || frontline.admission.target.repositoryId !== state.repositoryId
      || !laneSubjectOwnerMatches(frontline.admission.lineage, state.lineage))) {
    issue(context, ["attempts", index, "frontline"], "frontline attempt must remain inside its lane owner");
  }
  const hosted = attempt.hosted;
  if (hosted !== undefined
    && (!laneSubjectOwnerMatches(hosted.admission.lineage, state.lineage)
      || hosted.admission.repositoryId !== state.repositoryId)) {
    issue(context, ["attempts", index, "hosted", "admission"],
      "hosted attempt must remain inside its lane owner");
  }
}

function validatePassCounts(state: LaneProgressState, context: z.RefinementCtx): void {
  const pendingPasses = state.attempts.filter(({ outcome }) => outcome === "pending")
    .map(({ logicalPass }) => logicalPass);
  const terminalPasses = state.attempts.filter(({ terminalProducer }) => terminalProducer)
    .map(({ logicalPass }) => logicalPass);
  const terminalPassSet = new Set(terminalPasses);
  if (new Set(pendingPasses).size !== pendingPasses.length) {
    issue(context, ["attempts"], "a logical pass may have only one pending source attempt");
  }
  if (pendingPasses.some((logicalPass) => terminalPassSet.has(logicalPass))) {
    issue(context, ["attempts"], "a logical pass cannot retain a pending source after its terminal producer");
  }
  if (terminalPassSet.size !== terminalPasses.length) {
    issue(context, ["attempts"], "a logical pass may have only one authoritative terminal producer");
  }
  if (state.completedPasses !== terminalPassSet.size) {
    issue(context, ["completedPasses"], "completed passes must equal authoritative terminal claims");
  }
}

export function validateLaneProgressState(state: LaneProgressState, context: z.RefinementCtx): void {
  const hostedAdmissionIds = state.attempts.flatMap((attempt) =>
    attempt.hosted === undefined ? [] : [attempt.hosted.admission.admissionId]);
  if (new Set(hostedAdmissionIds).size !== hostedAdmissionIds.length) {
    issue(context, ["attempts"], "hosted admission identities must be unique within lane progress");
  }
  state.attempts.forEach((attempt, index) => {
    validateAuthorizations(state, attempt, index, context);
    validateAttemptLineage(state, attempt, index, context);
    validateAttemptCoverage(attempt, index, context);
    validateAttemptAdmission(state, attempt, index, context);
  });
  validatePassCounts(state, context);
}
