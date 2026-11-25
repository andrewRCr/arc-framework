/** Published native delivery phases shared by refusal and cutover tests. */
import { SlugSchema } from "../../../src/lib/kernel/schema/slug.js";
import { vi } from "vitest";
import type { Store } from "../../../src/lib/store/contract.js";
import { createNativeDeliveryReviewRepository } from "./native-delivery-repository.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeMetaTaskList } from "../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "./lifecycle-harness.js";
import { renderDeliveryPlanSection } from "../../../src/lib/delivery/task-list-render.js";
import { createReviewTarget } from "../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { frontlineOutcome, localOutcome, hostedOutcome } from "../../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../../fixtures/review-evidence.js";
import { ReviewOutcomeSchema } from "../../../src/lib/store/kinds/review/outcome/schema.js";
import { ReviewEvidenceSchema } from "../../../src/lib/store/kinds/review/evidence/schema.js";
import { createReviewOutcomePort } from "../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewResponsePort } from "../../../src/lib/store/kinds/review/evidence-root-selection/responses.js";
import { composeReviewDispositionRecord } from "../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { publishNativeReviewApproval } from "../../../src/scripts/review-gate/runtime/native-review-approval.js";
import { DeliveryEntryInspectionRequestSchema } from "../../../src/lib/delivery/entry-inspection.js";

/** Publish closed tasks and a hosted member finding with an approved, unperformed correction. */
export async function createNativePendingResponseFixture() {
  const h = await createNativePublishedDeliveryFixture();
  const store = h.reference.store, owner = h.primary.reference.owner;
  const taskList = await seedNativeClosedDeliveryTasks(h);
  const member = h.state.members[0]!;
  if (member.coordinates === null) throw new Error("Expected published member coordinates");
  const coordinates = member.coordinates;
  const vehicle = { kind: "delivery-member" as const, planId: h.plan.planId, deliverableId: member.deliverableId,
    workUnitId: h.plan.workUnitId, head: coordinates.head };
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: h.projectId, baseRef: "main", diffBaseSha: coordinates.base,
    diffBaseTree: await h.git("rev-parse", `${coordinates.base}^{tree}`), headSha: coordinates.head,
    headTree: coordinates.tree });
  const outcome = ReviewOutcomeSchema.parse(hostedOutcome({ provider: "codex-pr", repositoryId: h.projectId,
    vehicle, reviewTarget: target, target: { repository: "owner/repo", pullRequest: 41, headSha: coordinates.head },
    outcome: "findings", findings: [{ findingId: "finding-1", severity: "major", sourceOrdinal: 1,
      origin: "review-body", reviewId: "review-1", fingerprint: "finding-1", settlement: "not-applicable",
      locus: "member-1.ts:1", url: "https://example.invalid/review", body: "Correct the first member." }] }));
  const value = ReviewEvidenceSchema.parse({ ...reviewEvidenceFixture(outcome, "fix"),
    binding: { kind: "delivery-member", deliveryMember: vehicle } });
  const outcomes = createReviewOutcomePort(store, owner), evidence = createReviewEvidencePort(store, owner);
  await outcomes.create(outcome);
  await publishNativeReviewApproval({ outcomes, evidence, responses: createReviewResponsePort(store, owner),
    readProjectId: h.reference.projectId, record: composeReviewDispositionRecord(outcome, [value], owner),
    now: () => "2026-11-04T12:00:00Z" });
  const input = { ...h.native, store, workItem: owner, baseBranch: "main", taskListPath: ".arc/active/tasks-example.md",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }) };
  return { ...h, taskList, outcome, value, vehicle, input };
}

