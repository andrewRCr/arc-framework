import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { seed, success, testProvenance, update } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, type WriteCheck } from "../../src/lib/store/index.js";
import { acquireStoreUserReferenceAuthority } from "../../src/lib/store/user-reference-authority.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";

describe.each(["default", "separate"] as const)("complete primary aliases in %s", layout => {
  it.each([false, true])("projects Errand-primary aliases with renamed=%s", async renamed => {
    const f = await createRefFixture({}, layout), first = await seed(f, f.reference("work-item/record"));
    let reference = first.reference;
    if (renamed) {
      reference = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "renamed-errand" } });
      success(await f.store.write({ ...update(f, first, first.content), reference }));
    }
    expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: {
      aliases: renamed ? [first.reference.owner.name] : [],
    } });
  });

  it.each((["current", "saved", "archived", "checked", "authority"] as const).flatMap(view =>
    [false, true].map(renamed => ({ view, renamed }))))("projects aliases in $view with renamed=$renamed", async ({ view, renamed }) => {
    const wanted = renamed ? ["work-item-one"] : [];
    const check: WriteCheck = async ({ reference, before, after }) => {
      const primary = RecordReferenceSchema.parse({ owner: reference.owner, kind: "work-item/meta" });
      const prior = success(await before.read({ reference: primary })), next = success(await after.read({ reference: primary }));
      return JSON.stringify(prior.aliases) === JSON.stringify(wanted) && JSON.stringify(next.aliases) === JSON.stringify(wanted)
        ? [] : [{ rule: "primary-aliases", condition: "Captured primary aliases are incomplete.",
          remedy: { text: "Restore the complete primary projection and retry." } }];
    };
    const f = await createRefFixture(view === "checked" ? { "work-item/companion": { check } } : {}, layout);
    const first = await seed(f, f.reference("work-item/meta"));
    let reference = first.reference;
    if (renamed) {
      reference = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "renamed" } });
      success(await f.store.write({ ...update(f, first, first.content), reference }));
    }
    if (view === "archived") {
      const current = success(await f.store.read({ reference }));
      success(await f.store.write({ ...update(f, current, current.content),
        placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    }
    if (view === "authority") {
      expect(await acquireStoreUserReferenceAuthority(f.store)).toMatchObject({ status: "ok", result: {
        transitions: renamed ? [{ subject: "work-item-one", outcome: { kind: "rename", targetSlug: "renamed" } }] : [],
      } });
    } else if (view === "checked") {
      expect(await f.store.write({ action: "put", expected: null,
        reference: RecordReferenceSchema.parse({ owner: reference.owner, kind: "work-item/companion", key: "checked.svg" }),
        content: "Checked companion\n", provenance: testProvenance })).toMatchObject({ status: "ok" });
    } else {
      const asOf = view === "saved" ? await f.settle() : undefined;
      if (view === "saved") {
        const current = success(await f.store.read({ reference }));
        success(await f.store.write({ ...update(f, current, current.content),
          reference: RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "later-name" } }) }));
      }
      expect(await f.store.read({ reference, asOf })).toMatchObject({ status: "ok", result: { reference, aliases: wanted } });
      const listing = success(await f.store.list({ family: "work-item", kind: "work-item/meta", asOf }));
      expect(listing).toMatchObject({ status: "complete", missed: false, records: [expect.objectContaining({ reference, aliases: wanted })] });
    }
  });

  it("holds removal while a surviving edge names an authenticated former slug", async () => {
    const h = await refSyncFixture(layout), store = h.a.store;
    const make = async (name: string, dependsOn: string[] = []) => success(await store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ owner: { type: "work-item", name }, kind: "work-item/meta" }),
      content: makeMetaFixture(name, { dependsOn }), placement: { kind: "active" },
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const origin = await make("former"), dependent = await make("dependent", ["former"]);
    const prior = success(await store.read({ reference: origin.reference }));
    const reference = RecordReferenceSchema.parse({ ...origin.reference, owner: { ...origin.reference.owner, name: "current" } });
    success(await store.write({ action: "put", reference, expected: prior.version,
      content: makeMetaFixture("current"), placement: { kind: "active" }, provenance: { verb: "rename", lifecycleAction: "rename" } }));
    const current = success(await store.read({ reference }));
    const remove = { action: "remove" as const, reference, expected: current.version,
      provenance: { verb: "decompose", lifecycleAction: "decompose" } };
    const before = success(await store.version());
    expect(await store.write(remove)).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      rule: "meta.decompose-removal-edges", condition: expect.stringContaining("dependent.Depends On → former") } });
    expect(success(await store.version())).toBe(before);
    const dependentBefore = success(await store.read({ reference: dependent.reference }));
    success(await store.write({ action: "put", reference: dependent.reference, expected: dependentBefore.version,
      content: makeMetaFixture("dependent"), placement: { kind: "active" }, provenance: testProvenance }));
    success(await store.write(remove));
    expect(await store.read({ reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  }, 60_000);
});
