/** One UID primary through role changes, exercised only through shared fixture operations. */
import { expect } from "vitest";
import { ConflictRecordSchema, RecordReferenceSchema, OwnerIdentitySchema, type RecordReference, type StoreRecord } from "../../../src/lib/store/index.js";
import type { ConformanceFixture } from "./fixture-contract.js";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

function metaRole(reference: RecordReference): RecordReference {
  return RecordReferenceSchema.parse({ ...reference, kind: "work-item/meta" });
}
async function promote(fixture: ConformanceFixture, record: StoreRecord): Promise<StoreRecord> {
  const reference = metaRole(record.reference);
  success(await fixture.store.write({ action: "put", reference, expected: record.version,
    content: fixture.content(reference, "changed"), placement: { kind: "active" },
    provenance: { ...testProvenance, verb: "promote", lifecycleAction: "promote" } }));
  return success(await fixture.store.read({ reference }));
}
async function primaryCount(fixture: ConformanceFixture, reference: RecordReference): Promise<number> {
  const listed = success(await fixture.store.list({ family: "work-item", owner: reference.owner }));
  if (listed.status !== "complete") throw new Error("Expected a complete primary inventory");
  return listed.records.filter((record) => ["work-item/meta", "work-item/record"].includes(record.reference.kind)).length;
}

/** Register the same primary-transition obligations for each backend's declared applicability.
 * @param context - Item and fresh fixture registration.
 */
