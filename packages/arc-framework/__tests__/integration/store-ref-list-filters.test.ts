import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema, type StoreView } from "../../src/lib/store/index.js";

describe.each(["default", "separate"] as const)("scoped listings (%s)", (layout) => {
  it("starts a new named generation while retained UID companions remain addressable", async () => {
    const f = await createRefFixture({}, layout);
    const named = f.reference("work-item/meta"), old = await seed(f, named);
    const companion = RecordReferenceSchema.parse({ kind: "work-item/companion", key: "kept", owner: old.reference.owner });
    const kept = await seed(f, companion);
    success(await f.store.write({ action: "remove", reference: old.reference, expected: old.version,
      provenance: { verb: "remove", lifecycleAction: "remove" } }));
    const current = await seed(f, named);
    expect(current.reference.owner).not.toEqual(old.reference.owner);
    expect(success(await f.store.read({ reference: named })).reference).toEqual(current.reference);
    expect(success(await f.store.read({ reference: kept.reference }))).toEqual(kept);
    const child = RecordReferenceSchema.parse({ ...companion, owner: named.owner });
    const created = await seed(f, child);
    expect(created.reference.owner).toEqual(current.reference.owner);
    expect(success(await f.store.read({ reference: kept.reference }))).toEqual(kept);
  });

  it("applies location filters in current, saved, and checked views while preserving scoped absence", async () => {
    let checked = false, inspect = false;
    async function expectActive(view: StoreView, count: number) {
      const listing = success(await view.list({ family: "work-item", kind: "work-item/meta", filter: { locations: ["active"] } }));
      expect(listing).toMatchObject({ status: "complete", records: Array.from({ length: count }, () => expect.any(Object)) });
      expect(success(await view.list({ family: "work-item", kind: "work-item/record", owner: activeOwner })).status).toBe("absent");
    }
    const f = await createRefFixture({ "work-item/meta": { check: async ({ before, after }) => {
      if (!inspect) return [];
      await expectActive(before, 1);
      await expectActive(after, 0);
      checked = true;
      return [];
    } } }, layout);
    const active = await seed(f, f.reference("work-item/meta"));
    const activeOwner = active.reference.owner;
    await seed(f, f.reference("work-item/meta", "planned"), undefined, { kind: "backlog", commitment: "planned" });
    await seed(f, f.reference("work-item/meta", "completed"), undefined, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") });
    const asOf = success(await f.store.version());
    await expectActive(f.store, 1);
    expect(success(await f.store.list({ family: "work-item", kind: "work-item/meta", asOf, filter: { locations: ["active"] } })))
      .toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: active.reference })] });
    inspect = true;
    success(await f.store.write({ ...update(f, active), placement: { kind: "backlog", commitment: "planned" } }));
    expect(checked).toBe(true);
    await expectActive(f.store, 0);
    expect(success(await f.store.list({ family: "work-item", kind: "work-item/meta", asOf, filter: { locations: ["active"] } })))
      .toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: active.reference })] });
  });
});
