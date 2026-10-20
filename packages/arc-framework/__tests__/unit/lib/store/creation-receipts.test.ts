/** Allocation evidence stays backend-owned, complete and durable across every selected entry. */
import { expect, it } from "vitest";
import { BatchCreationReceiptSchema, BatchInputSchema, CallerProvenanceSchema, CreatedOwnersSchema, CreatedOwnerSchema,
  HistoryEntrySchema, OwnerIdentitySchema, recordReferences, type CreatedOwner, type WriteCheckInput } from "../../../../src/lib/store/index.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { success, testProvenance } from "../../../helpers/store/suite-tools.js";

const uid = "11111111-1111-4111-8111-111111111111";
const otherUid = "22222222-2222-4222-8222-222222222222";
const birth: CreatedOwner = CreatedOwnerSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example", uid } });
const receipt = { schemaVersion: 1, batchId: "batch", createdOwners: [birth] };

it("distinguishes unavailable and complete-none and binds accepted receipts to their own batch", () => {
  const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse(birth.owner));
  const entry = { reference, version: "version", content: "", provenance: { ...testProvenance, reference, batchId: "batch" } };
  expect(HistoryEntrySchema.parse(entry).creationReceipt).toBeUndefined();
  expect(HistoryEntrySchema.parse({ ...entry, creationReceipt: { ...receipt, createdOwners: [] } }).creationReceipt?.createdOwners).toEqual([]);
  expect(HistoryEntrySchema.safeParse({ ...entry, creationReceipt: { ...receipt, batchId: "other" } }).success).toBe(false);
  expect(HistoryEntrySchema.safeParse({ ...entry, provenance: { message: "unstructured" }, creationReceipt: receipt }).success).toBe(false);
  expect(HistoryEntrySchema.parse({ ...entry, version: null, content: null, creationReceipt: receipt }).creationReceipt).toEqual(receipt);
});

it("validates the closed birth domain, generation uniqueness and canonical ordering without requiring unique names", () => {
  expect(CreatedOwnersSchema.parse([birth, { ...birth, owner: { ...birth.owner, uid: otherUid } }])).toHaveLength(2);
  for (const invalid of [
    { ...birth, kind: "work-item/notes" }, { ...birth, kind: "cohort/document" },
    { ...birth, owner: { ...birth.owner, uid: undefined } }, { ...birth, birthKey: "a".repeat(64) },
  ]) expect(CreatedOwnersSchema.safeParse([invalid]).success).toBe(false);
  expect(CreatedOwnersSchema.safeParse([birth, { ...birth, owner: { ...birth.owner, name: "other" } }]).success).toBe(false);
  expect(CreatedOwnersSchema.safeParse([{ ...birth, owner: { ...birth.owner, uid: otherUid } }, birth]).success).toBe(false);
  expect(BatchCreationReceiptSchema.safeParse({ ...receipt, schemaVersion: 2 }).success).toBe(false);
  expect(BatchCreationReceiptSchema.safeParse({ ...receipt, extra: true }).success).toBe(false);
  expect(CallerProvenanceSchema.safeParse({ ...testProvenance, creationReceipt: receipt }).success).toBe(false);
  expect(BatchInputSchema.safeParse({ writes: [], provenance: testProvenance, proposedCreatedOwners: [birth] }).success).toBe(false);
});

it("gives every check the complete candidate inventory and publishes only the finally accepted facts", async () => {
  const attempts: (readonly CreatedOwner[])[] = [];
  let rejecting = true;
  const check = async (input: WriteCheckInput) => {
    expect(input.proposedCreatedOwners).toBeDefined();
    attempts.push(structuredClone(input.proposedCreatedOwners!));
    return rejecting ? [{ rule: "test.admission", condition: "repair the candidate", remedy: { text: "Repair and retry." } }] : [];
  };
  const fixture = createReferenceFixture(undefined, { "work-item/meta": { check }, "work-item/notes": { check }, "cohort/document": { check } });
  const store = fixture.store as ReferenceBackend;
  const refs = [fixture.reference("work-item/meta"), fixture.reference("work-item/notes"), fixture.reference("cohort/document")];
  const writes = refs.map(reference => ({ action: "put" as const, reference, expected: null, content: fixture.content(reference),
    ...(reference.kind === "work-item/meta" ? { placement: { kind: "active" as const } } : {}) }));
  const before = success(await store.version());
  expect(await store.batch({ writes, provenance: testProvenance })).toMatchObject({ status: "refused", refusal: { rule: "test.admission" } });
  expect(success(await store.version())).toBe(before);
  expect(store.state.events).toEqual([]);
  expect(new Set(attempts.map(value => JSON.stringify(value))).size).toBe(1);
  expect(attempts[0]?.map(value => value.kind)).toEqual(["cohort/document", "work-item/meta"]);
  const discarded = attempts[0];
  attempts.length = 0;
  rejecting = false;
  const accepted = success(await store.batch({ writes, provenance: testProvenance }));
  expect(new Set(attempts.map(value => JSON.stringify(value))).size).toBe(1);
  expect(attempts[0]).not.toEqual(discarded);
  const expected = { schemaVersion: 1, batchId: accepted.batchId, createdOwners: attempts[0] };
  for (const result of accepted.writes) expect(success(await store.history({ reference: result.reference }))[0]?.creationReceipt).toEqual(expected);
  const to = success(await store.version());
  const selected = success(await store.changes({ from: before, to, references: [accepted.writes[1]!.reference] }));
  expect(selected).toHaveLength(1);
  expect(selected[0]?.creationReceipt).toEqual(expected);
  expect(success(await fixture.reopen().history({ reference: accepted.writes[0]!.reference }))[0]?.creationReceipt).toEqual(expected);
});

