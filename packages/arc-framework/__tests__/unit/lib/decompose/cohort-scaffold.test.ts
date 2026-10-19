/** Cohort scaffolds compose with member seeds in the production checked batch. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { checkDecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import { planDecomposeCohorts } from "../../../../src/lib/decompose/cohort-scaffold.js";
import { planDecomposeMembers } from "../../../../src/lib/decompose/member-scaffold.js";
import { parseCohortDocument } from "../../../../src/lib/store/kinds/cohort/index.js";
import type { DecomposeResult } from "../../../../src/lib/decompose/refusal.js";

function success<T>(result: DecomposeResult<T>): T {
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  return result.result;
}

it.each(["cohort", "cohort-existing", "subcohort", "subcohort-existing-parent", "at-cap", "direct-member"] as const)("writes the documents and placement for %s", async kind => {
  const h = await createDecomposePlanFixture();
  if (kind === "at-cap" || kind === "subcohort-existing-parent" || kind === "cohort-existing") await h.seedCohort("group");
  const retained = kind === "at-cap" ? await h.seedCohort("group/child") : undefined;
  if (kind === "direct-member") {
    h.map.authoring.destinations.splice(1);
    h.map.authoring.internalEdges = [];
    for (const outgoing of h.map.authoring.outgoingDispositions) outgoing.disposition = { kind: "targets", targets: ["member-a"] };
    h.map.authoring.placement = { kind };
  } else if (kind === "at-cap") h.map.authoring.placement = { kind, parent: "group/child" };
  else if (kind === "cohort" || kind === "cohort-existing") h.map.authoring.placement = { kind: "cohort", cohort: "group", ...(kind === "cohort" ? { purpose: "Coordinate the group." } : {}) };
  else h.map.authoring.placement = { kind: "subcohort", cohort: "group/child", purpose: "Coordinate the child.",
    ...(kind === "subcohort" ? { parentPurpose: "Coordinate the parent." } : {}) };
  const names = success(await checkDecomposeNames(h.store, h.map));
  const planned = success(planDecomposeCohorts(h.ctx, h.map, names));
  const paths = kind === "cohort" ? ["group"] : kind === "subcohort" ? ["group", "group/child"]
    : kind === "subcohort-existing-parent" ? ["group/child"] : [];
  expect(planned.cohorts.map(cohort => cohort.path)).toEqual(paths);
  expect(planned.topology.memberCohort).toEqual(kind === "direct-member" ? null : kind === "cohort" || kind === "cohort-existing" ? "group" : "group/child");
  const fresh = success(await prepareDecomposePreflight(h.ctx, "origin"));
  const dependencies = await h.plan();
  const members = success(planDecomposeMembers(h.ctx, h.map, fresh.acquired, planned.topology, dependencies.projection));
  lifecycleSuccess(await h.store.batch({ writes: [...members.writes, ...planned.writes], provenance: { verb: "decompose", lifecycleAction: "additive" } }));
  for (const cohort of planned.cohorts) {
    const record = lifecycleSuccess(await h.store.read({ reference: cohort.reference }));
    expect(parseCohortDocument(record.content)).toMatchObject({ success: true, data: {
      parent: cohort.path.includes("/") ? "group" : null,
      purpose: cohort.path.includes("/") ? "Coordinate the child." : kind === "cohort" ? "Coordinate the group." : "Coordinate the parent.",
    } });
  }
  if (retained !== undefined) expect(lifecycleSuccess(await h.store.read({ reference: retained.reference }))).toEqual(retained);
});

it("refuses a reused document's mismatched Parent and admits its actual placement without a write", async () => {
  const h = await createDecomposePlanFixture();
  await h.seedCohort("group");
  const child = await h.seedCohort("group/child");
  h.map.authoring.placement = { kind: "at-cap", parent: "group/child" };
  const names = success(await checkDecomposeNames(h.store, h.map));
  h.map.authoring.placement = { kind: "cohort", cohort: "child" };
  expect(planDecomposeCohorts(h.ctx, h.map, names)).toMatchObject({ status: "refused", reason: "cohort-parent", class: "recoverable" });
  h.map.authoring.placement = { kind: "at-cap", parent: "group/child" };
  expect(planDecomposeCohorts(h.ctx, h.map, names)).toMatchObject({ status: "ok", result: { cohorts: [], writes: [], topology: { fanout: child } } });
});
