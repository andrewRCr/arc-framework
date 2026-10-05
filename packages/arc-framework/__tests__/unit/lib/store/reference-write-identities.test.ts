/** Local writes preserve the complete live owner namespace atomically. */
import { describe, expect, it } from "vitest";
import { BatchInputSchema, RecordReferenceSchema, WriteInputSchema } from "../../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

describe("reference local rename admission", () => {
  it("accepts distinct UID generations sharing one human name in a batch", async () => {
    const fixture = createReferenceFixture();
    const named = fixture.reference("work-item/meta");
    const first = await seed(fixture,named);
    success(await fixture.store.write({...update(fixture,first),placement:{kind:"completed",quarter:ArchiveQuarterSchema.parse("2026-q4")}}));
    const archived = success(await fixture.store.read({reference:first.reference}));
    const current = await seed(fixture,named);
    const writes = [archived,current].map((record)=> {
      const {provenance,...mutation} = update(fixture,record);
      void provenance;
      return mutation;
    });
    const result = success(await fixture.store.batch(BatchInputSchema.parse({writes,provenance:testProvenance})));
    expect(result.writes.map((write)=>write.reference.owner)).toEqual([archived.reference.owner,current.reference.owner]);
    expect(archived.reference.owner).not.toEqual(current.reference.owner);
  });

  it.each([false,true])("refuses canonical batch duplicates before any mutation, alias: %s", async (alias) => {
    const fixture = createReferenceFixture();
    const requested = fixture.reference("work-item/meta","duplicate");
    let original = await seed(fixture,requested);
    if (alias) {
      const renamed = RecordReferenceSchema.parse({...original.reference,owner:{...original.reference.owner,name:"renamed"}});
      success(await fixture.store.write(WriteInputSchema.parse({...update(fixture,original),reference:renamed})));
      original = success(await fixture.store.read({reference:renamed}));
    }
    const before = await fixture.settle();
    const history = success(await fixture.store.history({reference:original.reference}));
    const other = fixture.reference("personal/document","untouched");
    const put = {action:"put",reference:original.reference,expected:original.version,content:fixture.content(original.reference,"changed"),placement:original.placement};
    const batch = BatchInputSchema.parse({writes:[put,{...put,reference:requested},{action:"put",reference:other,expected:null,content:"unrelated"}],provenance:testProvenance});
    expect(await fixture.store.batch(batch)).toMatchObject({status:"refused",refusal:{code:"record-malformed",remedy:{text:expect.any(String)}}});
    expect(await fixture.settle()).toBe(before);
    expect(success(await fixture.store.read({reference:original.reference}))).toEqual(original);
    expect(success(await fixture.store.history({reference:original.reference}))).toEqual(history);
    expect(await fixture.store.read({reference:other})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
    const repaired = BatchInputSchema.parse({...batch,writes:batch.writes.filter((_,index)=>index!==1)});
    success(await fixture.store.batch(repaired));
    expect(success(await fixture.store.read({reference:original.reference})).content).toBe(put.content);
  });

  for (const leftKind of ["work-item/meta", "work-item/record"] as const) for (const rightKind of ["work-item/meta", "work-item/record"] as const) {
    it.each([false, true])(`refuses colliding ${leftKind} and ${rightKind} names without namespace effects, batch: %s`, async (batch) => {
      const fixture = createReferenceFixture();
      const left = await seed(fixture, fixture.reference(leftKind, "left"));
      const right = await seed(fixture, fixture.reference(rightKind, "right"));
      const companionReference = RecordReferenceSchema.parse({ ...fixture.reference(leftKind === "work-item/meta" ? "work-item/notes" : "work-item/description"), owner: left.reference.owner });
      const companion = await seed(fixture, companionReference);
      const before = await fixture.settle();
      const records = success(await fixture.store.list({ family: "work-item" }));
      const history = success(await fixture.store.history({ reference: left.reference }));
      const name = batch ? "common-name" : right.reference.owner.name;
      const renamed = RecordReferenceSchema.parse({ ...left.reference, owner: { ...left.reference.owner, name } });
      const other = RecordReferenceSchema.parse({ ...right.reference, owner: { ...right.reference.owner, name } });
      const write = WriteInputSchema.parse({ ...update(fixture, left), reference: renamed });
      const unrelated = fixture.reference("personal/document");
      const makeBatch = (first = write, second = WriteInputSchema.parse({ ...update(fixture, right), reference: other })) => {
        const { provenance: firstProvenance, ...a } = first;
        const { provenance: secondProvenance, ...b } = second;
        void firstProvenance; void secondProvenance;
        return BatchInputSchema.parse({ writes: [a, b, { action: "put", reference: unrelated, expected: null, content: fixture.content(unrelated) }], provenance: testProvenance });
      };
      const result = batch ? await fixture.store.batch(makeBatch()) : await fixture.store.write(write);
      expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", class: "recoverable", candidates: expect.any(Array), remedy: { text: expect.any(String) } } });
      expect(await fixture.settle()).toBe(before);
      expect(success(await fixture.store.list({ family: "work-item" }))).toEqual(records);
      expect(success(await fixture.store.history({ reference: left.reference }))).toEqual(history);
      expect(success(await fixture.store.changes({ from: before, to: await fixture.settle() }))).toEqual([]);
      for (const original of [left, right, companion]) expect(success(await fixture.reopen().read({ reference: original.reference }))).toEqual(original);
      expect(success(await fixture.store.lookup({ kind: "slug", slug: left.reference.owner.name }))).toEqual({ reference: left.reference });
      expect(success(await fixture.store.lookup({ kind: "slug", slug: right.reference.owner.name }))).toEqual({ reference: right.reference });
      expect(await fixture.store.read({ reference: unrelated })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const repaired = RecordReferenceSchema.parse({ ...renamed, owner: { ...renamed.owner, name: "left-distinct" } });
      const corrected = WriteInputSchema.parse({ ...write, reference: repaired });
      if (batch) {
        const repairedRight = RecordReferenceSchema.parse({ ...other, owner: { ...other.owner, name: "right-distinct" } });
        success(await fixture.store.batch(makeBatch(corrected, WriteInputSchema.parse({ ...update(fixture, right), reference: repairedRight }))));
      } else success(await fixture.store.write(corrected));
      const saved = success(await fixture.store.read({ reference: companionReference }));
      expect(saved.reference.owner).toEqual(repaired.owner);
      expect(saved.version).toBe(companion.version);
      expect(success(await fixture.store.lookup({ kind: "slug", slug: left.reference.owner.name }))).toEqual({ reference: repaired });
      expect(success(await fixture.store.read({ reference: left.reference, asOf: before }))).toEqual(left);
      expect(success(await fixture.store.read({ reference: companionReference, asOf: before }))).toEqual(companion);
    });
  }
});
