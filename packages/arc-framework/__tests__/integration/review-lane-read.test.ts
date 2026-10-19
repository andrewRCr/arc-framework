/** Lane reads authenticate a real checkout and preserve first-use stores. */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { handleReviewLaneRead } from "../../src/handlers/review.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { serializeTransientIdentityRecord, TransientIdentityRecordV3Schema } from "../../src/lib/errand/identity-record.js";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });
async function snapshot(path: string): Promise<unknown> {
  const entries = await readdir(path, { withFileTypes: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  });
  return Promise.all(entries.sort((a,b) => a.name.localeCompare(b.name)).map(async entry => [entry.name,
    entry.isDirectory() ? await snapshot(join(path, entry.name)) : await readFile(join(path, entry.name), "utf8")]));
}
async function run(root: string, request = { schemaVersion: 1 }) {
  let output = "";
  await handleReviewLaneRead("-", { resolveRoot: () => root,
    readText: async () => JSON.stringify(request), write: text => { output += text; },
    setExitCode: () => undefined });
  return JSON.parse(output);
}
it("refuses outside a claim checkout, resumes in it, and creates no first-use review records", async () => {
  const root = await createTempRepoCore({ prefix: "arc-lane-read-", identity: "andrew" }); roots.push(root);
  const exec = makeGitExec(root);
  const git = async (...args: string[]) => (await exec("git", args, { cwd: root })).stdout.trim();
  await git("commit", "--allow-empty", "-m", "base");
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", slug: "lane-read",
    claimId: "0123456789abcdef0123456789abcdef", purpose: "errand", origin: "description", originEntry: null,
    intent: "Read review history", branch: "chore/lane-read", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z" });
  await writeFile(join(root, "lane-read"), serializeTransientIdentityRecord(record));
  await git("add", "."); await git("commit", "-m", "claim snapshot");
  await git("update-ref", "refs/arc/user/andrew/errands", "HEAD");
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"), "review.standard_max_passes: 4\n");
  await git("add", "."); await git("commit", "-m", "configuration");
  const before = await snapshot(join(root, ".git/arc"));
  const outside = await run(root);
  expect(outside).toMatchObject({ state: "refused", payload: { code: "vehicle-unresolved",
    remedy: { text: expect.stringContaining("checkout"), argv: ["arc", "review", "lane", "read", "-"], stdin: { schemaVersion: 1 } } } });
  if (record.branch === null) throw new Error("claim branch missing");
  await git("switch", "-c", record.branch);
  expect(await run(root)).toMatchObject({ state: "ready", payload: {
    lineage: { kind: "head-bound", vehicleIdentity: record.claimId }, rejections: [], lastLook: null,
    facts: { completePasses: 0, ceiling: 4 } } });
  expect(await snapshot(join(root, ".git/arc"))).toEqual(before);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand", vehicleIdentity: record.claimId,
    headSha: await git("rev-parse", "HEAD") };
  await seedRejection({ cwd: root, exec, publisher, repositoryId }, lineage);
  const historyBefore = await snapshot(join(root, ".git/arc"));
  expect(await runHistory({ cwd: root, exec }, { schemaVersion: 1 })).toMatchObject({ state: "ready", payload: {
    lineage, rejections: [{ lane: "standard", findingId: "finding-1", reason: "The source check established this disposition." }],
    facts: { completePasses: 1, ceiling: 4 } } });
  expect(await snapshot(join(root, ".git/arc"))).toEqual(historyBefore);
});

