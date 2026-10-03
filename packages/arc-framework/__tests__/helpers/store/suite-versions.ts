/** atomic batches, record-bound freshness, saved states and provenance history. */

import { expect } from "vitest";
import { KIND_REGISTRY, type KindId, type Mutation } from "../../../src/lib/store/index.js";
import { assertion, everyKind, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

function mutable(kind: KindId): boolean { return !["create-only", "write-once"].includes(KIND_REGISTRY[kind].writerRule); }

/** Register all-or-nothing batches including removals and shared provenance.
 * @param context - item 4 context.
 */
export function registerBatchAssertions(context: SuiteContext): void {
  everyKind(context, "batch-stale-all-or-nothing", async (fixture, reference) => {
    const first = await seed(fixture, reference);
    const second = await seed(fixture, fixture.reference(reference.kind, "two"));
    const third = await seed(fixture, fixture.reference(reference.kind, "three"));
    success(await fixture.store.write(update(fixture, first)));
    success(await fixture.store.write(update(fixture, second)));
    const currentFirst = success(await fixture.store.read({ reference: first.reference }));
    const currentSecond = success(await fixture.store.read({ reference: second.reference }));
    const before = success(await fixture.store.version());
    const result = await fixture.store.batch({ writes: [update(fixture, first), update(fixture, second), update(fixture, third)], provenance: testProvenance });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [first.reference, second.reference] } });
    expect(success(await fixture.store.version())).toBe(before);
    expect(success(await fixture.store.read({ reference: first.reference }))).toEqual(currentFirst);
    expect(success(await fixture.store.read({ reference: second.reference }))).toEqual(currentSecond);
    expect(success(await fixture.store.read({ reference: third.reference }))).toEqual(third);
  }, (kind) => mutable(kind) && KIND_REGISTRY[kind].merge === "single-writer");
  assertion(context, "work-item", "batch-mixed-atomic-write-and-removal", async (fixture) => {
    const remove = await seed(fixture, fixture.reference("work-item/meta"));
    const change = await seed(fixture, fixture.reference("work-item/meta", "two"));
    const writes: Mutation[] = [{ action: "remove", reference: remove.reference, expected: remove.version }, update(fixture, change)];
    const landed = success(await fixture.store.batch({ writes, provenance: testProvenance }));
    expect(landed.writes).toHaveLength(2);
    expect(await fixture.store.read({ reference: remove.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await fixture.store.read({ reference: change.reference })).content).toBe(fixture.content(change.reference, "changed"));
  });
  assertion(context, "work-item", "batch-shared-ID-in-changes-and-history", async (fixture) => {
    const remove = await seed(fixture, fixture.reference("work-item/meta"));
    const change = await seed(fixture, fixture.reference("work-item/meta", "two"));
    const before = await fixture.settle();
    const landed = success(await fixture.store.batch({ writes: [
      { action: "remove", reference: remove.reference, expected: remove.version }, update(fixture, change),
    ], provenance: testProvenance }));
    const changes = success(await fixture.store.changes({ from: before, to: await fixture.settle() }));
    expect(changes).toHaveLength(2);
    expect(changes.every((entry) => "batchId" in entry.provenance && entry.provenance.batchId === landed.batchId)).toBe(true);
    for (const record of [remove, change]) {
      const history = success(await fixture.store.history({ reference: record.reference }));
      expect(history[0]?.provenance).toMatchObject({ batchId: landed.batchId });
    }
  });
}

/** Register unrelated writes preserving every bound record check.
 * @param context - item 6 context.
 */
export function registerFreshnessAssertions(context: SuiteContext): void {
  everyKind(context, "unrelated-write-keeps-record-bound", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    await seed(fixture, fixture.reference("work-item/meta", "unrelated"));
    expect(success(await fixture.store.read({ reference: record.reference })).version).toBe(record.version);
    if (mutable(reference.kind)) success(await fixture.store.write(update(fixture, record)));
  });
  everyKind(context, "unrelated-write-keeps-scoped-changes", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    const anchor = await fixture.settle();
    await seed(fixture, fixture.reference("work-item/meta", "unrelated"));
    expect(success(await fixture.store.changes({ from: anchor, to: await fixture.settle(), references: [record.reference] }))).toEqual([]);
  });
}

