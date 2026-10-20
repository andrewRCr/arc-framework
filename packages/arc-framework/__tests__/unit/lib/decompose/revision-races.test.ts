/** Revision admission repeats after a competing batch and preserves native failures. */
import { expect, it } from "vitest";
import { observedDecomposeWrite } from "../../../helpers/store/decompose-batch.js";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { recordPut, readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

async function preview(h: Awaited<ReturnType<typeof createDecomposeTerminalFixture>>, map: CutMap, path = "revised.json") {
  const result = await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: path });
  expect(result.status).toBe("ok");
  if (result.status === "refused" || result.result.kind !== "preview") throw new Error(JSON.stringify(result));
  return result.result;
}

it.each(["work-item", "cohort-for-member", "work-item-for-cohort"] as const)("explains a revision's %s name race and admits another name", async kind => {
  const h = await createDecomposeTerminalFixture();
  const map = structuredClone(h.map);
  if (kind === "work-item-for-cohort") map.authoring.placement = { kind: "cohort", cohort: "new-group", purpose: "Coordinate the new placement." };
  else map.authoring.destinations.push({ kind: "new-member", destinationId: "z-new", slug: "added", workClass: "Light" });
  const plan = await preview(h, map);
  let saved: unknown;
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.primary.reference],
    condition: "A competing writer acquired the requested name.", remedy: { text: "Read current name holders." } };
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    if (kind === "cohort-for-member") await h.seedCohort("added");
    else await h.seedStub(kind === "work-item-for-cohort" ? "new-group" : "added");
    saved = lifecycleSuccess(await h.store.version());
  }, kind === "work-item" ? undefined : refusal);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "name-collision" });
  expect(lifecycleSuccess(await h.store.version())).toBe(saved);
  if (kind === "work-item-for-cohort") map.authoring.placement = { kind: "cohort", cohort: "available-group", purpose: "Coordinate the revised placement." };
  else {
    const added = map.authoring.destinations.at(-1);
    if (added?.kind !== "new-member") throw new Error("Expected added member.");
    added.slug = "available";
  }
  const repaired = await preview(h, map);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: repaired.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
});

it("requires renewed approval for an unexplained native compare-and-swap conflict", async () => {
  const h = await createDecomposeTerminalFixture();
  const path = "maps/revision's $(literal) `tick`.json";
  const plan = await preview(h, h.map, path);
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.primary.reference],
    condition: "A bound record changed at batch admission.", remedy: { text: "Acquire fresh versions." } };
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    const origin = lifecycleSuccess(await readWorkUnit(h.store, "origin"));
    await h.handEdit(origin, writeMetaNextAction(origin.content, "Keep the concurrent instruction."));
  }, refusal);
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: path }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "version-conflict", storeRefusal: refusal,
      remedy: { argv: ["arc", "decompose", "origin", "--revise", path], text: expect.stringMatching(/fresh.*preview.*approv/iu) } });
  expect(lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }))).toHaveLength(1);
  const repaired = await preview(h, h.map, path);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: path }, { applyAuthority: repaired.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
});

it("preserves an unexplained terminal native refusal and admits a later healthy batch", async () => {
  const h = await createDecomposeTerminalFixture();
  const plan = await preview(h, h.map);
  const refusal: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: "work", condition: "Namespace authority is corrupt.",
    remedy: { text: "Restore namespace authority from the verified copy." } };
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {}, refusal);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "store", class: refusal.class, storeRefusal: refusal, remedy: refusal.remedy });
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: h.map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
});

it("fails native map-version admission atomically and applies after a fresh preview", async () => {
  const h = await createDecomposeTerminalFixture();
  const map = structuredClone(h.map);
  map.authoring.internalEdges = [];
  const plan = await preview(h, map);
  h.ctx.executor.store = withCompetingBatch(h.store, async () => {
    const stored = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
    lifecycleSuccess(await observedDecomposeWrite(h.store, { ...recordPut(stored), provenance: { verb: "decompose", lifecycleAction: "revise" } }));
  });
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: plan.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "version-conflict", storeRefusal: { code: "version-conflict" },
      remedy: { argv: ["arc", "decompose", "origin", "--revise", "revised.json"] } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes).toHaveLength(1);
  expect(changes[0]?.reference).toEqual(h.applied.storedMap);
  const fresh = await preview(h, map);
  expect(await runStoreDecomposeRevision(h.ctx, "origin", { cutMap: map, cutMapPath: "revised.json" }, { applyAuthority: fresh.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "revised" } });
});
