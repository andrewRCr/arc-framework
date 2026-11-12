/** Pure delivery-plan amendment classification from validated plans and explicit host facts. */

import { assertCanonicalDigest, canonicalize, type CanonicalDigest } from "../kernel/index.js";
import { validateDeliveryPlanRecord, validateDeliveryPlanRevision } from "./plan.js";
import type { DeliveryPlanV1 } from "./schema.js";
import { isDeliveryTaskAssignable } from "./task-inventory.js";

/** Inputs to one side-effect-free amendment classification. */
export interface ClassifyDeliveryPlanAmendmentInput {
  readonly current: DeliveryPlanV1;
  readonly proposed: DeliveryPlanV1;
  readonly boundDeliverableIds: readonly CanonicalDigest[];
  readonly landedDeliverableIds: readonly CanonicalDigest[];
}

/** Closed refusal vocabulary for contradictory facts or changes to landed intent. */
export type DeliveryPlanAmendmentRefusalReason =
  | "current-plan-invalid"
  | "proposed-plan-invalid"
  | "bound-facts-invalid"
  | "landed-facts-invalid"
  | "landed-member-changed"
  | "landed-projection-changed"
  | "landed-seam-changed";

/** Smallest safe disposition for one proposed successor revision. */
export type DeliveryPlanAmendmentResult =
  | { readonly status: "accepted" }
  | {
    readonly status: "replacement-required";
    readonly affectedDeliverableIds: readonly CanonicalDigest[];
  }
  | { readonly status: "refused"; readonly reason: DeliveryPlanAmendmentRefusalReason };

