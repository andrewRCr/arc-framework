/** Native local review defaults publish portable results from their authenticated checkout owner. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { createReviewOutcomePort } from "../../src/lib/store/kinds/review/outcome/access.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, RecordReferenceSchema } from "../../src/lib/store/identity.js";
import { recordPut } from "../../src/lib/store/lifecycle-write.js";
import { resolveReviewSourceInvocation } from "../../src/scripts/review-gate/runtime/source-invocation.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { validateApprovedDispositionRecordForResult } from "../../src/scripts/review-gate/core/review-result-disposition.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import type { ReviewInvocationInput } from "../../src/scripts/review-gate/runtime/invocation.js";
import { IntegrationBoundaryLocusV2Schema } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema, LocalResumeEnvelopeSchema, ReduceEnvelopeSchema }
  from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { parseNativeReviewOperationReference } from "../../src/scripts/review-gate/core/review-operation-reference.js";
import { bindReviewSourceReference, parseReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import { handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewLocalResume, handleReviewReduce }
  from "../../src/handlers/review.js";

it.each(["clean", "findings"] as const)("replays a %s result and approved evidence through actual defaults after pruning, rename, and slug reuse on two clones", async outcome => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const projectId = "123e4567-e89b-42d3-a456-426614174099", branch = "topic/opaque";
  await h.reference.seedProject(projectId);
  const primary = await h.reference.seedMeta("example", { owner: "andrew", branch: null, workClass: "Light" }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "example.ts"), "export const value = 0;\n");
  await git("add", ".");
  await git("commit", "-m", "Configure local review");
  const base = await git("rev-parse", "HEAD");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "example.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement example");
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-20T15:00:00Z",
    createdFor: { kind: "work-unit", name: "example" } });
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision: base, attestedBy: "andrew", attestedAt: "2026-10-20T15:00:00Z", verificationEvidenceRef: "test://verified" });
  await h.reference.seedCandidate(primary.reference.owner, { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] });
  await h.reference.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
    mode: "pre-publication-review", workUnit: "example", candidateId: attestation.candidateId,
    candidateSubjectDigest: collected.target.subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
  const invoke = async (handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalAttest
    | typeof handleReviewLocalResume | typeof handleReviewReduce, request: unknown, invocation = h.native) => {
    let output = "";
    const exitCodes: number[] = [];
    await handler("-", { resolveRoot: () => invocation.cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exitCodes.push(code) }, undefined, invocation);
    expect(exitCodes, output).toEqual([]);
    return JSON.parse(output) as unknown;
  };
  const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(handleReviewLocalPrepare, { schemaVersion: 1,
    evaluatorIdentity: "independent-reviewer", routingFacts: { contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } }));
  expect(prepared.state).toBe("ready");
  if (prepared.state !== "ready" || prepared.payload.operationRef === undefined) throw new Error("Expected a native admission");
  const operationRef = prepared.payload.operationRef;
  expect(parseNativeReviewOperationReference(operationRef).workItem).toEqual(primary.reference.owner);
  const findings = outcome === "clean" ? [] : [{ findingId: "retained-finding", severity: "major",
    locus: "example.ts:1", evidenceUrlOrId: "source:example.ts:1" }];
  const request = { ...localReviewResult(prepared.payload, "default-native-review", findings), operationRef };
  const attested = LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest, request));
  expect(attested.state).toBe("attested-current");
  if (attested.state !== "attested-current") throw new Error("Expected a completed native attestation");
  expect(attested.payload.sourceRef).toBeDefined();
  const outcomes = createReviewOutcomePort(h.reference.store, primary.reference.owner);
  const stored = await outcomes.read(prepared.payload.operationId);
  expect(stored?.value).toMatchObject({ outcome, target: { repositoryId: projectId },
    lineage: { kind: "candidate", candidateId: attestation.candidateId } });
  if (stored === null) throw new Error("Expected the actual producer outcome");
  const readFamily = async (invocation: ReviewInvocationInput) => {
    const selected = await resolveReviewSourceInvocation(invocation, attested.payload.receiptRef, "attested-local");
    const context = createReviewCompositionContext(selected.invocation);
    if (context.family.mode !== "stored") throw new Error("Expected the stored review family");
    return { ...context.family.ports, readProjectId: context.projectId };
  };
  const family = await readFamily(h.native);
  const approval = outcome === "clean" ? null : await publishNativeReviewApproval({ ...family,
    record: composeReviewDispositionRecord(stored.value, [{ ...reviewEvidenceFixture(stored.value),
      binding: { kind: "candidate", candidate: { workUnit: attestation.workUnit, candidateId: attestation.candidateId } } }],
    primary.reference.owner), now: () => "2026-10-20T15:01:00Z" });
  const reducedState = outcome === "clean" ? "advisory-complete" : "settled";
  const continuation = { schemaVersion: 1, operationId: prepared.payload.operationId, operationRef };
  expect(LocalResumeEnvelopeSchema.parse(await invoke(handleReviewLocalResume, continuation)).state).toBe("review-complete");
  expect(ReduceEnvelopeSchema.parse(await invoke(handleReviewReduce, continuation)).state).toBe(reducedState);
  expect(LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest, request)).state).toBe("attested-current");
  expect(await outcomes.read(prepared.payload.operationId)).toEqual(stored);
  const readResult = async (invocation: ReviewInvocationInput) => {
    const selected = await resolveReviewSourceInvocation(invocation, attested.payload.receiptRef, "attested-local");
    const publisher = new RepositoryGitCommonStatePublisher(invocation.exec, invocation.cwd);
    return createRepositoryReviewResultReader(publisher, selected.invocation).readResult(prepared.payload.operationId);
  };
  const originalResult = await readResult(h.native);
  const originalDisposition = await family.evidence.readDispositionRecord(prepared.payload.operationId);
  if (originalDisposition !== null) expect(validateApprovedDispositionRecordForResult(originalDisposition, originalResult))
    .toEqual(originalDisposition);
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  for (const namespace of ["in-flight", "sources", "evidence"] as const) {
    const location = { root: "review-gate", namespace } as const;
    const records = await publisher.snapshot(location);
    if (namespace === "sources") expect(records.length).toBeGreaterThan(0);
    for (const entry of records) if (entry.kind === "file") {
      await publisher.update(location, entry.name, () => ({ kind: "delete", result: undefined }));
    }
    expect(await publisher.snapshot(location)).toEqual([]);
  }
  const owner = (name: string) => OwnerIdentitySchema.parse({ ...primary.reference.owner, name });
  const disposition = (name: string) => originalDisposition?.source.kind !== "attested-local" ? originalDisposition
    : { ...originalDisposition, source: { ...originalDisposition.source, receiptRef: bindReviewSourceReference({
      ...parseReviewSourceReference(originalDisposition.source.receiptRef, "attested-local", true), workItem: owner(name) }) } };
  const completedReplay = async (invocation: ReviewInvocationInput, name: string = primary.reference.owner.name) => {
    const replay = LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest, request, invocation));
    expect(replay).toMatchObject({ state: "attested-current", payload: { persistedVersion: 0, receiptRef: attested.payload.receiptRef } });
    expect(replay.payload).not.toHaveProperty("sourceRef");
    const resumed = LocalResumeEnvelopeSchema.parse(await invoke(handleReviewLocalResume, continuation, invocation));
    expect(resumed).toMatchObject({ state: "review-complete", payload: { persistedVersion: 0, receiptRef: attested.payload.receiptRef } });
    expect(resumed.payload).not.toHaveProperty("sourceRef");
    expect(await invoke(handleReviewReduce, continuation, invocation)).toMatchObject({ state: reducedState,
      payload: { persistedVersion: 0 } });
    expect(await readResult(invocation)).toEqual({ ...originalResult, workItem: owner(name) });
    const selected = await readFamily(invocation);
    expect(await selected.evidence.readDispositionRecord(prepared.payload.operationId)).toEqual(disposition(name));
    if (approval !== null) expect(await selected.evidence.read(approval.value.dispositionSet.dispositionSetId)).toEqual({
      ...approval, reference: { ...approval.reference, owner: owner(name) } });
    expect(await outcomes.read(prepared.payload.operationId)).toEqual({ ...stored, reference: { ...stored.reference,
      owner: owner(name) } });
  };
  await completedReplay(h.native);
  const renamedReference = RecordReferenceSchema.parse({ ...primary.reference,
    owner: { ...primary.reference.owner, name: "renamed-example" } });
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(primary), reference: renamedReference,
    provenance: { verb: "rename", lifecycleAction: "rename" } }));
  const renamed = lifecycleSuccess(await h.reference.store.read({ reference: renamedReference }));
  expect(renamed.reference.owner).toEqual({ ...primary.reference.owner, name: "renamed-example" });
  await completedReplay(h.native, "renamed-example");
  lifecycleSuccess(await h.reference.store.write({ action: "remove", reference: renamed.reference,
    expected: renamed.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
  const replacement = await h.reference.seedMeta("example", { owner: "andrew", branch: null });
  expect(replacement.reference.owner).not.toEqual(primary.reference.owner);
  await completedReplay(h.native, "renamed-example");
  await git("push", "origin", "main", branch);
  const secondGit = async (...args: string[]) => h.secondNative.exec("git", args, { cwd: h.secondNative.cwd });
  await secondGit("fetch", "origin");
  await secondGit("merge", "--ff-only", "origin/main");
  await secondGit("switch", "-c", branch, "--track", `origin/${branch}`);
  await secondGit("config", "arc.identity", "andrew");
  await completedReplay(h.secondNative, "renamed-example");
}, 60_000);
