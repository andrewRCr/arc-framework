/** Errand responses refuse before approval writes when their producer's claim is not active here. */
import { expect, it } from "vitest";
import { activeErrandBinding, dependencies, errandVehicle, fixture, frontlineFixture, frontlineResult,
  hostedResponseFixture, hostedResult, localResult, policyRequest } from "../../../../fixtures/respond-command.js";
import { withReviewReport } from "../../../../fixtures/review-report-input.js";
import { approveDispositionState } from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { respondToReviewCommand } from "../../../../../src/scripts/review-gate/runtime/respond-command.js";
import { reviewRespondRemedy } from "../../../../../src/scripts/review-gate/runtime/respond-remedy.js";

it.each(["local", "frontline", "hosted"] as const)("refuses an off-branch %s response and binds it after branch repair", async kind => {
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
  const failure = await respondToReviewCommand(request, deps).catch((error: unknown) => error);
  expect(failure).toMatchObject({ code: "invalid-input" });
  expect(reviewRespondRemedy(failure, request)).toMatchObject({ argv: ["arc", "locus", "--json"],
    text: expect.stringContaining("Switch") });
  expect(await deps.dispositionStore.readDispositionRecord(records.operation.operationId)).toBeNull();
  active = activeErrandBinding();
  const proposal = await respondToReviewCommand(request, deps);
  if (proposal.state !== "awaiting-approval") throw new Error(JSON.stringify(proposal));
  const dispositions = approveDispositionState({ proposed: proposal.payload.proposal,
    approvedBy: records.authority.authorIdentity, approvedAt: "2026-07-23T20:00:00Z" });
  const policy = policyRequest(records, { lane: kind === "frontline" ? "frontline" : "standard",
    sourceId: kind === "local" ? "delegated-agent" : kind === "frontline" ? "coderabbit-cli" : "codex-pr",
    reviewOperationId: proposal.payload.operationId, ...(kind === "hosted" ? { pullRequest: 42 } : {}) });
  const approval = withReviewReport({ schemaVersion: 1, source, dispositions, policyRequest: policy });
  active = null;
  await expect(respondToReviewCommand(approval, deps)).rejects.toMatchObject({ code: "invalid-input" });
  expect(await deps.dispositionStore.readDispositionRecord(proposal.payload.operationId)).toBeNull();
  active = activeErrandBinding();
  const approved = await respondToReviewCommand(approval, deps);
  expect(approved.state).toBe("ready-to-fix");
  const record = await deps.dispositionStore.readDispositionRecord(proposal.payload.operationId);
  expect(record?.errand).toEqual(active);
  active = activeErrandBinding("another-claim");
  await expect(respondToReviewCommand(request, deps)).rejects.toMatchObject({ code: "invalid-input" });
});
