/** Errand responses refuse before approval writes when their producer's claim is not active here. */
import { expect, it } from "vitest";
import { activeErrandBinding, dependencies, errandVehicle, fixture, frontlineFixture, frontlineResult,
  hostedResponseFixture, hostedResult, localResult, policyRequest } from "../../../../fixtures/respond-command.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { approveDispositionState } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { reviewRespondRemedy } from "../../../../../src/scripts/review-gate/runtime/respond-remedy.js";

function responseCase(kind: "local" | "frontline" | "hosted") {
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand" as const, vehicleIdentity: "claim-1", headSha: "c".repeat(40) };
  const records = fixture(errandVehicle, undefined, lineage), deps = dependencies(records);
  const hosted = hostedResponseFixture("review-body", errandVehicle, false, lineage);
  const frontline = frontlineFixture(records, 2, lineage);
  const source = kind === "local" ? { kind: "attested-local" as const, receiptRef: records.receiptRef }
    : kind === "frontline" ? { kind: "frontline" as const, outcomeRef: frontline.outcomeRef }
    : { kind: "hosted" as const, attemptRef: hosted.attemptRef };
  deps.resultReader.readResult = async () => kind === "local" ? localResult(records) : kind === "frontline"
    ? frontlineResult({ ...frontline, outcomeRef: frontline.durableRef }) : hostedResult(hosted);
  deps.readCandidateLineage = async () => null;
  let active: ReturnType<typeof activeErrandBinding> | null = null;
  deps.resolveActiveErrand = async () => active;
  const request = withReviewReport({ schemaVersion: 1, source, proposal: { proposedVerification: "full",
    severityGatingPolicy: { minorGating: "record-only" }, findings: [{ findingId: records.finding.findingId,
      sourceVerification: "verified", verificationRefs: [records.finding.evidenceUrlOrId], verifiedSeverity: "major", disposition: "fix",
      title: "Repair the reported issue", issue: "The reported issue is present.", rationale: "The source confirms it.",
      recommendation: "Apply the repair.", openQuestions: [] }] } });
  const approval = async () => {
    const proposal = await respondToReviewCommand(request, deps);
    if (proposal.state !== "awaiting-approval") throw new Error(JSON.stringify(proposal));
    const dispositions = approveDispositionState({ proposed: proposal.payload.proposal,
      approvedBy: records.authority.authorIdentity, approvedAt: "2026-07-23T20:00:00Z" });
    const policy = policyRequest(records, { lane: kind === "frontline" ? "frontline" : "standard",
      sourceId: kind === "local" ? "delegated-agent" : kind === "frontline" ? "coderabbit-cli" : "codex-pr",
      reviewOperationId: proposal.payload.operationId, ...(kind === "hosted" ? { pullRequest: 42 } : {}) });
    return { request: withReviewReport({ schemaVersion: 1, source, dispositions, policyRequest: policy }),
      operationId: proposal.payload.operationId };
  };
  return { deps, records, request, approval, setActive: (next: typeof active) => { active = next; } };
}

it.each(["local", "frontline", "hosted"] as const)("refuses an off-branch %s response and binds it after branch repair", async kind => {
  const f = responseCase(kind), { deps, request, records } = f;
  const failure = await respondToReviewCommand(request, deps).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "invalid-input" });
  expect(reviewRespondRemedy(failure, request)).toMatchObject({ argv: ["arc", "locus", "--json"],
    text: expect.stringContaining("Switch") });
  expect(await deps.dispositionStore.readDispositionRecord(records.operation.operationId)).toBeNull();
  f.setActive(activeErrandBinding());
  const approval = await f.approval();
  f.setActive(null);
  await expect(respondToReviewCommand(approval.request, deps)).rejects.toMatchObject({ code: "invalid-input" });
  expect(await deps.dispositionStore.readDispositionRecord(approval.operationId)).toBeNull();
  f.setActive(activeErrandBinding());
  expect((await respondToReviewCommand(approval.request, deps)).state).toBe("ready-to-fix");
  expect((await deps.dispositionStore.readDispositionRecord(approval.operationId))?.errand).toEqual(activeErrandBinding());
  f.setActive(activeErrandBinding("another-claim"));
  await expect(respondToReviewCommand(request, deps)).rejects.toMatchObject({ code: "invalid-input" });
});

it.each(["local", "frontline", "hosted"] as const)("refuses a queued %s approval after claim loss or replacement, and retries after repair", async kind => {
  for (const moved of [null, activeErrandBinding("claim-2")]) {
    const f = responseCase(kind), { deps } = f;
    f.setActive(activeErrandBinding());
    const approval = await f.approval(), lock = deps.withOperationLock.bind(deps);
    deps.withOperationLock = async (_operationId, action) => { f.setActive(moved); return action(); };
    await expect(respondToReviewCommand(approval.request, deps)).rejects.toMatchObject({ code: "invalid-input" });
    expect(await deps.dispositionStore.readDispositionRecord(approval.operationId)).toBeNull();
    f.setActive(activeErrandBinding());
    deps.withOperationLock = lock;
    expect((await respondToReviewCommand(approval.request, deps)).state).toBe("ready-to-fix");
    expect((await deps.dispositionStore.readDispositionRecord(approval.operationId))?.errand).toEqual(activeErrandBinding());
  }
});

it.each(["local", "frontline", "hosted"] as const)("keeps a %s approval on the producer claim when later live context differs", async kind => {
  const f = responseCase(kind), { deps } = f;
  f.setActive(activeErrandBinding());
  const approval = await f.approval();
  let reads = 0;
  deps.resolveActiveErrand = async () => ++reads === 1 ? activeErrandBinding() : activeErrandBinding("claim-2");
  expect((await respondToReviewCommand(approval.request, deps)).state).toBe("ready-to-fix");
  expect((await deps.dispositionStore.readDispositionRecord(approval.operationId))?.errand).toEqual(activeErrandBinding());
});
