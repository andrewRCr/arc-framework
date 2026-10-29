/** Live readiness reads selected Store records and the Candidate's machine-local lane owner. */
import { expect, it, onTestFinished } from "vitest";
import { readReviewReadinessBinding } from "../../../../../src/scripts/review-gate/runtime/readiness-binding.js";
import { createReviewCompositionContext } from "../../../../../src/scripts/review-gate/runtime/composition-context.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { candidateFixture } from "../../../../helpers/store/tracked-write-fixture.js";
import { createReviewOutcomePort } from "../../../../../src/lib/store/kinds/review/outcome/access.js";
import { recordLaneAttempt } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { createMemoryRemote } from "../../../../helpers/store/sync.js";
import { ReferenceBackend } from "../../../../helpers/store/reference-backend.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { recordKey } from "../../../../helpers/store/model.js";
import { localPendingBinding } from "../../../../fixtures/lane-pending-binding.js";
import { reviewEvidenceFixture } from "../../../../fixtures/review-evidence.js";
import { approvedFixDecision } from "../../../../fixtures/review-decision.js";
import { createReviewEvidencePort } from "../../../../../src/lib/store/kinds/review/evidence/access.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";

async function fixture(cleanup: (operation: () => Promise<void>) => void) {
  const h = createReviewHarness(), candidate = candidateFixture();
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(repositoryId);
  const primary = await h.seedMeta("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  const checkout = await createReviewCheckout(h);
  cleanup(checkout.cleanup);
  const lineage = { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
  const target = createHostedHandleFixture({ repositoryId }).admission.reviewTarget;
  const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, lineage, vehicle: { kind: "work-unit", identity: "example" }, outcome: "findings",
    findings: [{ findingId: "finding-1", severity: "major", locus: "src/main.ts:1", evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }] }));
  const context = createReviewCompositionContext({ cwd: checkout.cwd, exec: checkout.exec,
    store: h.store, workItem: primary.reference.owner, projectId: h.projectId });
  return { ...h, context, lineage, outcome, input: { store: h.store, workItem: primary.reference.owner,
    inFlight: context.family.ports.inFlight, repositoryId: outcome.target.repositoryId,
    candidateId: candidate.attestation.candidateId, headSha: outcome.target.headSha } };
}

it("recomputes readiness when a selected Candidate's durable outcome is added", async ({ onTestFinished }) => {
  const h = await fixture(onTestFinished);
  const before = await readReviewReadinessBinding(h.input);
  expect(before).toMatchObject({ status: "complete" });
  await createReviewOutcomePort(h.store, h.input.workItem).create(h.outcome);
  const after = await readReviewReadinessBinding(h.input);
  expect(after).toMatchObject({ status: "complete" });
  expect(after).not.toEqual(before);
});

it.each(["evidence", "approved-fix", "withdrawal"])("binds the current %s listing", async (kind) => {
  const h = await fixture(onTestFinished);
  await createReviewOutcomePort(h.store, h.input.workItem).create(h.outcome);
  const decisions = createReviewDecisionPort(h.store, h.input.workItem), grant = approvedFixDecision(h.outcome);
  if (kind === "withdrawal") await decisions.create(grant);
  const before = await readReviewReadinessBinding(h.input);
  expect(before).toMatchObject({ status: "complete" });
  if (kind === "evidence") await createReviewEvidencePort(h.store, h.input.workItem).create(reviewEvidenceFixture(h.outcome));
  else await decisions.create(kind === "approved-fix" ? grant : { ...grant,
    choice: { kind: "withdrawal", decisionKey: reviewDecisionKey(grant) } });
  const after = await readReviewReadinessBinding(h.input);
  expect(after).toMatchObject({ status: "complete" });
  expect(after).not.toEqual(before);
});