/** Register current anchors, historical snapshots, restrictions and exact state advancement.
 * @param context - item 7 context.
 */
export function registerStateAssertions(context: SuiteContext): void {
  everyKind(context, "saved-state-reads-and-changes", async (fixture, reference) => {
    const before = await fixture.settle();
    const record = await seed(fixture, reference);
    const created = await fixture.settle();
    expect(created).not.toBe(before);
    expect(success(await fixture.store.version())).toBe(created);
    expect(success(await fixture.store.read({ reference: record.reference, asOf: created }))).toEqual(record);
    const saved = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind, asOf: created }));
    expect(saved).toMatchObject({ status: "complete", asOf: created });
    const live = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind }));
    if (live.status === "unreadable") throw new Error("Expected readable live listing");
    expect(live.asOf).toBe(fixture.declarations.liveListingStateVersion ? created : undefined);
    expect(await fixture.settle()).toBe(created);
    const changes = success(await fixture.store.changes({ from: before, to: created, references: [record.reference] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ reference: record.reference, version: record.version, content:record.content });
  });
  everyKind(context, "saved-state-changes-write-provenance", async (fixture, reference) => {
    const before = await fixture.settle();
    const record = await seed(fixture, reference);
    const changes = success(await fixture.store.changes({ from: before, to: await fixture.settle(), references: [record.reference] }));
    expect(changes).toHaveLength(1);
    expect(changes[0]?.provenance).toMatchObject(testProvenance);
  });
  everyKind(context, "earlier-state-keeps-prior-bytes", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    const before = await fixture.settle();
    success(await fixture.store.write(update(fixture, record)));
    const after = await fixture.settle();
    expect(after).not.toBe(before);
    expect(success(await fixture.store.read({ reference: record.reference, asOf: before }))).toEqual(record);
    const earlier = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind, asOf: before }));
    if (earlier.status !== "complete") throw new Error("Expected historical complete listing");
    expect(earlier.records).toContainEqual(record);
    expect(success(await fixture.store.changes({ from: before, to: after, references: [record.reference] }))).toHaveLength(1);
  }, mutable);
}

/** Register newest-first history with caller and backend provenance fields intact.
 * @param context - item 11 context.
 */
export function registerHistoryAssertions(context: SuiteContext): void {
  everyKind(context, "history-newest-first-versions", async (fixture, reference) => {
    const first = await seed(fixture, reference);
    await fixture.settle();
    if (mutable(reference.kind)) success(await fixture.store.write(update(fixture, first)));
    await fixture.settle();
    const current = success(await fixture.store.read({ reference: first.reference }));
    const history = success(await fixture.store.history({ reference: first.reference }));
    expect(history.map((entry) => entry.version)).toEqual(mutable(reference.kind) ? [current.version, first.version] : [first.version]);
    expect(history.map((entry) => entry.content)).toEqual(mutable(reference.kind) ? [current.content,first.content] : [first.content]);
    if (mutable(reference.kind)) {
      success(await fixture.store.write({action:"remove",reference:current.reference,expected:current.version,provenance:testProvenance,
        ...(reference.kind.endsWith("/conflict-record") ? {resolves:[current.reference]} : {})}));
      await fixture.settle();
      const removed = success(await fixture.reopen().history({reference:current.reference}));
      expect(removed[0]).toMatchObject({version:null,content:null});
      expect(removed.slice(1)).toEqual(history);
    }
  });
  everyKind(context, "history-caller-and-owner-provenance", async (fixture, reference) => {
    const first = await seed(fixture, reference);
    await fixture.settle();
    if (mutable(reference.kind)) success(await fixture.store.write({ ...update(fixture, first), provenance: { ...testProvenance, verb: "update", lifecycleAction: "resume" } }));
    await fixture.settle();
    const history = success(await fixture.store.history({ reference: first.reference }));
    expect(history.at(-1)?.provenance).toMatchObject({ ...testProvenance, reference: first.reference });
    if (first.reference.owner.type !== "person") expect(history.at(-1)?.provenance).toMatchObject({ ownerUid: first.reference.owner.uid });
    if (mutable(reference.kind)) expect(history[0]?.provenance).toMatchObject({ verb: "update", lifecycleAction: "resume", codeHead: testProvenance.codeHead });
  });
}
