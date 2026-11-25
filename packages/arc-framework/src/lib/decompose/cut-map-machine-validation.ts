/** Canonical identity checks shared by starters and completed maps. */
import { cutSourceId, cutIncomingEdgeId, cutOutgoingEdgeId, cutPreflightId, type CutMapMachine } from "./cut-map-machine.js";
import type { CutMap, CutMapStarter } from "./cut-map-schema.js";
import type { CutMapIssue } from "./cut-map-issues.js";

/** Check a unique UTF-8 ordered identity sequence. */
export function cutIdentitiesOrdered(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined
      && Buffer.compare(Buffer.from(previous, "utf8"), Buffer.from(value, "utf8")) >= 0) return false;
    previous = value;
  }
  return true;
}

/** Compare the authored inventory to the machine inventory, including order. */
export function cutIdentityArraysMatch(
  machine: CutMapMachine,
  authoring: CutMapStarter["authoring"] | CutMap["authoring"],
): boolean {
  return machine.sourceUnits.map(({ sourceId }) => sourceId).join("\0")
      === authoring.sourceAllocations.map(({ sourceId }) => sourceId).join("\0")
    && machine.incomingEdges.map(({ edgeId }) => edgeId).join("\0")
      === authoring.incomingDispositions.map(({ edgeId }) => edgeId).join("\0")
    && machine.outgoingEdges.map(({ edgeId }) => edgeId).join("\0")
      === authoring.outgoingDispositions.map(({ edgeId }) => edgeId).join("\0");
}

/** Return the first corrupt machine inventory or identity. */
export function cutMachineIssue(machine: CutMapMachine): CutMapIssue | null {
  const inventories = [
    ["sourceUnits", machine.sourceUnits.map(({ sourceId }) => sourceId)],
    ["incomingEdges", machine.incomingEdges.map(({ edgeId }) => edgeId)],
    ["outgoingEdges", machine.outgoingEdges.map(({ edgeId }) => edgeId)],
  ] as const;
  for (const [name, ids] of inventories) {
    if (!cutIdentitiesOrdered(ids)) return {
      code: "machine-order", path: `machine.${name}`, message: "Keep machine identities unique and in UTF-8 order.",
    };
  }
  const source = machine.sourceUnits.findIndex(unit => unit.sourceId !== cutSourceId(unit));
  if (source >= 0) return {
    code: "machine-identity", path: `machine.sourceUnits.${source}.sourceId`,
    message: "Restore the machine-derived sourceId; author only fields under authoring.",
  };
  const incoming = machine.incomingEdges.findIndex(edge => edge.edgeId !== cutIncomingEdgeId(edge));
  if (incoming >= 0) return {
    code: "machine-identity", path: `machine.incomingEdges.${incoming}`,
    message: "Restore the machine-derived incoming edge; author only its disposition.",
  };
  const outgoing = machine.outgoingEdges.findIndex(edge => edge.edgeId !== cutOutgoingEdgeId(edge));
  if (outgoing >= 0) return {
    code: "machine-identity", path: `machine.outgoingEdges.${outgoing}`,
    message: "Restore the machine-derived outgoing edge; author only its disposition.",
  };
  const { preflightId, ...facts } = machine;
  return preflightId === cutPreflightId(facts) ? null : {
    code: "machine-identity", path: "machine.preflightId",
    message: "Restore the complete machine envelope emitted by preflight.",
  };
}
