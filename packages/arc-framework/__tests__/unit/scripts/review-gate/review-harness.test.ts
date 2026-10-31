/** Review fixtures enter the same production registry their consumers read. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateRecordFixture } from "../../../fixtures/review-candidate.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { TransientIdentityRecordSchema } from "../../../../src/lib/errand/identity-record.js";
import { recordReferences, OwnerIdentitySchema } from "../../../../src/lib/store/identity.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createProjectIdentityReader } from "../../../../src/lib/store/project-identity.js";

function errandRecord() {
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand",
    slug: "review-errand", claimId: "1".repeat(32), intent: "Review fixture", origin: "description", originEntry: null,
    branch: "chore/review-errand", state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-19T12:00:00Z", updatedAt: "2026-10-19T12:00:00Z" });
  if (record.kind !== "errand" || record.purpose !== "errand") throw new Error("Expected ordinary Errand");
  return record;
}

it("seeds a complete review record group with a project identity and store-only Errand", async () => {
  const h = createReviewHarness();
  const project = "123e4567-e89b-42d3-a456-426614174099";
  const { record: candidate } = candidateRecordFixture();
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture(),
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest });
  const errand = errandRecord();
  await h.seedProject(project);
  await h.seedErrand(errand);
  const meta = await h.seedReviewWorkUnit(candidate, boundary);
  await expect.soft(createProjectIdentityReader(h.store)()).resolves.toBe(project);
  const errandRead = await h.store.read({ reference: recordReferences["work-item/record"](
    OwnerIdentitySchema.parse({ type: "work-item", name: errand.slug })) });
  expect.soft(errandRead.status).toBe("ok");
  if (errandRead.status === "ok") expect(JSON.parse(errandRead.result.content)).toEqual(errand);
  const candidateRead = await h.store.read({ reference: recordReferences["review/candidate"](meta.reference.owner) });
  const boundaryRead = await h.store.read({ reference: recordReferences["review/integration-boundary"](meta.reference.owner) });
  expect.soft(candidateRead.status).toBe("ok");
  expect.soft(boundaryRead.status).toBe("ok");
  if (candidateRead.status === "ok") expect(JSON.parse(lifecycleSuccess(candidateRead).content)).toEqual(candidate);
  if (boundaryRead.status === "ok") expect(JSON.parse(lifecycleSuccess(boundaryRead).content)).toEqual(boundary);
});

it("shares operational records across scripted clones while keeping local review working state private", async () => {
  const { createReviewCheckout } = await import("../../../helpers/store/review-checkout.js");
  const { createLocalReviewPreparationFixture } = await import("../../../fixtures/local-review-preparation.js");
  const { createReviewCompositionContext } = await import("../../../../src/scripts/review-gate/runtime/composition-context.js");
  const { prepareLocalReview } = await import("../../../../src/scripts/review-gate/runtime/local-prepare.js");
  const { readCandidateRecord } = await import("../../../../src/lib/store/kinds/review/candidate/access.js");
  const { readdir } = await import("node:fs/promises");
  const h = createReviewHarness();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const { record: candidate } = candidateRecordFixture();
  const owner = (await h.seedMeta("example")).reference.owner;
  await h.seedCandidate(owner, candidate);
  const first = await createReviewCheckout(h), second = await createReviewCheckout(h);
  try {
    await expect.soft(readCandidateRecord(second.cwd, "example", { store: second.store, owner })).resolves.toEqual(candidate);
    const a = createReviewCompositionContext({ ...first, workItem: owner });
    const b = createReviewCompositionContext({ ...second, workItem: owner });
    const producer = createLocalReviewPreparationFixture({ repositoryId });
    const prepared = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
      routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
        ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } },
    { ...producer.dependencies, operationStore: a.family.ports.inFlight });
    expect(prepared.state).toBe("ready");
    if (prepared.state !== "ready") throw new Error("Expected local review preparation");
    expect.soft((await a.family.ports.inFlight.readOperation(prepared.payload.operationId)).state?.kind).toBe("local-review");
    expect.soft((await b.family.ports.inFlight.readOperation(prepared.payload.operationId)).state).toBeNull();
    expect.soft(await readdir(first.commonDir)).toContain("arc");
    expect.soft(await readdir(first.cwd)).not.toContain("arc");
  } finally { await Promise.all([first.cleanup(), second.cleanup()]); }
});


it("discovers a store-only Errand through the production locus probe and exact marker", async () => {
  const { createReviewCheckout } = await import("../../../helpers/store/review-checkout.js");
  const { runDerivedLocusStateProbe } = await import("../../../../src/handlers/derived-locus-state-probe.js");
  const h = createReviewHarness();
  const errand = errandRecord();
  await h.seedErrand(errand);
  const checkout = await createReviewCheckout(h);
  try {
    await checkout.occupy(errand.branch, { kind: "errand", slug: errand.slug, claimId: errand.claimId });
    const frame = await runDerivedLocusStateProbe({ ...checkout, baseBranch: "main", archiveCadence: "with-integration" });
    expect(frame.entering).toMatchObject({ kind: "selected", row: { kind: "transient",
      subject: { kind: "errand", key: errand.slug, claimId: errand.claimId } } });
  } finally { await checkout.cleanup(); }
});

it.each(["Active", "Shipped"] as const)("resolves the production %s Candidate owner without checkout meta files", async state => {
  const { createReviewCheckout } = await import("../../../helpers/store/review-checkout.js");
  const { resolveCandidateMutationOwner, resolveCompletedCandidateWorkUnits } = await import("../../../../src/handlers/candidate-mutation-owner.js");
  const { ArchiveQuarterSchema } = await import("../../../../src/lib/kernel/index.js");
  const h = createReviewHarness();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const meta = await h.seedMeta("example", { state, owner: "test-user", taskList: "tasks-example.md",
    currentWorkflow: state === "Active" ? "process-task-loop" : null }, state === "Active" ? { kind: "active" }
    : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  { branches: [{ repository: projectId, ref: "feat/example", linkedAs: "created", excluded: [] }] });
  await h.seed(recordReferences["work-item/task-list"](meta.reference.owner), "# Task List\n\n### `[x]` **1.1 Complete**\n");
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["rev-parse", "--verify", "--quiet", "origin/main"], responses: [{ stdout: "b".repeat(40) }] },
    { match: ["cherry", "b".repeat(40), "a".repeat(40)], responses: [{ stdout: `+ ${"a".repeat(40)}\n` }] },
  ] });
  try {
    await checkout.occupy("feat/example", { kind: "work-unit", name: "example" });
    const result = await resolveCandidateMutationOwner(checkout);
    expect(result).toEqual(state === "Shipped" ? { status: "owned", workUnit: "example", branch: "feat/example" }
      : { status: "owned", workUnit: "example" });
    if (state === "Shipped") expect(await resolveCompletedCandidateWorkUnits(checkout.cwd, checkout.store)).toEqual(["example"]);
  } finally { await checkout.cleanup(); }
});
