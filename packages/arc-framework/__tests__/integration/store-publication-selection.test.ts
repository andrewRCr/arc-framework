/** Publication handlers keep the selected record through Candidate evidence and a concurrent name clash. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";
import { runHandlerAt } from "../helpers/handler.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { createClashDouble } from "../helpers/store/clash-double.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeOwnershipMarker } from "../../src/lib/git/worktree-marker.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { CandidatePublishReadyBoundarySchema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import type { VerbBase } from "../../src/handlers/lifecycle-shared.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";
const state = vi.hoisted(() => ({ base: undefined as VerbBase | undefined, executor: undefined as ExecuteTransitionContext | undefined }));
vi.mock("../../src/handlers/lifecycle-shared.js", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/handlers/lifecycle-shared.js")>(),
  resolveVerbBase: () => Promise.resolve(state.base),
  buildExecutor: () => Promise.resolve({ executor: state.executor, settings: { "branch.base": "main" } }),
}));
import { handlePublish } from "../../src/handlers/lifecycle.js";
let root: string | undefined;
beforeEach(() => { vi.resetAllMocks(); state.base = undefined; state.executor = undefined; });
afterEach(async () => { vi.restoreAllMocks(); if (root !== undefined) await cleanupTempDir(root); root = undefined; });

it.each([true, false])("publication retains Candidate evidence and name admission through a clash, explicit=%s", async explicit => {
  root = await createTempRepo(); const exec = makeGitExec(root);
  await exec("git", ["branch", "-M", "main"]);
  await exec("git", ["commit", "--allow-empty", "-m", "base"]);
  await exec("git", ["switch", "-c", "feat/example"]);
  await writeFile(join(root, "implementation.ts"), "export const value = true;\n");
  await exec("git", ["add", "implementation.ts"]); await exec("git", ["commit", "-m", "implementation"]);
  const target = await collectCandidateSubjectTarget({ cwd: root, name: "example", baseBranch: "main", exec });
  const attestation = createCandidateAttestation({ workUnit: "example", subject: target.subject, baseRevision: target.revision,
    attestedBy: "test-user", attestedAt: "2026-10-14T00:00:00Z", verificationEvidenceRef: "test://publication-selection" });
  await writeCandidateRecord(root, "example", { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", attestation,
    subject: target.subject, transitions: [], lineageAttestations: [] }, null);
  await writeSubmissionBoundary(root, CandidatePublishReadyBoundarySchema.parse({ schemaVersion: 1, mode: "pre-publication-review",
    workUnit: "example", candidateId: attestation.candidateId, candidateSubjectDigest: target.subject.subjectDigest,
    locus: "candidate-publish-ready", standardLaneOwnerVersion: 0,
    nextAction: { kind: "publish-candidate", command: "arc publish example --json", interactionText: "Publish" },
    policy: null, reservation: null, terminus: null, deliveryReviewTermini: [] }), null);
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { candidateId: attestation.candidateId }, { kind: "active" },
    { branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const other = await h.seedMeta("other");
  const store = createClashDouble(h.store, { slug: "example", holders: [primary.reference, other.reference], mode: explicit ? "mid-verb" : "clash" });
  if (!explicit) await writeWorktreeOwnershipMarker(root, { createdByArc: true, createdFor: boundWorkUnitSubject(primary), spawningIdentity: "test-user" });
  const io = { ...createUserIOContext(), exec };
  state.base = { cwd: root, identity: "test-user", io, store };
  state.executor = buildExecutorContext({ cwd: root, io, store, projectId: async () => "repo", identity: "test-user", teamMode: false, internalTemplateDir: "/templates" });
  const result = await runHandlerAt(root, () => handlePublish(explicit ? "example" : undefined, { json: true }));
  expect(result.exitCode, result.stdout + result.stderr).toBe(explicit ? 0 : 1);
  expect(JSON.parse(result.stdout)).toMatchObject(explicit ? { status: "published" }
    : { status: "rejected", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining([
      { ...primary.reference, owner: { ...primary.reference.owner, name: "example" } },
      { ...other.reference, owner: { ...other.reference.owner, name: "example" } },
    ]) } });
  const after = lifecycleSuccess(await h.store.read({ reference: primary.reference }));
  expect(after.fields).toMatchObject({ state: explicit ? "Integrating" : "Active" });
  if (!explicit) {
    expect(after).toEqual(primary);
    expect((await readSubmissionBoundaryVersioned(root, "example")).boundary?.locus).toBe("candidate-publish-ready");
  }
  expect(lifecycleSuccess(await h.store.read({ reference: other.reference }))).toEqual(other);
}, 30_000);
