import { createReviewReceipt } from "../../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../../../src/lib/delivery/review-vehicle.js";
import { describe, expect, it } from "vitest";
import { ReviewOutcomeSchema } from "../../../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { createHostedHandleFixture } from "../../../../../../fixtures/hosted-review.js";
import { hostedOutcome, frontlineOutcome, localOutcome } from "../../../../../../fixtures/review-outcome.js";

function change(input: unknown, path: string, replacement: unknown): unknown {
  const copy: unknown = JSON.parse(JSON.stringify(input));
  const parts = path.split(".");
  let current = copy as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) current = current[part] as Record<string, unknown>;
  const last = parts.at(-1);
  if (last === undefined) throw new Error("expected field path");
  current[last] = replacement;
  return copy;
}

const digest = `sha256:${"0".repeat(64)}`;
const sha = "0".repeat(40);

describe("local receipt and admission", () => {
  it.each([
    ["local source", "source.sourceId", "coderabbit-cli"],
    ["local operation", "local.operationId", "another-operation"],
    ["complete effective coverage", "local.effectiveCoverage", "incremental"],
    ["coverage admission", "local.requestedCoverage", "incremental"],
    ["verdict receipt", "local.receipt", undefined],
    ["receipt request", "local.receipt.requestId", digest],
    ["receipt target", "local.receipt.targetId", digest],
    ["receipt requirement", "local.receipt.requirementId", digest],
    ["receipt result", "local.receipt.result", "failed"],
    ["request evaluator", "local.request.evaluatorIdentity", "another-evaluator"],
    ["request pass", "logicalPass", 2],
    ["request generation", "retryGeneration", 1],
    ["attestation evaluator", "local.attestation.evaluatorIdentity", "another-evaluator"],
    ["requirement policy", "local.policyVersion", digest],
    ["delivery vehicle target", "local.vehicle.kind", "delivery-member"],
  ])("refuses mismatched %s", (_label, path, replacement) => {
    expect(ReviewOutcomeSchema.safeParse(change(localOutcome(), String(path), replacement)).success).toBe(false);
  });
});

describe("hosted admission and sealing", () => {
  it.each([
    ["host target", "hosted.target.repository", "another/repository"],
    ["coverage", "hosted.requestedCoverage", "incremental"],
    ["review target", "hosted.reviewTarget.targetId", digest],
    ["review requirement", "hosted.requirement.requirementId", digest],
    ["actor", "hosted.actorIdentity", "another-actor"],
    ["repository", "hosted.admission.repositoryId", "another-repository"],
    ["target head", "hosted.target.headSha", sha],
    ["delivery vehicle", "hosted.vehicle", { kind: "delivery-member", planId: "123e4567-e89b-12d3-a456-426614174000", workUnitId: "work-1", deliverableId: digest, head: sha }],
    ["handle generation", "hosted.handle.admission.logicalPass", 2],
    ["missing handle", "hosted.handle", undefined],
    ["sealed verdict", "hosted.sealedResult.outcome", "findings"],
    ["unproved coverage", "hosted.effectiveCoverage", "incremental"],
  ])("refuses mismatched %s", (_label, path, replacement) => {
    expect(ReviewOutcomeSchema.safeParse(change(hostedOutcome(), String(path), replacement)).success).toBe(false);
  });
});

describe("portable frontline admission", () => {
  it.each([
    ["executable", "frontline.admission.frontlineReview.source.executable", "/machine/reviewer"],
    ["argv", "frontline.admission.frontlineReview.source.argv", ["--plain"]],
    ["attempt", "attemptId", digest],
    ["pass", "logicalPass", 2],
    ["generation", "retryGeneration", 1],
    ["source", "source.sourceId", "another-source"],
    ["owner", "lineage.vehicleIdentity", "another-owner"],
    ["coverage", "effectiveCoverage", null],
    ["ceiling", "frontline.admission.maxPasses", 3],
  ])("refuses mismatched %s", (_label, path, replacement) => {
    expect(ReviewOutcomeSchema.safeParse(change(frontlineOutcome(), String(path), replacement)).success).toBe(false);
  });
});

it.each(["pending", "settled-findings"])("refuses in-flight or derived outcome %s", (outcome) => {
  const value = localOutcome();
  expect(ReviewOutcomeSchema.safeParse({ ...value, outcome, effectiveCoverage: null,
    local: { ...value.local, effectiveCoverage: null, receipt: undefined } }).success).toBe(false);
});
it("requires a recorded end time", () => {
  expect(ReviewOutcomeSchema.safeParse(change(localOutcome(), "endedAt", undefined)).success).toBe(false);
});

it("refuses a frontline admission from another valid repository target", () => {
  const value = frontlineOutcome();
  const target = createHostedHandleFixture({ repositoryId: "another-repository" }).admission.reviewTarget;
  expect(ReviewOutcomeSchema.safeParse({ ...value, target }).success).toBe(false);
});

const finding = { findingId: "finding-1", severity: "major" as const, locus: "src/main.ts:10",
  evidenceUrlOrId: "finding:1", sourceOrdinal: 1 };

