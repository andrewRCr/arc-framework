/** Candidate access preserves the chosen store and its opaque record versions. */
import { expect, it } from "vitest";
import { readCandidateRecord, readCandidateRecordVersion, readCandidateRecordVersioned, writeCandidateRecord, prepareCandidateRecordPut } from "../../../../../../../src/lib/store/kinds/review/candidate/access.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { digestBytes } from "../../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { writeMetaPriority } from "../../../../../../../src/lib/store/kinds/meta/writers.js";
import { serializeCandidateManagedRecord, createCandidateAttestation } from "../../../../../../../src/lib/work-unit/candidate-attestation.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../../../../helpers/store/model.js";
import { CandidateRecordVersionConflictError } from "../../../../../../../src/lib/work-unit/candidate-record-store.js";
import { candidateFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";

it("reads through the supplied store and preserves its non-digest version", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const record = candidateFixture();
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, serializeCandidateManagedRecord(record));
  expect(stored.version).not.toMatch(/^sha256:/u);
  await expect(readCandidateRecordVersioned("/unavailable", "example", { store: h.store, owner }))
    .resolves.toEqual({ record, version: stored.version });
});

it("reads established absence as null through every Candidate reader", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const options = { store: h.store, owner };
  await expect(readCandidateRecord("/unavailable", "example", options)).resolves.toBeNull();
  await expect(readCandidateRecordVersioned("/unavailable", "example", options)).resolves.toEqual({ record: null, version: null });
  await expect(readCandidateRecordVersion("/unavailable", "example", options)).resolves.toBeNull();
});

it.each(["malformed", "wrong-owner"])("rejects %s Candidate content returned by the store", async (fault) => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, serializeCandidateManagedRecord(candidateFixture()));
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored Candidate fixture");
  const valid = raw.content;
  raw.content = fault === "malformed" ? "{unreadable" : serializeCandidateManagedRecord(candidateFixture("another"));
  const options = { store: h.store, owner };
  await expect(readCandidateRecordVersion("/unavailable", "example", options)).resolves.toBe(stored.version);
  const read = readCandidateRecordVersioned("/unavailable", "example", options);
  if (fault === "malformed") {
    await expect(read).rejects.toMatchObject({ offBranch: true, refusal: { code: "record-malformed", class: "recoverable",
      reference: stored.reference, condition: expect.stringMatching(/^The stored review\/candidate record does not match its schema: /u),
      remedy: { text: "Restore a valid version of the record, then retry." } } });
    raw.content = valid;
    await expect(readCandidateRecordVersioned("/unavailable", "example", options)).resolves.toEqual({ record: candidateFixture(),
      version: stored.version });
  } else await expect(read).rejects.toThrow(/belongs to work unit `another`, not `example`/u);
});

it("writes through the supplied store and returns no tracked path, since no tracked file holds the record", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const record = candidateFixture();
  const options = { store: h.store, owner };
  await expect(writeCandidateRecord("/unavailable", "example", record, null, options)).resolves.toBeNull();
  await expect(readCandidateRecord("/unavailable", "example", options)).resolves.toEqual(record);
});

it("preserves a newer Candidate when a writer holds a stale version, then permits a fresh retry", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const options = { store: h.store, owner };
  const record = candidateFixture();
  await writeCandidateRecord("/unavailable", "example", record, null, options);
  const stale = await readCandidateRecordVersioned("/unavailable", "example", options);
  const changed = { ...record, attestation: createCandidateAttestation({ ...record.attestation,
    subject: record.subject, attestedAt: "2026-08-13T14:00:00.000Z" }) };
  await writeCandidateRecord("/unavailable", "example", changed, stale.version, options);
  const current = await readCandidateRecordVersioned("/unavailable", "example", options);
  expect(current.record).toEqual(changed);
  await expect(writeCandidateRecord("/unavailable", "example", record, stale.version, options))
    .rejects.toBeInstanceOf(CandidateRecordVersionConflictError);
  await expect(readCandidateRecordVersioned("/unavailable", "example", options)).resolves.toEqual(current);
  await expect(writeCandidateRecord("/unavailable", "example", record, current.version, options)).resolves.toBeNull();
});

