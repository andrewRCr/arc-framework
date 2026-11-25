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
