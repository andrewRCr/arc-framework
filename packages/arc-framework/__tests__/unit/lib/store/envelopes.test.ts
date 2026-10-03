/** Operational envelopes preserve strict mutations, conflicts, and completeness. */

import { describe, expect, it } from "vitest";
import {
  OwnerIdentitySchema, RecordVersionSchema, StateVersionSchema, recordReferences,
  CallerProvenanceSchema, LinksSchema, ConflictRecordSchema, CheckoutClaimSchema, LookupResultSchema,
  MutationSchema, WriteInputSchema, BatchInputSchema, batchResultSchema, StoreRefusalSchema,
  storeResultSchema, ListingOutcomeSchema, ListingFilterSchema, StoreRecordSchema, SyncResultSchema,
  StoreCapabilitiesSchema, UNSUPPORTED_CASES, ListingDiagnosticSchema, writeResultSchema,
} from "../../../../src/lib/store/index.js";
import { z } from "zod";
import { HistoryEntrySchema } from "../../../../src/lib/store/contract.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example", uid: "11111111-1111-4111-8111-111111111111" });
const person = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });
const reference = recordReferences["work-item/meta"](owner);
const version = RecordVersionSchema.parse("basis");
const provenance = { verb: "edit", lifecycleAction: "update" };
const mutation = { action: "put", reference, expected: null, content: "record", placement: { kind: "active" } };
const record = { reference, content: "record", version, formatVersion: 1, conflicts: [], placement: { kind: "active" } };
const remedy = { text: "Read the current record and retry." };
const missing = { code: "not-found", class: "recoverable", condition: "No such record", remedy, reference };
const sha = "a".repeat(40);
const label = { actor: "session", time: "2026-10-02T00:00:00Z" };

