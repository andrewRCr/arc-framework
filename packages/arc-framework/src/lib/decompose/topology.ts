/** Record-backed placement and cohort-structure planning for decomposition. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeNames } from "./check-names.js";
import type { DecomposeResult } from "./refusal.js";
import type { StoreRecord } from "../store/read.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";
import type { DecomposeRefusal } from "./refusal.js";

export type DecomposeLogicalAnchor = { kind: "direct-member"; slug: string }
  | { kind: "cohort" | "subcohort"; cohort: string }
  | { kind: "at-cap-fanout"; parent: string; origin: string };

/** Placement facts consumed by member scaffolds and terminal cohort updates. */
export interface DecomposeTopology {
  logicalAnchor: DecomposeLogicalAnchor;
  constituents: readonly string[];
  memberCohort: string | null;
  fanout?: StoreRecord;
}

/** Plan the authored placement, counting an extraction's surviving origin as a constituent. */
export function planDecomposeTopology(map: CutMap, names: DecomposeNames): DecomposeResult<DecomposeTopology> {
  const { placement, destinations } = map.authoring;
  const members = destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []);
  if (members.length === 0) return decomposeMapRuleRefusal("no-new-member", "authoring.destinations",
    "Declare at least one new member destination, then retry.");
  const constituents = [...members, ...(map.authoring.shape === "extraction" ? [map.machine.origin.slug] : [])]
    .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const expected = placement.kind === "direct-member" ? null : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  const mismatch = destinations.findIndex(destination => destination.kind === "cohort-coordination" && destination.cohort !== expected);
  if (mismatch >= 0) return decomposeMapRuleRefusal("unexpected-coordination-location", `authoring.destinations.${mismatch}.cohort`,
    "Use the placement's cohort for coordination, or remove coordination under direct-member placement, then retry.");
  if (placement.kind === "direct-member") {
    if (members.length !== 1) return decomposeMapRuleRefusal("multi-member-cohortless", "authoring.placement",
      "Choose a cohort placement for multiple new members, or keep exactly one direct member, then retry.");
    return { status: "ok", result: { logicalAnchor: { kind: "direct-member", slug: map.authoring.shape === "extraction"
      ? map.machine.origin.slug : members[0] ?? map.machine.origin.slug }, constituents, memberCohort: null } };
  }
  return planCohortTopology(placement, names, constituents, map.machine.origin.slug);
}

function planCohortTopology(placement: Exclude<CutMap["authoring"]["placement"], { kind: "direct-member" }>,
  names: DecomposeNames, constituents: readonly string[], origin: string): DecomposeResult<DecomposeTopology> {
  if (constituents.length < 2) return decomposeMapRuleRefusal("placement-member-count", "authoring.placement",
    "Use direct-member placement for one retirement member; a cohort needs two constituents, counting a surviving extraction origin.");
  const parents = checkCohortParents(placement, names);
  if (parents !== undefined) return parents;
  if (placement.kind === "at-cap") {
    const parent = names.cohorts.find(cohort => cohort.path === placement.parent && cohort.record.placement?.kind !== "completed");
    if (parent === undefined) return decomposeMapRuleRefusal("missing-parent", "authoring.placement.parent",
      "Choose an existing open subcohort as the at-cap parent, or another placement, then retry.");
    return { status: "ok", result: { logicalAnchor: { kind: "at-cap-fanout", parent: placement.parent, origin },
      constituents, memberCohort: placement.parent, fanout: parent.record } };
  }
  return { status: "ok", result: { logicalAnchor: { kind: placement.kind, cohort: placement.cohort },
    constituents, memberCohort: placement.cohort } };
}

function checkCohortParents(placement: Exclude<CutMap["authoring"]["placement"], { kind: "direct-member" }>,
  names: DecomposeNames): DecomposeRefusal | undefined {
  const open = names.cohorts.filter(cohort => cohort.record.placement?.kind !== "completed");
  const parent = placement.kind === "subcohort" ? placement.cohort.split("/")[0] ?? placement.cohort : undefined;
  const paths = placement.kind === "at-cap" ? [placement.parent] : parent === undefined ? [placement.cohort] : [parent, placement.cohort];
  const locus = placement.kind === "at-cap" ? "authoring.placement.parent" : "authoring.placement.cohort";
  for (const path of paths) {
    const leaf = path.split("/").at(-1);
    if (open.some(cohort => cohort.record.reference.owner.name === leaf && cohort.path !== path)) {
      return decomposeMapRuleRefusal("cohort-parent", locus,
        "Choose a cohort path matching the existing document's Parent, or another cohort name, then retry.");
    }
  }
  if (placement.kind === "subcohort" && open.some(cohort => cohort.path === placement.cohort)
    && !open.some(cohort => cohort.path === parent)) return decomposeMapRuleRefusal("cohort-parent", locus,
    "Restore the existing subcohort's missing parent before reusing it, or choose another placement, then retry.");
  return undefined;
}
