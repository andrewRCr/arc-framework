import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, testProvenance } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

describe("ref writer and placement admission", () => {
  it.each(["companion-first", "primary-first"] as const)("requires a primary and accepts its atomic creation (%s)", async (order) => {
    const fixture = await createRefFixture();
    const reference = fixture.reference("work-item/task-list");
    const primary = fixture.reference("work-item/meta");
    const companion = { action: "put" as const, reference, expected: null, content: fixture.content(reference) };
    expect(await fixture.store.write({ ...companion, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", reference: { kind: reference.kind, owner: { name: reference.owner.name } },
      remedy: { text: expect.stringContaining("primary") },
    } });
    expect((await makeGitExec(fixture.root)("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
    const root = { action: "put" as const, reference: primary, expected: null, content: fixture.content(primary), placement: { kind: "active" as const } };
    success(await fixture.store.batch({ writes: order === "companion-first" ? [companion, root] : [root, companion], provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference })).content).toBe(companion.content);
    expect(success(await fixture.store.read({ reference: primary })).placement).toEqual({ kind: "active" });
  });

  it("requires a primary for a review record and accepts a separately created primary", async () => {
    const fixture = await createRefFixture();
    const reference = fixture.reference("review/evidence");
    const put = { action: "put" as const, reference, expected: null, content: fixture.content(reference), provenance: testProvenance };
    expect(await fixture.store.write(put)).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      remedy: { text: expect.stringContaining("same atomic batch") } } });
    await seed(fixture, fixture.reference("work-item/meta"));
    success(await fixture.store.write(put));
    expect(success(await fixture.store.read({ reference })).placement).toEqual({ kind: "active" });
  });

  it("keeps placement available after primary removal for new companions", async () => {
    const fixture = await createRefFixture();
    const primary = await seed(fixture, fixture.reference("work-item/meta"));
    success(await fixture.store.write({ action: "remove", reference: primary.reference, expected: primary.version, provenance: testProvenance }));
    const reference = fixture.reference("work-item/task-list");
    success(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference), provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference })).placement).toEqual({ kind: "active" });
  });

  it.each(["work-item/conflict-record", "review/conflict-record"] as const)("allows %s without a primary", async (kind) => {
    const fixture = await createRefFixture();
    const reference = fixture.reference(kind);
    success(await fixture.store.write({ action: "put", reference, expected: null, content: fixture.content(reference), provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference })).reference.kind).toBe(kind);
    expect(await fixture.store.read({ reference: fixture.reference("work-item/meta") })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("refuses an unauthorized writer, then accepts the declared writer", async () => {
    const fixture = await createRefFixture();
    const reference = fixture.reference("personal/conflict-record");
    const mutation = { action: "put" as const, reference, expected: null, content: fixture.content(reference) };
    expect(await fixture.store.write({ ...mutation, provenance: { ...testProvenance, verb: "edit" } }))
      .toMatchObject({ status: "refused", refusal: { code: "record-malformed", rule: "store.writer" } });
    success(await fixture.store.write({ ...mutation, provenance: testProvenance }));
    expect(success(await fixture.store.read({ reference })).content).toBe(mutation.content);
  });

  it.each(["name", "uid"] as const)("requires explicit self resolution and canonicalizes the %s handle on retry", async (handle) => {
    const fixture = await createRefFixture();
    const record = await seed(fixture, fixture.reference("work-item/conflict-record"));
    const byName = fixture.reference("work-item/conflict-record");
    const byUid = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: "obsolete-name" } });
    const reference = handle === "name" ? byName : byUid;
    const mutation = { action: "remove" as const, reference, expected: record.version, provenance: testProvenance };
    expect(await fixture.store.write(mutation)).toMatchObject({ status: "refused", refusal: { code: "record-malformed",
      remedy: { text: expect.stringContaining("Name this conflict in resolves") } } });
    const wrongOwner = RecordReferenceSchema.parse({ ...byName, owner: { type: "work-item", name: "different-owner" } });
    expect(await fixture.store.write({ ...mutation, resolves: [wrongOwner] })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", rule: "store.resolves",
    } });
    expect(success(await fixture.store.read({ reference: record.reference })).version).toBe(record.version);
    success(await fixture.store.write({ ...mutation, resolves: [handle === "name" ? byUid : byName] }));
    expect(await fixture.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
});