it("does not infer an allocation from a caller-provided UID or a companion, update, promotion or reopen", async () => {
  const candidates: (readonly CreatedOwner[])[] = [];
  const check = async (input: WriteCheckInput) => { candidates.push(structuredClone(input.proposedCreatedOwners!)); return []; };
  const fixture = createReferenceFixture(undefined, { "work-item/meta": { check }, "work-item/record": { check }, "work-item/notes": { check } });
  const owner = OwnerIdentitySchema.parse(birth.owner), reference = recordReferences["work-item/meta"](owner);
  const first = success(await fixture.store.batch({ writes: [{ action: "put", reference, expected: null,
    content: fixture.content(reference), placement: { kind: "active" } }], provenance: testProvenance }));
  expect(candidates).toEqual([[]]);
  const primary = success(await fixture.store.read({ reference: first.writes[0]!.reference }));
  const companion = recordReferences["work-item/notes"](primary.reference.owner);
  success(await fixture.store.batch({ writes: [{ action: "put", reference: companion, expected: null, content: "notes" },
    { action: "put", reference: primary.reference, expected: primary.version, content: fixture.content(primary.reference, "changed"), placement: { kind: "active" } }], provenance: testProvenance }));
  expect(candidates.every(value => value.length === 0)).toBe(true);
  const updated = success(await fixture.store.read({ reference: primary.reference }));
  success(await fixture.store.batch({ writes: [{ action: "put", reference: recordReferences["work-item/record"](owner),
    expected: updated.version, content: fixture.content(reference, "changed-again"), placement: { kind: "active" } }], provenance: { verb: "promote", lifecycleAction: "promote" } }));
  expect(candidates.every(value => value.length === 0)).toBe(true);
  const reopened = success(await fixture.reopen().history({ reference }));
  expect(reopened.every(entry => entry.creationReceipt?.createdOwners.length === 0)).toBe(true);
});

it("retains complete creation facts through filtered cross-family sync and net-zero history", async () => {
  const fixture = createReferenceFixture(), remote = fixture.remote(true)!;
  const meta = fixture.reference("work-item/meta"), cohort = fixture.reference("cohort/document");
  const batch = success(await fixture.store.batch({ provenance: testProvenance, writes: [
    { action: "put", reference: meta, expected: null, content: fixture.content(meta), placement: { kind: "active" } },
    { action: "put", reference: cohort, expected: null, content: fixture.content(cohort) },
  ] }));
  const original = success(await fixture.store.history({ reference: batch.writes[0]!.reference }))[0]!.creationReceipt;
  success(await fixture.store.batch({ provenance: testProvenance, writes: batch.writes.map(result => ({ action: "remove" as const,
    reference: result.reference, expected: result.version! })) }));
  success(await fixture.store.push());
  success(await fixture.store.push());
  for (const result of batch.writes) {
    const history = success(await remote.history({ reference: result.reference }));
    expect(history).toHaveLength(2);
    expect(history[0]?.creationReceipt?.createdOwners).toEqual([]);
    expect(history[1]?.creationReceipt).toEqual(original);
    expect(history[1]?.creationReceipt?.createdOwners).toHaveLength(2);
  }
});

it("refuses a malformed advertised receipt and resumes after authentic evidence is restored", async () => {
  const fixture = createReferenceFixture(), store = fixture.store as ReferenceBackend;
  const reference = fixture.reference("work-item/meta");
  const batch = success(await store.batch({ writes: [{ action: "put", reference, expected: null,
    content: fixture.content(reference), placement: { kind: "active" } }], provenance: testProvenance }));
  const saved = structuredClone(store.state.events[0]!.creationReceipt!);
  store.state.events[0]!.creationReceipt!.batchId = "incorrect";
  expect(await store.history({ reference: batch.writes[0]!.reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal" } });
  store.state.events[0]!.creationReceipt = saved;
  expect(success(await store.history({ reference: batch.writes[0]!.reference }))[0]?.creationReceipt).toEqual(saved);
});

it("refuses partial or conflicting envelopes on another physical entry of the selected batch", async () => {
  const fixture = createReferenceFixture(), store = fixture.store as ReferenceBackend;
  const meta = fixture.reference("work-item/meta"), cohort = fixture.reference("cohort/document");
  const accepted = success(await store.batch({ provenance: testProvenance, writes: [
    { action: "put", reference: meta, expected: null, content: fixture.content(meta), placement: { kind: "active" } },
    { action: "put", reference: cohort, expected: null, content: fixture.content(cohort) },
  ] }));
  const sibling = store.state.events[1]!, complete = structuredClone(sibling.creationReceipt!);
  sibling.creationReceipt = { ...complete, createdOwners: [] };
  expect(await store.history({ reference: accepted.writes[0]!.reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
  delete sibling.creationReceipt;
  expect(await store.history({ reference: accepted.writes[0]!.reference })).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
  sibling.creationReceipt = complete;
  expect(success(await store.history({ reference: accepted.writes[0]!.reference }))[0]?.creationReceipt).toEqual(complete);
});
