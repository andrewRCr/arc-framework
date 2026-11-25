/** Boundary access retains the filesystem contract while selecting explicit stores. */
import { expect, it } from "vitest";
import { canonicalize, digestBytes } from "../../../../../../../src/lib/kernel/canonical/canonical-json.js";
import { prepareSubmissionBoundaryPut, readSubmissionBoundary, readSubmissionBoundaryVersioned, writeSubmissionBoundary } from
  "../../../../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { parseIntegrationBoundaryLocus } from
  "../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";

import { SubmissionBoundaryVersionConflictError } from "../../../../../../../src/lib/work-unit/submission-boundary-store.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../../../../src/lib/store/identity.js";
import { createLifecycleHarness } from "../../../../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../../../../helpers/store/model.js";
import { createReviewHarness } from "../../../../../../helpers/store/review-harness.js";
import { candidateFixture } from "../../../../../../helpers/store/tracked-write-fixture.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { boundaryLoci, boundaryV2Fixture } from "../../../../../../fixtures/review-boundary.js";

it("reads the explicit filesystem boundary and exact byte version", async () => {
  const boundary = parseIntegrationBoundaryLocus(boundaryFixture());
  const content = canonicalize(boundary);
  const fs = { readFile: async () => content };
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", fs))
    .resolves.toEqual({ boundary, version: digestBytes(Buffer.from(content)) });
});

it("reads established boundary absence as null", async () => {
  const fs = { readFile: async (): Promise<string> => { throw Object.assign(new Error("Absent"), { code: "ENOENT" }); } };
  await expect(readSubmissionBoundary("/unavailable", "example", fs)).resolves.toBeNull();
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", fs)).resolves.toEqual({ boundary: null, version: null });
});


it.each(["direct", "options"])("preserves boundary writes and stale-writer refusal through %s filesystem input", async (mode) => {
  const files = new Map<string, string>();
  const fs = { readFile: async (path: string) => {
    const content = files.get(path);
    if (content === undefined) throw Object.assign(new Error("Absent"), { code: "ENOENT" });
    return content;
  }, writeFile: async (path: string, content: string) => { files.set(path, content); },
  withLock: async <T>(_path: string, operation: () => Promise<T>) => operation() };
  const input = mode === "direct" ? fs : { fs };
  const value = parseIntegrationBoundaryLocus(boundaryFixture());
  const writing = writeSubmissionBoundary("/unavailable", value, null, input);
  await expect(writing).resolves.toBe(".arc/system/.internal/candidates/example.boundary.json");
  const path = await writing;
  const version = digestBytes(Buffer.from(await fs.readFile(`/unavailable/${path}`)));
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", input))
    .resolves.toEqual({ boundary: value, version });
  await expect(writeSubmissionBoundary("/unavailable", value, null, input))
    .rejects.toBeInstanceOf(SubmissionBoundaryVersionConflictError);
  await expect(readSubmissionBoundary("/unavailable", "example", input)).resolves.toEqual(value);
  await expect(writeSubmissionBoundary("/unavailable", value, version, input)).resolves.toBe(path);
});

it.each(["malformed", "wrong-owner"])("rejects %s boundary content returned by the store", async (fault) => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const reference = recordReferences["review/integration-boundary"](OwnerIdentitySchema.parse({ type: "work-item", name: "example" }));
  const stored = await h.seed(reference, JSON.stringify(boundaryV2Fixture()));
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored boundary fixture");
  const valid = raw.content;
  raw.content = fault === "malformed" ? "{unreadable" : JSON.stringify(boundaryFixture("another"));
  const read = readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner });
  if (fault === "malformed") {
    await expect(read).rejects.toMatchObject({ offBranch: true, refusal: { code: "record-malformed", class: "recoverable",
      reference: stored.reference, condition: expect.stringMatching(/^The stored review\/integration-boundary record does not match its schema: /u),
      remedy: { text: "Restore a valid version of the record, then retry." } } });
    raw.content = valid;
    await expect(readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner }))
      .resolves.toEqual({ boundary: IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture()), version: stored.version });
  } else await expect(read).rejects.toThrow(/belongs to work unit `another`, not `example`/u);
});

it("rejects native boundary content its schema refuses as a malformed record naming the issue", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const reference = recordReferences["review/integration-boundary"](owner);
  const stored = await h.seed(reference, JSON.stringify(boundaryV2Fixture()));
  const raw = h.store.state.records.get(recordKey(stored.reference));
  if (raw === undefined) throw new Error("Missing stored boundary fixture");
  const valid = raw.content;
  raw.content = JSON.stringify({ ...boundaryV2Fixture(), locus: "unknown-locus" });
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner })).rejects.toMatchObject({
    offBranch: true, refusal: { code: "record-malformed", reference: stored.reference,
      condition: expect.stringMatching(/^The stored review\/integration-boundary record does not match its schema: \S/u) } });
  raw.content = valid;
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner }))
    .resolves.toMatchObject({ version: stored.version });
});

