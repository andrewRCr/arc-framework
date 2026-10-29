/** Candidate acquisition follows the selected Store's exact work-unit generation. */
import { mkdtemp, mkdir, readFile, writeFile, rm, access, realpath, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectCheckoutSubjectMeta, type SubjectMetaIO } from "../../../../src/lib/locus/subject-meta.js";
import { readStoreWorkUnitEvidence } from "../../../../src/lib/locus/store-work-unit-evidence.js";
import { writeMetaCurrentWorkflow } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { parseCandidateManagedRecord, createCandidateAttestation, createCandidateSubjectSnapshot, serializeCandidateManagedRecord } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { recordKey } from "../../../helpers/store/model.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { projectDurableCandidateTarget } from "../../../helpers/candidate.js";

import { projectCandidateReviewBoundary, projectCandidateFixResumeBoundary } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

function candidate(attestedBy = "andrew") {
  const subject = createCandidateSubjectSnapshot(attestedBy === "andrew" ? [] : [{ path: `src/${attestedBy}.ts`, mode: "100644",
    digest: `sha256:${"d".repeat(64)}`, treatment: "reviewable" }]);
  const attestation = createCandidateAttestation({ workUnit: "demo", subject, baseRevision: "a".repeat(40),
    attestedBy, attestedAt: "2026-10-16T12:00:00.000Z", verificationEvidenceRef: "tasks-demo.md#verification" });
  return { id: attestation.candidateId, content: serializeCandidateManagedRecord({ schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1", attestation, subject, transitions: [], lineageAttestations: [] }) };
}

async function seedPrepared(h: ReturnType<typeof createLifecycleHarness>, candidateId: ReturnType<typeof candidate>["id"] | null) {
  const initial = await h.seedMeta("demo", { taskList: "tasks-demo.md", candidateId }, { kind: "active" }, {
    branches: [{ repository: "project-1", ref: "feat/demo", linkedAs: "adopted", excluded: [] }],
  });
  await h.seed(recordReferences["work-item/task-list"](initial.reference.owner),
    "# Task List: Demo\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  lifecycleSuccess(await h.store.write({ action: "put", reference: initial.reference, expected: initial.version, placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(initial.content, "prepare-work-unit"), provenance: { verb: "prepare-work-unit", lifecycleAction: "prepare" } }));
  return lifecycleSuccess(await h.store.read({ reference: initial.reference }));
}

async function fixture(withMetaCandidate = true) {
  const cwd = await mkdtemp(join(tmpdir(), "arc-subject-candidate-")); roots.push(cwd);
  const h = createLifecycleHarness();
  const authoritative = candidate();
  const meta = await seedPrepared(h, withMetaCandidate ? authoritative.id : null);
  const workUnit = await readStoreWorkUnitEvidence({ store: h.store, slug: "demo", head: "a".repeat(40), projectId: async () => "project-1" });
  if (workUnit.kind !== "present") throw new Error(JSON.stringify(workUnit));
  const localCandidatePath = join(cwd, ".arc/system/.internal/candidates/demo.json");
  await mkdir(dirname(localCandidatePath), { recursive: true });
  const io: SubjectMetaIO = { readFile: path => readFile(path, "utf8"), pathExists: path => access(path).then(() => true, () => false),
    realpath, lstat, projectCandidateTarget: projectDurableCandidateTarget,
    readPendingCandidateReviewFixAuthority: async () => ({ status: "none" }), projectDeliveryCorrection: async () => ({ status: "none" }) };
  const options = { cwd, store: h.store, workUnit, subjectKey: "demo", identity: "andrew", metaRoot: { kind: "maintainer" as const }, candidates: [], io };
  const reference = recordReferences["review/candidate"](meta.reference.owner);
  return { ...h, authoritative, meta, reference, localCandidatePath, options };
}

it("takes native Candidate authority from its record without a meta Candidate or checkout files", async () => {
  const h = await fixture(false);
  await h.seed(h.reference, h.authoritative.content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", branch: "feat/demo",
    sessionType: "prepublication", integrationBoundary: { candidateId: h.authoritative.id } });
});

it("uses the stored Candidate ID despite a stale meta Candidate", async () => {
  const h = await fixture();
  const current = candidate("current-stored");
  await h.seed(h.reference, current.content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved",
    integrationBoundary: { candidateId: current.id } });
});

it.each(["absent", "in-repo"] as const)("keeps injected file IO when the Store is %s", async mode => {
  const h = await fixture();
  await writeFile(h.localCandidatePath, h.authoritative.content);
  const record = parseCandidateManagedRecord(h.authoritative.content);
  if (record === null) throw new Error("Expected produced Candidate");
  const boundary = projectCandidateFixResumeBoundary({ workUnit: "demo", candidateId: record.attestation.candidateId,
    candidateSubjectDigest: record.subject.subjectDigest });
  await writeFile(join(dirname(h.localCandidatePath), "demo.boundary.json"), JSON.stringify(boundary));
  const store = mode === "absent" ? undefined : new Proxy(h.store, {
    get(target, key) {
      if (key === "capabilities") return { ...target.capabilities, stateOffBranch: false };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  expect(await projectCheckoutSubjectMeta({ ...h.options, store, workUnit: undefined,
    candidates: [{ kind: "read", name: "meta-demo.md", path: join(h.options.cwd, ".arc/active/meta-demo.md"), text: h.meta.content }] }))
    .toMatchObject({ kind: "resolved", sessionType: "prepublication", integrationBoundary: boundary });
});

it("uses stored Candidate bytes when the checkout carries a different Candidate", async () => {
  const h = await fixture();
  await h.seed(h.reference, h.authoritative.content);
  await writeFile(h.localCandidatePath, candidate("someone-else").content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", sessionType: "prepublication", integrationBoundary: { candidateId: h.authoritative.id } });
});

it("preserves the selected owner's generation after its name is reused", async () => {
  const h = await fixture();
  await h.seed(h.reference, h.authoritative.content);
  lifecycleSuccess(await h.store.write({ action: "remove", reference: h.meta.reference, expected: h.meta.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = candidate("replacement-owner");
  const current = await seedPrepared(h, replacement.id);
  await h.seed(recordReferences["review/candidate"](current.reference.owner), replacement.content);
  await writeFile(h.localCandidatePath, replacement.content);
  expect(current.reference.owner).not.toEqual(h.meta.reference.owner);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", integrationBoundary: { candidateId: h.authoritative.id } });
});

it("reports the Store's missing-record condition and remedy, then resumes after repair", async () => {
  const h = await fixture();
  await writeFile(h.localCandidatePath, h.authoritative.content);
  const refusal = await h.store.read({ reference: h.reference });
  if (refusal.status !== "refused") throw new Error("Expected missing Candidate");
  const result = await projectCheckoutSubjectMeta(h.options);
  expect(result).toMatchObject({ kind: "unresolved", code: "subject-unresolved", message: expect.stringContaining(refusal.refusal.condition) });
  expect(result.kind === "unresolved" ? result.message : "").toContain(refusal.refusal.remedy.text);
  await h.seed(h.reference, h.authoritative.content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", integrationBoundary: { candidateId: h.authoritative.id } });
});

it("keeps a malformed stored Candidate unresolved despite a valid checkout copy", async () => {
  const h = await fixture();
  const saved = await h.seed(h.reference, h.authoritative.content);
  // Corrupt persisted bytes below write admission to exercise retained-data reads and repair.
  const stored = h.store.state.records.get(recordKey(saved.reference));
  if (stored === undefined) throw new Error("Expected the persisted Candidate");
  stored.content = "invalid Candidate JSON";
  await writeFile(h.localCandidatePath, h.authoritative.content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "unresolved", code: "subject-unresolved", message: expect.stringMatching(/Candidate.*Repair.*retry/iu) });
  lifecycleSuccess(await h.store.write({ action: "put", reference: saved.reference, expected: saved.version,
    content: h.authoritative.content, provenance: { verb: "repair", lifecycleAction: "repair" } }));
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved" });
});

it("reports a stored Candidate conflict with a remedy and resolves after the conflict is repaired", async () => {
  const h = await fixture();
  const remote = createMemoryRemote(); h.store.context.publication.remote = remote;
  await h.seed(h.reference, h.authoritative.content);
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const before = lifecycleSuccess(await h.store.read({ reference: h.reference }));
  const remoteBefore = lifecycleSuccess(await writer.read({ reference: h.reference }));
  lifecycleSuccess(await h.store.write({ action: "put", reference: before.reference, expected: before.version,
    content: candidate("local-edit").content, provenance: { verb: "attest", lifecycleAction: "attest" } }));
  lifecycleSuccess(await writer.write({ action: "put", reference: remoteBefore.reference, expected: remoteBefore.version,
    content: candidate("remote-edit").content, provenance: { verb: "attest", lifecycleAction: "attest" } }));
  lifecycleSuccess(await h.store.push());
  const conflicted = lifecycleSuccess(await h.store.read({ reference: h.reference }));
  expect(conflicted.conflicts.length).toBeGreaterThan(0);
  await writeFile(h.localCandidatePath, h.authoritative.content);
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "unresolved", code: "subject-unresolved", message: expect.stringMatching(/Candidate.*unresolved conflicts.*Resolve/iu) });
  lifecycleSuccess(await h.store.write({ action: "put", reference: conflicted.reference, expected: conflicted.version,
    resolves: conflicted.conflicts, content: h.authoritative.content, provenance: { verb: "resolve", lifecycleAction: "resolve" } }));
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", integrationBoundary: { candidateId: h.authoritative.id } });
});

it("does not fall back to checkout acquisition when off-branch work-unit authority is missing", async () => {
  const h = await fixture();
  await writeFile(h.localCandidatePath, h.authoritative.content);
  const result = await projectCheckoutSubjectMeta({ ...h.options, workUnit: undefined, candidates: [{ kind: "read",
    name: "meta-demo.md", path: join(h.options.cwd, ".arc/active/meta-demo.md"), text: h.meta.content }] });
  expect(result).toMatchObject({ kind: "unresolved", code: "subject-unresolved", message: expect.stringMatching(/work-unit authority.*retry/iu) });
});

it("retains the selected generation when reading pending Candidate fix authority", async () => {
  const { storedCandidateApproval } = await import("../../../fixtures/review-family-access.js");
  const { candidateFixture } = await import("../../../helpers/store/tracked-write-fixture.js");
  const { projectCandidateApplicabilityDecision } = await import("../../../helpers/candidate.js");
  const { scriptGitExec } = await import("../../../helpers/git-exec-fake.js");
  const { readPendingCandidateReviewFixAuthority } = await import(
    "../../../../src/scripts/review-gate/policy/candidate-review-fix-continuation.js");
  const h = await storedCandidateApproval(candidateFixture("demo"));
  const cwd = await mkdtemp(join(tmpdir(), "arc-subject-pending-fix-")); roots.push(cwd);
  const workUnit = await readStoreWorkUnitEvidence({ store: h.harness.store, slug: "demo",
    head: "a".repeat(40), projectId: async () => h.producer.repositoryId });
  if (workUnit.kind !== "present") throw new Error(JSON.stringify(workUnit));
  lifecycleSuccess(await h.harness.store.write({ action: "remove", reference: h.meta.reference,
    expected: h.meta.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
  await h.harness.seedMeta("demo");
  const io: SubjectMetaIO = { readFile: path => readFile(path, "utf8"),
    pathExists: path => access(path).then(() => true, () => false), realpath, lstat,
    projectCandidateTarget: projectCandidateApplicabilityDecision,
    projectDeliveryCorrection: async () => ({ status: "none" }),
    readPendingCandidateReviewFixAuthority: input => readPendingCandidateReviewFixAuthority({ ...input,
      store: h.harness.store, exec: scriptGitExec([]).exec }) };
  expect(await projectCheckoutSubjectMeta({ cwd, store: h.harness.store, workUnit, subjectKey: "demo",
    identity: "andrew", metaRoot: { kind: "maintainer" }, candidates: [], io }))
    .toMatchObject({ kind: "resolved", sessionType: "prepublication",
      integrationBoundary: { locus: "candidate-fix-pending", candidateId: h.candidate.attestation.candidateId } });
});

it("keeps stored boundary absence when a checkout file holds stale fix authority", async () => {
  const { parseCandidateManagedRecord } = await import("../../../../src/lib/work-unit/candidate-attestation.js");
  const { projectCandidateFixResumeBoundary } = await import(
    "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  const h = await fixture();
  await h.seed(h.reference, h.authoritative.content);
  const record = parseCandidateManagedRecord(h.authoritative.content);
  if (record === null) throw new Error("Expected native Candidate fixture");
  const stale = projectCandidateFixResumeBoundary({ workUnit: "demo", candidateId: h.authoritative.id,
    candidateSubjectDigest: record.subject.subjectDigest });
  await writeFile(join(dirname(h.localCandidatePath), "demo.boundary.json"), JSON.stringify(stale));
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved",
    integrationBoundary: { locus: "candidate-review-pending" } });
});

it("projects a checked native boundary from the selected work item without a boundary file", async () => {
  const h = await fixture(false);
  await h.seed(h.reference, h.authoritative.content);
  const record = parseCandidateManagedRecord(h.authoritative.content);
  if (record === null) throw new Error("Expected the produced Candidate");
  const boundary = projectCandidateReviewBoundary({ workUnit: "demo", candidateId: record.attestation.candidateId,
    candidateSubjectDigest: record.subject.subjectDigest }, 2);
  await h.seed(recordReferences["review/integration-boundary"](h.meta.reference.owner), JSON.stringify(boundary));
  expect(await projectCheckoutSubjectMeta(h.options)).toMatchObject({ kind: "resolved", sessionType: "prepublication",
    integrationBoundary: boundary });
});
