/** Placement rules retain authored loci and count the surviving extraction origin. */
import { expect, it } from "vitest";
import { cutMapFixture, cutExtractionFixture } from "../../../fixtures/decompose-v4.js";
import { planDecomposeTopology } from "../../../../src/lib/decompose/topology.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import type { DecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import { checkDecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { sameReference } from "../../../../src/lib/store/identity.js";

const names: DecomposeNames = { cohorts: [], newCohorts: [{ path: "group", locus: "authoring.placement.cohort" }] };

it.each([
  { reason: "no-new-member", locus: "authoring.destinations", mutate: (map: CutMap) => { map.authoring.destinations = []; } },
  { reason: "multi-member-cohortless", locus: "authoring.placement", mutate: (map: CutMap) => { map.authoring.placement = { kind: "direct-member" }; } },
  { reason: "placement-member-count", locus: "authoring.placement", mutate: (map: CutMap) => { map.authoring.destinations.splice(1); } },
  { reason: "unexpected-coordination-location", locus: "authoring.destinations.2.cohort", mutate: (map: CutMap) => {
    map.authoring.destinations.push({ kind: "cohort-coordination", destinationId: "z-coordination", cohort: "elsewhere" });
  } },
  { reason: "missing-parent", locus: "authoring.placement.parent", mutate: (map: CutMap) => { map.authoring.placement = { kind: "at-cap", parent: "group/subgroup" }; } },
])("refuses $reason at $locus and admits a corrected placement", ({ reason, locus, mutate }) => {
  const map = cutMapFixture(); mutate(map);
  expect(planDecomposeTopology(map, names)).toMatchObject({ status: "refused", reason, class: "recoverable", locus });
  Object.assign(map, cutMapFixture());
  expect(planDecomposeTopology(map, names)).toMatchObject({ status: "ok" });
});

it.each(["cohort", "subcohort", "at-cap"] as const)("refuses a reused %s document with the wrong Parent and admits its actual path", async kind => {
  const h = await createDecomposeOriginFixture();
  await h.seedCohort("group");
  const child = await h.seedCohort("group/subgroup");
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.placement = { kind: "at-cap", parent: "group/subgroup" };
  const observed = await checkDecomposeNames(h.store, map);
  if (observed.status === "refused") throw new Error(JSON.stringify(observed));
  map.authoring.placement = kind === "cohort" ? { kind, cohort: "subgroup" }
    : kind === "subcohort" ? { kind, cohort: "subgroup/child", purpose: "Coordinate work." }
    : { kind, parent: "other/subgroup" };
  expect(planDecomposeTopology(map, observed.result)).toMatchObject({ status: "refused", reason: "cohort-parent",
    class: "recoverable", locus: kind === "at-cap" ? "authoring.placement.parent" : "authoring.placement.cohort" });
  map.authoring.placement = { kind: "at-cap", parent: "group/subgroup" };
  expect(planDecomposeTopology(map, observed.result)).toMatchObject({ status: "ok", result: { memberCohort: "group/subgroup",
    logicalAnchor: { kind: "at-cap-fanout", parent: "group/subgroup", origin: "origin" }, fanout: child } });
});

it("refuses backfilling a missing parent beside a reused orphaned subcohort", async () => {
  const h = await createDecomposeOriginFixture();
  const parent = await h.seedCohort("group");
  await h.seedCohort("group/subgroup");
  // Represent a legacy orphan that checked cohort removal would refuse to create.
  for (const [key, record] of h.store.state.records) if (sameReference(record.reference, parent.reference)) h.store.state.records.delete(key);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.placement = { kind: "subcohort", cohort: "group/subgroup", parentPurpose: "Restore parent." };
  const observed = await checkDecomposeNames(h.store, map);
  if (observed.status === "refused") throw new Error(JSON.stringify(observed));
  expect(planDecomposeTopology(map, observed.result)).toMatchObject({ status: "refused", reason: "cohort-parent",
    locus: "authoring.placement.cohort" });
  map.authoring.placement = { kind: "cohort", cohort: "available-group", purpose: "Coordinate work." };
  expect(planDecomposeTopology(map, observed.result)).toMatchObject({ status: "ok" });
});

it.each(["direct-member", "cohort"] as const)("counts one extracted member and the surviving origin under %s placement", kind => {
  const map = cutExtractionFixture();
  map.authoring.placement = kind === "direct-member" ? { kind } : { kind, cohort: "group", purpose: "Coordinate work." };
  expect(planDecomposeTopology(map, names)).toMatchObject({ status: "ok", result: { constituents: ["member-a", "origin"],
    memberCohort: kind === "direct-member" ? null : "group", logicalAnchor: kind === "direct-member"
      ? { kind, slug: "origin" } : { kind, cohort: "group" } } });
});
