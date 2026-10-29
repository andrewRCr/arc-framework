/** Prepared lookups follow completed renames and select one owner through reopen. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, testProvenance } from "../helpers/store/suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4"), newSlug = SlugSchema.parse("renamed");

describe.each(["default", "separate"] as const)("checked ended-owner lookups in %s", layout => {
  it("looks up a completed rename by its prepared new slug", async () => {
    const f = await createRefFixture({ "work-item/meta": { check: async ({ writer, reference, after }) => {
      if (writer.kind !== "verb" || writer.verb !== "rename") return [];
      const found = success(await after.lookup({ kind: "slug", slug: newSlug }));
      expect(found.reference).toEqual({ ...reference, owner: { ...reference.owner, name: "renamed" } });
      expect(success(await after.read({ reference: found.reference })).placement).toEqual({ kind: "completed", quarter, sequence: "01" });
      return [];
    } } }, layout);
    const first = await seed(f, f.reference("work-item/meta"));
    success(await f.store.write({ ...update(f, first), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: first.reference }));
    const renamed = RecordReferenceSchema.parse({ ...closed.reference, owner: { ...closed.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, closed), reference: renamed, provenance: { ...testProvenance, verb: "rename" } }));
    expect(success(await f.store.lookup({ kind: "slug", slug: newSlug })).reference).toEqual(renamed);
  });

  it("selects one prepared reopened owner by branch, commit and checkout claim", async () => {
    const repository = "repo", ref = "feat/checked", sha = "a".repeat(40);
    const f = await createRefFixture({ "work-item/meta": { check: async ({ writer, reference, after }) => {
      if (writer.kind !== "verb" || writer.verb !== "reopen") return [];
      const found = await Promise.all([
        after.lookup({ kind: "ref", repository, ref }),
        after.lookup({ kind: "commit", repository, sha }),
        after.lookup({ kind: "claim", claim: { kind: "work-unit", slug: reference.owner.name } }),
      ]);
      expect(found).toEqual([
        { status: "ok", result: { reference } },
        { status: "ok", result: { reference, taskIds: ["1.1"] } },
        { status: "ok", result: { reference } },
      ]);
      expect(success(await after.lookup({ kind: "slug", slug: reference.owner.name })).reference).toEqual(reference);
      expect(success(await after.read({ reference })).placement).toEqual({ kind: "active" });
      return [];
    } } }, layout);
    const first = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository, ref, linkedAs: "created", excluded: [] }], taskCaptures: { "1.1": [{ repository, sha }] },
    });
    success(await f.store.write({ ...update(f, first), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: first.reference }));
    success(await f.store.write({ ...update(f, closed), placement: { kind: "active" }, provenance: { ...testProvenance, verb: "reopen" } }));
  });
});
