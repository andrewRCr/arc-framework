/** Publication withdrawal joins reopening without changing the Candidate or its portable review decisions. */
import { expect, it } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../../../helpers/store/tracked-write-fixture.js";
import { terminusDecision } from "../../../fixtures/review-decision.js";
import { canonicalDigest } from "../../../../src/lib/kernel/index.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { createReviewDecisionPort } from "../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../src/lib/store/kinds/review/decision/key.js";
import { readSubmissionBoundaryVersioned } from "../../../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectCandidateReviewBoundary, projectPublicationBoundary,
  recoverAttestedSingletonPublicationBoundary } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { authorizeActivePublication } from "../../../../src/lib/work-unit/verbs/publish.js";
import { runReopen } from "../../../../src/lib/work-unit/verbs/reopen.js";
import type { ExecuteTransitionContext } from "../../../../src/lib/work-unit/lifecycle-executor.js";
import { recordPut } from "../../../../src/lib/store/lifecycle-write.js";
import { runArchive } from "../../../../src/lib/work-unit/verbs/archive.js";

async function fixture(accepted = false, present = true) {
  const h = createReviewHarness(), candidate = candidateFixture();
  const primary = await h.seedMeta("example", { state: "Integrating", currentWorkflow: "integrate-work-unit", taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: Example\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  const savedCandidate = await h.seedCandidate(primary.reference.owner, candidate);
  const decision = { ...terminusDecision(), subject: { lineage: { kind: "candidate" as const, candidateId: candidate.attestation.candidateId },
    headSha: null, subjectDigest: candidate.subject.subjectDigest } };
  const decisions = createReviewDecisionPort(h.store, primary.reference.owner);
  const terminus = accepted ? reviewDecisionKey((await decisions.create(decision)).value) : null;
  const reservation = accepted ? null : createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
    sourceId: "codex-pr", repository: "owner/repo", headSha: candidate.attestation.baseRevision,
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "feat/example",
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest,
    reservation, terminus, readinessBinding: canonicalDigest({ readiness: 1 }), changeRequest: null }, 2);
  const savedBoundary = present ? await h.seedBoundary(primary.reference.owner, boundary) : null;
  const forbidden = (): Promise<never> => Promise.reject(new Error("tracked artifact access"));
  let withdrawals = 0;
  const ctx: ExecuteTransitionContext = { cwd: "/repo", store: h.store,
    indexFs: { readdir: forbidden, readFile: forbidden }, setPhase: forbidden, relocateArtifacts: forbidden,
    reconcileBranch: forbidden, reconcileWorkUnitWorktree: forbidden, writeSoftFields: forbidden,
    writeBranchField: forbidden, writeCurrentWorkflowField: forbidden, writeDesignField: forbidden,
    sideEffects: { "withdraw-pr": Object.assign(async () => undefined, { prepareWithdrawal: async () => ({
      name: "withdraw-pr", run: async () => { withdrawals += 1; }, retryCommand: ["gh", "pr", "close", "feat/example"],
    }) }) } };
  return { ...h, primary, candidate, savedCandidate, boundary, savedBoundary, decisions, ctx,
    withdrawals: () => withdrawals,
    readBoundary: () => readSubmissionBoundaryVersioned("/repo", "example", { store: h.store, owner: primary.reference.owner }) };
}

it.each([
  { accepted: false, withdrawMode: "close" as const }, { accepted: false, withdrawMode: "draft" as const },
  { accepted: true, withdrawMode: "close" as const }, { accepted: true, withdrawMode: "draft" as const },
])("withdraws publication atomically with %j", async ({ accepted, withdrawMode }) => {
  const h = await fixture(accepted), before = lifecycleSuccess(await h.store.version());
  const decisions = await h.decisions.list();
  expect(recoverAttestedSingletonPublicationBoundary({ stored: h.boundary, integrating: true, repairCurrent: true, workUnit: "example",
    candidateId: h.boundary.candidateId, candidateSubjectDigest: h.boundary.candidateSubjectDigest! })).toEqual(h.boundary);
  expect(await runReopen(h.ctx, { name: "example", prMerged: false, withdrawMode })).toMatchObject({ status: "reopened" });
  const stored = (await h.readBoundary()).boundary;
  const expected = { ...projectCandidateReviewBoundary({ workUnit: "example", candidateId: h.boundary.candidateId,
    candidateSubjectDigest: h.boundary.candidateSubjectDigest }, 2), terminus: h.boundary.terminus };
  expect(stored).toEqual(expected);
  if (stored?.schemaVersion !== 2) throw new Error("Expected native withdrawal");
  expect(authorizeActivePublication({ boundary: stored, candidateId: stored.candidateId,
    candidateSubjectDigest: stored.candidateSubjectDigest! })).toMatchObject({ status: "refused", reason: expect.stringContaining("remain open") });
  expect(recoverAttestedSingletonPublicationBoundary({ stored, integrating: false, repairCurrent: true, workUnit: "example",
    candidateId: stored.candidateId, candidateSubjectDigest: stored.candidateSubjectDigest! })).toBeNull();
  expect(await h.decisions.list()).toEqual(decisions);
  expect(lifecycleSuccess(await h.store.read({ reference: h.savedCandidate.reference }))).toEqual(h.savedCandidate);
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes.map(change => change.reference.kind).sort()).toEqual(["review/integration-boundary", "work-item/meta", "work-item/task-list"]);
  const batches = changes.map(change => "batchId" in change.provenance ? change.provenance.batchId : undefined);
  expect(batches).toEqual([expect.any(String), expect.any(String), expect.any(String)]);
  expect(new Set(batches).size).toBe(1);
  expect(h.withdrawals()).toBe(1);
});

