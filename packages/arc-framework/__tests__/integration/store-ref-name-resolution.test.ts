import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update, mutationOf, testProvenance } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { batchResultSchema } from "../../src/lib/store/write.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("name resolution over captured ref owners", () => {
  it.each([
    ["work-item/meta", "current"], ["work-item/meta", "former"], ["cohort/document", "current"], ["cohort/document", "former"],
  ] as const)("reads completed %s records by their owner's %s name", async (kind, tier) => {
    const f = await createRefFixture();
    const named = f.reference(kind), record = await seed(f, named);
    const note = kind === "work-item/meta" ? await seed(f, RecordReferenceSchema.parse({ ...record.reference, kind: "work-item/companion", key: "extra" }), "note") : undefined;
    const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, record, record.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const owner = { ...named.owner, name: tier === "current" ? renamed.owner.name : named.owner.name };
    const primary = success(await f.store.read({ reference: RecordReferenceSchema.parse({ ...named, owner }) }));
    expect(primary.reference).toEqual(renamed);
    if (note) {
      const companion = success(await f.store.read({ reference: RecordReferenceSchema.parse({ ...note.reference, owner }) }));
      expect(companion.reference.owner).toEqual(renamed.owner);
      expect(companion.content).toBe("note");
    }
    expect(primary.placement?.kind).toBe("completed");
  });
  it("restricts completed changes through an owner's former name", async () => {
    const f = await createRefFixture();
    const named = f.reference("work-item/meta"), initial = await seed(f, named);
    const renamed = RecordReferenceSchema.parse({ ...initial.reference, owner: { ...initial.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, initial, initial.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: renamed })), from = await f.settle();
    success(await f.store.write(update(f, closed)));
    const changed = success(await f.store.read({ reference: renamed }));
    expect(success(await f.store.changes({ from, to: await f.settle(), references: [named] }))).toEqual([
      expect.objectContaining({ reference: renamed, version: changed.version, content: changed.content }),
    ]);
  });

  it("lists one completed generation through its former owner name", async () => {
    const f = await createRefFixture();
    const named = f.reference("work-item/meta"), initial = await seed(f, named);
    const renamed = RecordReferenceSchema.parse({ ...initial.reference, owner: { ...initial.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, initial, initial.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const listing = success(await f.store.list({ family: "work-item", owner: named.owner }));
    expect(listing).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: renamed })] });
  });

  it.each(["live", "completed"] as const)("resolves saved %s owners from their manifest instead of today's current name holder", async (location) => {
    const f = await createRefFixture();
    const named = f.reference("work-item/meta"), initial = await seed(f, named);
    const renamed = RecordReferenceSchema.parse({ ...initial.reference, owner: { ...initial.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, initial, initial.content), reference: renamed }));
    if (location === "completed") {
      const live = success(await f.store.read({ reference: renamed }));
      success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    }
    const saved = success(await f.store.read({ reference: renamed })), asOf = await f.settle();
    const next = await seed(f, f.reference("work-item/meta", "next"));
    const current = RecordReferenceSchema.parse({ ...next.reference, owner: { ...next.reference.owner, name: named.owner.name } });
    success(await f.store.write({ ...update(f, next, next.content), reference: current }));
    expect(success(await f.store.read({ reference: named })).reference).toEqual(current);
    expect(success(await f.store.read({ reference: named, asOf }))).toEqual(saved);
    expect(success(await f.store.list({ family: "work-item", owner: named.owner, asOf })))
      .toMatchObject({ status: "complete", asOf, records: [expect.objectContaining({ reference: renamed })] });
  });

  it("updates a completed primary and companion through the same former owner name", async () => {
    const f = await createRefFixture();
    const named = f.reference("work-item/meta"), initial = await seed(f, named);
    const note = await seed(f, RecordReferenceSchema.parse({ ...initial.reference, kind: "work-item/companion", key: "extra" }), "before");
    const renamed = RecordReferenceSchema.parse({ ...initial.reference, owner: { ...initial.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, initial, initial.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    const closed = success(await f.store.read({ reference: renamed }));
    const input = { writes: [mutationOf({ ...update(f, closed), reference: named }),
      mutationOf({ ...update(f, note, "after"), reference: RecordReferenceSchema.parse({ ...note.reference, owner: named.owner }) })], provenance: testProvenance };
    const result = success(await f.store.batch(input));
    expect(batchResultSchema(input).safeParse(result).success).toBe(true);
    expect(success(await f.store.read({ reference: result.writes[0]!.reference })).reference).toEqual(renamed);
    expect(success(await f.store.read({ reference: renamed })).content).toBe(f.content(renamed, "changed"));
    expect(success(await f.store.read({ reference: note.reference })).content).toBe("after");
    expect(success(await f.store.read({ reference: named })).reference).toEqual(renamed);
  });

  it("starts a fresh batch generation over several completed holders, even with an old-UID write beside it", async () => {
    const f = await createRefFixture(), named = f.reference("work-item/meta");
    const notes = [];
    for (let generation = 0; generation < 2; generation += 1) {
      const primary = await seed(f, named);
      const note = await seed(f, RecordReferenceSchema.parse({ ...primary.reference, kind: "work-item/companion", key: "extra" }), "old");
      notes.push(note.reference);
      success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter } }));
    }
    const oldNote = success(await f.store.read({ reference: notes[0]! }));
    const noteName = RecordReferenceSchema.parse({ ...named, kind: "work-item/companion", key: "extra" });
    const input = { writes: [
      { action: "put" as const, reference: noteName, expected: null, content: "new" },
      { action: "put" as const, reference: named, expected: null, content: f.content(named), placement: { kind: "active" as const } },
      mutationOf(update(f, oldNote, "old updated")),
    ], provenance: testProvenance };
    const result = success(await f.store.batch(input));
    expect(batchResultSchema(input).safeParse(result).success).toBe(true);
    const current = success(await f.store.read({ reference: named }));
    expect(result.writes[0]?.reference.owner).toEqual(result.writes[1]?.reference.owner);
    expect(result.writes[0]?.reference.owner).not.toEqual(oldNote.reference.owner);
    expect(success(await f.store.read({ reference: RecordReferenceSchema.parse({ ...noteName, owner: current.reference.owner }) })).content).toBe("new");
    expect(success(await f.store.read({ reference: oldNote.reference })).content).toBe("old updated");
  });

  it.each(["ended", "live-former"] as const)("refuses ambiguous %s owner tiers consistently and admits explicit UID retries", async (tier) => {
    const f = await createRefFixture(), named = f.reference("work-item/meta"), from = await f.settle();
    const first = await seed(f, named);
    let current = first;
    if (tier === "ended") {
      success(await f.store.write({ ...update(f, first, first.content), placement: { kind: "completed", quarter } }));
      const second = await seed(f, named);
      success(await f.store.write({ ...update(f, second, second.content), placement: { kind: "completed", quarter } }));
    } else {
      const second = await seed(f, f.reference("work-item/meta", "other"));
      const renamed = RecordReferenceSchema.parse({ ...first.reference, owner: { ...first.reference.owner, name: "first-renamed" } });
      success(await f.store.write({ ...update(f, first, first.content), reference: renamed }));
      current = success(await f.store.read({ reference: renamed }));
      const intermediate = RecordReferenceSchema.parse({ ...second.reference, owner: { ...second.reference.owner, name: named.owner.name } });
      success(await f.store.write({ ...update(f, second, second.content), reference: intermediate }));
      const live = success(await f.store.read({ reference: intermediate }));
      success(await f.store.write({ ...update(f, live, live.content), reference: RecordReferenceSchema.parse({ ...intermediate, owner: { ...intermediate.owner, name: "second-renamed" } }) }));
    }
    const to = await f.settle();
    const refusal = { status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([expect.objectContaining({ owner: current.reference.owner })]) } };
    expect(await f.store.read({ reference: named })).toMatchObject(refusal);
    expect(await f.store.list({ family: "work-item", owner: named.owner })).toMatchObject(refusal);
    expect(await f.store.history({ reference: named })).toMatchObject(refusal);
    expect(await f.store.changes({ from, to, references: [named] })).toMatchObject(refusal);
    expect(await f.store.write({ ...update(f, current), reference: named })).toMatchObject(refusal);
    expect(await f.settle()).toBe(to);
    const known = success(await f.store.read({ reference: current.reference }));
    expect(success(await f.store.history({ reference: known.reference })).length).toBeGreaterThan(0);
    expect(success(await f.store.changes({ from, to, references: [known.reference] })).length).toBeGreaterThan(0);
    success(await f.store.write(update(f, known)));
  });

  it("reads completed history by the owner's former name", async () => {
    const f = await createRefFixture(), named = f.reference("work-item/meta");
    const initial = await seed(f, named);
    const renamed = RecordReferenceSchema.parse({ ...initial.reference, owner: { ...initial.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, initial, initial.content), reference: renamed }));
    const live = success(await f.store.read({ reference: renamed }));
    success(await f.store.write({ ...update(f, live, live.content), placement: { kind: "completed", quarter } }));
    expect(success(await f.store.history({ reference: named }))).toEqual(success(await f.store.history({ reference: renamed })));
    expect(success(await f.store.history({ reference: named }))).toHaveLength(3);
  });

  it("resolves saved lineage references against the saved live owners before the registry map", async () => {
    const { f, named, origin, before, after } = await shadowedLineageFixture();
    expect(await f.store.read({ reference: named })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.read({ reference: named, asOf: after })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(success(await f.store.read({ reference: named, asOf: before }))).toEqual(origin);
    expect(success(await f.store.read({ reference: origin.reference, asOf: after }))).toEqual(origin);
    expect(success(await f.store.list({ family: "lineage", owner: named.owner, asOf: before })))
      .toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: origin.reference })] });
    expect(success(await f.store.list({ family: "lineage", owner: named.owner, asOf: after })))
      .toMatchObject({ status: "complete", records: [] });
  });

  it("gives captured write-check lineage reads the same live-owner precedence", async () => {
    const { f, observed } = await shadowedLineageFixture();
    await seed(f, f.reference("personal/document"));
    expect(observed).toEqual([
      expect.objectContaining({ status: "refused", refusal: expect.objectContaining({ code: "not-found" }) }),
      expect.objectContaining({ status: "refused", refusal: expect.objectContaining({ code: "not-found" }) }),
    ]);
  });

  it.each(["read", "saved-read", "history", "changes", "write"] as const)("binds the owner before interpreting an old-name-shaped literal companion key for %s", async (operation) => {
    const f = await createRefFixture(), named = f.reference("work-item/meta");
    const primary = await seed(f, named);
    const renamed = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "renamed" } });
    success(await f.store.write({ ...update(f, primary, primary.content), reference: renamed }));
    const literal = await seed(f, RecordReferenceSchema.parse({ ...renamed, kind: "work-item/companion", key: `extra-${named.owner.name}.md` }), "before");
    const requested = RecordReferenceSchema.parse({ ...literal.reference, owner: named.owner }), from = await f.settle();
    if (operation === "read" || operation === "saved-read") {
      expect(success(await f.store.read({ reference: requested, ...(operation === "saved-read" ? { asOf: from } : {}) }))).toEqual(literal);
    } else if (operation === "history") {
      expect(success(await f.store.history({ reference: requested }))).toMatchObject([{ content: "before", reference: literal.reference }]);
    } else if (operation === "changes") {
      success(await f.store.write(update(f, literal, "after")));
      expect(success(await f.store.changes({ from, to: await f.settle(), references: [requested] }))).toMatchObject([{ content: "after", reference: literal.reference }]);
    } else {
      const result = success(await f.store.write({ ...update(f, literal, "after"), reference: requested }));
      expect(success(await f.store.read({ reference: result.reference })).content).toBe("after");
      expect(success(await f.store.read({ reference: literal.reference })).content).toBe("after");
    }
  });

});

async function shadowedLineageFixture() {
  const observed: unknown[] = [];
  const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
    observed.push(await before.read({ reference: named }), await after.read({ reference: named }));
    return [];
  } } });
  const named = f.reference("lineage/transition"), origin = await seed(f, named), before = await f.settle();
  await seed(f, f.reference("work-item/meta"));
  return { f, named, origin, before, after: await f.settle(), observed };
}