/** Publish a Candidate fix approval before making its real terminal code change. */
export async function createNativeCandidateCorrectionFixture() {
  const h = await createNativePublishedDeliveryFixture();
  const { readCandidateRecord } = await import("../../../src/lib/store/kinds/review/candidate/access.js");
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const store = h.reference.store, owner = h.primary.reference.owner;
  const candidate = await readCandidateRecord(h.cwd, "example", { store, owner });
  if (candidate === null) throw new Error("Expected the published Candidate");
  const base = candidate.attestation.baseRevision;
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: h.projectId, baseRef: "main", diffBaseSha: base,
    diffBaseTree: await h.git("rev-parse", `${base}^{tree}`), headSha: h.heads[1]!,
    headTree: await h.git("rev-parse", `${h.heads[1]}^{tree}`) });
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, outcome: "findings",
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" }, findings: [{ findingId: "finding-1", severity: "major",
      locus: "member-2.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  const value = ReviewEvidenceSchema.parse({ ...reviewEvidenceFixture(outcome, "fix"),
    binding: { kind: "candidate", candidate: { workUnit: "example", candidateId: candidate.attestation.candidateId } } });
  const outcomes = createReviewOutcomePort(store, owner), evidence = createReviewEvidencePort(store, owner);
  await outcomes.create(outcome);
  await publishNativeReviewApproval({ outcomes, evidence, responses: createReviewResponsePort(store, owner),
    readProjectId: h.reference.projectId, record: composeReviewDispositionRecord(outcome, [value], owner),
    now: () => "2026-11-04T12:00:00Z" });
  await writeFile(join(h.cwd, "member-2.ts"), "export const member2 = false;\n");
  await h.git("commit", "-am", "Apply approved Candidate correction");
  return { ...h, candidate, outcome, value, correctionHead: await h.git("rev-parse", "HEAD") };
}

/** Keep the native task record and its published plan projection in agreement. */
export async function seedNativeClosedDeliveryTasks(h: Awaited<ReturnType<typeof createNativeDeliveryReviewRepository>>) {
  const store = h.reference.store, owner = h.primary.reference.owner;
  const current = lifecycleSuccess(await store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await store.write({ ...recordPut(current, {
    content: writeMetaTaskList(current.content, "tasks-example.md"),
  }), provenance: { verb: "edit", lifecycleAction: "edit" } }));
  return h.reference.seed(recordReferences["work-item/task-list"](owner),
    `# Task List\n\n## **Phase 1:** Build\n\n### \`[x]\` **1.1 First member**\n\n### \`[x]\` **1.2 Second member**\n\n## **Phase 2:** Verify\n\n### \`[x]\` **2.1 Complete**\n\n${renderDeliveryPlanSection(h.plan)}`);
}

/** Carry the published plan/state evidence into a native delivery-status boundary. */
export async function carryNativeDeliveryStatus(h: Awaited<ReturnType<typeof createNativeDeliveryReviewRepository>>) {
  const { projectDeliveryPublicReviewContinuation } = await import("../../../src/lib/delivery/public-review-continuation.js");
  const { readSubmissionBoundaryVersioned, writeSubmissionBoundary } = await import("../../../src/lib/store/kinds/review/integration-boundary/access.js");
  const projected = projectDeliveryPublicReviewContinuation({ plan: h.plan, state: h.state, stateRevision: h.stateRevision });
  if (projected.status !== "projected") throw new Error(projected.reason);
  const before = await readSubmissionBoundaryVersioned(h.cwd, "example", h.access);
  const { projectCorrectiveDeliveryStatusBoundary } = await import("../../../src/scripts/review-gate/policy/integration-boundary-locus.js");
  if (before.boundary === null || before.boundary.candidateSubjectDigest === null) throw new Error("Expected published Candidate boundary");
  await writeSubmissionBoundary(h.cwd, projectCorrectiveDeliveryStatusBoundary({ workUnit: "example",
    candidateId: before.boundary.candidateId, candidateSubjectDigest: before.boundary.candidateSubjectDigest,
    supersedesCandidateId: null, sourceBoundary: before.boundary, deliveryContinuation: projected.continuation }),
  before.version, h.access);
}

/** Name the exact native generation in the marker, rather than relying on an unbound slug claim. */
async function bindNativeDeliveryFixtureCheckout(h: Awaited<ReturnType<typeof createNativeDeliveryReviewRepository>>) {
  const { boundWorkUnitSubject } = await import("./bound-checkout.js");
  const { writeWorktreeMarker } = await import("../../../src/lib/git/worktree-marker.js");
  await writeWorktreeMarker(h.cwd, { spawnedByArc: false, spawningIdentity: "andrew",
    createdAt: "2026-11-04T12:00:00Z", createdFor: boundWorkUnitSubject(h.primary) });
}

