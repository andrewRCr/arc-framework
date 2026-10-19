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
  await h.seedMeta("example");
  const record = candidateFixture();
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, serializeCandidateManagedRecord(record));
  expect(stored.version).not.toMatch(/^sha256:/u);
  await expect(readCandidateRecordVersioned("/unavailable", "example", { store: h.store }))
    .resolves.toEqual({ record, version: stored.version });
});

it("reads established absence as null through every Candidate reader", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const options = { store: h.store };
  await expect(readCandidateRecord("/unavailable", "example", options)).resolves.toBeNull();
  await expect(readCandidateRecordVersioned("/unavailable", "example", options)).resolves.toEqual({ record: null, version: null });
  await expect(readCandidateRecordVersion("/unavailable", "example", options)).resolves.toBeNull();
});

it.each(["malformed", "wrong-owner"])("rejects %s Candidate content returned by the store", async (fault) => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const reference = recordReferences["review/candidate"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, serializeCandidateManagedRecord(candidateFixture()));
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored Candidate fixture");
  raw.content = fault === "malformed" ? "{unreadable" : serializeCandidateManagedRecord(candidateFixture("another"));
  const options = { store: h.store };
  await expect(readCandidateRecordVersion("/unavailable", "example", options)).resolves.toBe(stored.version);
  await expect(readCandidateRecordVersioned("/unavailable", "example", options))
    .rejects.toThrow(fault === "malformed" ? /Candidate record is malformed/u : /work unit does not match its path/u);
});

it("writes through the supplied store and returns the established record path", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const record = candidateFixture();
  const options = { store: h.store };
  await expect(writeCandidateRecord("/unavailable", "example", record, null, options))
    .resolves.toBe(".arc/system/.internal/candidates/example.json");
  await expect(readCandidateRecord("/unavailable", "example", options)).resolves.toEqual(record);
});

it("preserves a newer Candidate when a writer holds a stale version, then permits a fresh retry", async () => {
  const h = createLifecycleHarness();
  await h.seedMeta("example");
  const options = { store: h.store };
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
  await expect(writeCandidateRecord("/unavailable", "example", record, current.version, options))
    .resolves.toBe(".arc/system/.internal/candidates/example.json");
});

it("puts a Candidate in the caller's atomic batch beside a primary update", async () => {
  const h = createLifecycleHarness();
  const meta = await h.seedMeta("example");
  const record = candidateFixture();
  await expect(h.store.batch({ writes: [prepareCandidateRecordPut("example", record, null),
    { action: "put", reference: meta.reference, expected: meta.version, placement: { kind: "active" },
      content: writeMetaPriority(meta.content, "P1") }], provenance: { verb: "update-candidate", lifecycleAction: "edit" } })).resolves.toMatchObject({ status: "ok" });
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store })).resolves.toEqual(record);
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
  await h.seedMeta("example");
  h.store.state.corrupt = true;
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store }))
    .rejects.toThrow(/structurally corrupt.*Rebuild the namespace index/u);
  h.store.state.corrupt = false;
  await expect(readCandidateRecord("/unavailable", "example", { store: h.store })).resolves.toBeNull();
});
