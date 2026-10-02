/** record identity, mutation, durability and capability assertions. */

import { expect, it } from "vitest";
import {
  KIND_REGISTRY, RecordReferenceSchema, OwnerIdentitySchema, ReadPlacementSchema, StoreRecordSchema,
} from "../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { assertion, everyKind, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

/** Register item 1 over every served role and primary metadata behavior.
 * @param context - Item and fresh fixture registration.
 */
export function registerRecordAssertions(context: SuiteContext): void {
  everyKind(context, "round-trip", async (fixture, reference) => {
    const content = fixture.content(reference);
    const record = await seed(fixture, reference);
    expect(StoreRecordSchema.safeParse(record).success).toBe(true);
    expect(record).toMatchObject({ content, formatVersion: KIND_REGISTRY[reference.kind].formatVersion, conflicts: [] });
    expect(record.reference.kind).toBe(reference.kind);
    expect(record.reference.key).toEqual(reference.key);
    const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind, owner: record.reference.owner }));
    expect(listed.status).toBe("complete");
    if (listed.status === "complete") expect(listed.records.map((entry) => entry.reference)).toContainEqual(record.reference);
  });
  for (const [kind, definition] of Object.entries(KIND_REGISTRY)) {
    if (!context.registration.declarations.families.includes(definition.family)) continue;
    const typedKind = definition.id;
    const reason = context.registration.declarations.rejectingContentUnavailable[typedKind];
    const name = `${kind}: rejecting-content-and-repaired-creation`;
    if (reason) { it.skip(`${name} — ${reason}`, () => {}); continue; }
    assertion(context, definition.family, name, async (fixture) => {
      const reference = fixture.reference(typedKind);
      const writer = definition.writerVerbs?.[0] ?? "edit";
      expect(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference, "invalid"),
        ...(typedKind === "work-item/meta" || typedKind === "work-item/record" ? { placement: { kind: "active" as const } } : {}),
        provenance: { verb: writer, lifecycleAction: writer } })).toMatchObject({ status: "refused", refusal: { code: "record-malformed" } });
      const valid = await seed(fixture, reference);
      expect(success(await fixture.store.read({ reference: valid.reference })).content).toBe(fixture.content(reference));
    });
  }
  everyKind(context, "current-removal", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    const removed = success(await fixture.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: testProvenance }));
    expect(removed.version).toBeUndefined();
    expect(await fixture.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, (kind) => !kind.endsWith("/conflict-record"));
  everyKind(context, "keyed-independence", async (fixture, reference) => {
    const first = await seed(fixture, reference);
    const second = await seed(fixture, RecordReferenceSchema.parse({ ...fixture.reference(reference.kind, "two"), owner: first.reference.owner }));
    const foreign = fixture.reference(reference.kind, "foreign");
    await seed(fixture, RecordReferenceSchema.parse({ ...foreign, owner: OwnerIdentitySchema.parse({ ...foreign.owner, name: "foreign-owner" }) }));
    expect(first.reference).not.toEqual(second.reference);
    expect(success(await fixture.store.read({ reference: first.reference })).version).toBe(first.version);
    expect(success(await fixture.store.read({ reference: second.reference })).version).toBe(second.version);
    const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, owner: first.reference.owner, kind: reference.kind }));
    if (listed.status !== "complete") throw new Error("Expected complete owner listing");
    expect(listed.records.map((record) => record.reference)).toEqual([first.reference, second.reference]);
    expect(listed.records.every((record) => JSON.stringify(record.reference.owner) === JSON.stringify(first.reference.owner))).toBe(true);
    if (!["create-only", "write-once"].includes(KIND_REGISTRY[reference.kind].writerRule)) {
      success(await fixture.store.write(update(fixture, second)));
      expect(success(await fixture.store.read({ reference: second.reference })).content).toBe(fixture.content(second.reference, "changed"));
      expect(success(await fixture.store.read({ reference: first.reference }))).toEqual(first);
    }
  }, (kind) => KIND_REGISTRY[kind].key !== null);
  for (const kind of ["work-item/meta", "work-item/record"] as const) {
    assertion(context, "work-item", `primary-placement-links:${kind}`, async (fixture) => {
      const record = await seed(fixture, fixture.reference(kind), undefined, { kind: "active" }, { branch: { repository: "repo", ref: "feat/original" } });
      expect(record.placement).toEqual({ kind: "active" });
      expect(record.links).toEqual({ branch: { repository: "repo", ref: "feat/original" } });
      success(await fixture.store.write(update(fixture, record)));
      const retained = success(await fixture.store.read({ reference: record.reference }));
      expect(retained.links).toEqual(record.links);
      success(await fixture.store.write({ ...update(fixture, retained), links: { changeRequest: { repository: "repo", number: 7 } } }));
      const replaced = success(await fixture.store.read({ reference: record.reference }));
      expect(replaced.links).toEqual({ changeRequest: { repository: "repo", number: 7 } });
      success(await fixture.store.write({ ...update(fixture, replaced), links: {}, placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
      const completed = success(await fixture.store.read({ reference: record.reference }));
      expect(completed.links).toEqual({});
      expect(ReadPlacementSchema.safeParse(completed.placement).success).toBe(true);
      expect(completed.placement).toMatchObject({ kind: "completed", quarter: "2026-q4", ...(kind === "work-item/meta" ? { sequence: "01" } : {}) });
      if (kind === "work-item/record") expect(completed.placement).not.toHaveProperty("sequence");
      const listed = success(await fixture.store.list({ family: "work-item", kind }));
      if (listed.status !== "complete") throw new Error("Expected completed listing");
      expect(listed.records[0]).toMatchObject({ placement: completed.placement, links: {} });
    });
  }
  assertion(context, "work-item", "UID-rename-and-generations", async (fixture) => {
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    expect(record.reference.owner.type).toBe("work-item");
    const owner = record.reference.owner;
    if (owner.type === "person") throw new Error("Expected work-item owner");
    expect(owner.uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: OwnerIdentitySchema.parse({ ...owner, name: "renamed-work" }) });
    success(await fixture.store.write({ ...update(fixture, record), reference: renamed }));
    const current = success(await fixture.store.read({ reference: renamed }));
    expect(current.reference.owner).toEqual(renamed.owner);
    expect(success(await fixture.store.lookup({ kind: "slug", slug: owner.name })).reference).toEqual(current.reference);
    const history = success(await fixture.store.history({ reference: current.reference }));
    expect(history).toHaveLength(2);
    expect(history.every((entry) => entry.reference.owner.type !== "person" && entry.reference.owner.uid === owner.uid)).toBe(true);
  });
}

/** Register stale bases that must refuse on single-writer or immutable kinds.
 * @param context - item 2 context.
 */
export function registerVersionConflictAssertions(context: SuiteContext): void {
  everyKind(context, "duplicate-creation", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    expect(await fixture.store.write({ ...update(fixture, record), expected: null })).toMatchObject({
      status: "refused", refusal: { code: "version-conflict", records: [record.reference] },
    });
  });
  everyKind(context, "stale-writer", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    const results = await fixture.race(update(fixture, record), { ...update(fixture, record), content: fixture.content(reference) });
    const failed = results.filter((result) => result.status === "refused");
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]).toMatchObject({ refusal: { code: "version-conflict", records: [record.reference] } });
  }, (kind) => KIND_REGISTRY[kind].merge === "single-writer");
  everyKind(context, "stale-removal", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    success(await fixture.store.write(update(fixture, record)));
    expect(await fixture.store.write({ action: "remove", reference: record.reference, expected: record.version, provenance: testProvenance }))
      .toMatchObject({ status: "refused", refusal: { code: "version-conflict", records: [record.reference] } });
  }, (kind) => !["create-only", "write-once"].includes(KIND_REGISTRY[kind].writerRule));
  everyKind(context, "create-only-update", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    expect(await fixture.store.write(update(fixture, record))).toMatchObject({ status: "refused", refusal: { code: "version-conflict" } });
  }, (kind) => KIND_REGISTRY[kind].writerRule === "create-only");
}

/** Register immediate durability after a write returns.
 * @param context - item 13 context.
 */
export function registerDurabilityAssertions(context: SuiteContext): void {
  everyKind(context, "reopen-read", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    expect(success(await fixture.reopen().read({ reference: record.reference }))).toEqual(record);
  });
}

/** Register the one production capability against the fixture declaration.
 * @param context - item 15 context.
 */
export function registerCapabilityAssertions(context: SuiteContext): void {
  for (const family of context.registration.declarations.families) assertion(context, family, "state-off-branch", async (fixture) => {
    expect(fixture.store.capabilities).toEqual({ stateOffBranch: fixture.declarations.stateOffBranch });
  });
}