it("binds live pending attempts from the Candidate's standard lane owner", async ({ onTestFinished }) => {
  const h = await fixture(onTestFinished);
  const before = await readReviewReadinessBinding(h.input);
  expect(before).toMatchObject({ status: "complete" });
  await recordLaneAttempt(h.context.family.ports.inFlight, { lane: "standard", repositoryId: h.input.repositoryId,
    headSha: h.input.headSha, changeRequestId: null, lineage: h.lineage, attemptId: "pending-review",
    sourceId: h.outcome.source.sourceId, outcome: "pending", consumedPass: false,
    local: localPendingBinding({ operationId: "pending-review", headSha: h.input.headSha, repositoryId: h.input.repositoryId }),
    now: "2026-10-19T13:00:00Z" });
  const after = await readReviewReadinessBinding(h.input);
  expect(after).toMatchObject({ status: "complete" });
  expect(after).not.toEqual(before);
});

it.each(["outcome", "evidence", "decision"] as const)("refuses a missed %s entry and resumes after repair", async (kind) => {
  const h = await fixture(onTestFinished);
  const outcome = await createReviewOutcomePort(h.store, h.input.workItem).create(h.outcome);
  const evidence = await createReviewEvidencePort(h.store, h.input.workItem).create(reviewEvidenceFixture(h.outcome));
  const decision = await createReviewDecisionPort(h.store, h.input.workItem).create(approvedFixDecision(h.outcome));
  const before = await readReviewReadinessBinding(h.input);
  expect(before).toMatchObject({ status: "complete" });
  const reference = ({ outcome, evidence, decision })[kind].reference;
  const key = recordKey(reference);
  h.store.state.faults.set(key, { kind: "unreadable", reference });
  expect(await readReviewReadinessBinding(h.input)).toMatchObject({ status: "incomplete",
    condition: expect.stringContaining(`review/${kind}`) });
  h.store.state.faults.delete(key);
  expect(await readReviewReadinessBinding(h.input)).toEqual(before);
});

it.each(["unreadable", "refused"])("preserves a %s Store listing refusal until repair", async (kind) => {
  const h = await fixture(onTestFinished);
  const before = await readReviewReadinessBinding(h.input);
  if (kind === "unreadable") h.store.state.unreadable.add("review");
  else h.store.state.corrupt = true;
  const observed = await h.store.list({ family: "review", kind: "review/outcome", owner: h.input.workItem });
  const problem = observed.status === "refused" ? observed.refusal
    : observed.result.status === "unreadable" ? observed.result : null;
  if (problem === null) throw new Error("Expected the Store's listing refusal");
  expect(await readReviewReadinessBinding(h.input)).toEqual({ status: "incomplete",
    condition: `${problem.condition} ${problem.remedy.text}` });
  h.store.state.unreadable.clear();
  h.store.state.corrupt = false;
  expect(await readReviewReadinessBinding(h.input)).toEqual(before);
});

it("refuses a conflicted outcome and recomputes readiness after its resolution", async ({ onTestFinished }) => {
  const h = await fixture(onTestFinished), remote = createMemoryRemote();
  h.store.context.publication.remote = remote;
  lifecycleSuccess(await h.store.push());
  const writer = new ReferenceBackend({ state: remote.state, registry: h.store.context.registry });
  const outcome = await createReviewOutcomePort(h.store, h.input.workItem).create(h.outcome);
  await createReviewOutcomePort(writer, h.input.workItem).create({ ...h.outcome, endedAt: "2026-10-19T14:00:00Z" });
  lifecycleSuccess(await h.store.push());
  const conflicted = lifecycleSuccess(await h.store.read({ reference: outcome.reference }));
  expect(conflicted.conflicts.length).toBeGreaterThan(0);
  const result = await readReviewReadinessBinding(h.input);
  expect(result).toMatchObject({ status: "incomplete", condition: expect.stringContaining("conflict") });
  for (const reference of conflicted.conflicts) expect(result.status === "incomplete" ? result.condition : "")
    .toContain(JSON.stringify(reference));
  for (const reference of conflicted.conflicts) {
    const conflict = lifecycleSuccess(await h.store.read({ reference }));
    lifecycleSuccess(await h.store.write({ action: "remove", reference, expected: conflict.version,
      resolves: [reference], provenance: { verb: "resolve", lifecycleAction: "edit" } }));
  }
  expect(await readReviewReadinessBinding(h.input)).toMatchObject({ status: "complete" });
});
