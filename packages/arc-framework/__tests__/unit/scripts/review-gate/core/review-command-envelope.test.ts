import { describe, expect, it } from "vitest";

import {
  FrontlineResolveEnvelopeSchema,
  FrontlineRunEnvelopeSchema,
  ReviewChunkingResolveEnvelopeSchema,
  LocalAttestEnvelopeSchema,
  LocalPrepareEnvelopeSchema,
  LocalResumeEnvelopeSchema,
  ReduceEnvelopeSchema,
  RespondEnvelopeSchema,
  ReviewCommandErrorEnvelopeSchema,
  type ReviewCommandMode,
} from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import {
  createDispositionSet,
  proposeDispositionSet,
} from "../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFrontlineAdmission } from
  "../../../../../src/scripts/review-gate/core/frontline-admission.js";
import { createReviewTarget } from
  "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  projectLocalReviewGuidance,
} from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import {
  reduceReviewRouting,
} from "../../../../../src/scripts/review-gate/policy/routing.js";

const digest: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
const target = {
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
  targetId: digest,
} as const;
const header = (mode: ReviewCommandMode) => ({ schemaVersion: 1 as const, mode, diagnostics: [] });
const routingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
} as const;
const routing = { facts: routingFacts, decision: reduceReviewRouting(routingFacts) };
const source = {
  sourceId: "review-command",
  kind: "command",
  executable: "reviewer",
  argv: ["--mode", "frontline"],
} as const;
const skippedFrontlineReview = {
  schemaVersion: 1,
  semanticsVersion: "frontline-review/v1",
  action: "skip",
  reasons: ["frontline-policy-skip"],
  source: null,
  maxPasses: 0,
  promptText: null,
} as const;
const unboundFrontlineReview = {
  schemaVersion: 1,
  semanticsVersion: "frontline-review/v1",
  action: "offer",
  reasons: ["frontline-policy-offer", "source-unbound"],
  source: null,
  maxPasses: 2,
  promptText: "Bind a frontline source.",
} as const;
const offeredFrontlineReview = {
  ...unboundFrontlineReview,
  reasons: ["frontline-policy-offer", "source-project"],
  source,
} as const;
const readyFrontlineReview = {
  ...offeredFrontlineReview,
  action: "attempt",
  reasons: ["frontline-policy-attempt", "source-project"] as string[],
} as const;
const readyFrontlineAdmission = createFrontlineAdmission({
  lineage: { kind: "candidate", candidateId: `sha256:${"b".repeat(64)}` },
  target: createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "change-set",
    repositoryId: "repo-1",
    baseRef: "main",
    diffBaseSha: "a".repeat(40),
    diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40),
    headTree: "d".repeat(40),
  }),
  routing,
  frontlineReview: readyFrontlineReview,
  logicalPass: 1,
  retryGeneration: 0,
  maxPasses: 2,
});
const guidance = projectLocalReviewGuidance();
const request = {
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  repositoryId: target.repositoryId,
  targetId: target.targetId,
  requirementId: digest,
  lineageId: digest,
  logicalPass: 1,
  carrier: {
    kind: "local-change-set",
    adapterId: "git-local",
    changeRequestId: null,
  },
  authorIdentity: "author-1",
  evaluatorIdentity: "evaluator-1",
  generation: 0,
  requestMechanism: "local-attestation",
  requestId: digest,
} as const;
const reviewerPayload = {
  schemaVersion: 1,
  reviewRoot: "/tmp/review-root",
  diffBaseSha: target.diffBaseSha,
  headSha: target.headSha,
  sourceRef: "source/1",
  sourceDigest: digest,
  guidance: guidance.projection,
  guidanceDigest: guidance.guidanceDigest,
  reviewerInstructions: guidance.reviewerInstructions,
} as const;
const localResult = {
  status: "partial" as const,
  result: "clean" as const,
  repositoryId: target.repositoryId,
  targetId: digest,
  headSha: target.headSha,
  headTree: target.headTree,
  rubricVersion: "standard-review/v1",
  rubricDigest: digest,
  sourceDigest: digest,
  guidanceDigest: digest,
  evaluatorIdentity: "evaluator-1",
  reviewRunId: "run-1",
  applicabilityId: null,
  findings: [],
};
const dispositionProposal = proposeDispositionSet(createDispositionSet({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  targetId: target.targetId,
  producerId: "review-operation",
  resultDigest: digest,
  policyVersion: digest,
  rubricVersion: "standard-review/v1",
  rubricDigest: digest,
  proposedBy: "arc-cli/0.1.0",
  proposedVerification: "full",
  findings: [{
    findingId: "finding-1",
    sourceIdentity: "evaluator-1",
    locus: "src/index.ts:1",
    sourceVerification: "verified",
    verificationRefs: ["source:src/index.ts:1"],
    reportedSeverity: "major",
    verifiedSeverity: "major",
    disposition: "fix",
    gating: "blocking",
    rationale: "The source supports this finding.",
    recommendation: "Apply the fix.",
    openQuestions: [],
  }],
}));
const dispositionReportText = "Verification: full\n\nFinding F1: The source supports this finding.";
const provisionalPassAssessment = {
  status: "provisional",
  lane: "standard",
  admittedLogicalPass: 2,
  configuredMaxPasses: 2,
  proposedSignal: { confirmedFindingCount: 1, maxConfirmedSeverity: "major" },
  capPosition: "at-ceiling",
  potentialStopReason: "cap-exhausted",
  nextPassAuthority: "none",
  summaryText: "Provisional pass 2 of 2; approval and response are pending; no next-pass authority.",
} as const;