it("writes a native boundary through checked storage with its opaque compare-and-swap version and no tracked path", async () => {
  const h = createReviewHarness(), candidate = candidateFixture();
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(),
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest });
  const input = { store: h.store, owner: primary.reference.owner };
  await expect(writeSubmissionBoundary("/unavailable", boundary, null, input)).resolves.toBeNull();
  const reference = recordReferences["review/integration-boundary"](primary.reference.owner);
  const stored = await h.store.read({ reference });
  if (stored.status !== "ok") throw new Error("Expected stored boundary");
  expect(JSON.parse(stored.result.content)).toEqual(boundary);
  expect(stored.result.version).not.toMatch(/^sha256:/u);
  await expect(writeSubmissionBoundary("/unavailable", boundary, null, input)).rejects.toBeInstanceOf(SubmissionBoundaryVersionConflictError);
  await expect(writeSubmissionBoundary("/unavailable", boundary, stored.result.version, input)).resolves.toBeNull();
});

it.each(boundaryLoci)("reads native %s content with the exact opaque store version", async (locus) => {
  const h = createReviewHarness(), candidate = candidateFixture();
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(locus),
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest });
  await h.seedBoundary(primary.reference.owner, boundary);
  const stored = await h.store.read({ reference: recordReferences["review/integration-boundary"](primary.reference.owner) });
  if (stored.status !== "ok") throw new Error("Expected checked native boundary");
  const input = { store: h.store, owner: primary.reference.owner };
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", input))
    .resolves.toEqual({ boundary, version: stored.result.version });
  await expect(readSubmissionBoundary("/unavailable", "example", input)).resolves.toEqual(boundary);
});

it("refuses native boundary access that names no exact work item, and reads once its owner is supplied", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  const value = IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture());
  await h.seed(recordReferences["review/integration-boundary"](owner), JSON.stringify(value));
  const remedy = /need the invocation's exact work item\. Run the command from example's checkout/u;
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store })).rejects.toThrow(remedy);
  await expect(writeSubmissionBoundary("/unavailable", value, null, { store: h.store })).rejects.toThrow(remedy);
  expect((await readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner })).boundary).toEqual(value);
});

it("refuses natively a bound work item's boundary naming another work unit, naming both, and reads the named one's", async () => {
  const h = createLifecycleHarness();
  const other = (await h.seedMeta("other")).reference.owner, { owner } = (await h.seedMeta("example")).reference;
  const value = IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture());
  await h.seed(recordReferences["review/integration-boundary"](other), JSON.stringify({ ...value, workUnit: "other" }));
  await h.seed(recordReferences["review/integration-boundary"](owner), JSON.stringify(value));
  await expect(readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner: other })).rejects.toMatchObject({
    code: "invalid-input", condition: "The bound work item's submission boundary belongs to work unit `other`, not `example`." });
  expect((await readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner })).boundary).toEqual(value);
});

it("refuses a boundary put under a selected work item another work unit names, and prepares the named one's", async () => {
  const h = createLifecycleHarness();
  const other = (await h.seedMeta("other")).reference.owner, { owner } = (await h.seedMeta("example")).reference;
  const value = IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture());
  expect(() => prepareSubmissionBoundaryPut(value, null, other)).toThrow(expect.objectContaining({
    code: "invalid-input", condition: "The selected work item `other` cannot hold work unit `example`'s review record." }));
  await expect(writeSubmissionBoundary("/unavailable", value, null, { store: h.store, owner: other }))
    .rejects.toMatchObject({ code: "invalid-input" });
  expect(prepareSubmissionBoundaryPut(value, null, owner).reference)
    .toEqual(recordReferences["review/integration-boundary"](owner));
});

it("writes a boundary selected under a work item's earlier name to the work unit its UID now holds", async () => {
  const h = createLifecycleHarness();
  const { owner } = (await h.seedMeta("example")).reference;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected a native work item");
  const earlier = OwnerIdentitySchema.parse({ type: "work-item", name: "former", uid: owner.uid });
  const stranger = OwnerIdentitySchema.parse({ type: "work-item", name: "former", uid: "123e4567-e89b-42d3-a456-426614174777" });
  const value = IntegrationBoundaryLocusV2Schema.parse(boundaryV2Fixture());
  await expect(writeSubmissionBoundary("/unavailable", value, null, { store: h.store, owner: stranger }))
    .rejects.toMatchObject({ code: "invalid-input",
      condition: "The selected work item `former` cannot hold work unit `example`'s review record." });
  await writeSubmissionBoundary("/unavailable", value, null, { store: h.store, owner: earlier });
  expect((await readSubmissionBoundaryVersioned("/unavailable", "example", { store: h.store, owner })).boundary).toEqual(value);
});
