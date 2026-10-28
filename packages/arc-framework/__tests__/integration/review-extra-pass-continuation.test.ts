/** Public extra-pass continuations retain one-pass authority across response and scope transitions. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { localReviewResult } from "../helpers/in-process-review.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { approvedRecord } from "../fixtures/review-response-proof.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { renderMetaFile, writeMetaCurrentWorkflow } from "../../src/lib/store/kinds/meta/writers.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { LocalPrepareEnvelopeSchema, LocalAttestEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation, createCandidateReviewResponseEvidence } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord, readCandidateRecordVersioned } from "../../src/lib/store/kinds/review/candidate/access.js";
import { writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { projectCandidateReviewBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { readLaneResponsePerformance, recordLaneResponsePerformance } from "../../src/scripts/review-gate/lane-progress.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { readIncrementalPredecessorResponseEvidence } from "../../src/scripts/review-gate/policy/review-policy-evidence.js";
import { handleReviewPrePublication, handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewReduce } from "../../src/handlers/review.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import type { ReviewLaneJudgment } from "../../src/scripts/review-gate/policy/review-policy-driver.js";

async function subject(native: boolean) {
  const h = await createReviewRepositoryHarness(); onTestFinished(h.cleanup);
  const selected = native ? h.native : h.inRepo;
  const { cwd } = selected;
  const realExec = selected.exec;
  const exec: GitExec = async (command, args, options) => {
    if (command !== "gh") return realExec(command, args, options);
    if (args[0] === "pr" && args[1] === "list") return { stdout: "[]", stderr: "" };
    throw new Error(`Unexpected host invocation: ${args.join(" ")}`);
  };
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const name = "example", branch = "feat/example", projectId = "123e4567-e89b-42d3-a456-426614174099";
  const remote = await git("remote", "get-url", "origin");
  await git("remote", "set-url", "origin", "git@github.com:owner/repo.git");
  await git("config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git");
  await git("config", "arc.identity", "andrew");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [delegated-agent]\nreview.standard_max_passes: 1\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await writeFile(join(cwd, "source.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "Configure project");
  await git("push", "origin", "main");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
  await git("commit", "-am", "Implement feature");
  const collect = async () => {
    const observed = await collectGitCandidateSubject({ cwd, name, baseBranch: "main", exec });
    if (observed.status !== "collected") throw new Error(observed.detail);
    return observed.target;
  };
  const original = await collect();
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: original.subject, attestation: createCandidateAttestation({ workUnit: name, subject: original.subject,
      baseRevision: original.revision, attestedBy: "andrew", attestedAt: "2026-10-27T12:00:00Z",
      verificationEvidenceRef: "test://verified" }), transitions: [], lineageAttestations: [] };
  const fields = { state: "Active" as const, owner: "andrew", branch, workClass: "Light" as const, taskList: "tasks-example.md",
    currentWorkflow: "process-task-loop" as const, ...(native ? {} : { candidateId: candidate.attestation.candidateId }) };
  const tasks = "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Complete**\n";
  if (native) {
    await h.reference.seedProject(projectId);
    const primary = await h.reference.seedMeta(name, fields, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "created", excluded: [] }],
    });
    await h.reference.seed(recordReferences["work-item/task-list"](primary.reference.owner), tasks);
  } else {
    await mkdir(join(cwd, ".arc/active"), { recursive: true });
    await writeFile(join(cwd, ".arc/active/meta-example.md"), renderMetaFile(name, fields));
    await writeFile(join(cwd, ".arc/active/tasks-example.md"), tasks);
  }
  const store = selected.store!;
  const lookup = lifecycleSuccess(await store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: candidate.attestation.workUnit } }));
  const owner = lookup.reference.owner;
  const input = { ...selected, exec, store, workItem: owner };
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: "2026-10-27T12:00:00Z",
    createdFor: { kind: "work-unit", name } });
  await writeCandidateRecord(cwd, name, candidate, null, { store, owner });
  await writeSubmissionBoundary(cwd, projectCandidateReviewBoundary({ workUnit: name,
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest }, native ? 2 : 1), null, { store, owner });
  await git("add", ".");
  if (!native) await git("add", "-f", ".arc/system/.internal/candidates/example.json", ".arc/system/.internal/candidates/example.boundary.json");
  if ((await git("diff", "--cached", "--name-only")) !== "") await git("commit", "-m", "Record Candidate");
  const context = createReviewCompositionContext(input);
  const reader = createRepositoryReviewResultReader(new RepositoryGitCommonStatePublisher(exec, cwd), input);
  const routingFacts = { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "ordinary",
    ownership: "self", surfaceAuthority: "ordinary" };
  const invoke = async (handler: typeof handleReviewLocalPrepare | typeof handleReviewLocalAttest | typeof handleReviewReduce,
    request: unknown) => {
    let output = ""; const exits: number[] = [];
    await handler("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) }, undefined, input);
    expect(exits, output).toEqual([]);
    return JSON.parse(output);
  };
  const review = async (judgment: ReviewLaneJudgment, findings = false) => {
    const prepared = LocalPrepareEnvelopeSchema.parse(await invoke(handleReviewLocalPrepare, { schemaVersion: 1,
      evaluatorIdentity: "independent-reviewer", routingFacts, policyJudgment: judgment,
      coverageAdmission: { requestedCoverage: "complete" } }));
    if (prepared.state !== "ready") throw new Error(JSON.stringify(prepared));
    const attested = LocalAttestEnvelopeSchema.parse(await invoke(handleReviewLocalAttest,
      localReviewResult(prepared.payload, `run-${prepared.payload.request.logicalPass}`, findings ? [{
        findingId: "finding-1", severity: "major", locus: "source.ts:1", evidenceUrlOrId: "source.ts:1" }] : [])));
    if (attested.state !== "attested-current") throw new Error(JSON.stringify(attested));
    if (!findings) await invoke(handleReviewReduce, { schemaVersion: 1, operationId: prepared.payload.operationId });
    return reader.readResult(prepared.payload.operationId);
  };
  const reviewed = await collect();
  const first = await review({});
  const spent = { exhaustedPassCount: 1, nextPass: 2 };
  const result = await review({ ceilingOverride: spent, additionalPassAuthorization: { headSha: first.target.headSha,
    precedingProducerId: first.producerId, completedPasses: 1, nextPass: 2 } }, true);
  expect(result.admission.logicalPass).toBe(2);
  let approval;
  if (context.family.mode === "stored") {
    const outcome = await context.family.ports.outcomes.read(result.producerId);
    if (outcome === null) throw new Error("Expected immutable producer");
    await publishNativeReviewApproval({ ...context.family.ports, readProjectId: context.projectId,
      record: composeReviewDispositionRecord(outcome.value, [{ ...reviewEvidenceFixture(outcome.value, "fix"), binding: {
        kind: "candidate", candidate: { workUnit: candidate.attestation.workUnit, candidateId: candidate.attestation.candidateId } } }], owner),
      now: () => "2026-10-27T12:01:00Z" });
    approval = await context.family.ports.dispositions.readDispositionRecord(result.producerId);
  } else {
    approval = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
    await context.family.ports.dispositions.appendDispositionRecord(approval);
  }
  if (approval === null) throw new Error("Expected approved response");
  await writeFile(join(cwd, "source.ts"), "export const value = 2;\n");
  await git("commit", "-am", "Apply approved fix");
  const fixed = await collect();
  const response = createCandidateReviewResponseEvidence({ candidateId: candidate.attestation.candidateId,
    oldTarget: reviewed, newTarget: fixed, dispositionId: approval.currentDispositionSetId, approvedBy: "andrew",
    appliedBy: "andrew", applicability: "focused", approvedVerification: "focused",
    verificationEvidenceRefs: ["test://fix"], implementationChanged: true });
  const saved = await readCandidateRecordVersioned(cwd, name, { store, owner });
  await writeCandidateRecord(cwd, name, { ...candidate, transitions: [response] }, saved.version, { store, owner });
  await recordLaneResponsePerformance(context.family.ports.inFlight, { lane: "standard", repositoryId: result.repositoryId,
    headSha: result.target.headSha, lineage: result.admission.lineage, attemptId: result.producerId,
    dispositionSetId: approval.currentDispositionSetId, producedHeadSha: fixed.revision, candidateResponseId: response.responseId,
    now: "2026-10-27T12:02:00Z" });
  const meta = lifecycleSuccess(await store.read({ reference: lookup.reference }));
  lifecycleSuccess(await store.write({ action: "put", reference: meta.reference, expected: meta.version,
    placement: { kind: "active" }, content: writeMetaCurrentWorkflow(meta.content, "prepare-work-unit"),
    provenance: { verb: "prepare-work-unit", lifecycleAction: "prepare" } }));
  if (!native) { await git("add", "."); await git("commit", "-m", "Record response"); }
  expect(await readIncrementalPredecessorResponseEvidence(result, context.family.ports.dispositions,
    predecessor => readLaneResponsePerformance(context.family.ports.inFlight, predecessor))).toMatchObject({ status: "performed" });
  const prepublish = async (judgments: unknown) => {
    let output = ""; const exits: number[] = [];
    await handleReviewPrePublication(name, { selfReview: "settled", lanes: "lanes.json", changeSet: "facts.json" }, {
      resolveRoot: () => cwd, readText: async source => JSON.stringify(source === "facts.json"
        ? { changeSetState: "known", ...routingFacts } : judgments), write: text => { output += text; },
      setExitCode: code => exits.push(code) }, undefined, input);
    expect(exits, output).toEqual([]);
    return JSON.parse(output);
  };
  let retained: ReviewLaneJudgment["ceilingOverride"] = spent;
  if (context.family.mode === "stored") {
    const listing = await context.family.ports.decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    const grant = listing.records.find(({ value }) => value.choice.kind === "extra-pass" && value.choice.precondition.kind === "ceiling");
    if (grant === undefined) throw new Error("Expected the original ceiling decision");
    retained = { ...spent, decisionKey: reviewDecisionKey(grant.value) };
  }
  return { ...input, candidate, result, spent: retained, context, prepublish };
}

it.each([false, true])("public post-fix re-entry omits the consumed complete-pass override (native=%s)", async native => {
  const h = await subject(native);
  const grants = async () => {
    if (h.context.family.mode !== "stored") return [];
    const listing = await h.context.family.ports.decisions.list();
    if (listing.status !== "complete") throw new Error(listing.reason);
    return listing.records.filter(({ value }) => value.choice.kind === "extra-pass");
  };
  const before = await grants();
  const result = await h.prepublish({ frontline: { invocation: { mode: "skip" } }, standard: { ceilingOverride: h.spent } });
  expect(result).toMatchObject({ locus: "candidate-review-pending", policy: { state: "ready", nextAction: "local-prepare",
    payload: { pass: 3, ceilingOverrideApplied: false } } });
  expect(await grants()).toEqual(before);
}, 45_000);
