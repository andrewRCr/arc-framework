/** Captured readers reject alternate companion addresses before certifying conflict evidence. */
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type StoreRecord, type StoreResult } from "../../src/lib/store/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { mutationOf, seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("captured companion admission in %s", layout => {
  it.each((["observation", "saved-read", "check-view"] as const).flatMap(mode => [false, true].map(oldHint => ({ mode, oldHint }))))(
    "rejects an alias in $mode with obsolete hint $oldHint and accepts the canonical reference", async ({ mode, oldHint }) => {
      let armed = false, requested: StoreRecord["reference"] | undefined;
      let checked: StoreResult<StoreRecord> | undefined;
      const f = await createRefFixture({ "personal/document": { check: async input => {
        if (armed && requested) checked = await input.before.read({ reference: requested });
        return [];
      } } }, layout);
      const primary = await seed(f, f.reference("work-item/meta"));
      const reference = RecordReferenceSchema.parse({ kind: "work-item/companion", owner: primary.reference.owner, key: "extra" });
      const base = await seed(f, reference, "base\n");
      success(await f.store.write(update(f, base, "current\n")));
      success(await f.store.write(update(f, base, "incoming\n")));
      const current = success(await f.store.read({ reference }));
      expect(current.conflicts).toHaveLength(1);
      const alias = RecordReferenceSchema.parse({ ...reference, key: `extra-${primary.reference.owner.name}.md`,
        owner: { ...reference.owner, name: oldHint ? "obsolete-hint" : reference.owner.name } });
      const canonical = RecordReferenceSchema.parse({ ...reference,
        owner: { ...reference.owner, name: oldHint ? "obsolete-hint" : reference.owner.name } });
      const target = await seed(f, f.reference("personal/document"), "original\n");
      const asOf = success(await f.store.version());
      if (mode === "observation") {
        const writes = [mutationOf(update(f, target, "accepted\n"))];
        expect(await f.store.batch({ writes, provenance: testProvenance,
          observations: [{ reference: alias, expected: { version: current.version, conflicts: [] } }] }))
          .toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
        expect(success(await f.store.version())).toBe(asOf);
        expect(success(await f.store.read({ reference: target.reference }))).toEqual(target);
        success(await f.store.batch({ writes, provenance: testProvenance,
          observations: [{ reference: canonical, expected: { version: current.version, conflicts: current.conflicts } }] }));
        expect(success(await f.store.read({ reference: target.reference })).content).toBe("accepted\n");
      } else if (mode === "saved-read") {
        expect(await f.store.read({ reference: alias, asOf })).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
        expect(success(await f.store.read({ reference: canonical, asOf })))
          .toMatchObject({ reference: current.reference, version: current.version, conflicts: current.conflicts });
      } else {
        armed = true; requested = alias;
        success(await f.store.write(update(f, target, "checked\n")));
        expect(checked).toMatchObject({ status: "refused", refusal: { code: "unsupported" } });
        requested = canonical;
        const held = success(await f.store.read({ reference: target.reference }));
        success(await f.store.write(update(f, held, "canonical\n")));
        expect(checked).toMatchObject({ status: "ok", result: { reference: current.reference,
          version: current.version, conflicts: current.conflicts } });
        expect(success(await f.store.read({ reference: target.reference })).content).toBe("canonical\n");
      }
    });
});
