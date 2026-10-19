/** Name admission distinguishes live holders, former slugs, and completed cohort reuse. */
import { expect, it } from "vitest";
import { createDecomposeOriginFixture } from "../../../fixtures/decompose-origin.js";
import { completeCutMapFixture } from "../../../fixtures/decompose-v4.js";
import { prepareDecomposePreflight } from "../../../../src/lib/decompose/preflight.js";
import { checkDecomposeNames } from "../../../../src/lib/decompose/check-names.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import { decodeCutMap } from "../../../../src/lib/decompose/cut-map-decode.js";

function renameMember(map: CutMap, from: string, to: string): void {
  for (const destination of map.authoring.destinations) {
    if (destination.kind === "new-member" && destination.slug === from) destination.slug = to;
  }
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind === "target") {
      allocation.disposition.targetLocator.artifact = allocation.disposition.targetLocator.artifact.replace(`-${from}.md`, `-${to}.md`);
    }
  }
  for (const edge of [...map.authoring.internalEdges, ...map.authoring.externalEdges]) {
    if (edge.from === from) edge.from = to;
    if (edge.to === from) edge.to = to;
  }
  for (const entry of map.authoring.incomingDispositions) {
    if (entry.disposition.kind === "replace") entry.disposition.replacementTargets = entry.disposition.replacementTargets.map(slug => slug === from ? to : slug);
  }
  for (const entry of map.authoring.outgoingDispositions) {
    if (entry.disposition.kind === "targets") entry.disposition.targets = entry.disposition.targets.map(slug => slug === from ? to : slug);
  }
}

it.each(["work-item", "open-cohort", "former-slug", "completed-cohort"] as const)("refuses a name held by %s and admits a corrected map", async held => {
  const h = await createDecomposeOriginFixture();
  if (held === "work-item") await h.seedStub("member-a");
  if (held === "open-cohort") await h.seedCohort("member-a");
  if (held === "former-slug") await h.seedRenamedWorkUnit("member-a", "renamed-holder");
  if (held === "completed-cohort") await h.seedCohort("group", true);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const refused = await checkDecomposeNames(h.store, map);
  expect(refused).toMatchObject({ status: "refused", reason: "name-collision", class: "recoverable",
    locus: held === "completed-cohort" ? "authoring.placement.cohort" : "authoring.destinations.0.slug" });
  if (refused.status !== "refused") throw new Error("Expected held name.");
  expect(refused.remedy.text).toContain("another");
  if (held === "completed-cohort") map.authoring.placement = { kind: "cohort", cohort: "available-group", purpose: "Coordinate the work." };
  else renameMember(map, "member-a", "member-aa");
  expect(decodeCutMap(map).status).toBe("accepted");
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "ok" });
});

it("allows a member to reuse a name held only by a completed cohort", async () => {
  const h = await createDecomposeOriginFixture();
  await h.seedCohort("member-a", true);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  expect(await checkDecomposeNames(h.store, completeCutMapFixture(fresh.result.machine))).toMatchObject({ status: "ok",
    result: { newCohorts: [{ path: "group", locus: "authoring.placement.cohort" }] } });
});

it.each(["member/cohort", "parent/subcohort"] as const)("refuses duplicate %s names within the map, then admits distinct names", async collision => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  if (collision === "member/cohort") renameMember(map, "member-a", "group");
  else map.authoring.placement = { kind: "subcohort", cohort: "group/group", purpose: "Coordinate children.", parentPurpose: "Coordinate parent." };
  expect(decodeCutMap(map).status).toBe("accepted");
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "refused", reason: "name-collision",
    class: "recoverable", locus: "authoring.placement.cohort" });
  map.authoring.placement = { kind: "cohort", cohort: "available-group", purpose: "Coordinate the work." };
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "ok" });
});

it.each(["origin", "origin/child", "parent/origin"])("refuses creating %s under the live origin's name, then admits another name", async path => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.placement = path.includes("/") ? { kind: "subcohort", cohort: path,
    purpose: "Coordinate children.", parentPurpose: "Coordinate parent." } : { kind: "cohort", cohort: path, purpose: "Coordinate the work." };
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "refused", reason: "cohort-origin-name",
    class: "recoverable", locus: "authoring.placement.cohort" });
  map.authoring.placement = { kind: "cohort", cohort: "available-group", purpose: "Coordinate the work." };
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "ok" });
});

it.each(["group", "parent/child"])("reuses open %s documents without reacquiring their names", async path => {
  const h = await createDecomposeOriginFixture();
  if (path.includes("/")) await h.seedCohort("parent");
  const existing = await h.seedCohort(path);
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  map.authoring.placement = path.includes("/") ? { kind: "subcohort", cohort: path } : { kind: "cohort", cohort: path };
  const result = await checkDecomposeNames(h.store, map);
  expect(result).toMatchObject({ status: "ok", result: { newCohorts: [] } });
  if (result.status === "refused") throw new Error(JSON.stringify(result));
  expect(result.result.cohorts).toContainEqual({ path, record: existing });
});

it("preserves an unreadable cohort inventory's repair and admits names after the inventory recovers", async () => {
  const h = await createDecomposeOriginFixture();
  const fresh = await prepareDecomposePreflight(h.ctx, "origin");
  if (fresh.status === "refused") throw new Error(JSON.stringify(fresh));
  const map = completeCutMapFixture(fresh.result.machine);
  const list = h.store.list.bind(h.store);
  const remedy = { text: "Restore the cohort ref, then retry.", argv: ["repair-cohort-ref"] };
  h.store.list = async input => input.family === "cohort"
    ? { status: "ok", result: { status: "unreadable", condition: "Cohort ref unreadable.", remedy } } : list(input);
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "refused", reason: "inventory-incomplete",
    class: "recoverable", locus: "cohort-inventory", remedy });
  h.store.list = list;
  expect(await checkDecomposeNames(h.store, map)).toMatchObject({ status: "ok" });
});