import { readReviewLane } from "../../src/scripts/review-gate/runtime/lane-read-composition.js";
import type { ReviewLaneReadRequest } from "../../src/scripts/review-gate/lane-read.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { deriveLocalReviewTarget } from "../../src/scripts/review-gate/hosts/local/repository-target.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { createReadOnlyRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { createHostedAdmission } from "../../src/scripts/review-gate/hosted/request.js";
import { createReviewRequirement } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { laneProgressOperationId, bindHostedAttemptDisposition } from "../../src/scripts/review-gate/lane-progress.js";
import { LaneSubjectLineageSchema, type LaneSubjectLineage } from "../../src/scripts/review-gate/core/lane-admission.js";
import { createHostedTerminalAttemptFixture, publishHostedTerminalProgressFixture } from "../fixtures/hosted-review.js";
import { approvedRecord } from "../fixtures/review-response-proof.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord, readCandidateRecordVersioned } from "../../src/lib/work-unit/candidate-record-store.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../src/lib/work-unit/submission-boundary-store.js";
import { IntegrationBoundaryLocusSchema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryStateV1Schema } from "../../src/lib/delivery/schema.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";

async function workUnitCheckout() {
  const cwd = await createTempRepoCore({ prefix: "arc-lane-read-history-", identity: "andrew" }); roots.push(cwd);
  const real = makeGitExec(cwd);
  const exec: GitExec = async (command, args, options) => command === "gh"
    ? { stdout: "[]", stderr: "" } : real(command, args, options);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "review.standard_max_passes: 4\nreview.standard_sources: [delegated-agent]\n");
  await git("add", "."); await git("commit", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  await git("switch", "-c", "feat/example");
  await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
  await git("add", "."); await git("commit", "-m", "contribution");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec,
    revision: await git("rev-parse", "HEAD") });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    attestation: createCandidateAttestation({ workUnit: "example", subject: collected.target.subject, baseRevision: base,
      attestedBy: "andrew", attestedAt: "2026-10-18T00:00:00Z", verificationEvidenceRef: "test://verified" }),
    subject: collected.target.subject, transitions: [], lineageAttestations: [] };
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", { owner: "andrew", branch: "feat/example",
    workClass: "Light", taskList: "tasks-example.md" }));
  await writeCandidateRecord(cwd, "example", candidate, null);
  await writeSubmissionBoundary(cwd, IntegrationBoundaryLocusSchema.parse({ schemaVersion: 1, mode: "pre-publication-review",
    workUnit: "example", candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest,
    locus: "candidate-review-pending", nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review." },
    policy: null, reservation: null }), null);
  await git("add", "."); await git("commit", "-m", "candidate");
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  return { cwd, exec, git, publisher, repositoryId, candidate, base };
}

async function seedRejection(fixture: Pick<Awaited<ReturnType<typeof workUnitCheckout>>, "cwd" | "exec" | "publisher" | "repositoryId">, lineage: LaneSubjectLineage,
  member?: { head: string; base: string }) {
  const { cwd, exec, publisher, repositoryId } = fixture;
  const reviewTarget = await deriveLocalReviewTarget({ cwd, exec, repositoryId, baseRef: "main",
    ...(member === undefined ? {} : { memberCoordinates: { headSha: member.head, diffBaseSha: member.base } }) });
  const target = { repository: "owner/repo", pullRequest: 42, headSha: reviewTarget.headSha };
  const requirement = createReviewRequirement({ target: reviewTarget, projection: { obligation: "required", reasons: ["sensitive-change-set"],
    rubricVersion: "standard-review/v1", rubricDigest: `sha256:${"a".repeat(64)}`, retrigger: "full-final", count: 1 },
    acceptableSources: [{ sourceKind: "hosted", qualifier: "codex-pr" }], initialAdmission: "automatic" });
  if (requirement === null) throw new Error("missing requirement");
  const admission = createHostedAdmission({ schemaVersion: 1, repositoryId, lineage, logicalPass: 1, sourceId: "codex-pr",
    target, requestedCoverage: "complete", reviewTarget, requirement, actorIdentity: "independent-reviewer",
    ...(lineage.kind === "delivery-member" ? { vehicle: { ...lineage, head: reviewTarget.headSha } } : {}) });
  const terminal = createHostedTerminalAttemptFixture({ admission, outcome: "findings", findings: [{
    findingId: "finding-1", origin: "review-body", reviewId: "review-1", fingerprint: "finding-1",
    settlement: "not-applicable", severity: "major", locus: "source.ts:1", url: "https://example.test/review", body: "Review finding.", sourceOrdinal: 1 }] });
  await publishHostedTerminalProgressFixture(new LocalReviewOperationStateStore(publisher), {
    operationId: laneProgressOperationId({ lane: "standard", repositoryId, lineage, headSha: reviewTarget.headSha }), repositoryId,
    lineage, logicalPass: 1, changeRequestId: "owner/repo/42", headSha: reviewTarget.headSha, sourceId: "codex-pr",
    outcome: "findings", terminal, now: "2026-10-18T00:00:00Z" });
  const producer = await createReadOnlyRepositoryReviewResultReader(publisher, repositoryId).readResult(terminal.attemptId);
  const record = approvedRecord(producer, [{ sourceVerification: "not-supported", verifiedSeverity: null, disposition: "reject" }]);
  await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(record);
  await bindHostedAttemptDisposition(new LocalReviewOperationStateStore(publisher), {
    operationId: laneProgressOperationId({ lane: "standard", repositoryId, lineage, headSha: reviewTarget.headSha }),
    attemptId: terminal.attemptId, dispositionSetId: record.currentDispositionSetId,
    findingDispositions: [{ findingId: "finding-1", disposition: "reject", channelAction: "record-only" }],
    now: "2026-10-18T00:01:00Z" });

}

async function runHistory(fixture: { cwd: string; exec: GitExec }, request: ReviewLaneReadRequest) {
  let output = "";
  await handleReviewLaneRead("-", { resolveRoot: () => fixture.cwd, readText: async () => JSON.stringify(request),
    read: (input, cwd) => readReviewLane(input, { cwd, exec: fixture.exec }), write: text => { output += text; },
    setExitCode: () => undefined });
  return JSON.parse(output);
}

