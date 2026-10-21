/** Native withdrawal requires fresh readiness while preserving the same Candidate's recorded authority. */
import { expect, it, onTestFinished, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { handleReviewPrePublication } from "../../src/handlers/review.js";
import { attestCandidateWithReviewBoundary } from "../../src/handlers/lifecycle-delivery-review.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { prepareNativePublicationClaim } from "../../src/lib/store/kinds/review/integration-boundary/publication.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../src/scripts/review-gate/runtime/readiness-binding.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { runPublish } from "../../src/lib/work-unit/verbs/publish.js";
import { runReopen } from "../../src/lib/work-unit/verbs/reopen.js";
import { buildStoreCurrentWuReconcile } from "../../src/lib/work-unit/store-current-wu-reconcile.js";
import type { ExecuteTransitionContext } from "../../src/lib/work-unit/lifecycle-executor.js";
import type { CurrentWuReconcileHost } from "../../src/lib/work-unit/side-effects/discharge-dep-edges.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { resolveNativeExtraPassJudgment } from "../../src/scripts/review-gate/runtime/native-extra-pass.js";
import { readCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";

it.each([{ accepted: false, keepPr: false }, { accepted: false, keepPr: true },
  { accepted: true, keepPr: false }, { accepted: true, keepPr: true }])("requires fresh readiness after native reopen with %j", async ({ accepted, keepPr }) => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd } = h.native;
  let hostState: "absent" | "open" | "draft" = "absent", hostHead = "";
  const exec: typeof h.native.exec = async (command, args, options) => {
    if (command === "gh") {
      const request = { number: 42, state: "OPEN", isDraft: hostState === "draft", headRefName: "feat/example",
        baseRefName: "main", headRefOid: hostHead, url: "https://github.com/owner/repository/pull/42" };
      return { stdout: JSON.stringify(args[1] === "list" ? hostState === "absent" ? [] : [request] : request), stderr: "" };
    }
    if (args.join(" ") === "config --get remote.origin.url") return { stdout: "https://github.com/owner/repository.git", stderr: "" };
    return h.native.exec(command, args, options);
  };
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "feat/example";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "test-user");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr]\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure review");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("add", "example.ts");
  await git("commit", "-m", "Implement example");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-20T12:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  const primary = await h.reference.seedMeta("example", { taskList: "tasks-example.md", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: collected.target.subject, attestation: createCandidateAttestation({ workUnit: "example",
      subject: collected.target.subject, baseRevision: collected.target.revision, attestedBy: "test-user",
      attestedAt: "2026-10-20T12:00:00Z", verificationEvidenceRef: "test://verified" }), transitions: [], lineageAttestations: [] };
  await h.reference.seedCandidate(primary.reference.owner, candidate);
  const invocation = { ...h.native, exec, workItem: primary.reference.owner };
  const lanes = { frontline: { invocation: { mode: "skip" } }, ...(accepted ? { standard: { terminus: { mode: "owner-accepted" } } } : {}) };
  const review = async (judgments: unknown = lanes) => {
    let output = "";
    const exits: number[] = [];
    await handleReviewPrePublication("example", { selfReview: "settled", lanes: "lanes.json" }, {
      resolveRoot: () => cwd, readText: async () => JSON.stringify(judgments), write: text => { output += text; },
      setExitCode: code => exits.push(code) }, undefined, invocation);
    expect(exits, output).toEqual([]);
    return JSON.parse(output) as { locus: string; reservation: unknown; terminus: string | null };
  };
  const ready = await review();
  expect(ready).toHaveProperty("locus", "candidate-publish-ready");
  const readBoundary = () => readSubmissionBoundaryVersioned(cwd, "example", { store: h.reference.store, owner: primary.reference.owner });
  const snapshot = await readBoundary();
  if (snapshot.boundary?.schemaVersion !== 2) throw new Error("Expected native readiness");
  const { family } = createReviewCompositionContext(invocation);
  const readBinding = () => readReviewReadinessBinding({ store: h.reference.store, workItem: primary.reference.owner,
    inFlight: family.ports.inFlight, repositoryId: projectId, candidateId: candidate.attestation.candidateId, headSha: collected.target.revision });
  const forbidden = (): Promise<never> => Promise.reject(new Error("tracked lifecycle access"));
  const ctx: ExecuteTransitionContext & CurrentWuReconcileHost = { cwd, store: h.reference.store, currentWuReconcile: buildStoreCurrentWuReconcile(h.reference.store),
    indexFs: { readdir: forbidden, readFile: forbidden }, setPhase: forbidden, relocateArtifacts: forbidden,
    reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden, writeSoftFields: forbidden,
    writeBranchField: forbidden, writeDesignField: forbidden, writeCurrentWorkflowField: forbidden,
    sideEffects: { "withdraw-pr": Object.assign(async () => undefined, { prepareWithdrawal: async () => ({
      name: "withdraw-pr", run: async () => { hostState = keepPr ? "draft" : "absent"; },
      retryCommand: ["gh", "pr", keepPr ? "ready" : "close", branch, ...(keepPr ? ["--undo"] : [])],
    }) }) } };
  const params = { name: "example", candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest, candidateCurrent: true, boundary: snapshot.boundary,
    refreshCandidateAuthorization: async () => {
      const current = await createPrePublicationCompositionDependencies(invocation).readCandidate("example");
      if (current.status !== "current") throw new Error("Expected the current Candidate");
      return { candidateId: current.candidateId, candidateSubjectDigest: current.subjectDigest, candidateCurrent: true };
    }, readReadinessBinding: readBinding, readStandardLaneOwnerVersion: forbidden, claimPublicationBoundary: forbidden,
    preparePublicationClaim: (boundary: typeof snapshot.boundary) => {
      if (boundary?.schemaVersion !== 2) throw new Error("Expected a native claim");
      return prepareNativePublicationClaim({ store: h.reference.store, cwd, owner: primary.reference.owner,
        boundary, expectedVersion: snapshot.version, readReadinessBinding: readBinding });
    } };
  expect(await runPublish(ctx, params)).toHaveProperty("status", "published");
  const claimed = (await readBoundary()).boundary;
  if (claimed === null) throw new Error("Expected the publication claim");
  expect(await runPublish(ctx, { ...params, boundary: claimed })).toHaveProperty("status", "unchanged");
  hostState = "open"; hostHead = collected.target.revision;
  const decisions = createReviewDecisionPort(h.reference.store, primary.reference.owner), beforeDecisions = await decisions.list();
  expect(await runReopen(ctx, { name: "example", prMerged: false, withdrawMode: keepPr ? "draft" : "close" })).toHaveProperty("status", "reopened");
  expect(hostState).toBe(keepPr ? "draft" : "absent");
  const pending = (await readBoundary()).boundary;
  if (pending === null) throw new Error("Expected the withdrawn boundary");
  expect(pending).toMatchObject({ locus: "candidate-review-pending", reservation: null, terminus: ready.terminus });
  expect(await runPublish(ctx, { ...params, boundary: pending })).toMatchObject({ status: "rejected", remedy: {
    argv: ["arc", "review", "pre-publication", "example"] } });
  const io = createUserIOContext(); io.exec = exec;
  let attestOutput = "";
  const output = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { attestOutput += String(chunk); return true; });
  onTestFinished(() => output.mockRestore());
  await attestCandidateWithReviewBoundary({ cwd, identity: "test-user", io, store: h.reference.store,
    projectId: h.reference.projectId, workItem: primary.reference.owner }, { name: SlugSchema.parse("example"), scope: "full", json: true });
  expect(JSON.parse(attestOutput)).toMatchObject({ status: "unchanged", locus: { locus: "candidate-review-pending" } });
  expect((await readBoundary()).boundary).toEqual(pending);
  const refreshed = await review({ frontline: { invocation: { mode: "skip" } } });
  expect(refreshed).toMatchObject({ locus: "candidate-publish-ready", reservation: ready.reservation, terminus: ready.terminus });
  expect(await decisions.list()).toEqual(beforeDecisions);
  expect(lifecycleSuccess(await h.reference.store.read({ reference: primary.reference })).fields).toMatchObject({ state: "Active" });
  const grant = { facts: { decisions, readProjectId: h.reference.projectId }, repositoryId: projectId,
    subject: { lineage: { kind: "candidate" as const, candidateId: candidate.attestation.candidateId },
      headSha: collected.target.revision, subjectDigest: candidate.subject.subjectDigest },
    policyTarget: { repository: "owner/repository", pullRequest: null, headSha: collected.target.revision },
    lane: "standard" as const, completedPasses: 0, actor: "test-user", now: "2026-10-20T12:01:00Z" };
  expect(await resolveNativeExtraPassJudgment({ ...grant,
    judgment: { ceilingOverride: { exhaustedPassCount: 0, nextPass: 1 } } })).toHaveProperty("ceilingDecisionKey");
  const beforeRoot = await decisions.list();
  await writeFile(join(cwd, "example.ts"), "export const value = 2;\n");
  await git("commit", "-am", "Adjust example");
  attestOutput = "";
  await attestCandidateWithReviewBoundary({ cwd, identity: "test-user", io, store: h.reference.store,
    projectId: h.reference.projectId, workItem: primary.reference.owner }, { name: SlugSchema.parse("example"), scope: "full", json: true, newRoot: true });
  expect(JSON.parse(attestOutput)).toMatchObject({ status: "attested" });
  expect(await decisions.list()).toEqual(beforeRoot);
  const newCandidate = await readCandidateRecord(cwd, "example", { store: h.reference.store, owner: primary.reference.owner });
  if (newCandidate === null) throw new Error("Expected the new root");
  expect(newCandidate.attestation.candidateId).not.toBe(candidate.attestation.candidateId);
  const newHead = await git("rev-parse", "HEAD");
  expect(await resolveNativeExtraPassJudgment({ ...grant, actor: undefined, policyTarget: { ...grant.policyTarget, headSha: newHead }, subject: { lineage: {
    kind: "candidate", candidateId: newCandidate.attestation.candidateId }, headSha: newHead,
    subjectDigest: newCandidate.subject.subjectDigest } })).toEqual({});
  expect((await readBoundary()).boundary).toMatchObject({ candidateId: newCandidate.attestation.candidateId, terminus: null });
  expect(await review({ frontline: { invocation: { mode: "skip" } } })).toMatchObject({
    locus: "candidate-publish-ready", terminus: null, reservation: expect.any(Object) });
}, 30_000);
