/** Additive refusal rechecks explain competing writes before offering an exact retry. */
import { expect, it } from "vitest";
import { createDecomposePlanFixture } from "../../../fixtures/decompose-plan.js";
import { withCompetingBatch } from "../../../helpers/store/decompose-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeAdditive } from "../../../../src/lib/decompose/additive.js";
import { DecomposeRefusalSchema } from "../../../../src/lib/decompose/refusal.js";
import { writeMetaNextAction } from "../../../../src/lib/store/kinds/meta/writers.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";

function renameFirstMember(map: CutMap): void {
  const member = map.authoring.destinations[0];
  if (member?.kind !== "new-member") throw new Error("Expected member.");
  member.slug = "fresh-member";
  map.authoring.internalEdges = [{ from: "fresh-member", to: "member-b" }];
  for (const allocation of map.authoring.sourceAllocations) if (allocation.disposition.kind === "target"
    && allocation.disposition.destinationId === member.destinationId) allocation.disposition.targetLocator.artifact = "draft-fresh-member.md";
}

it("reports a competing cut's stored map before names held by that cut", async () => {
  const h = await createDecomposePlanFixture();
  let saved: unknown;
  const store = withCompetingBatch(h.store, async () => {
    expect(await runStoreDecomposeAdditive(h.ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "other.json" })).toMatchObject({ status: "ok" });
    saved = lifecycleSuccess(await h.store.version());
  });
  const ctx = { ...h.ctx, executor: { ...h.ctx.executor, store } };
  const result = await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" });
  expect(result).toMatchObject({ status: "refused", reason: "cut-in-flight", class: "recoverable" });
  expect(lifecycleSuccess(await h.store.version())).toEqual(saved);
  if (result.status !== "refused") throw new Error("Expected refusal.");
  expect(result.remedy.text).toContain("--finish");
});

it.each(["work-item", "cohort-for-member", "work-item-for-cohort"] as const)("explains a %s name race and admits another name", async kind => {
  const h = await createDecomposePlanFixture();
  let saved: unknown;
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.primary.reference],
    condition: "A competing writer acquired the requested name.", remedy: { text: "Read the name holders again." } };
  const store = withCompetingBatch(h.store, async () => {
    if (kind === "cohort-for-member") await h.seedCohort("member-a");
    else await h.seedStub(kind === "work-item-for-cohort" ? "group" : "member-a");
    saved = lifecycleSuccess(await h.store.version());
  }, kind === "work-item" ? undefined : refusal);
  const ctx = { ...h.ctx, executor: { ...h.ctx.executor, store } };
  const result = await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" });
  expect(result).toMatchObject({ status: "refused", reason: "name-collision", class: "recoverable" });
  expect(lifecycleSuccess(await h.store.version())).toEqual(saved);
  const work = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  const cohorts = lifecycleSuccess(await h.store.list({ family: "cohort", kind: "cohort/document" }));
  if (work.status !== "complete" || (cohorts.status !== "complete" && cohorts.status !== "absent")) throw new Error("Expected complete inventory.");
  const cohortNames = cohorts.status === "absent" ? [] : cohorts.records.map(record => record.reference.owner.name);
  expect(work.records.filter(record => record.placement?.kind !== "completed").some(record => cohortNames.includes(record.reference.owner.name))).toBe(false);
  if (kind === "work-item-for-cohort") h.map.authoring.placement = { kind: "cohort", cohort: "fresh-group", purpose: "Coordinate the work." };
  else renameFirstMember(h.map);
  expect(await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});

it.each(["execute", "extract"] as const)("returns the exact %s retry when fresh checks cannot explain a version conflict", async mode => {
  const h = await createDecomposePlanFixture(mode === "extract");
  const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.primary.reference],
    condition: "A bound record changed at batch admission.", remedy: { text: "Acquire current versions and retry." } };
  const store = withCompetingBatch(h.store, async () => {
    const current = lifecycleSuccess(await h.store.read({ reference: h.primary.reference }));
    await h.handEdit(current, writeMetaNextAction(current.content, "Keep the concurrent instruction."));
  }, refusal);
  const ctx = { ...h.ctx, executor: { ...h.ctx.executor, store } };
  const path = "maps/cut's $(literal) `tick`.json";
  const result = await runStoreDecomposeAdditive(ctx, "origin", mode, { cutMap: h.map, cutMapPath: path });
  expect(result).toMatchObject({ status: "refused", reason: "version-conflict", class: "recoverable", storeRefusal: refusal,
    remedy: { argv: ["arc", "decompose", "origin", `--${mode}`, path] } });
  expect(DecomposeRefusalSchema.safeParse(result).success).toBe(true);
  if (result.status !== "refused") throw new Error("Expected refusal.");
  expect(await runStoreDecomposeAdditive(ctx, "origin", mode, { cutMap: h.map, cutMapPath: result.remedy.argv?.[4] ?? "missing" }))
    .toMatchObject({ status: "ok" });
});

it("preserves an unexplained terminal store failure without replacing its repair", async () => {
  const h = await createDecomposePlanFixture();
  const refusal: StoreRefusal = { code: "namespace-corrupt", class: "terminal", namespace: "work", condition: "Namespace authority is corrupt.",
    remedy: { text: "Restore namespace authority from the verified copy." } };
  const store = withCompetingBatch(h.store, async () => {}, refusal);
  const ctx = { ...h.ctx, executor: { ...h.ctx.executor, store } };
  expect(await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" }))
    .toMatchObject({ status: "refused", reason: "store", class: refusal.class, storeRefusal: refusal, remedy: refusal.remedy });
  expect(await runStoreDecomposeAdditive(ctx, "origin", "execute", { cutMap: h.map, cutMapPath: "cut.json" })).toMatchObject({ status: "ok" });
});