export function registerPrimaryRoleAssertions(context: SuiteContext): void {
  assertion(context, "work-item", "primary-role-transition-retains-generation-and-metadata", async (fixture) => {
    const original = await seed(fixture, fixture.reference("work-item/record"), undefined, { kind: "active" },
      { branches: [{ repository: "repo", ref: "chore/original" }, { repository: "repo", ref: "feat/promoted" }] });
    const description = await seed(fixture, RecordReferenceSchema.parse({ ...fixture.reference("work-item/description"), owner: original.reference.owner }));
    const renamed = RecordReferenceSchema.parse({ ...original.reference, owner: { ...original.reference.owner, name: "promoted" } });
    success(await fixture.store.write({ ...update(fixture, original), reference: renamed }));
    const prior = success(await fixture.store.read({ reference: renamed }));
    const before = await fixture.settle();
    const promoted = await promote(fixture, prior);
    const after = await fixture.settle();
    expect(promoted.reference).toEqual(metaRole(renamed));
    expect(promoted.links).toEqual(original.links);
    expect(promoted.placement).toEqual(prior.placement);
    expect(await primaryCount(fixture, promoted.reference)).toBe(1);
    const savedDescription = success(await fixture.store.read({ reference: description.reference }));
    expect(savedDescription.content).toBe(description.content);
    expect(savedDescription.version).toBe(description.version);
    expect(savedDescription.reference.owner).toEqual(promoted.reference.owner);
    for (const slug of [original.reference.owner.name, promoted.reference.owner.name]) {
      expect(success(await fixture.store.lookup({ kind: "slug", slug })).reference).toEqual(promoted.reference);
    }
    for (const branch of original.links!.branches!) {
      expect(success(await fixture.store.lookup({ kind: "ref", ...branch })).reference).toEqual(promoted.reference);
    }
    for (const kind of ["work-item/record", "work-item/meta"] as const) {
      for (const owner of [prior.reference.owner, OwnerIdentitySchema.parse({ type: "work-item", name: "promoted" }),
        OwnerIdentitySchema.parse({ type: "work-item", name: original.reference.owner.name })]) {
        const reference = RecordReferenceSchema.parse({ kind, owner });
        expect(success(await fixture.store.read({ reference, asOf: before }))).toEqual(prior);
        expect(success(await fixture.store.read({ reference, asOf: after }))).toEqual(promoted);
      }
      expect(success(await fixture.store.read({ reference: RecordReferenceSchema.parse({ ...prior.reference, kind }) }))).toEqual(promoted);
    }
    expect(success(await fixture.store.list({ family: "work-item", kind: "work-item/record", owner: promoted.reference.owner })).status).toBe("absent");
    const metas = success(await fixture.store.list({ family: "work-item", kind: "work-item/meta", owner: promoted.reference.owner }));
    expect(metas).toMatchObject({ status: "complete", records: [promoted] });
    for (const reference of [prior.reference, promoted.reference]) {
      const history = success(await fixture.store.history({ reference }));
      expect(history.map((entry) => entry.reference.kind)).toEqual(["work-item/meta", "work-item/record", "work-item/record"]);
      expect(history.map((entry) => entry.content)).toEqual([promoted.content, prior.content, original.content]);
      expect(history[0]!.provenance).toMatchObject({ verb: "promote", reference: promoted.reference });
      const changes = success(await fixture.store.changes({ from: before, to: after, references: [reference] }));
      expect(changes).toEqual([history[0]]);
    }
  });
  assertion(context, "work-item", "primary-role-stale-absence-and-atomic-batch-guards", async (fixture) => {
    const original = await seed(fixture, fixture.reference("work-item/record"));
    const promoted = await promote(fixture, original);
    const before = await fixture.settle();
    const put = { ...update(fixture, promoted), reference: original.reference };
    for (const expected of [null, original.version]) {
      expect(await fixture.store.write({ ...put, expected })).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
      expect(await fixture.settle()).toBe(before);
      expect(success(await fixture.store.read({ reference: original.reference }))).toEqual(promoted);
    }
    const unrelated = fixture.reference("personal/document", "untouched");
    for (const handles of [[promoted.reference, original.reference], [fixture.reference("work-item/meta"), fixture.reference("work-item/record")]]) {
      expect(await fixture.store.batch({ writes: [
        { ...put, reference: handles[0]! }, { ...put, reference: handles[1]! },
        { action: "put", reference: unrelated, expected: null, content: fixture.content(unrelated) },
      ], provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
      expect(await fixture.settle()).toBe(before);
      expect(await fixture.store.read({ reference: unrelated })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      expect(await primaryCount(fixture, promoted.reference)).toBe(1);
    }
    success(await fixture.store.write(put));
    expect(success(await fixture.store.read({ reference: promoted.reference })).reference).toEqual(original.reference);
    expect(await primaryCount(fixture, original.reference)).toBe(1);
  });
  assertion(context, "work-item", "primary-role-reopen-sync-and-current-side-conflicts", async (fixture) => {
    const remote = fixture.remote(true);
    if (remote === undefined) throw new Error("Fixture must provide the configured remote");
    const original = await seed(fixture, fixture.reference("work-item/record"), undefined, { kind: "active" },
      { branches: [{ repository: "repo", ref: "chore/original" }] });
    success(await fixture.store.sync());
    const promoted = await promote(fixture, original);
    success(await remote.write({ ...update(fixture, original, fixture.content(original.reference, "changed-again")),
      provenance: { ...testProvenance, verb: "remote-edit" } }));
    const current = success(await remote.read({ reference: original.reference }));
    const result = success(await fixture.store.sync());
    expect(result.publishes[0]?.status).toBe("reconciled");
    const preserved = success(await fixture.reopen().read({ reference: promoted.reference }));
    expect(preserved).toMatchObject({ reference: current.reference, content: current.content, version: current.version,
      links: current.links, placement: current.placement });
    expect(preserved.conflicts).toHaveLength(1);
    const conflictReference = preserved.conflicts[0]!;
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await fixture.store.read({ reference: conflictReference })).content));
    const conflictValue = (record: StoreRecord) => ({ reference: record.reference, content: record.content,
      version: record.version, formatVersion: record.formatVersion, placement: record.placement, links: record.links });
    expect(conflict).toMatchObject({ record: current.reference,
      current: { value: conflictValue(current) }, incoming: { value: conflictValue(promoted) } });
    const restoredPromotion = await promote(fixture, preserved);
    expect(restoredPromotion.conflicts).toEqual([conflictReference]);
    success(await fixture.store.sync());
    expect(success(await remote.read({ reference: original.reference }))).toEqual(restoredPromotion);
    expect(success(await fixture.reopen().read({ reference: original.reference }))).toEqual(restoredPromotion);
    expect(await primaryCount(fixture, restoredPromotion.reference)).toBe(1);
    success(await fixture.store.write({ ...update(fixture, restoredPromotion), resolves: [conflictReference] }));
    expect(success(await fixture.store.read({ reference: original.reference })).conflicts).toEqual([]);
    expect(await fixture.store.read({ reference: conflictReference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "primary-role-removal-retains-actual-historical-role", async (fixture) => {
    const original = await seed(fixture, fixture.reference("work-item/record"));
    const before = await fixture.settle();
    const promoted = await promote(fixture, original);
    const removed = success(await fixture.store.write({ action: "remove", reference: original.reference,
      expected: promoted.version, provenance: testProvenance }));
    expect(removed.reference).toEqual(promoted.reference);
    for (const reference of [original.reference, promoted.reference]) {
      expect(await fixture.store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const history = success(await fixture.store.history({ reference }));
      expect(history.map((entry) => [entry.reference.kind, entry.content])).toEqual([
        ["work-item/meta", null], ["work-item/meta", promoted.content], ["work-item/record", original.content],
      ]);
      expect(success(await fixture.store.changes({ from: before, to: await fixture.settle(), references: [reference] })))
        .toEqual([history[1], history[0]]);
    }
    const recreated = await seed(fixture, fixture.reference("work-item/record"));
    expect(recreated.reference.owner).not.toEqual(original.reference.owner);
    expect(success(await fixture.store.history({ reference: original.reference }))).toHaveLength(3);
  });
}
