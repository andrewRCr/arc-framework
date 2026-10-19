/** Ordered origin, profile, source-unit, and stable-edge comparisons for revision. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeRevisionMismatch } from "./revision-starter-report.js";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";
import { decomposeRebindUnitMismatch, firstRebindDifference } from "./rebind-units.js";

/** Find the first binding that prevents carrying authoring; source-kind changes take the completed-map checks. */
export function decomposeRebindMachineMismatch(map: CutMap, machine: CutMapMachine): DecomposeRevisionMismatch | undefined {
  const prior = map.machine;
  if (prior.origin.slug !== machine.origin.slug || prior.origin.uid !== machine.origin.uid) {
    return { reason: "source-identity", locus: "machine.origin" };
  }
  if (canonicalDigest(prior.planningProfile) !== canonicalDigest(machine.planningProfile)) {
    return { reason: "planning-profile", locus: "machine.planningProfile" };
  }
  const units = decomposeRebindUnitMismatch(map, machine);
  if (units !== undefined) return units;
  for (const field of ["incomingEdges", "outgoingEdges"] as const) {
    const mismatch = firstRebindDifference(prior[field].map(edge => edge.edgeId), machine[field].map(edge => edge.edgeId));
    if (mismatch !== null) return { reason: field === "incomingEdges" ? "incoming-edges" : "outgoing-edges",
      locus: `machine.${field}.${mismatch}` };
  }
  return undefined;
}