it("refuses a moved boundary without lifecycle effects and succeeds on a fresh retry", async () => {
  const h = await fixture(), batch = h.store.batch.bind(h.store);
  if (h.savedBoundary === null) throw new Error("Expected the original boundary");
  const saved = h.savedBoundary;
  let once = true;
  h.store.batch = async input => {
    if (once) {
      once = false;
      lifecycleSuccess(await h.store.write({ ...recordPut(saved, { content: JSON.stringify({ ...h.boundary,
        nextAction: { ...h.boundary.nextAction, interactionText: "Resume the changed publication." } }) }),
        provenance: { verb: "write-submission-boundary", lifecycleAction: "edit" } }));
    }
    return batch(input);
  };
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "rejected", refusal: { code: "version-conflict" } });
  expect(lifecycleSuccess(await h.store.read({ reference: h.primary.reference }))).toEqual(h.primary);
  expect(h.withdrawals()).toBe(0);
  expect((await h.readBoundary()).boundary).toMatchObject({ locus: "publication-pending" });
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "reopened" });
  expect((await h.readBoundary()).boundary).toMatchObject({ locus: "candidate-review-pending", reservation: null });
  expect(h.withdrawals()).toBe(1);
});

it("reopens a Candidate with no boundary without manufacturing a review write", async () => {
  const h = await fixture(false, false), before = lifecycleSuccess(await h.store.version());
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "reopened" });
  expect(await h.readBoundary()).toEqual({ boundary: null, version: null });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes.map(change => change.reference.kind).sort()).toEqual(["work-item/meta", "work-item/task-list"]);
});

it.each(["malformed", "newer-format"] as const)("refuses a %s boundary without lifecycle effects and resumes after repair", async fault => {
  const h = await fixture(), before = await h.store.version();
  const raw = [...h.store.state.records.values()].find(record => record.reference.kind === "review/integration-boundary");
  if (raw === undefined) throw new Error("Expected the saved boundary");
  const original = raw.content;
  const originalFormat = raw.formatVersion;
  if (fault === "malformed") raw.content = "{invalid boundary";
  else raw.formatVersion += 1;
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "rejected",
    reason: expect.stringMatching(/repair|newer/iu) });
  expect(await h.store.version()).toEqual(before);
  expect(h.withdrawals()).toBe(0);
  raw.content = original;
  raw.formatVersion = originalFormat;
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "reopened" });
});

it("retires an archived Candidate from live listings through its owner without a review write", async () => {
  const h = await fixture(), before = lifecycleSuccess(await h.store.version());
  const live = () => h.store.list({ family: "review", kind: "review/candidate",
    filter: { locations: ["active", "planned", "provisional"] } });
  expect(lifecycleSuccess(await live())).toMatchObject({ status: "complete", records: [expect.objectContaining({ reference: h.savedCandidate.reference })] });
  expect(await runArchive({ executor: h.ctx, fs: { readdir: async () => { throw new Error("tracked archive scan"); } },
    clock: () => new Date("2026-10-20T12:00:00Z") }, { name: "example" })).toMatchObject({ status: "archived" });
  expect(lifecycleSuccess(await live())).toMatchObject({ status: "complete", records: [] });
  const candidate = lifecycleSuccess(await h.store.read({ reference: h.savedCandidate.reference }));
  expect(candidate).toMatchObject({ version: h.savedCandidate.version, content: h.savedCandidate.content,
    placement: { kind: "completed" } });
  const changes = lifecycleSuccess(await h.store.changes({ from: before, to: lifecycleSuccess(await h.store.version()) }));
  expect(changes.map(change => change.reference.kind)).toEqual(["work-item/meta"]);
});

it("refuses a conflicted boundary naming its conflicts and remedy, and reopens once they are resolved", async () => {
  const h = await fixture(), read = h.store.read.bind(h.store), before = await h.store.version();
  let conflicted = true;
  h.store.read = async input => {
    const result = await read(input);
    return conflicted && result.status === "ok" && input.reference.kind === "review/integration-boundary"
      ? { status: "ok", result: { ...result.result, conflicts: [result.result.reference] } } : result;
  };
  const refused = await runReopen(h.ctx, { name: "example", prMerged: false });
  expect(refused).toMatchObject({ status: "rejected", reason: expect.stringContaining(JSON.stringify(h.savedBoundary?.reference)),
    remedy: { text: expect.stringContaining("Resolve the named conflict records") } });
  expect(await h.store.version()).toEqual(before);
  conflicted = false;
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "reopened" });
});

it("names a remedy when a malformed boundary refuses reopening", async () => {
  const h = await fixture();
  const raw = [...h.store.state.records.values()].find(record => record.reference.kind === "review/integration-boundary");
  if (raw === undefined) throw new Error("Expected the saved boundary");
  raw.content = "{invalid boundary";
  expect(await runReopen(h.ctx, { name: "example", prMerged: false })).toMatchObject({ status: "rejected",
    remedy: { text: expect.stringContaining("Repair the integration boundary") } });
});
