/** Reconciliation retains the name and generation authority of independently writable stores. */
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordReferenceSchema, type Store } from "../../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

function clients(direction: "pull" | "publish") {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  return { fixture, writer: direction === "pull" ? remote : fixture.store, reader: direction === "pull" ? fixture.store : remote };
}

describe.each(["pull", "publish"] as const)("reference identity %s", (direction) => {
  it("allocates completion order after imported completed records", async () => {
    const {fixture,writer,reader} = clients(direction);
    const quarter = ArchiveQuarterSchema.parse("2026-q4");
    const reference = fixture.reference("work-item/meta","imported");
    const first = success(await writer.write({action:"put",reference,expected:null,content:fixture.content(reference),placement:{kind:"completed",quarter},provenance:testProvenance}));
    success(await fixture.store.sync());
    const imported = success(await reader.read({reference:first.reference}));
    expect(imported.placement).toEqual({kind:"completed",quarter,sequence:"01"});
    const next = fixture.reference("work-item/meta","next");
    const second = success(await reader.write({action:"put",reference:next,expected:null,content:fixture.content(next),placement:{kind:"completed",quarter},provenance:testProvenance}));
    expect(success(await reader.read({reference:second.reference})).placement).toEqual({kind:"completed",quarter,sequence:"02"});
    expect(success(await reader.read({reference:first.reference}))).toEqual(imported);
    success(await reader.write({...update(fixture,imported),placement:{kind:"completed",quarter}}));
    expect(success(await reader.read({reference:first.reference})).placement).toEqual(imported.placement);
  });

  it("retains name-only reads, exact UIDs, and duplicate creation refusal after sync", async () => {
    const {fixture,writer,reader} = clients(direction);
    const reference = fixture.reference("work-item/meta");
    const input = {action:"put" as const,reference,expected:null,content:fixture.content(reference),placement:{kind:"active" as const},provenance:testProvenance};
    const first = success(await writer.write(input));
    success(await fixture.store.sync());
    expect(success(await reader.read({reference}))).toMatchObject({reference:first.reference,version:first.version});
    expect(success(await reader.read({reference:first.reference}))).toEqual(success(await reader.read({reference})));
    expect(await reader.write(input)).toMatchObject({status:"refused",refusal:{code:"version-conflict"}});
    expect(success(await reader.lookup({kind:"slug",slug:reference.owner.name}))).toEqual({reference:first.reference});
    expect(success(await fixture.reopen().read({reference}))).toMatchObject({reference:first.reference});
  });

  it("retains renamed handles and old aliases without changing historical name reads", async () => {
    const {fixture,writer,reader} = clients(direction);
    const reference = fixture.reference("work-item/meta");
    const first = success(await writer.write({action:"put",reference,expected:null,content:fixture.content(reference),placement:{kind:"active"},provenance:testProvenance}));
    success(await fixture.store.sync());
    const before = success(await reader.version());
    const renamed = RecordReferenceSchema.parse({...first.reference,owner:{...first.reference.owner,name:"renamed-work"}});
    success(await writer.write({...update(fixture,success(await writer.read({reference:first.reference}))),reference:renamed}));
    success(await fixture.store.sync());
    const named = RecordReferenceSchema.parse({...reference,owner:{...reference.owner,name:"renamed-work"}});
    for (const handle of [reference,named]) expect(success(await reader.read({reference:handle}))).toMatchObject({reference:renamed});
    expect(success(await reader.lookup({kind:"slug",slug:reference.owner.name}))).toEqual({reference:renamed});
    expect(success(await reader.read({reference,asOf:before}))).toMatchObject({reference:first.reference});
    expect(await reader.read({reference:named,asOf:before})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
  });

  it("prefers a recreated primary over its older orphan companion generation", async () => {
    const {fixture,writer,reader} = clients(direction);
    const named = fixture.reference("work-item/meta");
    const put = (store:Store,reference= named)=>store.write({action:"put",reference,expected:null,content:fixture.content(reference),placement:{kind:"active"},provenance:testProvenance});
    const first = success(await put(writer));
    const companion = RecordReferenceSchema.parse({...fixture.reference("work-item/companion"),owner:first.reference.owner});
    success(await writer.write({action:"put",reference:companion,expected:null,content:fixture.content(companion),provenance:testProvenance}));
    success(await fixture.store.sync());
    const before = success(await reader.version());
    success(await writer.write({action:"remove",reference:first.reference,expected:first.version!,provenance:testProvenance}));
    const second = success(await put(writer));
    success(await fixture.store.sync());
    expect(second.reference.owner).not.toEqual(first.reference.owner);
    expect(success(await reader.read({reference:named}))).toMatchObject({reference:second.reference});
    expect(success(await reader.read({reference:companion}))).toMatchObject({reference:companion});
    expect(success(await reader.list({family:"work-item",owner:named.owner}))).toMatchObject({records:[{reference:second.reference}]});
    expect(success(await reader.read({reference:named,asOf:before}))).toMatchObject({reference:first.reference});
    expect(success(await fixture.reopen().read({reference:named}))).toMatchObject({reference:second.reference});
  });
});

it("prefers a live generation over an imported completed generation", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const named = fixture.reference("work-item/meta");
  const first = await seed(fixture,named);
  success(await fixture.store.sync());
  const before = success(await remote.version());
  success(await fixture.store.write({...update(fixture,first),placement:{kind:"completed",quarter:ArchiveQuarterSchema.parse("2026-q4")}}));
  const next = RecordReferenceSchema.parse({...named,owner:{...named.owner,uid:randomUUID()}});
  const second = await seed(fixture,next);
  success(await fixture.store.sync());
  expect(success(await remote.read({reference:named}))).toMatchObject({reference:second.reference});
  expect(success(await remote.read({reference:first.reference}))).toMatchObject({placement:{kind:"completed"}});
  expect(success(await remote.read({reference:named,asOf:before}))).toMatchObject({reference:first.reference});
});