/** Prepare unbound private member worktrees and read their actual produced frontline target. */
export async function createNativePrivateMemberFixture() {
  const h = await createNativePendingResponseFixture();
  const { RepositoryDeliveryStateStore } = await import("../../../src/lib/delivery/local-stores.js");
  const { RepositoryGitCommonStatePublisher } = await import("../../../src/lib/git-common-state.js");
  const { createPrePublicationCompositionDependencies } = await import("../../../src/scripts/review-gate/policy/pre-publication-composition.js");
  const { createRepositoryReviewResultReader } = await import("../../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js");
  const { mkdir } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const publisher = new RepositoryGitCommonStatePublisher(h.realExec, h.cwd);
  const removed = await new RepositoryDeliveryStateStore(publisher).remove(h.plan.planId, h.stateRevision);
  if (removed.status !== "ok") throw new Error(removed.reason);
  const commonDir = await h.git("rev-parse", "--git-common-dir");
  for (const [index, member] of h.plan.members.entries()) {
    const head = h.heads[index]!;
    await h.git("update-ref", `refs/arc/delivery-candidates/${h.plan.planId}/${member.chunkKey}`, head);
    const gatePath = resolve(h.cwd, commonDir, "arc", "delivery-gates", h.plan.planId, member.chunkKey);
    await mkdir(dirname(gatePath), { recursive: true });
    await h.git("worktree", "add", "--detach", gatePath, head);
  }
  const invocation = { ...h.native, workItem: h.primary.reference.owner };
  const composed = await createPrePublicationCompositionDependencies(invocation).readDeliveryReviewTargets("example");
  if (composed.status !== "composed" || composed.targets[0] === undefined) throw new Error(JSON.stringify(composed));
  const selected = composed.targets[0];
  const terminal = h.state.members.at(-1)?.coordinates;
  if (terminal === undefined || terminal === null) throw new Error("Expected terminal coordinates");
  const candidateTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2",
    kind: "change-set", repositoryId: h.projectId, baseRef: "main", diffBaseSha: selected.target.diffBaseSha,
    diffBaseTree: selected.target.diffBaseTree, headSha: terminal.head, headTree: terminal.tree });
  const outcome = ReviewOutcomeSchema.parse(frontlineOutcome({ target: selected.target,
    lineage: { kind: "delivery-member", planId: h.plan.planId, deliverableId: selected.vehicle.deliverableId,
      workUnitId: SlugSchema.parse("example") }, responseBinding: { candidate: { workUnit: SlugSchema.parse("example"),
      candidateId: h.boundary.candidateId, target: candidateTarget }, deliveryMember: selected.vehicle } }));
  await createReviewOutcomePort(h.reference.store, h.primary.reference.owner).create(outcome);
  const result = await createRepositoryReviewResultReader(publisher, invocation).readResult(outcome.attemptId);
  return { ...h, invocation, selected, result };
}

/** Publish a changed terminal member awaiting scoped verification acknowledgment. */
export async function createNativeVerificationFixture() {
  const h = await createNativeCandidateCorrectionFixture();
  await seedNativeClosedDeliveryTasks(h);
  await carryNativeDeliveryStatus(h);
  const { writeMetaState, writeMetaCurrentWorkflow } = await import("../../../src/lib/store/kinds/meta/writers.js");
  const current = lifecycleSuccess(await h.reference.store.read({ reference: h.primary.reference }));
  lifecycleSuccess(await h.reference.store.write({ ...recordPut(current, { content:
    writeMetaCurrentWorkflow(writeMetaState(current.content, "Integrating"), "integrate-work-unit") }),
  provenance: { verb: "edit", lifecycleAction: "edit" } }));
  const { installDeliveryReviewFixVerification, projectDeliveryReviewFixVerificationContinuation } =
    await import("../../../src/lib/delivery/review-fix-verification.js");
  const { RepositoryDeliveryStateStore } = await import("../../../src/lib/delivery/local-stores.js");
  const { RepositoryGitCommonStatePublisher } = await import("../../../src/lib/git-common-state.js");
  const head = h.correctionHead, tree = await h.git("rev-parse", "HEAD^{tree}");
  const selected = h.state.members.at(-1)!;
  const changed = { ...h.state, members: h.state.members.map(member => member.deliverableId === selected.deliverableId
    ? { ...member, coordinates: { ...member.coordinates!, head, tree } } : member) };
  const state = installDeliveryReviewFixVerification({ state: changed, selectedDeliverableId: selected.deliverableId,
    memberDeliverableIds: [selected.deliverableId] });
  if (state === null) throw new Error("Expected pending verification");
  const states = new RepositoryDeliveryStateStore(new RepositoryGitCommonStatePublisher(h.realExec, h.cwd));
  const published = await states.publish(h.plan.planId, state, h.stateRevision);
  if (published.status !== "ok") throw new Error(published.reason);
  const continuation = projectDeliveryReviewFixVerificationContinuation({ planId: h.plan.planId,
    state: { revision: published.value.revision, value: state } });
  if (continuation === null) throw new Error("Expected the acknowledgment request");
  const request = { ...continuation.acknowledgementInput, verification: { applicability: "focused", target: { head, tree },
    commitGate: { outcome: "passed", provenance: "rerun", targetTree: tree }, verificationEvidenceRefs: ["test://verified-correction"] } };
  return { ...h, verificationState: state, verificationRevision: published.value.revision, request };
}