describe("mutation envelopes", () => {
  it("accepts a valid primary write with provenance and preserves absent versus empty links", () => {
    const absent = WriteInputSchema.parse({ ...mutation, provenance });
    const cleared = WriteInputSchema.parse({ ...mutation, provenance, links: {} });
    expect("links" in absent).toBe(false);
    expect(cleared).toHaveProperty("links", {});
  });
  it.each([
    { ...mutation, expected: undefined }, { ...mutation, placement: undefined },
    { ...mutation, reference: recordReferences["work-item/notes"](owner) },
    { ...mutation, action: "remove", expected: version },
    { action: "remove", reference, expected: null },
  ])("refuses an invalid mutation: %j", (value) => expect(MutationSchema.safeParse(value).success).toBe(false));
  it("removes by expected version without content or placement", () => {
    expect(WriteInputSchema.safeParse({ action: "remove", reference, expected: version, provenance }).success).toBe(true);
  });
  it("requires the exact put version and no version after removal", () => {
    const put = writeResultSchema(MutationSchema.parse(mutation));
    const remove = writeResultSchema(MutationSchema.parse({ action: "remove", reference, expected: version }));
    expect(put.safeParse({ reference, conflicts: [] }).success).toBe(false);
    expect(remove.safeParse({ reference, conflicts: [], version }).success).toBe(false);
    expect(remove.safeParse({ reference, conflicts: [] }).success).toBe(true);
  });
  it("accepts a backend-minted UID while binding the requested owner, kind, and key", () => {
    const named = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: owner.name }));
    const input = MutationSchema.parse({ ...mutation, reference: named });
    const result = { reference, version, conflicts: [] };
    expect(writeResultSchema(input).safeParse(result).success).toBe(true);
    expect(batchResultSchema(BatchInputSchema.parse({ writes: [input], provenance }))
      .safeParse({ batchId: "minted", writes: [result] }).success).toBe(true);
    const renamed = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ ...owner, name: "other" }));
    const differentUid = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ ...owner, uid: "22222222-2222-4222-8222-222222222222" }));
    expect(writeResultSchema(input).safeParse({ ...result, reference: renamed }).success).toBe(false);
    expect(writeResultSchema(input).safeParse({ ...result, reference: recordReferences["work-item/notes"](owner) }).success).toBe(false);
    expect(writeResultSchema(MutationSchema.parse(mutation)).safeParse({ ...result, reference: differentUid }).success).toBe(false);
    const keyed = MutationSchema.parse({ action: "put", reference: recordReferences["work-item/companion"](named.owner, "a"), expected: null, content: "file" });
    expect(writeResultSchema(keyed).safeParse({ ...result, reference: recordReferences["work-item/companion"](owner, "a") }).success).toBe(true);
    expect(writeResultSchema(keyed).safeParse({ ...result, reference: recordReferences["work-item/companion"](owner, "b") }).success).toBe(false);
  });
  it("refuses two mutations of one UID under different display names", () => {
    const renamedOwner = OwnerIdentitySchema.parse({ ...owner, name: "renamed" });
    const alias = recordReferences["work-item/meta"](renamedOwner);
    expect(BatchInputSchema.safeParse({ writes: [mutation, { ...mutation, reference: alias }], provenance }).success).toBe(false);
  });
  it("binds an atomic result to every requested write", () => {
    const other = recordReferences["work-item/notes"](owner);
    const input = BatchInputSchema.parse({ writes: [mutation, { action: "put", reference: other, expected: null, content: "notes" }], provenance });
    const schema = batchResultSchema(input);
    expect(schema.safeParse({ batchId: "batch", writes: [{ reference, version, conflicts: [] }] }).success).toBe(false);
    expect(schema.safeParse({ batchId: "batch", writes: [{ reference, version, conflicts: [] }, { reference: other, version, conflicts: [] }] }).success).toBe(true);
  });
  it("rejects duplicate canonical results for mixed name and UID requests", () => {
    const named = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({type:"work-item",name:owner.name}));
    const input = BatchInputSchema.parse({writes:[mutation,{...mutation,reference:named}],provenance});
    expect(batchResultSchema(input).safeParse({batchId:"batch",writes:[{reference,version,conflicts:[]},{reference,version,conflicts:[]}]}).success).toBe(false);
    const distinct = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({...owner,uid:"22222222-2222-4222-8222-222222222222"}));
    const generations = BatchInputSchema.parse({writes:[mutation,{...mutation,reference:distinct}],provenance});
    expect(batchResultSchema(generations).safeParse({batchId:"batch",writes:[{reference,version,conflicts:[]},{reference:distinct,version,conflicts:[]}]}).success).toBe(true);
  });
  it.each([
    {}, { verb: "", lifecycleAction: "update" }, { ...provenance, reference },
    { ...provenance, ownerUid: "11111111-1111-4111-8111-111111111111" }, { ...provenance, batchId: "batch" },
  ])("rejects caller provenance containing backend facts: %j", (value) => {
    expect(CallerProvenanceSchema.safeParse(value).success).toBe(false);
  });
  it("keeps empty task captures and rejects duplicate commits", () => {
    expect(LinksSchema.safeParse({ landingCommit: { sha }, taskCaptures: { "1.1": [] } }).success).toBe(true);
    expect(LinksSchema.safeParse({ taskCaptures: { "1.1": [{ sha, patchId: sha }, { sha }] } }).success).toBe(false);
  });
  it("preserves both labeled sides and the precise conflict locus", () => {
    const conflict = { record: reference, location: { kind: "entry", id: "abcdef12" }, base: "base", baseSection: "One",
      current: { content: "current", section: "Two", label }, incoming: { content: "incoming", section: "Three", label } };
    expect(ConflictRecordSchema.safeParse(conflict).success).toBe(true);
    expect(ConflictRecordSchema.safeParse({ ...conflict, baseSection: undefined }).success).toBe(false);
    expect(ConflictRecordSchema.safeParse({ ...conflict, current: { ...conflict.current, section: undefined } }).success).toBe(false);
    expect(ConflictRecordSchema.safeParse({ ...conflict, incoming: { ...conflict.incoming, section: undefined } }).success).toBe(false);
    expect(ConflictRecordSchema.safeParse({ ...conflict, base: undefined }).success).toBe(false);
    expect(ConflictRecordSchema.safeParse({ ...conflict, location: { kind: "path", path: "file" } }).success).toBe(false);
    expect(ConflictRecordSchema.safeParse({ ...conflict, incoming: { content: "incoming" } }).success).toBe(false);
    expect(MutationSchema.safeParse({ ...mutation, resolves: [reference] }).success).toBe(false);
  });
});