describe("review command envelopes", () => {
  it.each([
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "disabled", nextAction: "none", payload: { target },
    }],
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "below-threshold", nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 2, files: 1 },
        thresholds: { lines: 10, files: 5 },
      },
    }],
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "consider-chunks", nextAction: "select-review-scope",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
        remedy: "review-chunks",
        recommendedActionText: "Consider cohesive review chunks.",
      },
    }],
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "scope-selected", nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
      },
    }],
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "evidence-unavailable", nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
      },
    }],
    [ReviewChunkingResolveEnvelopeSchema, {
      ...header("review-chunking-resolve"),
      state: "delivery-bound", nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
        planId: "plan-1",
        remedy: "continue-bound-delivery",
        recommendedActionText: "Continue through the bound delivery plan.",
      },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "skipped", nextAction: "none",
      payload: { routing, frontlineReview: skippedFrontlineReview },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "offered", nextAction: "bind-source",
      payload: { routing, frontlineReview: unboundFrontlineReview },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "offered", nextAction: "obtain-authorization",
      payload: { routing, frontlineReview: offeredFrontlineReview },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "ready", nextAction: "run-frontline",
      payload: {
        routing,
        frontlineReview: readyFrontlineReview,
        pass: 1,
        maxPasses: 2,
        admission: readyFrontlineAdmission,
      },
    }],
    [FrontlineRunEnvelopeSchema, {
      ...header("review-frontline-run"),
      state: "clean", nextAction: "none", payload: operationPayload(),
    }],
    [FrontlineRunEnvelopeSchema, {
      ...header("review-frontline-run"),
      state: "findings", nextAction: "respond", payload: operationPayload(),
    }],
    [FrontlineRunEnvelopeSchema, {
      ...header("review-frontline-run"),
      state: "timed-out", nextAction: "operator-repair",
      payload: operationPayload({ reason: { class: "execution-timeout" } }),
    }],
    [FrontlineRunEnvelopeSchema, {
      ...header("review-frontline-run"),
      state: "stale-target", nextAction: "prepare-current-target",
      payload: operationPayload({ reason: { class: "head-mismatch", expectedHeadSha: "c".repeat(40), observedHeadSha: "d".repeat(40) } }),
    }],
    [LocalPrepareEnvelopeSchema, {
      ...header("review-local-prepare"),
      state: "exempt", nextAction: "none", payload: {},
    }],
    [LocalPrepareEnvelopeSchema, {
      ...header("review-local-prepare"),
      state: "review-complete", nextAction: "reduce",
      payload: { operationId: "local-1", persistedVersion: 1, target },
    }],
    [LocalPrepareEnvelopeSchema, {
      ...header("review-local-prepare"),
      state: "ready", nextAction: "launch-review",
      payload: {
        operationId: "local-1", persistedVersion: 1, target, request,
        reviewerPayload, sourceRef: "source/1", sourceDigest: digest,
      },
    }],
    [LocalPrepareEnvelopeSchema, {
      ...header("review-local-prepare"),
      state: "unavailable", nextAction: "operator-repair", payload: {},
    }],
    [LocalPrepareEnvelopeSchema, {
      ...header("review-local-prepare"),
      state: "stale-target", nextAction: "prepare-current-target",
      payload: { attemptedTarget: target, currentTarget: target },
    }],
    [RespondEnvelopeSchema, {
      ...header("review-respond"),
      state: "awaiting-approval", nextAction: "obtain-approval",
      payload: {
        operationId: "local-1", proposal: dispositionProposal, dispositionReportText,
        provisionalPassAssessment,
      },
    }],
    [RespondEnvelopeSchema, {
      ...header("review-respond"),
      state: "settled", nextAction: "reduce",
      payload: { operationId: "local-1", dispositionRecordRef: "disposition/1", dispositionReportText },
    }],
    [RespondEnvelopeSchema, {
      ...header("review-respond"),
      state: "stale-target", nextAction: "prepare-current-target",
      payload: { operationId: "local-1", attemptedTarget: target, currentTarget: target },
    }],
    [ReduceEnvelopeSchema, {
      ...header("review-reduce"),
      state: "retryable", nextAction: "retry",
      payload: {
        operationId: "local-1", persistedVersion: 1, currentTarget: target,
        retryCommand: "local-attest", requestRef: "request/1",
      },
    }],
    [LocalResumeEnvelopeSchema, {
      ...header("review-local-resume"),
      state: "suspended", nextAction: "wait",
      payload: { operationId: "local-1", persistedVersion: 1, currentTarget: target },
    }],
  ] as const)("accepts legal state/action pairs", (schema, envelope) => {
    expect(schema.parse(envelope)).toEqual(envelope);
  });

  it.each([
    ["disabled thresholds below threshold", {
      state: "below-threshold",
      nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 0, files: 0 },
        thresholds: { lines: 0, files: 0 },
      },
    }],
    ["tripped metrics below threshold", {
      state: "below-threshold",
      nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 1 },
        thresholds: { lines: 10, files: 5 },
      },
    }],
    ["disabled thresholds requesting chunks", {
      state: "consider-chunks",
      nextAction: "select-review-scope",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 0, files: 0 },
        tripped: ["lines"],
        remedy: "review-chunks",
        recommendedActionText: "Invalid.",
      },
    }],
    ["duplicate tripped dimensions", {
      state: "consider-chunks",
      nextAction: "select-review-scope",
      payload: {
        target,
        metrics: { lines: 10, files: 1 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "lines"],
        remedy: "review-chunks",
        recommendedActionText: "Invalid.",
      },
    }],
    ["incomplete tripped dimensions", {
      state: "consider-chunks",
      nextAction: "select-review-scope",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines"],
        remedy: "review-chunks",
        recommendedActionText: "Invalid.",
      },
    }],
    ["remedy on a silent arm", {
      state: "scope-selected",
      nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
        remedy: "review-chunks",
      },
    }],
    ["delivery remedy on the chunking arm", {
      state: "consider-chunks",
      nextAction: "select-review-scope",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
        remedy: "continue-bound-delivery",
        recommendedActionText: "Invalid.",
      },
    }],
    ["delivery remedy without precomposed text", {
      state: "delivery-bound",
      nextAction: "continue-review",
      payload: {
        target,
        metrics: { lines: 10, files: 5 },
        thresholds: { lines: 10, files: 5 },
        tripped: ["lines", "files"],
        planId: "plan-1",
        remedy: "continue-bound-delivery",
      },
    }],
  ] as const)("rejects impossible review chunking envelope: %s", (_name, variant) => {
    expect(() => ReviewChunkingResolveEnvelopeSchema.parse({
      ...header("review-chunking-resolve"),
      ...variant,
    })).toThrow();
  });

  it("rejects an impossible state/action pair", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "ready",
      nextAction: "bind-source",
      payload: { routing, frontlineReview: readyFrontlineReview, pass: 1, maxPasses: 2 },
    })).toThrow();
  });

  it("rejects a ready frontline pass above its declared allowance", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing,
        frontlineReview: { ...readyFrontlineReview, maxPasses: 1 },
        pass: 2,
        maxPasses: 1,
      },
    })).toThrow();
  });

  it("rejects a ready frontline allowance that disagrees with its semantic record", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "ready",
      nextAction: "run-frontline",
      payload: {
        routing,
        frontlineReview: readyFrontlineReview,
        pass: 1,
        maxPasses: 1,
      },
    })).toThrow();
  });

  it("rejects an untyped frontline routing payload", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "skipped",
      nextAction: "none",
      payload: { routing: {}, frontlineReview: skippedFrontlineReview },
    })).toThrow();
  });

  it("rejects an untyped frontline semantic payload", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "skipped",
      nextAction: "none",
      payload: { routing, frontlineReview: {} },
    })).toThrow();
  });

  it("rejects an untyped local review request", () => {
    expect(() => LocalPrepareEnvelopeSchema.parse({
      ...header("review-local-prepare"),
      state: "ready",
      nextAction: "launch-review",
      payload: {
        operationId: "local-1",
        persistedVersion: 1,
        target,
        request: {},
        reviewerPayload,
        sourceRef: "source/1",
        sourceDigest: digest,
      },
    })).toThrow();
  });

  it("rejects an untyped local reviewer payload", () => {
    expect(() => LocalPrepareEnvelopeSchema.parse({
      ...header("review-local-prepare"),
      state: "ready",
      nextAction: "launch-review",
      payload: {
        operationId: "local-1",
        persistedVersion: 1,
        target,
        request,
        reviewerPayload: {},
        sourceRef: "source/1",
        sourceDigest: digest,
      },
    })).toThrow();
  });

  it("rejects a caller-supplied rubric augmentation from a command payload", () => {
    expect(() => LocalPrepareEnvelopeSchema.parse({
      ...header("review-local-prepare"),
      state: "ready",
      nextAction: "launch-review",
      payload: {
        operationId: "local-1",
        persistedVersion: 1,
        target,
        request,
        reviewerPayload,
        sourceRef: "source/1",
        sourceDigest: digest,
        reviewAugmentation: { rubricId: "security-audit/v1", dimensions: [] },
      },
    })).toThrow();
  });

  it.each([
    ["rate-limited", "operator-repair"],
    ["transient-unavailable", "operator-repair"],
    ["source-unbound", "operator-repair"],
    ["capability-unsupported", "operator-repair"],
    ["transient-transport", "operator-repair"],
    ["process-failure", "operator-repair"],
    ["signal-termination", "operator-repair"],
    ["unexpected-adapter-failure", "operator-repair"],
    ["invalid-output", "operator-repair"],
    ["authorization-rejected", "operator-repair"],
  ] as const)("maps frontline reason class %s only to %s", (reasonClass, nextAction) => {
    const state = [
      "rate-limited", "transient-unavailable", "source-unbound", "capability-unsupported",
    ].includes(reasonClass)
      ? "unavailable"
      : "failed";
    const envelope = {
      ...header("review-frontline-run"),
      state,
      nextAction,
      payload: operationPayload({ reason: { class: reasonClass } }),
    };
    expect(FrontlineRunEnvelopeSchema.parse(envelope)).toEqual(envelope);
    expect(() => FrontlineRunEnvelopeSchema.parse({
      ...envelope,
      nextAction: "retry",
    })).toThrow();
  });

  it.each([
    localResult,
    { ...localResult, status: "failed", result: null },
    { ...localResult, status: "complete", result: null },
  ])("admits not-attestable only for non-terminal evidence %#", (result) => {
    expect(LocalAttestEnvelopeSchema.parse({
      ...header("review-local-attest"),
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: { operationId: "local-1", persistedVersion: 1, result },
    })).toMatchObject({ state: "not-attestable" });
  });

  it("rejects a complete terminal result from the not-attestable envelope", () => {
    expect(() => LocalAttestEnvelopeSchema.parse({
      ...header("review-local-attest"),
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: {
        operationId: "local-1",
        persistedVersion: 1,
        result: { ...localResult, status: "complete" },
      },
    })).toThrow();
  });

  it("rejects success-only fields on every strict error variant", () => {
    for (const code of ["invalid-input", "corrupt-state", "unexpected-failure"] as const) {
      const error = {
        ...header("review-local-prepare"),
        error: { code, message: "cannot continue" },
      };
      expect(ReviewCommandErrorEnvelopeSchema.parse(error)).toEqual(error);
      for (const forbidden of [
        { state: "ready" },
        { nextAction: "launch-review" },
        { payload: {} },
      ]) {
        expect(() => ReviewCommandErrorEnvelopeSchema.parse({ ...error, ...forbidden })).toThrow();
      }
    }
  });

  it("carries repository preconditions as typed invalid-input diagnostics", () => {
    const error = {
      ...header("review-local-prepare"),
      diagnostics: [{
        code: "repository-precondition",
        message: "working tree must be clean",
        precondition: "clean-worktree",
      }],
      error: { code: "invalid-input", message: "repository precondition failed" },
    };
    expect(ReviewCommandErrorEnvelopeSchema.parse(error)).toEqual(error);
  });
});

function operationPayload(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operationId: "frontline-1",
    persistedVersion: 1,
    target,
    outcomeRef: "outcome/1",
    outcomeDigest: digest,
    ...extra,
  };
}
