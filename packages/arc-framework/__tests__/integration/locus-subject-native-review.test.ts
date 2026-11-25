/** Production locus callbacks recover portable pending fixes without checkout projections. */
import { boundWorkUnitSubject } from "../helpers/store/bound-checkout.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { inProcessReview, localReviewResult } from "../helpers/in-process-review.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { writeMetaCurrentWorkflow } from "../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { projectCandidateFixResumeBoundary, projectCandidateReviewBoundary }
  from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { resolveReviewSourceInvocation } from "../../src/scripts/review-gate/runtime/source-invocation.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";

// A native work unit at Candidate review on its own checkout, its Candidate stored and no boundary recorded.
async function nativeCandidateCheckout(workflow?: "prepare-work-unit") {
  const h = await createReviewRepositoryHarness(); onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", name = "example", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "Configure project");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  const collected = await collectGitCandidateSubject({ cwd, name, baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: collected.target.subject, attestation: createCandidateAttestation({ workUnit: name,
      subject: collected.target.subject, baseRevision: collected.target.revision, attestedBy: "andrew",
      attestedAt: "2026-10-20T15:00:00Z", verificationEvidenceRef: "test://verified" }), transitions: [], lineageAttestations: [] };
  const primary = await h.reference.seedMeta(name, { owner: "andrew", branch: null, workClass: "Light",
    taskList: "tasks-example.md" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Complete**\n");
  if (workflow !== undefined) {
    const meta = lifecycleSuccess(await h.reference.store.read({ reference: primary.reference }));
    lifecycleSuccess(await h.reference.store.write({ action: "put", reference: meta.reference, expected: meta.version,
      placement: { kind: "active" }, content: writeMetaCurrentWorkflow(meta.content, workflow),
      provenance: { verb: workflow, lifecycleAction: "prepare" } }));
  }
  await h.reference.seedCandidate(primary.reference.owner, candidate);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T15:00:00Z",
    createdFor: boundWorkUnitSubject(primary) });
  const probe = () => runDerivedLocusStateProbe({ ...h.native, identity: "andrew", baseBranch: "main", archiveCadence: "manual" });
  const projectedBoundary = async () => {
    const context = (await probe()).active?.context;
    if (context?.kind !== "resolved") throw new Error(`Expected a resolved locus: ${JSON.stringify(context)}`);
    return context.integrationBoundary;
  };
  const coordinates = { workUnit: name, candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest };
  return { h, cwd, exec, git, projectId, name, branch, candidate, primary, probe, projectedBoundary, coordinates };
}

it("projects a native Candidate review boundary when none is stored", async () => {
  const { projectedBoundary, coordinates } = await nativeCandidateCheckout("prepare-work-unit");
  expect(await projectedBoundary()).toEqual(projectCandidateReviewBoundary(coordinates, 2));
});

