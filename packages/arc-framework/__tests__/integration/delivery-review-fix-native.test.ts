/** Native delivery acknowledgment persists its Candidate and boundary without record effects. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { deliverySingleMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { handleDeliveryExecution } from "../../src/handlers/delivery-execution.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { installDeliveryReviewFixVerification, projectDeliveryReviewFixVerificationContinuation } from "../../src/lib/delivery/review-fix-verification.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation, createCandidateVerificationResponseEvidence, reduceCandidateDurableBaseline } from "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecord, readCandidateRecordVersioned, writeCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

it("acknowledges and replays a native delivery correction with no record paths or code commit", async () => {
  const h = await createReviewRepositoryHarness();
  onTestFinished(h.cleanup);
  const { cwd, exec } = h.native;
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  const plan = deliverySingleMemberStackPlanFixture(), name = plan.workUnitId, branch = "feat/delivery-fix";
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.reference.seedProject(projectId);
  await git("config", "arc.identity", "test-user");
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\n");
  await writeFile(join(cwd, ".gitignore"), ".arc/system/.internal/\n.arc/user/\n");
  await git("add", ".");
  await git("commit", "-m", "Configure project");
  const base = await git("rev-parse", "HEAD"), baseTree = await git("rev-parse", "HEAD^{tree}");
  await git("switch", "-c", branch);
  await writeFile(join(cwd, "feature.ts"), "export const value = 1;\n");
  await git("add", "feature.ts");
  await git("commit", "-m", "Implement feature");
  const original = await collectGitCandidateSubject({ cwd, name, baseBranch: "main", exec });
  if (original.status !== "collected") throw new Error(original.detail);
  const primary = await h.reference.seedMeta(name, { state: "Integrating", currentWorkflow: "integrate-work-unit", branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  await writeWorktreeMarker(cwd, { spawnedByArc: false, spawningIdentity: "test-user", createdAt: "2026-10-20T12:00:00Z",
    createdFor: { kind: "work-unit", name } });
  const record = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    subject: original.target.subject, attestation: createCandidateAttestation({ workUnit: name, subject: original.target.subject,
      baseRevision: original.target.revision, attestedBy: "test-user", attestedAt: "2026-10-20T12:00:00Z",
      verificationEvidenceRef: "test://original" }), transitions: [], lineageAttestations: [] };
  await h.reference.seedCandidate(primary.reference.owner, record);
  await writeFile(join(cwd, "feature.ts"), "export const value = 2;\n");
  await git("commit", "-am", "Apply approved correction");
  const head = await git("rev-parse", "HEAD"), tree = await git("rev-parse", "HEAD^{tree}");
  const initial = deliveryStateFixture(plan), selectedDeliverableId = plan.members[0]!.deliverableId;
  const value = installDeliveryReviewFixVerification({ state: { ...initial,
    target: { ref: "refs/heads/main", coordinates: { head: base, tree: baseTree } },
    members: initial.members.map(member => ({ ...member, ref: `refs/heads/${branch}`,
      coordinates: { base, head, tree }, changeRequest: { providerId: "github", changeRequestId: "42" } })) },
    selectedDeliverableId, memberDeliverableIds: [selectedDeliverableId] });
  if (value === null) throw new Error("Expected pending verification");
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd), stateStore = new RepositoryDeliveryStateStore(publisher);
  expect(await new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec).restoreExact(plan.planId, plan)).toHaveProperty("status", "ok");
  const state = { revision: 9, value };
  expect(await stateStore.restoreExact(plan.planId, state)).toHaveProperty("status", "ok");
  const continuation = projectDeliveryReviewFixVerificationContinuation({ planId: plan.planId, state });
  if (continuation === null) throw new Error("Expected acknowledgment coordinates");
  const reservation = createStandardReviewReservation({ candidateId: record.attestation.candidateId, sourceId: "codex-pr",
    target: { kind: "delivery", workUnitId: name, planId: plan.planId, repository: "owner/repo" },
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest, retrigger: "full-final", count: 1 } });
  await h.reference.seedBoundary(primary.reference.owner, projectPublicationBoundary({ workUnit: name, branch,
    candidateId: record.attestation.candidateId, candidateSubjectDigest: record.subject.subjectDigest,
    readinessBinding: null, reservation, changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2));
  const request = { ...continuation.acknowledgementInput, verification: { applicability: "focused", target: { head, tree },
    commitGate: { outcome: "passed", provenance: "rerun", targetTree: tree }, verificationEvidenceRefs: ["test://scoped-verification"] } };
  const dispatch = async (input = request) => {
    let output = "";
    const exits: number[] = [];
    await handleDeliveryExecution("review-fix-acknowledge", { input: "-" }, undefined, { readText: async () => JSON.stringify(input),
      write: text => { output += text; }, setExitCode: code => exits.push(code) },
    { ...h.native, workItem: primary.reference.owner });
    return { result: JSON.parse(output), exits, output };
  };
  const invoke = async () => {
    const { result, exits, output } = await dispatch();
    expect((await readCandidateRecord(cwd, name, { store: h.reference.store, owner: primary.reference.owner }))?.transitions)
      .toMatchObject([{ transitionKind: "verification-response", newTarget: { revision: head } }]);
    expect(exits, output).toEqual([]);
    expect(result).toMatchObject({ status: expect.stringMatching(/^(acknowledged|already-acknowledged)$/),
      candidate: { candidateId: record.attestation.candidateId }, boundaryCarry: { stateRevision: 10 } });
    expect(result.candidate).not.toHaveProperty("recordPath");
    expect(result.boundaryCarry).not.toHaveProperty("path");
    expect(result).not.toHaveProperty("recordEffects");
    return result;
  };
  await invoke();
  const candidate = await readCandidateRecord(cwd, name, { store: h.reference.store, owner: primary.reference.owner });
  expect(candidate?.transitions).toMatchObject([{ transitionKind: "verification-response", newTarget: { revision: head } }]);
  const boundary = (await readSubmissionBoundaryVersioned(cwd, name, { store: h.reference.store, owner: primary.reference.owner })).boundary;
  if (candidate === null) throw new Error("Expected the verified Candidate");
  expect(boundary).toMatchObject({ locus: "delivery-status-required", candidateSubjectDigest: reduceCandidateDurableBaseline(candidate).target.subject.subjectDigest,
    deliveryContinuation: { stateRevision: 10 } });
  const beforeConflict = await h.reference.store.version();
  expect((await dispatch({ ...request, verification: { ...request.verification,
    verificationEvidenceRefs: ["test://different-verification"] } })).result)
    .toMatchObject({ status: "refused", reason: "candidate-verification-replay-mismatch" });
  expect(await h.reference.store.version()).toEqual(beforeConflict);
  await invoke();
  const saved = await readCandidateRecordVersioned(cwd, name, { store: h.reference.store, owner: primary.reference.owner });
  if (saved.record === null || saved.version === null) throw new Error("Expected the current Candidate version");
  const target = reduceCandidateDurableBaseline(saved.record).target;
  const later = createCandidateVerificationResponseEvidence({ candidateId: saved.record.attestation.candidateId,
    oldTarget: target, newTarget: target, authorityRef: canonicalDigest({ verification: "later" }),
    verifiedBy: "test-user", verifiedAt: "2026-10-20T12:03:00Z", applicability: "focused",
    verificationEvidenceRefs: ["test://later-verification"], implementationChanged: false });
  await writeCandidateRecord(cwd, name, { ...saved.record, transitions: [...saved.record.transitions, later] },
    saved.version, { store: h.reference.store, owner: primary.reference.owner });
  expect((await dispatch()).result).toMatchObject({ status: "refused", reason: "candidate-verification-replay-unproven" });
  expect((await readSubmissionBoundaryVersioned(cwd, name, { store: h.reference.store, owner: primary.reference.owner })).boundary).toEqual(boundary);
  expect(await git("rev-parse", "HEAD")).toBe(head);
  expect(await git("diff", "--cached", "--name-only")).toBe("");
}, 30_000);