it("reads real Candidate history without initializing absent review namespaces", async () => {
  const fixture = await workUnitCheckout();
  const lineage = { kind: "candidate" as const, candidateId: fixture.candidate.attestation.candidateId };
  await seedRejection(fixture, lineage);
  const before = await snapshot(join(fixture.cwd, ".git/arc"));
  expect(await runHistory(fixture, { schemaVersion: 1 })).toMatchObject({ state: "ready", payload: { lineage,
    rejections: [{ lane: "standard", findingId: "finding-1", sourceVerification: "not-supported",
      reason: "The source check established this disposition." }], facts: { completePasses: 1, ceiling: 4 } } });
  expect(await snapshot(join(fixture.cwd, ".git/arc"))).toEqual(before);
});

it("refuses an unbound member head, then reads only that member after binding", async () => {
  const fixture = await workUnitCheckout();
  const head = await fixture.git("rev-parse", "HEAD");
  const request = { schemaVersion: 1 as const, memberHeadObjectId: head };
  const unboundBefore = await snapshot(join(fixture.cwd, ".git/arc"));
  expect(await runHistory(fixture, request)).toMatchObject({ state: "refused", payload: { code: "delivery-member-unbound",
    remedy: { text: expect.stringContaining(head), stdin: request } } });
  expect(await snapshot(join(fixture.cwd, ".git/arc"))).toEqual(unboundBefore);
  const plan = deliveryStackPlanForWorkUnitFixture("example");
  const planStore = new RepositoryDeliveryPlanStore(fixture.publisher, DeliveryPlanV1Codec);
  expect((await planStore.publishCurrent(plan.planId, plan, null)).status).toBe("ok");
  const state = DeliveryStateV1Schema.parse({ schemaVersion: 1, semanticsVersion: "delivery-state/v1", planId: plan.planId,
    workUnitId: "example", boundPlan: { planRevision: plan.planRevision, planDigest: plan.planDigest }, target: null,
    members: plan.members.map((member, index) => ({ deliverableId: member.deliverableId, ref: `opaque-${index}`, changeRequest: null,
      coordinates: { base: fixture.base, head: index === 0 ? head : fixture.base, tree: "a".repeat(40) } })),
    activeOperation: null, pendingReviewFixVerification: null });
  expect((await new RepositoryDeliveryStateStore(fixture.publisher).publish(plan.planId, state, 0)).status).toBe("ok");
  const lineage = LaneSubjectLineageSchema.parse({ kind: "delivery-member", planId: plan.planId, workUnitId: "example",
    deliverableId: plan.members[0]!.deliverableId });
  await seedRejection(fixture, lineage, { head, base: fixture.base });
  await seedRejection(fixture, { kind: "candidate", candidateId: fixture.candidate.attestation.candidateId });
  const before = await snapshot(join(fixture.cwd, ".git/arc"));
  expect(await runHistory(fixture, request)).toMatchObject({ state: "ready", payload: { lineage,
    rejections: [{ lane: "standard", findingId: "finding-1" }], facts: { completePasses: 1, ceiling: 4 } } });
  expect(await snapshot(join(fixture.cwd, ".git/arc"))).toEqual(before);
});

it("includes the validated superseded Candidate owners in rejection and ceiling facts", async () => {
  const fixture = await workUnitCheckout();
  const prior = { kind: "candidate" as const, candidateId: fixture.candidate.attestation.candidateId };
  await seedRejection(fixture, prior);
  const successor = { ...fixture.candidate, attestation: createCandidateAttestation({ workUnit: "example",
    subject: fixture.candidate.subject, baseRevision: fixture.base, supersedes: prior.candidateId,
    attestedBy: "andrew", attestedAt: "2026-10-19T00:00:00Z", verificationEvidenceRef: "test://reroot-verified" }) };
  await writeCandidateRecord(fixture.cwd, "example", successor,
    (await readCandidateRecordVersioned(fixture.cwd, "example")).version);
  const boundary = await readSubmissionBoundaryVersioned(fixture.cwd, "example");
  if (boundary.boundary === null) throw new Error("expected Candidate boundary");
  await writeSubmissionBoundary(fixture.cwd, { ...boundary.boundary, candidateId: successor.attestation.candidateId }, boundary.version);
  await fixture.git("add", "."); await fixture.git("commit", "-m", "reroot candidate");
  const result = await runHistory(fixture, { schemaVersion: 1 });
  expect(result).toMatchObject({ state: "ready", payload: { lineage: { kind: "candidate", candidateId: successor.attestation.candidateId },
    rejections: [{ findingId: "finding-1", reason: "The source check established this disposition." }],
    facts: { completePasses: 1, ceiling: 4 } } });
});