it("recovers a stored pending fix after execution pruning and keeps its source owner through slug reuse", async () => {
  const { h, cwd, exec, git, projectId, name, branch, candidate, primary, probe, projectedBoundary, coordinates }
    = await nativeCandidateCheckout();
  await h.reference.seedBoundary(primary.reference.owner, projectCandidateReviewBoundary(coordinates, 2));
  const invocation = { ...h.native, workItem: primary.reference.owner };
  const prepared = LocalPrepareEnvelopeSchema.parse(await inProcessReview.prepare(cwd, { schemaVersion: 1,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } }, invocation));
  if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
  const attested = LocalAttestEnvelopeSchema.parse(await inProcessReview.attest(cwd, {
    ...localReviewResult(prepared.payload, "pending-native-review", [{ findingId: "fix-1", severity: "major",
      locus: "example.ts:1", evidenceUrlOrId: "source:example.ts:1" }]), operationRef: prepared.payload.operationRef,
  }, invocation));
  if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
  const context = createReviewCompositionContext(invocation);
  if (context.family.mode !== "stored") throw new Error("Expected stored review ports");
  const stored = await context.family.ports.outcomes.read(prepared.payload.operationId);
  if (stored === null) throw new Error("Expected actual producer outcome");
  await publishNativeReviewApproval({ ...context.family.ports, readProjectId: context.projectId,
    record: composeReviewDispositionRecord(stored.value, [{ ...reviewEvidenceFixture(stored.value, "fix"),
      binding: { kind: "candidate", candidate: { workUnit: candidate.attestation.workUnit, candidateId: candidate.attestation.candidateId } } }], primary.reference.owner),
    now: () => "2026-10-20T15:01:00Z" });
  const meta = lifecycleSuccess(await h.reference.store.read({ reference: primary.reference }));
  lifecycleSuccess(await h.reference.store.write({ action: "put", reference: meta.reference, expected: meta.version, placement: { kind: "active" },
    content: writeMetaCurrentWorkflow(meta.content, "prepare-work-unit"), provenance: { verb: "prepare-work-unit", lifecycleAction: "prepare" } }));
  await writeFile(join(cwd, "example.ts"), "export const value = 2;\n");
  await git("commit", "-am", "Apply approved fix");
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  for (const namespace of ["in-flight", "sources", "evidence"] as const) {
    const location = { root: "review-gate", namespace } as const;
    for (const entry of await publisher.snapshot(location)) if (entry.kind === "file") {
      await publisher.update(location, entry.name, () => ({ kind: "delete", result: undefined }));
    }
    expect(await publisher.snapshot(location)).toEqual([]);
  }
  for (const path of [".arc/active/tasks-example.md", ".arc/system/.internal/candidates/example.json",
    ".arc/system/.internal/candidates/example.boundary.json"]) await expect(access(join(cwd, path))).rejects.toThrow();
  expect((await probe()).active?.context).toMatchObject({ kind: "resolved", sessionType: "prepublication",
    workflow: "prepare-work-unit", branch });
  expect(await projectedBoundary()).toEqual(projectCandidateFixResumeBoundary(coordinates, 2));
  const approved = await context.family.ports.dispositions.readDispositionRecord(prepared.payload.operationId);
  if (approved?.source.kind !== "attested-local") throw new Error("Expected native local source");
  const source = parseReviewSourceReference(approved.source.receiptRef, "attested-local", true);
  expect(source).toMatchObject({ workItem: primary.reference.owner, durableRef: stored.value.attemptId });
  const original = await resolveReviewSourceInvocation(h.native, approved.source.receiptRef, "attested-local");
  const result = await createRepositoryReviewResultReader(publisher, original.invocation).readResult(prepared.payload.operationId);
  expect(result.target).toEqual(stored.value.target);
  const current = lifecycleSuccess(await h.reference.store.read({ reference: primary.reference }));
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: current.reference, expected: current.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = await h.reference.seedMeta(name, { owner: "andrew" });
  const forged = bindReviewSourceReference({ ...source, workItem: replacement.reference.owner, repositoryId: projectId });
  await expect(resolveReviewSourceInvocation(invocation, forged, "attested-local")).rejects.toThrow("operation reference names another work item");
  const restored = await resolveReviewSourceInvocation(h.native, approved.source.receiptRef, "attested-local");
  expect(await createRepositoryReviewResultReader(publisher, restored.invocation).readResult(prepared.payload.operationId)).toEqual(result);
  // Reinstall the original primary by exact UID; the replacement slug cannot become its authority.
  const replacementMeta = lifecycleSuccess(await h.reference.store.read({ reference: replacement.reference }));
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: replacementMeta.reference, expected: replacementMeta.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  lifecycleSuccess(await h.reference.store.write({ action: "put", reference: current.reference, expected: null,
    content: current.content, placement: current.placement, links: current.links, provenance: { verb: "restore", lifecycleAction: "create" } }));
  expect(await projectedBoundary()).toEqual(projectCandidateFixResumeBoundary(coordinates, 2));
}, 40_000);
