/** Concurrent cut maps require explicit resolution before terminal preparation. */
import { expect, it } from "vitest";
import { createDecomposeCloneFixture, addConcurrentDecomposeCut } from "../../../fixtures/decompose-sync.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { recordPut, readWorkUnit } from "../../../../src/lib/store/lifecycle-write.js";
import { runStoreDecomposeFinish } from "../../../../src/lib/decompose/finish.js";
import { runStoreDecomposeDiscard } from "../../../../src/lib/decompose/discard.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { runStoreAbandon } from "../../../../src/lib/work-unit/verbs/abandon-store.js";
import { createDefaultLocusPorts } from "../../../../src/lib/work-unit/locus-ports.js";
import { sameReference } from "../../../../src/lib/store/identity.js";
import type { Store } from "../../../../src/lib/store/contract.js";

async function conflictingCuts() {
  const h = await createDecomposeCloneFixture();
  h.right.ctx.executor.locusPorts = { ...createDefaultLocusPorts(), findHoldingCheckout: async () => null };
  const leftCut = await addConcurrentDecomposeCut(h.left.ctx, "left");
  const rightCut = await addConcurrentDecomposeCut(h.right.ctx, "right");
  lifecycleSuccess(await h.left.store.sync());
  lifecycleSuccess(await h.right.store.sync());
  // Additive guards also re-put the meta; resolve that independent source conflict using its current bytes.
  const primary = lifecycleSuccess(await readWorkUnit(h.right.store, "origin"));
  if (primary.conflicts.length > 0) lifecycleSuccess(await h.right.store.write({ ...recordPut(primary), resolves: primary.conflicts,
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
  const stored = lifecycleSuccess(await h.right.store.read({ reference: leftCut.applied.storedMap }));
  expect(JSON.parse(stored.content)).toEqual(leftCut.map);
  expect(stored.conflicts).toHaveLength(1);
  return { ...h, leftCut, rightCut, stored };
}

it("refuses finish on a synced map conflict and names discard and revision without writing", async () => {
  const h = await conflictingCuts();
  const before = lifecycleSuccess(await h.right.store.version());
  const result = await runStoreDecomposeFinish(h.right.ctx, "origin");
  expect(result).toMatchObject({ status: "refused", reason: "stored-map-conflict", class: "recoverable" });
  if (result.status !== "refused") throw new Error(JSON.stringify(result));
  for (const command of ["arc decompose origin --discard", "arc decompose origin --revise"]) expect(result.remedy.text).toContain(command);
  expect(lifecycleSuccess(await h.right.store.version())).toBe(before);
});

it.each(["discard", "revise"] as const)("%s acquires and revalidates the origin's conflict record before closing it", async mode => {
  const h = await conflictingCuts();
  const conflict = h.stored.conflicts[0]!;
  const native = { code: "refused" as const, class: "terminal" as const, message: "Conflict evidence unavailable.",
    condition: "Conflict evidence unavailable.", remedy: { text: "Restore conflict evidence, then retry." } };
  let armed = false;
  const read: Store["read"] = async input => {
    if (sameReference(input.reference, conflict) && armed) return { status: "refused", refusal: native };
    return h.right.store.read(input);
  };
  const store = new Proxy(h.right.store, { get(target, property) {
    if (property === "read") return read;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const ctx = { ...h.right.ctx, executor: { ...h.right.ctx.executor, store } };
  const run = (applyAuthority?: string) => mode === "discard" ? runStoreDecomposeDiscard(ctx, "origin", { applyAuthority })
    : runStoreDecomposeRevision(ctx, "origin", { cutMap: h.leftCut.map, cutMapPath: "current.json" }, { applyAuthority });
  const preview = await run();
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  const before = lifecycleSuccess(await store.version());
  armed = true;
  expect(await run(preview.result.applyAuthority)).toMatchObject({ status: "refused", storeRefusal: native });
  expect(lifecycleSuccess(await store.version())).toBe(before);
  armed = false;
  expect(await run(preview.result.applyAuthority)).toMatchObject({ status: "ok" });
});

it.each(["discard", "revise"] as const)("%s closes the map conflict through its subject and preserves the other cut", async mode => {
  const h = await conflictingCuts();
  const store = h.right.store, ctx = h.right.ctx;
  const listing = lifecycleSuccess(await store.list({ family: "work-item" }));
  if (listing.status !== "complete") throw new Error(JSON.stringify(listing));
  const others = listing.records
    .filter(record => record.reference.owner.name.startsWith("right-"));
  const otherCohort = lifecycleSuccess(await store.read({ reference: h.rightCut.applied.cohorts[0]!.reference }));
  const run = (applyAuthority?: string) => mode === "discard" ? runStoreDecomposeDiscard(ctx, "origin", { applyAuthority })
    : runStoreDecomposeRevision(ctx, "origin", { cutMap: h.leftCut.map, cutMapPath: "current.json" }, { applyAuthority });
  const before = lifecycleSuccess(await store.version());
  const preview = await run();
  expect(preview.status).toBe("ok");
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(lifecycleSuccess(await store.version())).toBe(before);
  expect(preview.result.writes.filter(write => write.reference.kind.endsWith("/conflict-record"))).toEqual([]);
  expect(preview.result.writes.find(write => write.reference.kind === "work-item/cut-map"))
    .toMatchObject({ action: mode === "discard" ? "remove" : "put", resolves: h.stored.conflicts });
  expect(await run(preview.result.applyAuthority)).toMatchObject({ status: "ok", result: { kind: mode === "discard" ? "discarded" : "revised" } });
  for (const conflict of h.stored.conflicts) expect(await store.read({ reference: conflict }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const originGroup = lifecycleSuccess(await store.list({ family: "work-item", owner: h.stored.reference.owner }));
  if (originGroup.status !== "complete") throw new Error(JSON.stringify(originGroup));
  expect(originGroup.records.some(record => record.reference.kind.endsWith("/conflict-record"))).toBe(false);
  const current = await store.read({ reference: h.stored.reference });
  if (mode === "discard") expect(current).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  else {
    expect(current.status).toBe("ok");
    if (current.status === "refused") throw new Error(JSON.stringify(current));
    expect(JSON.parse(current.result.content)).toEqual(h.leftCut.map);
    expect(current.result.conflicts).toEqual([]);
  }
  for (const record of others) expect(lifecycleSuccess(await store.read({ reference: record.reference }))).toEqual(record);
  expect(lifecycleSuccess(await store.read({ reference: otherCohort.reference }))).toEqual(otherCohort);
  for (const name of ["right-a", "right-b"]) expect(await runStoreAbandon(ctx, { name, confirmed: true })).toMatchObject({ status: "abandoned" });
  for (const name of ["right-a", "right-b"]) expect(await readWorkUnit(store, name)).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  expect(lifecycleSuccess(await store.read({ reference: otherCohort.reference }))).toEqual(otherCohort);
});

it.each(["member", "cohort"] as const)("sync refuses independently minted %s owners sharing a name", async collision => {
  const h = await createDecomposeCloneFixture();
  await addConcurrentDecomposeCut(h.left.ctx, "left");
  await addConcurrentDecomposeCut(h.right.ctx, collision === "member" ? "left" : "right", collision === "cohort" ? "left-group" : "right-group");
  lifecycleSuccess(await h.left.store.sync());
  const before = lifecycleSuccess(await h.right.store.version());
  const result = await h.right.store.sync();
  expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable" } });
  if (result.status !== "refused" || result.refusal.code !== "ambiguous-match") throw new Error(JSON.stringify(result));
  const candidates = result.refusal.candidates;
  expect(candidates).toHaveLength(2);
  expect(candidates[0]!.owner.name).toBe(candidates[1]!.owner.name);
  expect(candidates[0]!.owner).toHaveProperty("uid");
  expect(candidates[0]!.owner).not.toEqual(candidates[1]!.owner);
  expect(candidates.every(reference => reference.owner.type === (collision === "member" ? "work-item" : "cohort"))).toBe(true);
  expect(lifecycleSuccess(await h.right.store.version())).toBe(before);
});