it("retains producer findings from all three sources", () => {
  const hostedFinding = { findingId: finding.findingId, sourceOrdinal: 1, severity: "major" as const,
    origin: "review-thread" as const, threadId: "thread-1", commentId: "comment-1", settlement: "reply-and-resolve" as const,
    locus: "src/main.ts:10", url: "https://example.invalid/finding" };
  for (const value of [localOutcome({ outcome: "findings", findings: [finding] }),
    frontlineOutcome({ findings: [finding] }), hostedOutcome({ outcome: "findings", findings: [hostedFinding] })]) {
    expect(ReviewOutcomeSchema.safeParse(value).success).toBe(true);
  }
});

it("refuses a local result whose admission agrees on the wrong lineage head", () => {
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand", vehicleIdentity: "claim-1", headSha: sha };
  expect(ReviewOutcomeSchema.safeParse(localOutcome({ lineage })).success).toBe(false);
});

it("refuses a local delivery result outside its member lineage", () => {
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", planId: "123e4567-e89b-12d3-a456-426614174000",
    workUnitId: "work-1", deliverableId: digest, head: "c".repeat(40) });
  const target = createHostedHandleFixture({ vehicle }).admission.reviewTarget;
  const lineage = { kind: vehicle.kind, planId: vehicle.planId, workUnitId: vehicle.workUnitId, deliverableId: vehicle.deliverableId };
  const value = localOutcome({ target, lineage, vehicle: { kind: "delivery-member", identity: digest } });
  expect(ReviewOutcomeSchema.safeParse(value).success).toBe(true);
  expect(ReviewOutcomeSchema.safeParse(change(value, "local.vehicle.identity", `sha256:${"1".repeat(64)}`)).success).toBe(false);
});

it("refuses a local delivery admission that contradicts its producer", () => {
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", planId: "123e4567-e89b-12d3-a456-426614174000",
    workUnitId: "work-1", deliverableId: digest, head: "c".repeat(40) });
  const target = createHostedHandleFixture({ vehicle }).admission.reviewTarget;
  const lineage = { kind: vehicle.kind, planId: vehicle.planId, workUnitId: vehicle.workUnitId, deliverableId: vehicle.deliverableId };
  const deliveryAdmission = { schemaVersion: 1 as const, sourceId: "delegated-agent" as const,
    target: { repository: "owner/repo", pullRequest: 42, headSha: vehicle.head }, vehicle, pass: 1,
    requestedCoverage: "complete" as const, statusTarget: { repository: "owner/repo", headRef: "feature/work-1", headSha: vehicle.head } };
  const value = localOutcome({ target, lineage, vehicle: { kind: "delivery-member", identity: digest }, deliveryAdmission });
  expect(ReviewOutcomeSchema.safeParse(value).success).toBe(true);
  expect(ReviewOutcomeSchema.safeParse(change(value, "local.deliveryAdmission.vehicle.deliverableId", `sha256:${"1".repeat(64)}`)).success).toBe(false);
});

it("binds normalized hosted findings to the sealed producer findings", () => {
  const sealedFinding = { findingId: "finding-1", severity: "major" as const, sourceOrdinal: 1,
    origin: "review-thread" as const, threadId: "thread-1", commentId: "comment-1",
    settlement: "reply-and-resolve" as const, locus: "src/main.ts:10", url: "https://example.invalid/finding" };
  const value = hostedOutcome({ outcome: "findings", findings: [sealedFinding] });
  expect(ReviewOutcomeSchema.safeParse(change(value, "findings.0.findingId", "another-finding")).success).toBe(false);
});

it("accepts proved native incremental hosted coverage and refuses a changed proof range", () => {
  const value = hostedOutcome({ requestedCoverage: "incremental" });
  expect(ReviewOutcomeSchema.safeParse(value).success).toBe(true);
  expect(ReviewOutcomeSchema.safeParse(change(value, "hosted.sealedResult.coverageEvidence.baselineSha", sha)).success).toBe(false);
});

it("requires the admitted identity for an unacknowledged terminal hosted request failure", () => {
  const value = hostedOutcome();
  const failed = { ...value, attemptId: value.hosted.admission.admissionId,
    outcome: "terminal-failure", effectiveCoverage: null,
    hosted: { ...value.hosted, effectiveCoverage: null, handle: undefined, sealedResult: undefined, requestFailureReason: "request failed" } };
  expect(ReviewOutcomeSchema.safeParse(failed).success).toBe(true);
  expect(ReviewOutcomeSchema.safeParse({ ...failed, attemptId: value.attemptId }).success).toBe(false);
  expect(ReviewOutcomeSchema.safeParse({ ...failed, hosted: { ...failed.hosted, requestFailureReason: null } }).success).toBe(false);
});

it.each([
  ["failed", "terminal-failure"], ["unavailable", "transient-unavailable"],
] as const)("retains a concluded %s local receipt in the lane vocabulary", (result, outcome) => {
  const value = localOutcome({ outcome: "terminal-failure" });
  const receipt = createReviewReceipt({ target: value.target, requirement: value.requirement, request: value.local.request,
    applicabilityId: null, reviewRunId: "failed-run-1", evaluatorIdentity: value.local.request.evaluatorIdentity,
    attestingRuntimeIdentity: value.local.attestation.runtimeIdentity, attestationMechanism: value.local.attestation.mechanism,
    providerEventIdentity: null, result, findings: [] });
  expect(ReviewOutcomeSchema.safeParse({ ...value, outcome, local: { ...value.local, receipt } }).success).toBe(true);
});
