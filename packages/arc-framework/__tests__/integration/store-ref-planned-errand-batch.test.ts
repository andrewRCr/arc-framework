import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

describe.each(["unused", "completed"] as const)("planned Errand UID (%s slug)", (slugState) => {
  it.each(["record first", "description first"])("binds the name-only description to the new record (%s)", async (order) => {
    const f = await createRefFixture();
    const named = f.reference("work-item/record"), description = f.reference("work-item/description");
    const previous = slugState === "completed" ? await seed(f, description) : undefined;
    if (previous) {
      const active = success(await f.store.read({ reference: named }));
      success(await f.store.write({ ...update(f, active, active.content),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    }

    const primary = RecordReferenceSchema.parse({ ...named, owner: { ...named.owner, uid: "abcdef01-2345-4678-9abc-def012345678" } });
    const recordPut = { action: "put" as const, expected: null, reference: primary, content: f.content(primary), placement: { kind: "active" as const } };
    const descriptionPut = { action: "put" as const, expected: null, reference: description, content: f.content(description, "changed") };
    const writes = order === "record first" ? [recordPut, descriptionPut] : [descriptionPut, recordPut];
    const result = await f.store.batch({ provenance: testProvenance, writes });

    if (previous) expect(success(await f.store.read({ reference: previous.reference })).content).toBe(previous.content);
    expect(result, JSON.stringify(result)).toMatchObject({ status: "ok", result: {
      writes: writes.map(({ reference }) => ({ reference: { ...reference, owner: primary.owner } })),
    } });
    expect(success(await f.store.read({ reference: { ...description, owner: primary.owner } })).content).toBe(descriptionPut.content);
  });
});

it("removes a retired work unit's transition by slug while creating an Errand with that slug", async () => {
  const f = await createRefFixture();
  const work = await seed(f, f.reference("work-item/meta"));
  const lineage = await seed(f, RecordReferenceSchema.parse({ kind: "lineage/transition", owner: work.reference.owner }));
  success(await f.store.write({ action: "remove", expected: work.version, reference: work.reference, provenance: testProvenance }));

  const transition = f.reference("lineage/transition");
  const retired = success(await f.store.read({ reference: transition }));
  expect(retired.reference).toEqual(lineage.reference);
  const errand = RecordReferenceSchema.parse({ kind: "work-item/record",
    owner: { ...transition.owner, uid: "abcdef01-2345-4678-9abc-def012345678" } });
  const content = f.content(errand);
  const result = await f.store.batch({ provenance: testProvenance, writes: [
    { action: "put", expected: null, reference: errand, content, placement: { kind: "active" } },
    { action: "remove", expected: retired.version, reference: transition },
  ] });

  expect(result, JSON.stringify(result)).toMatchObject({ status: "ok" });
  expect(success(await f.store.read({ reference: errand })).content).toBe(content);
  expect(await f.store.read({ reference: retired.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
});
