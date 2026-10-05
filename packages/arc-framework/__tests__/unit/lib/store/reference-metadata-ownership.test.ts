/** Public metadata ownership is independent of durable reference state. */
import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, RecordReferenceSchema, type RecordReference } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { success, testProvenance, update } from "../../../helpers/store/suite-tools.js";

function rename(reference: RecordReference, name: string): void {
  reference.owner.name = OwnerIdentitySchema.parse({ ...reference.owner, name }).name;
}

describe("reference metadata ownership", () => {
  it.each([false, true])("detaches caller input and landed reference metadata; batch: %s", async (batch) => {
    const fixture = createReferenceFixture();
    const reference = RecordReferenceSchema.parse({ ...fixture.reference("work-item/meta"), owner: { type: "work-item", name: "owned", uid: "11111111-1111-4111-8111-111111111111" } });
    const links = { branches: [{ repository: "repo", ref: "refs/heads/owned" }] };
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const provenance = { ...testProvenance };
    const write = { action: "put" as const, reference, expected: null, content: fixture.content(reference), placement, links, provenance, unknownExtra: () => "caller-only" };
    const landed = batch ? success(await fixture.store.batch({ writes: [write], provenance })).writes[0]! : success(await fixture.store.write(write));
    const expected = structuredClone(success(await fixture.store.read({ reference })));
    const anchor = success(await fixture.store.version());
    rename(reference, "input-alias");
    links.branches[0]!.ref = "refs/heads/input-alias";
    placement.quarter = ArchiveQuarterSchema.parse("2027-q1");
    provenance.verb = "input-alias";
    rename(landed.reference, "output-alias");
    expect(success(await fixture.reopen().read({ reference: expected.reference }))).toEqual(expected);
    expect(success(await fixture.store.read({ reference: expected.reference, asOf: anchor }))).toEqual(expected);
    expect(success(await fixture.store.history({ reference: expected.reference }))[0]?.provenance).toMatchObject({ verb: testProvenance.verb });
    expect(success(await fixture.store.version())).toBe(anchor);
  });

  it("detaches read, list, lookup, history and changes metadata while explicit updates persist", async () => {
    const fixture = createReferenceFixture();
    const from = success(await fixture.store.version());
    const reference = fixture.reference("work-item/meta");
    success(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference), placement: { kind: "backlog", commitment: "planned" },
      links: { branches: [{ repository: "repo", ref: "refs/heads/owned" }] }, provenance: testProvenance }));
    const expected = structuredClone(success(await fixture.store.read({ reference })));
    const anchor = success(await fixture.store.version());
    const live = success(await fixture.store.read({ reference }));
    rename(live.reference, "read-alias");
    live.links!.branches![0]!.ref = "refs/heads/read-alias";
    if (live.placement?.kind !== "backlog") throw new Error("Expected planned placement");
    live.placement.commitment = "provisional";
    const listed = success(await fixture.store.list({ family: "work-item" }));
    if (listed.status !== "complete") throw new Error("Expected complete listing");
    rename(listed.records[0]!.reference, "list-alias");
    listed.records[0]!.links!.branches![0]!.ref = "refs/heads/list-alias";
    const found = success(await fixture.store.lookup({ kind: "ref", repository: "repo", ref: "refs/heads/owned" }));
    rename(found.reference, "lookup-alias");
    const history = success(await fixture.store.history({ reference: expected.reference }));
    rename(history[0]!.reference, "history-alias");
    const historyProvenance = history[0]!.provenance;
    if (!("reference" in historyProvenance)) throw new Error("Expected reference provenance");
    rename(historyProvenance.reference, "history-provenance-alias");
    historyProvenance.verb = "history-alias";
    const changes = success(await fixture.store.changes({ from, to: anchor }));
    rename(changes[0]!.reference, "changes-alias");
    const changeProvenance = changes[0]!.provenance;
    if (!("reference" in changeProvenance)) throw new Error("Expected reference provenance");
    rename(changeProvenance.reference, "changes-provenance-alias");
    expect(success(await fixture.reopen().read({ reference: expected.reference }))).toEqual(expected);
    expect(success(await fixture.store.read({ reference: expected.reference, asOf: anchor }))).toEqual(expected);
    expect(success(await fixture.store.lookup({ kind: "ref", repository: "repo", ref: "refs/heads/owned" })).reference).toEqual(expected.reference);
    expect(success(await fixture.store.history({ reference: expected.reference }))[0]?.provenance).toMatchObject({ verb: testProvenance.verb });
    expect(success(await fixture.store.version())).toBe(anchor);
    success(await fixture.store.write(update(fixture, expected)));
    expect(success(await fixture.reopen().read({ reference: expected.reference })).content).toBe(fixture.content(expected.reference, "changed"));
  });

  it("keeps parser dependencies and arbitrary parsed fields outside metadata cloning", async () => {
    const data = { callback: () => "parsed" };
    const fixture = createReferenceFixture({}, { "work-item/meta": { parser: () => ({ success: true, data }) } });
    const reference = fixture.reference("work-item/meta");
    success(await fixture.store.write({ action: "put", reference, expected: null, content: "valid", placement: { kind: "active" }, provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference })).fields).toBe(data);
  });
});
