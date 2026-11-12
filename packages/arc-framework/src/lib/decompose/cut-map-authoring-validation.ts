/** Inventory identity and canonical ordering for authored cut decisions. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";
import { cutIdentitiesOrdered } from "./cut-map-machine-validation.js";

/** Preserve each machine identity exactly once and in machine order. */
export function cutAuthoringIdentityIssue({ machine, authoring }: CutMap): CutMapIssue | null {
  const identityPairs = [
    ["sourceAllocations", machine.sourceUnits.map(({ sourceId }) => sourceId),
      authoring.sourceAllocations.map(({ sourceId }) => sourceId)],
    ["incomingDispositions", machine.incomingEdges.map(({ edgeId }) => edgeId),
      authoring.incomingDispositions.map(({ edgeId }) => edgeId)],
    ["outgoingDispositions", machine.outgoingEdges.map(({ edgeId }) => edgeId),
      authoring.outgoingDispositions.map(({ edgeId }) => edgeId)],
  ] as const;
  const invalidIdentityPair = identityPairs.find(([, machineIds, authorIds]) =>
    machineIds.join("\0") !== authorIds.join("\0"));
  if (invalidIdentityPair !== undefined) return {
    code: "authoring-identity",
    path: `authoring.${invalidIdentityPair[0]}`,
    message: "Preserve every machine identity exactly once and in machine order; edit only its authored value.",
  };
  return null;
}

/** Require every authored identity collection to use unique UTF-8 order. */
export function cutAuthoringOrderIssue({ authoring }: CutMap): CutMapIssue | null {
  const inventories = [
    ["destinations", authoring.destinations.map(({ destinationId }) => destinationId)],
    ["internalEdges", authoring.internalEdges.map(({ from, to }) => `${from}\0${to}`)],
    ["externalEdges", authoring.externalEdges.map(({ from, to }) => `${from}\0${to}`)],
  ] as const;
  for (const [name, ids] of inventories) {
    if (!cutIdentitiesOrdered(ids)) return orderIssue(name);
  }
  if (authoring.incomingDispositions.some(({ disposition }) =>
    disposition.kind === "replace" && !cutIdentitiesOrdered(disposition.replacementTargets))) {
    return orderIssue("incomingDispositions");
  }
  if (authoring.outgoingDispositions.some(({ disposition }) =>
    disposition.kind === "targets" && !cutIdentitiesOrdered(disposition.targets))) {
    return orderIssue("outgoingDispositions");
  }
  return null;
}

function orderIssue(collection: string): CutMapIssue {
  return { code: "authoring-order", path: `authoring.${collection}`,
    message: "Keep authored identities unique and in canonical UTF-8 order." };
}
