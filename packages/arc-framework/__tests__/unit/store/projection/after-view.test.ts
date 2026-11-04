/** Pending-write views preserve record envelopes, family completeness and lookup authority. */
import { describe, expect, it } from "vitest";
import { createWriteBackAfterView } from "../../../../src/lib/store/projection/after-view.js";
import { ruleRecord, ruleView } from "../../../helpers/store/rule-view.js";
import { META_RULE_UID } from "../../../helpers/store/meta-rule-input.js";
import { recordReferences, RecordReferenceSchema, RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import { StoreRecordSchema } from "../../../../src/lib/store/read.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema, ArchiveSequenceSchema } from "../../../../src/lib/kernel/index.js";

const prior = ruleRecord("work-item/spec", "example", META_RULE_UID, "stored", { purpose: "stored" });
const other = ruleRecord("work-item/draft", "example", META_RULE_UID, "other", { purpose: "other" });
const next = { content: "pending", fields: { purpose: "pending" } };

describe("a single pending write", () => {
  it("reads the caller's parsed fields and retains the prior envelope and other records", async () => {
    const conflict = recordReferences["work-item/conflict-record"](prior.reference.owner, "one");
    const stored = { ...prior, conflicts: [conflict] };
    const before = ruleView([stored, other]);
    const after = createWriteBackAfterView({ before, reference: prior.reference, prior: stored, next });
    expect(await after.read({ reference: prior.reference })).toEqual({ status: "ok", result: { ...stored, ...next } });
    expect(await after.read({ reference: other.reference })).toEqual(await before.read({ reference: other.reference }));
    const missing = recordReferences["work-item/notes"](prior.reference.owner);
    expect(await after.read({ reference: missing })).toEqual(await before.read({ reference: missing }));
  });

  it("replaces the family member in place and delegates unrelated lists and lookups", async () => {
    const primary = ruleRecord("work-item/meta", "example", META_RULE_UID);
    const before = ruleView([other, prior, primary]);
    const after = createWriteBackAfterView({ before, reference: prior.reference, prior, next });
    expect(await after.list({ family: "work-item" })).toEqual({ status: "ok", result: {
      status: "complete", records: [other, { ...prior, ...next }, primary], diagnostics: [], missed: false,
    } });
    expect(await after.list({ family: "work-item", kind: "work-item/draft" })).toEqual(await before.list({ family: "work-item", kind: "work-item/draft" }));
    expect(await after.list({ family: "personal" })).toEqual(await before.list({ family: "personal" }));
    const lookup = { kind: "slug" as const, slug: prior.reference.owner.name };
    expect(await after.lookup(lookup)).toEqual(await before.lookup(lookup));
  });

  it("reads and lists a new companion with its owner's placement and a placeholder version", async () => {
    const primary = ruleRecord("work-item/meta", "example", META_RULE_UID, "primary", undefined,
      { kind: "backlog", commitment: "planned" });
    const before = ruleView([primary, other]);
    const after = createWriteBackAfterView({ before, reference: prior.reference, next });
    const read = await after.read({ reference: prior.reference });
    expect(read).toMatchObject({ status: "ok", result: { ...next, reference: prior.reference,
      placement: primary.placement, conflicts: [] } });
    if (read.status !== "ok") throw new Error("Pending companion not readable");
    expect(RecordVersionSchema.safeParse(read.result.version).success).toBe(true);
    expect(StoreRecordSchema.safeParse(read.result).success).toBe(true);
    expect(await after.list({ family: "work-item", kind: "work-item/spec" })).toEqual({ status: "ok", result: {
      status: "complete", records: [read.result], diagnostics: [], missed: false,
    } });
    expect(await after.list({ family: "work-item", filter: { locations: ["active"] } }))
      .toEqual(await before.list({ family: "work-item", filter: { locations: ["active"] } }));
    expect(await before.read({ reference: prior.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it.each(["read", "list"] as const)("keeps a saved-state %s at its saved content", async operation => {
    const fixture = createReferenceFixture();
    const stored = await seed(fixture, fixture.reference("personal/document"));
    const asOf = await fixture.settle();
    const after = createWriteBackAfterView({ before: fixture.store, reference: stored.reference, prior: stored, next });
    if (operation === "read") {
      expect(await after.read({ reference: stored.reference, asOf })).toEqual(await fixture.store.read({ reference: stored.reference, asOf }));
    } else {
      expect(await after.list({ family: "personal", asOf })).toEqual(await fixture.store.list({ family: "personal", asOf }));
    }
  });

  it.each([false, true])("resolves a pending companion queried by owner name (adopted: %s)", async adopted => {
    const fixture = createReferenceFixture();
    const primary = await seed(fixture, fixture.reference("work-item/meta"));
    const reference = recordReferences["work-item/spec"](primary.reference.owner);
    const prior = adopted ? undefined : await seed(fixture, reference);
    const named = RecordReferenceSchema.parse({ ...reference,
      owner: { type: reference.owner.type, name: reference.owner.name } });
    const before = await fixture.store.read({ reference: named });
    if (adopted) expect(before).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    else expect(success(before).reference).toEqual(reference);
    const after = createWriteBackAfterView({ before: fixture.store, reference, prior, next });
    expect(await after.read({ reference: named })).toMatchObject({ status: "ok", result: {
      reference, ...next, placement: primary.placement,
    } });
  });

  it("retains the backend's newer generation when a name is reused", async () => {
    const ended = { ...prior, placement: { kind: "completed" as const,
      quarter: ArchiveQuarterSchema.parse("2026-q4"), sequence: ArchiveSequenceSchema.parse("01") } };
    const current = ruleRecord("work-item/spec", "example", "00000000-0000-4000-8000-000000000002", "new generation");
    const before = ruleView([ended, current]);
    const named = RecordReferenceSchema.parse({ ...prior.reference, owner: { type: "work-item", name: "example" } });
    expect(success(await before.read({ reference: named })).reference).toEqual(current.reference);
    const after = createWriteBackAfterView({ before, reference: ended.reference, prior: ended, next });
    expect(await after.read({ reference: named })).toEqual({ status: "ok", result: current });
  });

  it("keeps a named family listing within the backend's selected generation", async () => {
    const fixture = createReferenceFixture();
    const primary = await seed(fixture, fixture.reference("work-item/meta"));
    const old = await seed(fixture, recordReferences["work-item/spec"](primary.reference.owner));
    success(await fixture.store.write({ ...update(fixture, primary),
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const ended = success(await fixture.store.read({ reference: old.reference }));
    const current = await seed(fixture, fixture.reference("work-item/meta"));
    const companion = await seed(fixture, recordReferences["work-item/spec"](current.reference.owner));
    const owner = RecordReferenceSchema.parse({ ...old.reference,
      owner: { type: "work-item", name: old.reference.owner.name } }).owner;
    const query = { family: "work-item" as const, owner };
    const listed = await fixture.store.list(query);
    expect(listed).toMatchObject({ status: "ok", result: { records: [current, companion] } });
    const after = createWriteBackAfterView({ before: fixture.store, reference: ended.reference, prior: ended, next });
    expect(await after.list(query)).toEqual(listed);
  });
});
