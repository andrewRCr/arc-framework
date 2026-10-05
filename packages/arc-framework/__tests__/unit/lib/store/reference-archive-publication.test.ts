/** Published archive allocation follows the observed remote, including durable high water. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { RecordReferenceSchema, StoreRecordSchema, type Store } from "../../../../src/lib/store/index.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success, testProvenance } from "../../../helpers/store/suite-tools.js";

const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };

describe("reference archive publication", () => {
  it.each([false, true])("orders independent clones by publication without changing their historical allocations; right publishes first: %s", async (rightFirst) => {
    const leftFixture = createReferenceFixture(), rightFixture = createReferenceFixture();
    const left = leftFixture.store as ReferenceBackend, right = rightFixture.store as ReferenceBackend;
    const remote = leftFixture.remote(true)!;
    right.context.publication.remote = left.context.publication.remote;
    const completed = [];
    for (const [fixture, store, suffix] of [[leftFixture, left, "left"], [rightFixture, right, "right"]] as const) {
      const reference = fixture.reference("work-item/meta", suffix);
      const result = success(await store.write({ action: "put", reference, expected: null, content: fixture.content(reference), placement, provenance: testProvenance }));
      completed.push({ store, record: success(await store.read({ reference: result.reference })), saved: success(await store.version()) });
    }
    const first = completed[rightFirst ? 1 : 0]!, second = completed[rightFirst ? 0 : 1]!;
    success(await first.store.sync());
    success(await second.store.sync());
    success(await first.store.sync());
    for (const store of [left, right, remote]) {
      expect(success(await store.read({ reference: first.record.reference })).placement).toEqual({ ...placement, sequence: "01" });
      expect(success(await store.read({ reference: second.record.reference })).placement).toEqual({ ...placement, sequence: "02" });
    }
    for (const entry of completed) expect(success(await entry.store.read({ reference: entry.record.reference, asOf: entry.saved }))).toEqual(entry.record);
    const final = success(await remote.version());
    expect(success(await left.sync()).publishes[0]?.status).toBe("noop");
    expect(success(await right.sync()).publishes[0]?.status).toBe("noop");
    expect(success(await remote.version())).toBe(final);
  });
  it.each([false, true])("preserves published positions and coherently renumbers incoming companions; remote first: %s", async (remoteFirst) => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const local = fixture.store;
    const publishFirst = remoteFirst ? remote : local, incoming = remoteFirst ? local : remote;
    const make = async (store: Store, suffix: string) => {
      const meta = fixture.reference("work-item/meta", suffix);
      const primary = success(await store.write({ action: "put", reference: meta, expected: null, content: fixture.content(meta), placement, provenance: testProvenance }));
      const task = { ...fixture.reference("work-item/task-list", suffix), owner: primary.reference.owner };
      success(await store.write({ action: "put", reference: task, expected: null, content: fixture.content(task), provenance: testProvenance }));
      return { primary: StoreRecordSchema.parse(success(await store.read({ reference: primary.reference }))), task: StoreRecordSchema.parse(success(await store.read({ reference: task }))) };
    };
    const first = await make(publishFirst, "published");
    if (!remoteFirst) success(await local.sync());
    const second = await make(incoming, "incoming");
    const beforeLocal = success(await local.version()), beforeRemote = success(await remote.version());
    const secondStore = remoteFirst ? local : remote;
    const secondAnchor = success(await secondStore.version());
    expect(second.primary.placement).toEqual({ ...placement, sequence: remoteFirst ? "01" : "02" });
    success(await local.sync());
    for (const store of [local, remote]) {
      expect(success(await store.read({ reference: first.primary.reference }))).toEqual(first.primary);
      const published = StoreRecordSchema.parse(success(await store.read({ reference: second.primary.reference })));
      const task = StoreRecordSchema.parse(success(await store.read({ reference: second.task.reference })));
      expect(published.placement).toEqual({ ...placement, sequence: "02" });
      expect(task.placement).toEqual(published.placement);
      if (remoteFirst) {
        expect(published.version).not.toBe(second.primary.version);
        expect(task.version).not.toBe(second.task.version);
        const changes = success(await store.changes({ from: store === local ? beforeLocal : beforeRemote, to: success(await store.version()), references: [published.reference, task.reference] }));
        expect(changes).toContainEqual(expect.objectContaining({ reference: published.reference, version: published.version }));
        expect(changes).toContainEqual(expect.objectContaining({ reference: task.reference, version: task.version }));
        expect(success(await store.history({ reference: published.reference }))[0]?.version).toBe(published.version);
      }
      const listed = success(await store.list({ family: "work-item", kind: "work-item/meta" }));
      expect(listed).toMatchObject({ status: "complete", records: expect.arrayContaining([first.primary, published]) });
    }
    expect(success(await secondStore.read({ reference: second.primary.reference, asOf: secondAnchor }))).toEqual(second.primary);
    const finalLocal = success(await local.version()), finalRemote = success(await remote.version());
    expect(success(await local.sync()).publishes[0]?.status).toBe("noop");
    expect(success(await local.version())).toBe(finalLocal);
    expect(success(await remote.version())).toBe(finalRemote);
  });

  it("allocates incoming completions in local completion order after retired remote high water", async () => {
    const fixture = createReferenceFixture();
    const remote = fixture.remote(true)!;
    const retired = fixture.reference("work-item/meta", "retired");
    const old = success(await remote.write({ action: "put", reference: retired, expected: null, content: fixture.content(retired), placement, provenance: testProvenance }));
    success(await remote.write({ action: "remove", reference: old.reference, expected: old.version!, provenance: testProvenance }));
    const incoming = [];
    for (const suffix of ["z-first", "a-second"]) {
      const reference = fixture.reference("work-item/meta", suffix);
      incoming.push(success(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference), placement, provenance: testProvenance })));
    }
    const errand = fixture.reference("work-item/record", "errand");
    success(await fixture.store.write({ action: "put", reference: errand, expected: null, content: fixture.content(errand), placement, provenance: testProvenance }));
    success(await fixture.store.sync());
    for (const store of [fixture.store, remote]) {
      for (const [index, record] of incoming.entries()) expect(success(await store.read({ reference: record.reference })).placement).toEqual({ ...placement, sequence: String(index + 2).padStart(2, "0") });
      expect(success(await store.read({ reference: errand })).placement).toEqual(placement);
    }
  });

  it("allocates against the replacement remote state on a successful CAS retry", async () => {
    const fixture = createReferenceFixture();
    const local = fixture.store as ReferenceBackend, remote = fixture.remote(true)!;
    const incoming = fixture.reference("work-item/meta", "incoming");
    success(await local.write({ action: "put", reference: incoming, expected: null, content: fixture.content(incoming), placement, provenance: testProvenance }));
    let attempted = false;
    local.context.publication.remote!.beforePublish = () => {
      if (attempted) return;
      attempted = true;
      const reference = fixture.reference("work-item/meta", "published-during-cas");
      void remote.write({ action: "put", reference, expected: null, content: fixture.content(reference), placement, provenance: testProvenance });
    };
    expect(success(await local.sync()).publishes[0]?.status).toBe("reconciled");
    expect(success(await remote.read({ reference: incoming })).placement).toEqual({ ...placement, sequence: "02" });
    expect(success(await local.history({ reference: incoming }))).toHaveLength(2);
  });

  it("recomputes after remote movement and leaves local state untouched after exhausted retries", async () => {
    const fixture = createReferenceFixture();
    const local = fixture.store as ReferenceBackend;
    const remote = fixture.remote(true)! as ReferenceBackend;
    const incoming = fixture.reference("work-item/meta", "incoming");
    success(await local.write({ action: "put", reference: incoming, expected: null, content: fixture.content(incoming), placement, provenance: testProvenance }));
    const saved = structuredClone(local.state);
    const moving = fixture.reference("work-item/meta", "moving");
    const memoryRemote = local.context.publication.remote!;
    memoryRemote.beforePublish = () => {
      // Use a fresh slug each attempt so every interleaving consumes a published position.
      const reference = RecordReferenceSchema.parse({ ...moving, owner: { ...moving.owner, name: `moving-${remote.state.counter}` } });
      void remote.write({ action: "put", reference, expected: null, content: fixture.content(reference), placement, provenance: testProvenance });
    };
    expect(success(await local.sync()).publishes[0]).toMatchObject({ status: "failed", failure: { code: "retries-exhausted" } });
    expect(local.state).toEqual(saved);
    memoryRemote.beforePublish = undefined;
    success(await local.sync());
    expect(success(await local.read({ reference: incoming })).placement).toEqual({ ...placement, sequence: "04" });
    expect(success(await remote.read({ reference: incoming })).placement).toEqual({ ...placement, sequence: "04" });
  });
});