it("puts a Candidate in the caller's atomic batch beside a primary update", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example");
  const record = candidateFixture();
  await expect(h.store.batch({ writes: [prepareCandidateRecordPut("example", record, null),
    { action: "put", reference: meta.reference, expected: meta.version, placement: { kind: "active" },
      content: writeMetaPriority(meta.content, "P1") }], provenance: { verb: "update-candidate", lifecycleAction: "edit" } })).resolves.toMatchObject({ status: "ok" });
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner: meta.reference.owner })).resolves.toEqual(record);
  expect(lifecycleSuccess(await h.store.read({ reference: meta.reference }))).toMatchObject({ fields: { priority: "P1" } });
});

it.each(["direct", "options"])("retains the explicit filesystem adapter through %s input", async (mode) => {
  const files = new Map<string, string>();
  const fs = { readFile: async (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw Object.assign(new Error("Absent"), { code: "ENOENT" });
    return content;
  }, writeFile: async (path: string, content: string) => { files.set(path, content); },
  withLock: async <T>(_path: string, operation: () => Promise<T>) => operation() };
  const input = mode === "direct" ? fs : { fs };
  await expect(readCandidateRecord("/unavailable", "example", input)).resolves.toBeNull();
  const record = candidateFixture();
  const path = await writeCandidateRecord("/unavailable", "example", record, null, input);
  const version = digestBytes(Buffer.from(await fs.readFile(`/unavailable/${path}`)));
  await expect(readCandidateRecordVersioned("/unavailable", "example", input)).resolves.toEqual({ record, version });
  await expect(readCandidateRecordVersion("/unavailable", "example", input)).resolves.toBe(version);
  await expect(writeCandidateRecord("/unavailable", "example", record, null, input))
    .rejects.toBeInstanceOf(CandidateRecordVersionConflictError);
});

it("surfaces non-absence store conditions and remedies, then reads after repair", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  h.store.state.corrupt = true;
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner }))
    .rejects.toThrow(/structurally corrupt.*Rebuild the namespace index/u);
  h.store.state.corrupt = false;
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner })).resolves.toBeNull();
});

it("retains the selected work-item generation after its slug is reused", async () => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("example");
  const record = candidateFixture();
  const stored = await h.seed(recordReferences["review/candidate"](first.reference.owner), serializeCandidateManagedRecord(record));
  lifecycleSuccess(await h.store.write({ action: "remove", reference: first.reference, expected: first.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const second = await h.seedMeta("example");
  const replacement = { ...record, attestation: createCandidateAttestation({ ...record.attestation,
    subject: record.subject, attestedAt: "2026-08-13T14:00:00.000Z" }) };
  await h.seed(recordReferences["review/candidate"](second.reference.owner), serializeCandidateManagedRecord(replacement));
  const options = { store: h.store, owner: first.reference.owner };
  expect(await readCandidateRecordVersioned("/unavailable", "example", options)).toEqual({ record, version: stored.version });
  expect(await readCandidateRecordVersion("/unavailable", "example", options)).toBe(stored.version);
  const updated = { ...record, attestation: createCandidateAttestation({ ...record.attestation,
    subject: record.subject, attestedAt: "2026-08-14T14:00:00.000Z" }) };
  await expect(writeCandidateRecord("/unavailable", "example", updated, stored.version, options)).resolves.toBeNull();
  expect(await readCandidateRecord("/unavailable", "example", options)).toEqual(updated);
  expect(await readCandidateRecord("/unavailable", "example", { store: h.store, owner: second.reference.owner }))
    .toEqual(replacement);
});

it("refuses conflicted Candidate authority and resumes after resolution", async () => {
  const { createMemoryRemote } = await import("../../../../../../helpers/store/sync.js");
  const { ReferenceBackend } = await import("../../../../../../helpers/store/reference-backend.js");
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example");
  const reference = recordReferences["review/candidate"](meta.reference.owner);
  const record = candidateFixture();
  await h.seed(reference, serializeCandidateManagedRecord(record));
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  for (const [store, attestedAt] of [[h.store, "2026-08-13T14:00:00.000Z"], [writer, "2026-08-14T14:00:00.000Z"]] as const) {
    const before = lifecycleSuccess(await store.read({ reference }));
    const changed = { ...record, attestation: createCandidateAttestation({ ...record.attestation, subject: record.subject, attestedAt }) };
    lifecycleSuccess(await store.write({ action: "put", reference, expected: before.version,
      content: serializeCandidateManagedRecord(changed), provenance: { verb: "review", lifecycleAction: "edit" } }));
  }
  lifecycleSuccess(await h.store.push());
  const disputed = lifecycleSuccess(await h.store.read({ reference }));
  expect(disputed.conflicts.length).toBeGreaterThan(0);
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner: meta.reference.owner }))
    .rejects.toThrow(/conflict.*Resolve.*retry/isu);
  lifecycleSuccess(await h.store.write({ action: "put", reference, expected: disputed.version,
    content: disputed.content, resolves: disputed.conflicts, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await readCandidateRecord("/unavailable", "example", { store: h.store, owner: meta.reference.owner }))
    .toEqual(JSON.parse(disputed.content));
});

it("refuses native access that names no exact work item, and reads once its owner is supplied", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const record = candidateFixture();
  await h.seed(recordReferences["review/candidate"](owner), serializeCandidateManagedRecord(record));
  const remedy = /need the invocation's exact work item\. Run the command from example's checkout/u;
  await expect(readCandidateRecordVersioned("/unavailable", "example", { store: h.store })).rejects.toThrow(remedy);
  await expect(readCandidateRecordVersion("/unavailable", "example", { store: h.store })).rejects.toThrow(remedy);
  await expect(writeCandidateRecord("/unavailable", "example", record, null, { store: h.store })).rejects.toThrow(remedy);
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner })).resolves.toEqual(record);
});

