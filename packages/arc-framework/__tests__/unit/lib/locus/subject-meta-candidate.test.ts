/** Candidate acquisition follows the selected Store's exact work-unit generation. */
import { mkdtemp, mkdir, readFile, writeFile, rm, access, realpath, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterEach, expect, it } from "vitest";
import { projectCheckoutSubjectMeta, type SubjectMetaIO } from "../../../../src/lib/locus/subject-meta.js";
import { readStoreWorkUnitEvidence } from "../../../../src/lib/locus/store-work-unit-evidence.js";
import { writeMetaCurrentWorkflow } from "../../../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot, serializeCandidateManagedRecord } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { ReferenceBackend } from "../../../helpers/store/reference-backend.js";
import { createMemoryRemote } from "../../../helpers/store/sync.js";
import { projectDurableCandidateTarget } from "../../../helpers/candidate.js";

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

async function seedPrepared(h: ReturnType<typeof createLifecycleHarness>, candidateId: ReturnType<typeof candidate>["id"]) {
  const initial = await h.seedMeta("demo", { taskList: "tasks-demo.md", candidateId });
  await h.seed(recordReferences["work-item/task-list"](initial.reference.owner),
    "# Task List: Demo\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  lifecycleSuccess(await h.store.write({ action: "put", reference: initial.reference, expected: initial.version, placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(initial.content, "prepare-work-unit"), provenance: { verb: "prepare-work-unit", lifecycleAction: "prepare" } }));
  return lifecycleSuccess(await h.store.read({ reference: initial.reference }));
}

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "arc-subject-candidate-")); roots.push(cwd);
  const h = createLifecycleHarness();
  const authoritative = candidate();
  const meta = await seedPrepared(h, authoritative.id);
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
  const saved = await h.seed(h.reference, "invalid Candidate JSON");
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
