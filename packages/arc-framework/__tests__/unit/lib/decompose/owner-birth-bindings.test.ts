/** Binding continuity, fresh generations and atomic history observations through real cut verbs. */
import { expect, it } from "vitest";
import { createDecomposeTerminalFixture } from "../../../fixtures/decompose-terminal.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { runStoreDecomposeRevision } from "../../../../src/lib/decompose/revision.js";
import { acquireDecomposeTerminal } from "../../../../src/lib/decompose/acquire-terminal.js";
import { decodeCutMapContent } from "../../../../src/lib/store/kinds/cut-map/index.js";
import type { CutMap } from "../../../../src/lib/decompose/cut-map-schema.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { createDecomposeCloneFixture, addConcurrentDecomposeCut } from "../../../fixtures/decompose-sync.js";
import { readWorkUnit, recordPut, readLifecycleMetaFields } from "../../../../src/lib/store/lifecycle-write.js";
import { writeMetaDependsOn } from "../../../../src/lib/store/kinds/meta/writers.js";

type Harness = Awaited<ReturnType<typeof createDecomposeTerminalFixture>>;

async function revise(h: Harness, map: CutMap) {
  const input = { cutMap: map, cutMapPath: "revision.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  const applied = await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority });
  expect(applied).toMatchObject({ status: "ok", result: { kind: "revised" } });
  const record = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const stored = decodeCutMapContent(record.content);
  if (!stored.success) throw new Error(stored.error);
  return { record, stored: stored.data };
}

function replaceSecond(map: CutMap, name: string): CutMap {
  const next = structuredClone(map), destination = next.authoring.destinations[1];
  if (destination?.kind !== "new-member") throw new Error("Expected second member.");
  destination.slug = name;
  next.authoring.internalEdges = [];
  return next;
}

it("keeps exact retained bindings through no-op puts and destination-ID relabeling", async () => {
  const h = await createDecomposeTerminalFixture();
  const original = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const first = await revise(h, h.map);
  expect(first.record.content).toBe(original.content);
  expect(lifecycleSuccess(await h.store.history({ reference: h.applied.storedMap }))[0]?.creationReceipt?.createdOwners).toEqual([]);
  const next = structuredClone(h.map);
  for (const destination of next.authoring.destinations) if (destination.destinationId === "member-b") destination.destinationId = "member-z";
  const relabeled = await revise(h, next);
  expect(relabeled.stored.ownerBirths).toEqual(first.stored.ownerBirths);
});

it("drops and re-adds a birth name with a fresh key and UID while preserving every retained owner", async () => {
  const h = await createDecomposeTerminalFixture();
  const original = await acquireDecomposeTerminal(h.ctx, "origin");
  if (original.status === "refused") throw new Error(JSON.stringify(original));
  const changed = await revise(h, replaceSecond(h.map, "member-c"));
  const restored = await revise(h, h.map);
  const current = await acquireDecomposeTerminal(h.ctx, "origin");
  if (current.status === "refused") throw new Error(JSON.stringify(current));
  const oldBirth = original.result.storedCut.ownerBirths.find(birth => birth.name === "member-b");
  const newBirth = restored.stored.ownerBirths.find(birth => birth.name === "member-b");
  expect(newBirth?.birthKey).not.toBe(oldBirth?.birthKey);
  expect(current.result.members.find(member => member.slug === "member-b")?.uid)
    .not.toBe(original.result.members.find(member => member.slug === "member-b")?.uid);
  expect(restored.stored.ownerBirths.filter(birth => birth.name !== "member-b"))
    .toEqual(original.result.storedCut.ownerBirths.filter(birth => birth.name !== "member-b"));
  expect(changed.stored.ownerBirths.some(birth => birth.name === "member-b")).toBe(false);
  expect(restored.stored.ownerBirths.some(birth => birth.name === "member-c")).toBe(false);
});

it("rechecks prior history atomically even when another map event has the same current record version", async () => {
  const h = await createDecomposeTerminalFixture();
  const map = replaceSecond(h.map, "member-c"), input = { cutMap: map, cutMapPath: "revision.json" };
  const preview = await runStoreDecomposeRevision(h.ctx, "origin", input);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  const before = structuredClone(h.store.state.records), batch = h.store.batch.bind(h.store);
  let armed = true;
  h.ctx.executor.store = new Proxy(h.store, { get(target, property) {
    if (property === "batch") return (candidate: Parameters<Store["batch"]>[0]) => {
      if (armed) {
        armed = false;
        const prior = h.store.state.events.find(event => event.reference.kind === "work-item/cut-map");
        if (prior === undefined || !("verb" in prior.provenance)) throw new Error("Expected accepted map history.");
        h.store.state.events.push({ ...structuredClone(prior), id: "concurrent-retained-event",
          provenance: { ...prior.provenance, batchId: "concurrent-retained-batch" },
          creationReceipt: { schemaVersion: 1, batchId: "concurrent-retained-batch", createdOwners: [] } });
      }
      return batch(candidate);
    };
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority }))
    .toMatchObject({ status: "refused", reason: "store", storeRefusal: { rule: "cut-map.atomic-binding", condition: expect.stringContaining("pinned before-history") } });
  expect(h.store.state.records).toEqual(before);
  h.ctx.executor.store = h.store;
  expect((await revise(h, map)).stored.ownerBirths.some(birth => birth.name === "member-c")).toBe(true);
});

it.each(["left", "right"] as const)("preserves the complete %s selected wrapper across a two-sided merge", async selectedSide => {
  const h = await createDecomposeCloneFixture();
  const left = await addConcurrentDecomposeCut(h.left.ctx, "left");
  const right = await addConcurrentDecomposeCut(h.right.ctx, "right");
  const selected = selectedSide === "left" ? left : right;
  const first = selectedSide === "left" ? h.left : h.right;
  const receiving = selectedSide === "left" ? h.right : h.left;
  const otherName = selectedSide === "left" ? "right-a" : "left-a";
  const selectedRecord = lifecycleSuccess(await first.store.read({ reference: selected.applied.storedMap }));
  const wrapper = decodeCutMapContent(selectedRecord.content);
  if (!wrapper.success) throw new Error(wrapper.error);
  lifecycleSuccess(await first.store.sync());
  lifecycleSuccess(await receiving.store.sync());
  const origin = lifecycleSuccess(await readWorkUnit(receiving.store, "origin"));
  if (origin.conflicts.length > 0) lifecycleSuccess(await receiving.store.write({ ...recordPut(origin), resolves: origin.conflicts,
    provenance: { verb: "write-back", lifecycleAction: "resolve" } }));
  const other = lifecycleSuccess(await readWorkUnit(receiving.store, otherName));
  const input = { cutMap: selected.map, cutMapPath: "selected.json" };
  const preview = await runStoreDecomposeRevision(receiving.ctx, "origin", input);
  if (preview.status === "refused" || preview.result.kind !== "preview") throw new Error(JSON.stringify(preview));
  expect(await runStoreDecomposeRevision(receiving.ctx, "origin", input, { applyAuthority: preview.result.applyAuthority })).toMatchObject({ status: "ok" });
  const acquired = await acquireDecomposeTerminal(receiving.ctx, "origin");
  if (acquired.status === "refused") throw new Error(JSON.stringify(acquired));
  expect(acquired.result.storedCut.ownerBirths).toEqual(wrapper.data.ownerBirths);
  expect(acquired.result.members.map(member => member.uid)).toEqual(selected.applied.report.members.map(member =>
    member.meta.owner.type === "work-item" ? member.meta.owner.uid : undefined));
  expect(lifecycleSuccess(await readWorkUnit(receiving.store, otherName))).toEqual(other);
});

it("requires explicit settlement of an ambiguous actual edge before subtracting a proved old seed", async () => {
  const h = await createDecomposeTerminalFixture();
  await h.seedRetiredWorkUnit(lifecycleSuccess(await readWorkUnit(h.store, "member-b")));
  const dependent = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(dependent, writeMetaDependsOn(dependent.content, []));
  const later = await h.seedStub("member-b");
  const groomed = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(groomed, writeMetaDependsOn(groomed.content, ["member-b"]));
  await h.seedRetiredWorkUnit(later);
  const input = { cutMap: replaceSecond(h.map, "member-c"), cutMapPath: "revision.json" };
  const before = lifecycleSuccess(await h.store.version());
  expect(await runStoreDecomposeRevision(h.ctx, "origin", input)).toMatchObject({ status: "refused", reason: "seed-divergence",
    remedy: { text: expect.stringContaining("write-back") } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const retained = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  await h.handEdit(retained, writeMetaDependsOn(retained.content, []));
  await revise(h, input.cutMap);
});

it("refuses unavailable batch birth facts and completes after authentic evidence and fresh approval are restored", async () => {
  const h = await createDecomposeTerminalFixture();
  const mapRecord = lifecycleSuccess(await h.store.read({ reference: h.applied.storedMap }));
  const decoded = decodeCutMapContent(mapRecord.content);
  if (!decoded.success) throw new Error(decoded.error);
  const selected = decoded.data.ownerBirths.find(birth => birth.kind === "work-item/meta");
  if (selected === undefined) throw new Error("Expected member birth binding.");
  const history = lifecycleSuccess(await h.store.history({ reference: h.applied.storedMap }));
  const batchId = history[0]?.creationReceipt?.batchId;
  if (batchId === undefined) throw new Error("Expected accepted additive receipt.");
  const saved = h.store.state.events.filter(event => "verb" in event.provenance && event.provenance.batchId === batchId)
    .map(event => ({ event, receipt: structuredClone(event.creationReceipt) }));
  for (const { event } of saved) delete event.creationReceipt;
  const before = lifecycleSuccess(await h.store.version());
  const ordinary = await acquireDecomposeTerminal(h.ctx, "origin");
  expect(ordinary).toMatchObject({ status: "refused", reason: "unsupported", class: "terminal",
    message: expect.stringContaining("unavailable birth evidence") });
  const atomic = await h.store.batch({ provenance: { verb: "decompose", lifecycleAction: "revise" }, writes: [recordPut(mapRecord)] });
  expect(atomic).toMatchObject({ status: "refused", refusal: { rule: "cut-map.atomic-binding" } });
  for (const result of [ordinary, atomic]) {
    for (const identity of [mapRecord.reference.kind, h.map.machine.origin.uid, selected.name, selected.birthKey, batchId]) {
      expect(JSON.stringify(result)).toContain(identity);
    }
  }
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  for (const { event, receipt } of saved) if (receipt !== undefined) event.creationReceipt = receipt;
  await revise(h, h.map);
});

it.each(["external", "existing-home"] as const)("still reconciles an ordinary %s seeded provider", async kind => {
  const h = await createDecomposeTerminalFixture({ provider: kind === "external", withHome: kind === "existing-home", authorMap: map => {
    if (kind === "external") map.authoring.externalEdges = [{ from: "member-a", to: "provider" }];
    else map.authoring.internalEdges.unshift({ from: "member-a", to: "home" });
  } });
  const member = lifecycleSuccess(await readWorkUnit(h.store, "member-a"));
  expect(lifecycleSuccess(readLifecycleMetaFields(member)).dependsOn).toContain(kind === "external" ? "provider" : "home");
  const map = structuredClone(h.map);
  map.authoring.externalEdges = [];
  map.authoring.internalEdges = map.authoring.internalEdges.filter(edge => edge.to !== "home");
  await revise(h, map);
  expect(lifecycleSuccess(readLifecycleMetaFields(lifecycleSuccess(await readWorkUnit(h.store, "member-a")))).dependsOn).toEqual(["member-b"]);
});
