/** Abandonment admission and accepted unsynced retirement outcomes for stored cuts. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { createDecomposeCloneFixture, addConcurrentDecomposeCut } from "../../../fixtures/decompose-sync.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";

it("refuses abandonment while a cut is stored and succeeds after its approved discard", async () => {
  const h = await createDecomposeTerminalFixture();
  h.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const before = lifecycleSuccess(await h.store.version());
  const refused = await runStoreAbandon(h.ctx, { name: "origin", confirmed: true });
  expect(refused).toMatchObject({ status: "rejected", refusal: { code: "record-malformed", rule: "lineage.cut-in-flight" } });
  for (const command of ["arc decompose origin --finish", "arc decompose origin --discard"]) expect(JSON.stringify(refused)).toContain(command);
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const preview = await runStoreDecomposeDiscard(h.ctx, "origin");
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeDiscard(h.ctx, "origin", { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "ok", result: { kind: "discarded" } });
  expect(await runStoreAbandon(h.ctx, { name: "origin", confirmed: true })).toMatchObject({ status: "abandoned" });
  expect(await readWorkUnit(h.store, "origin")).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await h.store.read({ reference: recordReferences["lineage/transition"](h.primary.reference.owner) })).fields)
    .toMatchObject({ kind: "abandon" });
});

it("preserves unsynced abandonment's native slug refusal and leaves independently removable stubs and an open cohort", async () => {
  const h = await createDecomposeCloneFixture();
  for (const clone of [h.left, h.right]) clone.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const cut = await addConcurrentDecomposeCut(h.left.ctx, "left");
  expect(await runStoreAbandon(h.right.ctx, { name: "origin", confirmed: true })).toMatchObject({ status: "abandoned" });
  lifecycleSuccess(await h.right.store.sync());
  lifecycleSuccess(await h.left.store.sync());
  const native = await readWorkUnit(h.left.store, "origin");
  expect(native).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  if (native.status !== "refused") throw new Error(JSON.stringify(native));
  const before = lifecycleSuccess(await h.left.store.version());
  for (const result of [await runStoreDecomposeDiscard(h.left.ctx, "origin"), await runStoreDecomposeFinish(h.left.ctx, "origin")])
    expect(result).toMatchObject({ status: "refused", reason: "store", storeRefusal: native.refusal });
  expect(lifecycleSuccess(await h.left.store.version())).toBe(before);
  const stored = lifecycleSuccess(await h.left.store.read({ reference: cut.applied.storedMap }));
  expect(stored.reference.owner).toHaveProperty("uid");
  expect(JSON.parse(stored.content)).toEqual(cut.map);
  const cohortRef = cut.applied.cohorts[0]!.reference;
  const cohort = lifecycleSuccess(await h.left.store.read({ reference: cohortRef }));
  for (const name of ["left-a", "left-b"]) {
    expect(lifecycleSuccess(await readWorkUnit(h.left.store, name))).toMatchObject({ placement: { kind: "backlog", commitment: "planned" } });
    expect(await runStoreAbandon(h.left.ctx, { name, confirmed: true })).toMatchObject({ status: "abandoned" });
    expect(await readWorkUnit(h.left.store, name)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }
  expect(lifecycleSuccess(await h.left.store.read({ reference: cohortRef }))).toEqual(cohort);
  expect(cohort.placement?.kind).not.toBe("completed");
  expect(lifecycleSuccess(await h.left.store.read({ reference: stored.reference }))).toEqual(stored);
});