it("refuses native access with no work item as the caller's input to correct", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  await expect(readCandidateRecordVersioned("/unavailable", "example", { store: h.store })).rejects.toMatchObject({
    code: "invalid-input", condition: "Review records for example need the invocation's exact work item." });
});

it("refuses natively a bound work item's Candidate naming another work unit, naming both, and reads the named one's", async () => {
  const h = createLifecycleHarness();
  const other = (await h.seedMeta("other")).reference.owner, { owner } = (await h.seedMeta("example")).reference;
  const record = candidateFixture();
  await h.seed(recordReferences["review/candidate"](other), serializeCandidateManagedRecord(candidateFixture("other")));
  await h.seed(recordReferences["review/candidate"](owner), serializeCandidateManagedRecord(record));
  await expect(readCandidateRecordVersioned("/unavailable", "example", { store: h.store, owner: other })).rejects.toMatchObject({
    code: "invalid-input", condition: "The bound work item's Candidate record belongs to work unit `other`, not `example`.",
    remedy: { text: "Name work unit `other`, or run the command from `example`'s checkout." } });
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner })).resolves.toEqual(record);
});

it("refuses a Candidate put under a selected work item another work unit names, and prepares the named one's", async () => {
  const h = createLifecycleHarness();
  const other = (await h.seedMeta("other")).reference.owner, { owner } = (await h.seedMeta("example")).reference;
  const record = candidateFixture();
  expect(() => prepareCandidateRecordPut("example", record, null, other)).toThrow(expect.objectContaining({
    code: "invalid-input", condition: "The selected work item `other` cannot hold work unit `example`'s review record." }));
  await expect(writeCandidateRecord("/unavailable", "example", record, null, { store: h.store, owner: other }))
    .rejects.toMatchObject({ code: "invalid-input" });
  expect(prepareCandidateRecordPut("example", record, null, owner).reference).toEqual(recordReferences["review/candidate"](owner));
});

it("writes a Candidate selected under a work item's earlier name to the work unit its UID now holds", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a native work item");
  const earlier = OwnerIdentitySchema.parse({ type: "work-item", name: "former", uid: owner.uid });
  const stranger = OwnerIdentitySchema.parse({ type: "work-item", name: "former", uid: "123e4567-e89b-42d3-a456-426614174777" });
  const record = candidateFixture();
  await expect(writeCandidateRecord("/unavailable", "example", record, null, { store: h.store, owner: stranger }))
    .rejects.toMatchObject({ code: "invalid-input",
      condition: "The selected work item `former` cannot hold work unit `example`'s review record." });
  await writeCandidateRecord("/unavailable", "example", record, null, { store: h.store, owner: earlier });
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store, owner })).resolves.toEqual(record);
});
