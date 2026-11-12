/** A native fix approval's extra-pass reference must name the live grant within the response's reach, then is not stored. */
import { expect, it } from "vitest";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewDecisionPort } from "../../../../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../../../../src/lib/store/kinds/review/decision/key.js";
import type { ReviewDecision } from "../../../../../src/lib/store/kinds/review/decision/schema.js";
import { currentApprovedDispositionNode } from "../../../../../src/scripts/review-gate/core/advisory-records.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { dependencies, fixture, localRequest, policyRequest } from "../../../../fixtures/respond-command.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";

type Digest = ReturnType<typeof canonicalDigest>;

async function native() {
  const records = fixture(), h = createReviewHarness();
  const decisions = createReviewDecisionPort(h.store, (await h.seedMeta("example")).reference.owner);
  const deps = { ...dependencies(records), stateOffBranch: true as const,
    extraPassFacts: { decisions, readProjectId: async () => records.target.repositoryId } };
  const base = policyRequest(records);
  const ceiling = (passCount: number, change: Partial<ReviewDecision> = {}): ReviewDecision => ({ schemaVersion: 1,
    subject: { lineage: records.operation.lineage, headSha: records.target.headSha, subjectDigest: canonicalDigest({ subject: 1 }) },
    lane: "standard", choice: { kind: "extra-pass", passCount, precondition: { kind: "ceiling", targetBinding: { kind: "call-target" } } },
    decidedBy: "andrew", decidedAt: "2026-10-31T10:00:00Z", basis: null, ...change });
  const record = async (value: ReviewDecision) => reviewDecisionKey((await decisions.create(value)).value);
  const approval = (decisionKey: Digest, disposition: "fix" | "defer" = "fix") => withReviewReport({ ...localRequest(records, disposition),
    policyRequest: { ...base, ceilingOverride: { target: base.target, lane: base.lane, exhaustedPassCount: 1, nextPass: 2, decisionKey } },
    conditionalNextPassAuthorization: { authorizedBy: records.authority.authorIdentity, exhaustedPassCount: 1, nextPass: 2 } });
  const refuses = async (key: Digest, reason: string) => {
    await expect(respondToReviewCommand(approval(key), deps)).rejects.toMatchObject({ code: "invalid-input",
      message: expect.stringContaining(reason) });
    await expect(deps.dispositionStore.readDispositionRecord(records.operation.operationId)).resolves.toBeNull();
  };
  const approves = async (key: Digest) => {
    expect(await respondToReviewCommand(approval(key), deps)).toMatchObject({ state: "ready-to-fix", nextAction: "apply-fix" });
    const stored = await deps.dispositionStore.readDispositionRecord(records.operation.operationId);
    if (stored === null) throw new Error("expected the approved disposition record");
    expect(currentApprovedDispositionNode(stored).responsePolicyRequest.ceilingOverride).not.toHaveProperty("decisionKey");
  };
  return { records, deps, decisions, approval, ceiling, record, refuses, approves };
}

const outsideReach = "missing, stale, superseded, withdrawn, or outside this target's reach";

it.each([
  ["another lane's", (h: Awaited<ReturnType<typeof native>>) => h.record(h.ceiling(1, { lane: "frontline" }))],
  ["a superseded", (h: Awaited<ReturnType<typeof native>>) => h.record(h.ceiling(1, { decidedBy: "earlier-owner",
    decidedAt: "2026-10-31T09:00:00Z" }))],
  ["another Candidate's", (h: Awaited<ReturnType<typeof native>>) => h.record(h.ceiling(1, { subject: { lineage: { kind: "candidate",
    candidateId: canonicalDigest({ candidate: 2 }) }, headSha: h.records.target.headSha, subjectDigest: canonicalDigest({ subject: 2 }) } }))],
  ["an unrecorded", async () => canonicalDigest({ grant: "unrecorded" })],
] as const)("refuses %s ceiling decision reference, then approves the fix naming the live one", async (_case, stale) => {
  const h = await native();
  const live = await h.record(h.ceiling(1));
  await h.refuses(await stale(h), outsideReach);
  await h.approves(live);
});

it("refuses a live decision whose values differ from the grant, then approves the fix naming one that matches", async () => {
  const h = await native();
  await h.refuses(await h.record(h.ceiling(0)), "does not match the supplied grant values");
  await h.approves(await h.record(h.ceiling(1, { decidedAt: "2026-10-31T11:00:00Z" })));
});

it("refuses consent for a next pass on a defer-only approval before recording anything, then settles it without one", async () => {
  const h = await native();
  const live = await h.record(h.ceiling(1));
  await expect(respondToReviewCommand(h.approval(live, "defer"), h.deps)).rejects.toMatchObject({ code: "invalid-input",
    message: expect.stringContaining("omit the authorization and its ceiling override") });
  await expect(h.deps.dispositionStore.readDispositionRecord(h.records.operation.operationId)).resolves.toBeNull();
  expect(await h.decisions.list()).toMatchObject({ status: "complete",
    records: [{ value: { choice: { precondition: { kind: "ceiling" } } } }] });
  expect(await respondToReviewCommand(withReviewReport(localRequest(h.records, "defer")), h.deps))
    .toMatchObject({ state: "settled", nextAction: "reduce" });
});