/** Drive a production delivery handler with one JSON input and retain its complete command envelope. */
export async function invokeNativeDelivery(h: Awaited<ReturnType<typeof createNativeDeliveryReviewRepository>>,
  command: Parameters<typeof import("../../../src/handlers/delivery-execution.js").handleDeliveryExecution>[0],
  request: unknown, store: Store = h.reference.store) {
  const { handleDeliveryExecution } = await import("../../../src/handlers/delivery-execution.js");
  let output = "";
  const exits: number[] = [];
  const previousExitCode = process.exitCode;
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    await handleDeliveryExecution(command, { input: "-" }, undefined, { readText: async () => JSON.stringify(request),
      write: text => { output += text; }, setExitCode: code => exits.push(code) },
    { ...h.native, store, workItem: h.primary.reference.owner });
  } finally { stdout.mockRestore(); process.exitCode = previousExitCode; }
  const result: unknown = JSON.parse(output);
  return { result, output, exits };
}

/** A published two-member native stack whose checkout names its exact work-item generation. */
export async function createNativePublishedDeliveryFixture(sourceId = "codex-pr") {
  const h = await createNativeDeliveryReviewRepository("delivery/example/member-1", sourceId);
  await bindNativeDeliveryFixtureCheckout(h);
  return h;
}


/** Prepare the actual candidate refs and detached gate checkouts for the current published coordinates. */
export async function prepareNativeDeliveryGates(h: Awaited<ReturnType<typeof createNativeDeliveryReviewRepository>>) {
  const { deriveDeliveryResidueLocators } = await import("../../../src/lib/delivery/residue-reaping.js");
  const { mkdir } = await import("node:fs/promises");
  const { dirname, resolve } = await import("node:path");
  const derived = deriveDeliveryResidueLocators(h.plan, resolve(h.cwd, await h.git("rev-parse", "--git-common-dir")));
  if (derived.status !== "derived") throw new Error(derived.reason);
  for (const [i, locator] of derived.locators.entries()) {
    await h.git("update-ref", locator.candidateRef, h.heads[i]!);
    await mkdir(dirname(locator.gatePath), { recursive: true });
    await h.git("worktree", "add", "--detach", locator.gatePath, h.heads[i]!);
  }
  return derived.locators;
}

/** Let the continuation create its gate, then commit the approved correction in that detached checkout. */
export async function createNativeCorrectedAuthoringFixture() {
  const h = await createNativePendingResponseFixture();
  const prepared = await invokeNativeDelivery(h, "review-fix-continue", { repository: "owner/repo", remote: "origin" });
  const { z } = await import("zod");
  const result = z.object({ status: z.literal("authoring-required"), authoring: z.object({
    kind: z.literal("candidate"), ref: z.string(), checkoutPath: z.string() }) }).parse(prepared.result);
  const { writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  await writeFile(join(result.authoring.checkoutPath, "member-1.ts"), "export const member1 = false;\n");
  await h.realExec("git", ["add", "member-1.ts"], { cwd: result.authoring.checkoutPath });
  await h.realExec("git", ["commit", "-m", "Apply approved member correction"], { cwd: result.authoring.checkoutPath });
  return { ...h, authoring: result.authoring };
}