describe("lookup and result envelopes", () => {
  it("pairs historical content with its version and represents removal explicitly", () => {
    const entry = {reference,version,content:"",provenance:{message:"saved\n"}};
    expect(HistoryEntrySchema.parse(entry)).toEqual(entry);
    expect(HistoryEntrySchema.parse({...entry,version:null,content:null})).toEqual({...entry,version:null,content:null});
    expect(HistoryEntrySchema.safeParse({...entry,version:null}).success).toBe(false);
    expect(HistoryEntrySchema.safeParse({...entry,content:null}).success).toBe(false);
    expect(HistoryEntrySchema.safeParse({...entry,content:undefined}).success).toBe(false);
  });
  it.each([
    { kind: "work-unit", slug: "example" }, { kind: "partial-errand", slug: "example", claimId: null },
    { kind: "errand", slug: "example", claimId: "a".repeat(32) }, { kind: "groom", slug: "example", claimId: "a".repeat(32) },
    { kind: "housekeep", slug: "example", claimId: "a".repeat(32) },
  ])("accepts a marker's exact claim: %j", (claim) => expect(CheckoutClaimSchema.safeParse(claim).success).toBe(true));
  it.each([
    { kind: "branch", slug: "example" }, { kind: "errand", slug: "example" },
    { kind: "errand", slug: "example", claimId: "short" },
    { kind: "groom", slug: "example", claimId: "a".repeat(513) },
    { kind: "work-unit", slug: "example", claimId: "a".repeat(32) }, { kind: "partial-errand", slug: "example" },
    { kind: "groom", slug: "../bad", claimId: "a".repeat(32) },
  ])("rejects a nonexistent or malformed claim: %j", (claim) => expect(CheckoutClaimSchema.safeParse(claim).success).toBe(false));
  it("keeps task captures only on work-item resolutions", () => {
    expect(LookupResultSchema.safeParse({ reference, taskIds: [] }).success).toBe(true);
    expect(LookupResultSchema.safeParse({ reference, taskIds: ["1.1", "1.2"] }).success).toBe(true);
    expect(LookupResultSchema.safeParse({ reference: recordReferences["personal/inbox"](person), taskIds: [] }).success).toBe(false);
  });
  it("admits only ok and refused operation results", () => {
    const schema = storeResultSchema(z.string());
    expect(schema.safeParse({ status: "ok", result: "value" }).success).toBe(true);
    expect(schema.safeParse({ status: "refused", refusal: missing }).success).toBe(true);
    expect(schema.safeParse({ status: "failed", result: "value" }).success).toBe(false);
  });
});

describe("whole-record conflict values", () => {
  const present = { reference, content: "", version, formatVersion: 1, placement: { kind: "active" }, links: {} };
  const conflict = { record: reference, location: { kind: "record" }, base: present,
    current: { value: null, label }, incoming: { value: present, label } };
  it("keeps absence distinct from empty content and preserves full metadata", () => {
    expect(ConflictRecordSchema.parse(conflict)).toEqual(conflict);
    const creation = { ...conflict, base: null, current: { value: present, label } };
    expect(ConflictRecordSchema.parse(creation)).toEqual(creation);
  });
  it.each([
    { ...present, version: undefined }, { ...present, formatVersion: 0 },
    { ...present, placement: undefined }, { ...present, placement: { kind: "completed", quarter: "2026-q4" } },
    { ...present, reference: recordReferences["work-item/record"](owner), placement: { kind: "backlog", commitment: "planned" } },
    { ...present, reference: recordReferences["work-item/notes"](owner) },
    { ...present, fields: { derived: true } }, { ...present, conflicts: [] },
    { ...present, links: { branch: { repository: "owner/repo" } } },
  ])("validates preserved values and excludes derived fields: %j", (invalid) => {
    expect(ConflictRecordSchema.safeParse({ ...conflict, incoming: { value: invalid, label } }).success).toBe(false);
  });
});

