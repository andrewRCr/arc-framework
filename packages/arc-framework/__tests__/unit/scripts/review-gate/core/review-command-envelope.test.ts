import { describe, expect, it } from "vitest";

import {
  FrontlineResolveEnvelopeSchema,
  FrontlineRunEnvelopeSchema,
  LocalAttestEnvelopeSchema,
  LocalPrepareEnvelopeSchema,
  LocalResumeEnvelopeSchema,
  ReduceEnvelopeSchema,
  RespondEnvelopeSchema,
  ReviewCommandErrorEnvelopeSchema,
  type ReviewCommandMode,
} from "../../../../../src/scripts/review-gate/core/review-command-envelope.js";

const digest = `sha256:${"a".repeat(64)}`;
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

describe("review command envelopes", () => {
  it.each([
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "skipped", nextAction: "none", payload: { routing: {}, frontlineReview: {} },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "offered", nextAction: "bind-source", payload: { routing: {}, frontlineReview: {} },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "offered", nextAction: "obtain-authorization", payload: { routing: {}, frontlineReview: {} },
    }],
    [FrontlineResolveEnvelopeSchema, {
      ...header("review-frontline-resolve"),
      state: "ready", nextAction: "run-frontline",
      payload: { routing: {}, frontlineReview: {}, pass: 1, maxPasses: 2 },
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
      state: "timed-out", nextAction: "retry",
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
      state: "ready", nextAction: "launch-review",
      payload: {
        operationId: "local-1", persistedVersion: 1, target, request: {},
        reviewerPayload: {}, sourceRef: "source/1", sourceDigest: digest,
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
      state: "settled", nextAction: "reduce",
      payload: { operationId: "local-1", dispositionRecordRef: "disposition/1" },
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

  it("rejects an impossible state/action pair", () => {
    expect(() => FrontlineResolveEnvelopeSchema.parse({
      ...header("review-frontline-resolve"),
      state: "ready",
      nextAction: "bind-source",
      payload: { routing: {}, frontlineReview: {}, pass: 1, maxPasses: 2 },
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
        request: {},
        reviewerPayload: {},
        sourceRef: "source/1",
        sourceDigest: digest,
        reviewAugmentation: { rubricId: "security-audit/v1", dimensions: [] },
      },
    })).toThrow();
  });

  it.each([
    ["rate-limited", "retry"],
    ["transient-unavailable", "retry"],
    ["source-unbound", "operator-repair"],
    ["capability-unsupported", "operator-repair"],
    ["transient-transport", "retry"],
    ["process-failure", "retry"],
    ["signal-termination", "retry"],
    ["unexpected-adapter-failure", "retry"],
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
      nextAction: nextAction === "retry" ? "operator-repair" : "retry",
    })).toThrow();
  });

  it.each([
    { status: "running", verdict: null },
    { status: "failed", verdict: "clean" },
    { status: "complete", verdict: null },
  ])("admits not-attestable only for non-terminal evidence %#", (result) => {
    expect(LocalAttestEnvelopeSchema.parse({
      ...header("review-local-attest"),
      state: "not-attestable",
      nextAction: "rerun-review",
      payload: { operationId: "local-1", persistedVersion: 1, result },
    })).toMatchObject({ state: "not-attestable" });
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