/** Classify a successor revision without provider access, persistence, or publication. */
export function classifyDeliveryPlanAmendment(
  input: ClassifyDeliveryPlanAmendmentInput,
): DeliveryPlanAmendmentResult {
  if (validateDeliveryPlanRecord(input.current).status === "refused") {
    return { status: "refused", reason: "current-plan-invalid" };
  }
  if (validateDeliveryPlanRevision(input.proposed, input.current).status === "refused") {
    return { status: "refused", reason: "proposed-plan-invalid" };
  }

  const memberOrder = input.current.members.map((member) => asCanonicalDigest(member.deliverableId));
  const memberIds = new Set(memberOrder);
  const boundIds = new Set(input.boundDeliverableIds);
  if (boundIds.size !== input.boundDeliverableIds.length
    || input.boundDeliverableIds.some((deliverableId) => !memberIds.has(deliverableId))) {
    return { status: "refused", reason: "bound-facts-invalid" };
  }
  const landedIds = new Set(input.landedDeliverableIds);
  const expectedPrefix = memberOrder.slice(0, input.landedDeliverableIds.length);
  if (landedIds.size !== input.landedDeliverableIds.length
    || input.landedDeliverableIds.some((deliverableId, index) => deliverableId !== expectedPrefix[index])
    || input.landedDeliverableIds.some((deliverableId) => !boundIds.has(deliverableId))) {
    return { status: "refused", reason: "landed-facts-invalid" };
  }

  const affected = new Set<CanonicalDigest>();
  let replacementRequired = false;
  if (canonicalize(input.current.projection) !== canonicalize(input.proposed.projection)) {
    if (landedIds.size > 0) {
      return { status: "refused", reason: "landed-projection-changed" };
    }
    replacementRequired = boundIds.size > 0;
    for (const deliverableId of memberOrder) {
      if (boundIds.has(deliverableId)) affected.add(deliverableId);
    }
  }

  const proposedIndex = new Map(input.proposed.members.map((member, index) => (
    [asCanonicalDigest(member.deliverableId), index]
  )));
  const proposedMembers = new Map(input.proposed.members.map((member) => (
    [asCanonicalDigest(member.deliverableId), member]
  )));
  const currentTasks = new Map(input.current.tasks.parents
    .filter(isDeliveryTaskAssignable)
    .map((task) => [task.taskId, canonicalize({ semanticDigest: task.semanticDigest, role: task.role })]));
  const proposedTasks = new Map(input.proposed.tasks.parents
    .filter(isDeliveryTaskAssignable)
    .map((task) => [task.taskId, canonicalize({ semanticDigest: task.semanticDigest, role: task.role })]));
  const currentDesign = new Map(input.current.design.elements.map((element) => (
    [element.elementId, element.semanticDigest]
  )));
  const proposedDesign = new Map(input.proposed.design.elements.map((element) => (
    [element.elementId, element.semanticDigest]
  )));

  for (const [index, currentMember] of input.current.members.entries()) {
    const deliverableId = asCanonicalDigest(currentMember.deliverableId);
    if (!boundIds.has(deliverableId)) continue;
    const proposedMember = proposedMembers.get(deliverableId);
    const landed = landedIds.has(deliverableId);
    const identityAndPositionPreserved = proposedMember !== undefined
      && proposedIndex.get(deliverableId) === index
      && canonicalize(input.current.members.slice(0, index).map((member) => member.deliverableId))
        === canonicalize(input.proposed.members.slice(0, index).map((member) => member.deliverableId));
    const memberSemanticsPreserved = proposedMember !== undefined
      && currentMember.contract === proposedMember.contract
      && currentMember.mainlineLandability === proposedMember.mainlineLandability
      && coveragePreserved(currentMember.taskIds, proposedMember.taskIds, currentTasks, proposedTasks)
      && coveragePreserved(currentMember.designElementIds, proposedMember.designElementIds, currentDesign, proposedDesign)
      && (!landed
        || (currentMember.taskIds.length === proposedMember.taskIds.length
          && currentMember.designElementIds.length === proposedMember.designElementIds.length));
    if (identityAndPositionPreserved && memberSemanticsPreserved) continue;
    if (landed) return { status: "refused", reason: "landed-member-changed" };
    replacementRequired = true;
    affected.add(deliverableId);
  }

  const currentSeams = new Map(input.current.seams.map((seam) => [seam.seamKey, seam]));
  const proposedSeams = new Map(input.proposed.seams.map((seam) => [seam.seamKey, seam]));
  const seamKeys = new Set([...currentSeams.keys(), ...proposedSeams.keys()]);
  for (const seamKey of seamKeys) {
    const currentSeam = currentSeams.get(seamKey);
    const proposedSeam = proposedSeams.get(seamKey);
    const currentIncidents = currentSeam?.incidentDeliverableIds.map(asCanonicalDigest) ?? [];
    const proposedIncidents = proposedSeam?.incidentDeliverableIds.map(asCanonicalDigest) ?? [];
    const incidentIds = new Set([...currentIncidents, ...proposedIncidents]);
    const landedIncidents = memberOrder.filter((deliverableId) => (
      incidentIds.has(deliverableId) && landedIds.has(deliverableId)
    ));
    const boundUnlandedIncidents = memberOrder.filter((deliverableId) => (
      incidentIds.has(deliverableId) && boundIds.has(deliverableId) && !landedIds.has(deliverableId)
    ));

    if (currentSeam === undefined || proposedSeam === undefined) {
      if (landedIncidents.length > 0) {
        return { status: "refused", reason: "landed-seam-changed" };
      }
      if (boundUnlandedIncidents.length > 0) {
        replacementRequired = true;
        for (const deliverableId of boundUnlandedIncidents) affected.add(deliverableId);
      }
      continue;
    }

    const acceptanceChanged = currentSeam.acceptance !== proposedSeam.acceptance;
    const incidenceChanged = canonicalize(currentIncidents) !== canonicalize(proposedIncidents);
    const designCoveragePreserved = coveragePreserved(
      currentSeam.designElementIds,
      proposedSeam.designElementIds,
      currentDesign,
      proposedDesign,
    );
    const designCoverageExact = designCoveragePreserved
      && currentSeam.designElementIds.length === proposedSeam.designElementIds.length;
    const designCoverageAdded = designCoveragePreserved && !designCoverageExact;

    if (acceptanceChanged && landedIncidents.length > 0) {
      return { status: "refused", reason: "landed-seam-changed" };
    }
    if (incidenceChanged && landedIncidents.length > 0) {
      const currentLandedIncidents = currentIncidents.filter((deliverableId) => landedIds.has(deliverableId));
      const proposedLandedIncidents = proposedIncidents.filter((deliverableId) => landedIds.has(deliverableId));
      if (canonicalize(currentLandedIncidents) !== canonicalize(proposedLandedIncidents)) {
        return { status: "refused", reason: "landed-seam-changed" };
      }
      if (boundUnlandedIncidents.length > 0) {
        replacementRequired = true;
        for (const deliverableId of boundUnlandedIncidents) affected.add(deliverableId);
      }
    } else if ((acceptanceChanged || incidenceChanged) && boundUnlandedIncidents.length > 0) {
      replacementRequired = true;
      for (const deliverableId of boundUnlandedIncidents) affected.add(deliverableId);
    }

    if (!designCoverageExact) {
      if (landedIncidents.length > 0) {
        return { status: "refused", reason: "landed-seam-changed" };
      }
      if (!designCoverageAdded && boundUnlandedIncidents.length > 0) {
        replacementRequired = true;
        for (const deliverableId of boundUnlandedIncidents) affected.add(deliverableId);
      }
    }
  }

  const affectedDeliverableIds = memberOrder.filter((deliverableId) => affected.has(deliverableId));
  return replacementRequired
    ? { status: "replacement-required", affectedDeliverableIds }
    : { status: "accepted" };
}

function coveragePreserved(
  currentIds: readonly string[],
  proposedIds: readonly string[],
  currentSemantics: ReadonlyMap<string, string>,
  proposedSemantics: ReadonlyMap<string, string>,
): boolean {
  const proposed = new Set(proposedIds);
  return currentIds.every((id) => proposed.has(id)
    && currentSemantics.get(id) === proposedSemantics.get(id));
}

function asCanonicalDigest(value: string): CanonicalDigest {
  assertCanonicalDigest(value);
  return value;
}