describe("refusals and outcomes", () => {
  it.each(["malformed", "oversized", "unreadable", "unknown-format-version", "key-mismatch"])("names the entry of a %s diagnostic", (kind) => {
    expect(ListingDiagnosticSchema.safeParse({ kind, key: "entry", condition: "Observed", remedy }).success).toBe(true);
    expect(ListingDiagnosticSchema.safeParse({ kind, condition: "Observed", remedy }).success).toBe(false);
  });
  const examples = [missing,
    { code: "version-conflict", class: "recoverable", records: [reference] },
    { code: "record-malformed", class: "recoverable", reference, rule: "format" },
    { code: "identity-mismatch", class: "recoverable", expected: reference, actual: reference },
    { code: "ambiguous-match", class: "recoverable", candidates: [reference, reference] },
    { code: "lock-held", class: "recoverable", lock: "surface" },
    { code: "namespace-corrupt", class: "terminal", namespace: "store" },
    { code: "checkout-not-writable", class: "recoverable", checkout: "writable" },
    { code: "retries-exhausted", class: "recoverable", retryCount: 3, waitedMs: 30 },
    { code: "unreachable", class: "recoverable", cause: "network" },
    { code: "refused", class: "terminal", message: "repair permissions" },
  ];
  it.each(examples)("requires the assigned class, condition and remedy for $code", (example) => {
    const refusal = { condition: "Observed condition", remedy, ...example };
    expect(StoreRefusalSchema.safeParse(refusal).success).toBe(true);
    expect(StoreRefusalSchema.safeParse({ ...refusal, class: example.class === "terminal" ? "recoverable" : "terminal" }).success).toBe(false);
    expect(StoreRefusalSchema.safeParse({ ...refusal, condition: undefined }).success).toBe(false);
    expect(StoreRefusalSchema.safeParse({ ...refusal, remedy: undefined }).success).toBe(false);
  });
  it.each(Object.entries(UNSUPPORTED_CASES))("assigns unsupported %s to its documented class", (unsupported, classification) => {
    expect(StoreRefusalSchema.safeParse({ code: "unsupported", class: classification, case: unsupported, condition: "Interim boundary", remedy }).success).toBe(true);
    expect(StoreRefusalSchema.safeParse({ code: "unsupported", class: classification === "terminal" ? "recoverable" : "terminal", case: unsupported, condition: "Interim boundary", remedy }).success).toBe(false);
  });
  it("rejects invented refusals and incomplete retry diagnostics", () => {
    expect(StoreRefusalSchema.safeParse({ ...missing, code: "invented" }).success).toBe(false);
    expect(StoreRefusalSchema.safeParse({ code: "retries-exhausted", class: "recoverable", condition: "race", remedy }).success).toBe(false);
  });
  it("requires every work-item record's placement and complete listing metadata", () => {
    expect(StoreRecordSchema.safeParse(record).success).toBe(true);
    expect(StoreRecordSchema.safeParse({ ...record, placement: undefined }).success).toBe(false);
    const complete = { status: "complete", records: [record], diagnostics: [], missed: false, asOf: StateVersionSchema.parse("saved") };
    expect(ListingOutcomeSchema.safeParse(complete).success).toBe(true);
    expect(ListingOutcomeSchema.safeParse({ ...complete, missed: undefined }).success).toBe(false);
    expect(ListingFilterSchema.safeParse({ locations: ["parked"] }).success).toBe(false);
  });
  it("reads terminal lineage independently of the retired origin's placement", () => {
    const transition = recordReferences["lineage/transition"](owner);
    expect(StoreRecordSchema.safeParse({ reference: transition, content: "transition", version, formatVersion: 1, conflicts: [] }).success).toBe(true);
  });
  it("reports no remote and no identity independently while other families publish", () => {
    const result = { states: [{ status: "no-remote" }, { status: "no-identity", families: ["personal"], remedy: { text: "Configure arc.identity" } }], publishes: [{ status: "pushed", families: ["work-item"] }] };
    expect(SyncResultSchema.safeParse(result).success).toBe(true);
    expect(SyncResultSchema.safeParse({ ...result, publishes: [{ status: "pushed", families: [] }] }).success).toBe(false);
    expect(SyncResultSchema.safeParse({ states: [{ status: "no-identity", families: [], remedy }], publishes: [] }).success).toBe(false);
    expect(SyncResultSchema.safeParse({ states: [{ status: "no-remote" }, { status: "no-remote" }], publishes: [] }).success).toBe(false);
  });
  it("exposes only whether state lives off branch", () => {
    expect(StoreCapabilitiesSchema.safeParse({ stateOffBranch: true }).success).toBe(true);
    expect(StoreCapabilitiesSchema.safeParse({ stateOffBranch: true, merges: true }).success).toBe(false);
  });
});