it("refuses colliding independently created live names before publishing either namespace", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const named = fixture.reference("work-item/meta");
  const local = await seed(fixture,named);
  const other = success(await remote.write({action:"put",reference:named,expected:null,content:fixture.content(named),placement:{kind:"active"},provenance:testProvenance}));
  const localBefore = success(await fixture.store.version()),remoteBefore = success(await remote.version());
  expect(await fixture.store.sync()).toMatchObject({status:"refused",refusal:{code:"ambiguous-match",candidates:expect.arrayContaining([local.reference,other.reference])}});
  expect(success(await fixture.store.version())).toBe(localBefore);
  expect(success(await remote.version())).toBe(remoteBefore);
  expect(await fixture.store.read({reference:other.reference})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
  expect(await remote.read({reference:local.reference})).toMatchObject({status:"refused",refusal:{code:"not-found"}});
});

it("prefers a live rename alias over an older completed generation's name", async () => {
  const fixture = createReferenceFixture();
  const remote = fixture.remote(true)!;
  const named = fixture.reference("work-item/meta");
  const first = await seed(fixture,named);
  success(await fixture.store.write({...update(fixture,first),placement:{kind:"completed",quarter:ArchiveQuarterSchema.parse("2026-q4")}}));
  const next = RecordReferenceSchema.parse({...named,owner:{...named.owner,uid:randomUUID()}});
  const second = await seed(fixture,next);
  const renamed = RecordReferenceSchema.parse({...next,owner:{...next.owner,name:"renamed-work"}});
  success(await fixture.store.write({...update(fixture,second),reference:renamed}));
  success(await fixture.store.sync());
  expect(success(await remote.read({reference:named}))).toMatchObject({reference:renamed});
  expect(success(await remote.read({reference:first.reference}))).toMatchObject({placement:{kind:"completed"}});
});
