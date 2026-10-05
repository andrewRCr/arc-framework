/** Retained admitted source authority with reservation-wide settlement. */

import { describe, expect, it } from "vitest";

import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { HostedRequestHandleSchema, hostedLaneAttemptId } from
  "../../../../../src/scripts/review-gate/hosted/request.js";
import { createStandardReviewReservation } from
  "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectHostedReservationDischarge } from
  "../../../../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { resolveReviewPolicy } from
  "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import type { EarlierApplicableAttempt } from
  "../../../../../src/scripts/review-gate/policy/hosted-reservation-support.js";

const handle = HostedRequestHandleSchema.parse({
  ...createHostedHandleFixture({ provider: "codex-pr", logicalPass: 2 }),
  invocation: { mode: "force", sourceId: "codex-pr" },
});
if (handle.admission.lineage.kind !== "candidate") throw new Error("expected singleton admission");
const reservation = createStandardReviewReservation({
  candidateId: handle.admission.lineage.candidateId,
  sourceId: "coderabbit-pr",
  sources: ["coderabbit-pr", "codex-pr"],
  repository: handle.target.repository,
  headSha: handle.target.headSha,
  obligation: {
    obligation: handle.admission.requirement.obligation,
    reasons: handle.admission.requirement.reasons,
    rubricVersion: handle.admission.requirement.rubricVersion,
    rubricDigest: handle.admission.requirement.rubricDigest,
    retrigger: handle.admission.requirement.retrigger,
    count: handle.admission.requirement.count,
  },
});
const retained: EarlierApplicableAttempt = {
  operationId: "lane-progress/selected",
  attemptId: hostedLaneAttemptId(handle),
  attemptIndex: 0,
  logicalPass: handle.admission.logicalPass,
  updatedAt: "2026-10-03T00:00:00Z",
  sourceId: handle.provider,
  outcome: "clean",
  requestedCoverage: handle.requestedCoverage,
  effectiveCoverage: handle.effectiveCoverage,
  scopeMode: "whole-target",
  producerTarget: handle.admission.reviewTarget,
  hosted: { handle, admission: handle.admission },
  applicability: "retain-prior-attempt",
};

async function discharge(attempts: readonly EarlierApplicableAttempt[], invocation?: {
  mode: "force"; sourceId: string;
}) {
  return projectHostedReservationDischarge({
    reservation,
    ...(invocation === undefined ? {} : { invocation }),
    span: ["d".repeat(40)],
    target: { ...handle.target, headSha: "d".repeat(40) },
    readLaneProgress: async () => ({ status: "unrecorded" }),
    readEarlierAttemptApplicability: async (sourceId) => {
      const matching = attempts.filter((attempt) => attempt.sourceId === sourceId);
      return matching.length === 0 ? { status: "not-found" } : { status: "complete", attempts: matching };
    },
    resolveTerminalPolicy: async () => { throw new Error("no current producer"); },
    resolveEarlierTerminalPolicy: async (attempt) => resolveReviewPolicy({
      schemaVersion: 1,
      target: handle.target,
      lane: "standard",
      standardReview: reservation.obligation,
      sources: [attempt.sourceId],
      maxPasses: 3,
      completedPasses: attempt.logicalPass,
      attempts: [{ sourceId: attempt.sourceId, outcome: "clean", reviewOperationId: attempt.attemptId }],
      verifiedTerminalSignal: {
        reviewOperationId: attempt.attemptId,
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        materialFix: false,
        coverageAdequate: attempt.effectiveCoverage === "complete",
      },
    }),
  });
}

describe("retained admitted source selection", () => {
  it("discharges an applicable complete selected source without repeating the invocation", async () => {
    await expect(discharge([retained])).resolves.toMatchObject({ discharged: true, nextSource: null });
  });

  it.each([
    ["no invocation", { ...retained, hosted: { admission: handle.admission, handle: {
      ...handle, invocation: undefined,
    } } }],
    ["wrong invocation source", { ...retained, hosted: { admission: handle.admission, handle: {
      ...handle, invocation: { mode: "force", sourceId: "coderabbit-pr" },
    } } }],
    ["mismatched owning admission", { ...retained, hosted: {
      handle, admission: createHostedHandleFixture({ provider: "codex-pr", logicalPass: 1 }).admission,
    } }],
    ["incomplete effective coverage", { ...retained, effectiveCoverage: "incremental" }],
    ["incomplete chunk series", { ...retained, scopeMode: "chunked", chunkSeriesComplete: false }],
  ] as const)("keeps the default order for %s", async (_case, attempt) => {
    await expect(discharge([attempt])).resolves.toMatchObject({ discharged: false, nextSource: "coderabbit-pr" });
  });

  it("honors a newly supplied source choice", async () => {
    await expect(discharge([retained], { mode: "force", sourceId: "coderabbit-pr" }))
      .resolves.toMatchObject({ discharged: false, nextSource: "coderabbit-pr" });
  });

  it("keeps a later review attempt ahead of an old admitted selection", async () => {
    await expect(discharge([retained, { ...retained, logicalPass: 3, outcome: "rate-limited" }]))
      .resolves.toMatchObject({ discharged: false, nextSource: "coderabbit-pr" });
  });

  it("keeps an earlier source's unsettled findings even after selected clean evidence", async () => {
    await expect(discharge([retained, {
      ...retained, sourceId: "coderabbit-pr", outcome: "findings", logicalPass: 1, hosted: undefined,
    }])).resolves.toMatchObject({ discharged: false, nextSource: null, detail: expect.stringContaining("finding") });
  });

  it("keeps an earlier source's pending request even after selected clean evidence", async () => {
    const pendingHandle = createHostedHandleFixture({ logicalPass: 1 });
    const pending: EarlierApplicableAttempt = {
      ...retained, sourceId: "coderabbit-pr", outcome: "pending", logicalPass: 1,
      operationId: "lane-progress/pending",
      attemptId: hostedLaneAttemptId(pendingHandle),
      producerTarget: pendingHandle.admission.reviewTarget,
      hosted: { handle: pendingHandle, admission: pendingHandle.admission },
    };
    await expect(discharge([retained, pending]))
      .resolves.toMatchObject({ discharged: false, nextSource: null, awaitAction: { handle: pendingHandle } });
    await expect(discharge([retained, { ...pending, outcome: "clean" }]))
      .resolves.toMatchObject({ discharged: true, nextSource: null });
  });
});
