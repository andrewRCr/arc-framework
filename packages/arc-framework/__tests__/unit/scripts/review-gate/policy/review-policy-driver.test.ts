import { describe, expect, it } from "vitest";
import { assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";

import { CanonicalDigestSchema } from "../../../../../src/lib/kernel/index.js";

import {
  projectReviewPolicyAttempt,
  ReviewPolicyCommandRequestSchema,
  resolveReviewPolicy,
} from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { assertStandardReviewExecutionAdmission } from
  "../../../../../src/scripts/review-gate/policy/review-execution-admission.js";

const target = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: "a".repeat(40),
};
const prePrTarget = { ...target, pullRequest: null };

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: CanonicalDigestSchema.parse(`sha256:${"b".repeat(64)}`),
  retrigger: "full-final" as const,
  count: 1 as const,
};

describe("resolveReviewPolicy", () => {
  it("retains a response-gated authorization identity with its ceiling override", () => {
    const conditionalPassAuthorizationId = `sha256:${"c".repeat(64)}`;
    const parsed = ReviewPolicyCommandRequestSchema.parse({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      completedPasses: 1,
      attempts: [{
        sourceId: "codex-pr",
        outcome: "findings",
        reviewOperationId: "hosted/attempt-1",
      }],
      ceilingOverride: {
        target,
        lane: "standard",
        exhaustedPassCount: 1,
        nextPass: 2,
        conditionalPassAuthorizationId,
      },
    });

    expect(parsed.ceilingOverride?.conditionalPassAuthorizationId)
      .toBe(conditionalPassAuthorizationId);
  });

  it("retains the immutable producer when projecting terminal lane progress", () => {
    expect(projectReviewPolicyAttempt({
      attemptId: "hosted/attempt-1",
      sourceId: "codex-pr",
      outcome: "settled-findings",
    })).toEqual({
      sourceId: "codex-pr",
      outcome: "findings",
      reviewOperationId: "hosted/attempt-1",
    });
    expect(projectReviewPolicyAttempt({
      attemptId: "hosted/attempt-2",
      sourceId: "codex-pr",
      outcome: "rate-limited",
    })).not.toHaveProperty("reviewOperationId");
  });

  it("resolves a settled material response to the next pass or ceiling", () => {
    const prior = {
      schemaVersion: 1 as const,
      target: { ...target, pullRequest: null },
      lane: "standard" as const,
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [{
        sourceId: "delegated-agent", outcome: "findings" as const,
        reviewOperationId: "local/material-1",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/material-1", confirmedFindingCount: 1,
        maxConfirmedSeverity: "major" as const, coverageAdequate: true,
      },
    };
    expect(resolveReviewPolicy(prior)).toMatchObject({ state: "findings", nextAction: "respond" });
    expect(resolveReviewPolicy({ ...prior, terminalResponseSettled: true })).toMatchObject({
      state: "ready", nextAction: "local-prepare", payload: { pass: 2 },
    });
    expect(resolveReviewPolicy({
      ...prior, completedPasses: 2, maxPasses: 2, terminalResponseSettled: true,
    })).toMatchObject({
      state: "approval-required", nextAction: "obtain-ceiling-override",
      payload: { consequence: { exhaustedPassCount: 2, nextPass: 3 } },
    });
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      ...prior, terminalResponseSettled: true,
    });
  });

  it("requires one immutable producer reference for a terminal attempt", () => {
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      completedPasses: 1,
      attempts: [{ sourceId: "codex-pr", outcome: "clean" }],
    });
  });

  it("rejects producer references on nonterminal progress and standalone settlement", () => {
    const base = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      completedPasses: 1,
    };
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      ...base,
      attempts: [{
        sourceId: "codex-pr",
        outcome: "rate-limited",
        reviewOperationId: "hosted/attempt-1",
      }],
    });
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      ...base,
      attempts: [{ sourceId: "codex-pr", outcome: "settled-findings" }],
    });
  });

  it("accepts terminal convergence only through a matching derived verified signal", () => {
    const request = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      completedPasses: 1,
      maxPasses: 2,
      sources: ["codex-pr"],
      attempts: [{
        sourceId: "codex-pr",
        outcome: "clean" as const,
        reviewOperationId: "hosted/attempt-1",
      }],
    };
    expect(() => resolveReviewPolicy(request)).toThrow(/verified terminal signal/u);
    expect(resolveReviewPolicy({
      ...request,
      verifiedTerminalSignal: {
        reviewOperationId: "hosted/attempt-1",
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        coverageAdequate: true,
      },
    })).toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: {
        verifiedTerminalSignal: {
          reviewOperationId: "hosted/attempt-1",
          coverageAdequate: true,
        },
      },
    });
  });

  it("keeps incomplete chunk progress nonterminal", () => {
    const base = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      completedPasses: 0,
      scopeSelection: { mode: "chunked" as const, target },
    };
    assertSchemaRefuses(ReviewPolicyCommandRequestSchema, {
      ...base,
      completedPasses: 1,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        reviewOperationId: "local-aggregate-1",
        chunkSeriesComplete: false,
      }],
    });
    expect(resolveReviewPolicy({
      ...base,
      sources: ["delegated-agent"],
      maxPasses: 2,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "partial",
        chunkSeriesComplete: false,
      }],
    })).toMatchObject({
      state: "chunk-pending",
      nextAction: "continue-chunks",
      payload: { consumedPass: false, completedPasses: 0, pass: 1 },
    });
  });

  it("no-ops standard review when no standard source is configured", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: [],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      schemaVersion: 1,
      mode: "review-resolve",
      state: "no-op",
      nextAction: "none",
      payload: {
        lane: "standard",
        scope: "whole-target",
        consumedPass: false,
        attemptedSources: [],
      },
    });
  });

  it("returns unavailable when configured sources cannot satisfy the selected scope", () => {
    const result = resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [],
      scopeSelection: { mode: "chunked", target },
    });
    expect(result).toMatchObject({
      state: "unavailable",
      nextAction: "stop",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "source-scope-ineligible" }),
        expect.objectContaining({ code: "no-eligible-source" }),
      ]),
      payload: {
        lane: "standard",
        scope: "chunked",
        consumedPass: false,
        attemptedSources: [],
        ineligibleSources: ["coderabbit-pr", "codex-pr"],
      },
    });
  });

  it("keeps the frontline carrier whole-target-only", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target: prePrTarget,
      lane: "frontline",
      frontlineActive: true,
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      scopeSelection: { mode: "chunked", target: prePrTarget },
    })).toMatchObject({
      state: "unavailable",
      nextAction: "stop",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "source-scope-ineligible",
          message: expect.stringContaining("coderabbit-cli"),
        }),
      ]),
    });
  });

  it("reports unknown sources while continuing with a registered fallback", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["custom-reviewer", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      diagnostics: [{
        code: "unknown-source",
        message: expect.stringContaining("custom-reviewer"),
      }],
      payload: {
        sourceId: "delegated-agent",
        ineligibleSources: ["custom-reviewer"],
      },
    });
  });

  it("requests PR creation when only hosted standard sources await coordinates", () => {
    const prePrTarget = { ...target, pullRequest: null };
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target: prePrTarget,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "awaiting-change-request",
      nextAction: "open-change-request",
      payload: {
        lane: "standard",
        scope: "whole-target",
        consumedPass: false,
        attemptedSources: [],
        waitingSources: ["coderabbit-pr"],
      },
    });
  });

  it("reserves a higher-ranked hosted standard source before a local fallback", () => {
    const prePrTarget = { ...target, pullRequest: null };
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target: prePrTarget,
      lane: "standard",
      standardReview,
      sources: ["codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "awaiting-change-request",
      nextAction: "open-change-request",
      payload: {
        lane: "standard",
        waitingSources: ["codex-pr"],
        attemptedSources: [],
      },
    });
  });

  it("selects exactly one source for each lane independently", () => {
    const frontline = resolveReviewPolicy({
      schemaVersion: 1,
      target: prePrTarget,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      frontlineActive: true,
    });
    const standard = resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent", "coderabbit-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    });

    expect(frontline).toMatchObject({
      state: "ready",
      nextAction: "run-frontline",
      payload: { lane: "frontline", sourceId: "coderabbit-cli", pass: 1 },
    });
    expect(standard).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: { lane: "standard", sourceId: "delegated-agent", pass: 1 },
    });
  });

  it("defaults to whole-target and limits chunked review to local carriers", () => {
    const common = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    };

    expect(resolveReviewPolicy(common)).toMatchObject({
      state: "ready",
      payload: { scope: "whole-target", sourceId: "coderabbit-pr" },
    });
    expect(resolveReviewPolicy({
      ...common,
      scopeSelection: { mode: "whole-target", target },
    })).toMatchObject({
      state: "ready",
      payload: { scope: "whole-target", sourceId: "coderabbit-pr" },
    });
    expect(resolveReviewPolicy({
      ...common,
      scopeSelection: { mode: "chunked", target },
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: {
        scope: "chunked",
        sourceId: "delegated-agent",
        ineligibleSources: ["coderabbit-pr"],
      },
    });
  });

  it("retains an earlier whole-target refusal while selecting the chunked carrier", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "capability-unsupported" }],
      scopeSelection: { mode: "chunked", target },
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: {
        scope: "chunked",
        sourceId: "delegated-agent",
        pass: 1,
        consumedPass: false,
        attemptedSources: [{ sourceId: "coderabbit-pr", outcome: "capability-unsupported" }],
        ineligibleSources: ["coderabbit-pr", "codex-pr"],
      },
    });
  });

  it("rejects a scope selection after its exact target moves", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target: { ...target, headSha: "c".repeat(40) },
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      scopeSelection: { mode: "chunked", target },
    })).toMatchObject({
      state: "stale-target",
      nextAction: "select-scope",
      payload: {
        lane: "standard",
        consumedPass: false,
        selectedTarget: target,
        currentTarget: { ...target, headSha: "c".repeat(40) },
      },
    });
  });

  it("falls through safe unavailability without consuming the pass", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [
        { sourceId: "coderabbit-pr", outcome: "rate-limited" },
        { sourceId: "codex-pr", outcome: "transient-unavailable" },
      ],
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: {
        sourceId: "delegated-agent",
        pass: 1,
        consumedPass: false,
        attemptedSources: [
          { sourceId: "coderabbit-pr", outcome: "rate-limited" },
          { sourceId: "codex-pr", outcome: "transient-unavailable" },
        ],
      },
    });
  });

  it.each([
    ["delegated-agent", "local-prepare"],
    ["coderabbit-pr", "hosted-request"],
    ["codex-pr", "hosted-request"],
  ] as const)("dispatches %s as an independent standard source", (sourceId, nextAction) => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: [sourceId],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "ready",
      nextAction,
      payload: { sourceId, pass: 1 },
    });
  });

  it("lets an explicit standard invocation start at any configured eligible source", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toMatchObject({
      state: "ready",
      nextAction: "hosted-request",
      payload: { sourceId: "codex-pr", ineligibleSources: [] },
    });
  });

  it("reserves an explicitly selected hosted source before PR creation", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target: { ...target, pullRequest: null },
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toMatchObject({
      state: "awaiting-change-request",
      nextAction: "open-change-request",
      payload: { waitingSources: ["codex-pr"] },
    });
  });

  it("falls forward from an explicitly selected source only after safe unavailability", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "codex-pr", outcome: "rate-limited" }],
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: { sourceId: "delegated-agent" },
    });
  });

  it("replays the same explicit selection after its ordered fallbacks are exhausted", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [
        { sourceId: "codex-pr", outcome: "rate-limited" },
        { sourceId: "delegated-agent", outcome: "transient-unavailable" },
      ],
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toMatchObject({
      state: "unavailable",
      nextAction: "stop",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "safe-fallback-exhausted" }),
      ]),
    });
  });

  it("refuses an unconfigured or ineligible explicit standard source", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      invocation: { mode: "force", sourceId: "codex-pr" },
    })).toThrow(/configured standard-review source/u);

    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      scopeSelection: { mode: "chunked", target },
      invocation: { mode: "force", sourceId: "coderabbit-pr" },
    })).toMatchObject({
      state: "unavailable",
      nextAction: "stop",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "selected-source-ineligible" }),
      ]),
      payload: { ineligibleSources: ["coderabbit-pr"] },
    });
  });

  it("refuses an explicit source that would rewind recorded source progress", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "codex-pr", outcome: "rate-limited" }],
      invocation: { mode: "force", sourceId: "coderabbit-pr" },
    })).toThrow(/cannot precede recorded source progress/u);
  });

  it("preserves the response continuation for verified material findings", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["codex-pr"],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [{
        sourceId: "codex-pr",
        outcome: "findings",
        reviewOperationId: "hosted/attempt-1",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "hosted/attempt-1",
        confirmedFindingCount: 1,
        maxConfirmedSeverity: "major",
        coverageAdequate: true,
      },
    })).toMatchObject({
      state: "findings",
      nextAction: "respond",
      payload: {
        sourceId: "codex-pr",
        pass: 1,
        completedPasses: 1,
        consumedPass: true,
        postResponseAction: "resolve-next-pass",
      },
    });
  });

  it.each([
    {
      name: "whole-target completion",
      scopeSelection: undefined,
      attempt: {
        sourceId: "codex-pr",
        outcome: "clean" as const,
        reviewOperationId: "hosted/attempt-1",
      },
    },
    {
      name: "completed chunk series",
      scopeSelection: { mode: "chunked" as const, target },
      attempt: {
        sourceId: "delegated-agent",
        outcome: "findings" as const,
        reviewOperationId: "local/aggregate-1",
        chunkSeriesComplete: true,
      },
    },
  ])("rejects zero completed passes for $name", ({ scopeSelection, attempt }) => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: [attempt.sourceId],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [attempt],
      verifiedTerminalSignal: {
        reviewOperationId: attempt.reviewOperationId,
        confirmedFindingCount: attempt.outcome === "clean" ? 0 : 1,
        maxConfirmedSeverity: attempt.outcome === "clean" ? null : "major",
        coverageAdequate: true,
      },
      ...(scopeSelection === undefined ? {} : { scopeSelection }),
    })).toThrow(/completedPasses must include the completed terminal pass/u);
  });

  it.each([
    "partial",
    "ambiguous-delivery",
    "malformed",
    "timed-out",
    "stale-target",
    "capability-unsupported",
    "source-unbound",
    "terminal-failure",
  ] as const)("stops on the non-fall-through %s outcome", (outcome) => {
    const result = resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome }],
    });
    expect(result).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      diagnostics: [{ code: `source-outcome-${outcome}` }],
      payload: {
        sourceId: "coderabbit-pr",
        outcome,
        consumedPass: false,
        attemptedSources: [{ sourceId: "coderabbit-pr", outcome }],
      },
    });
  });

  it("counts a completed chunk series as one logical pass", () => {
    const common = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      scopeSelection: { mode: "chunked" as const, target },
    };

    expect(resolveReviewPolicy({
      ...common,
      completedPasses: 0,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "partial",
        chunkSeriesComplete: false,
      }],
    })).toMatchObject({
      state: "chunk-pending",
      nextAction: "continue-chunks",
      payload: { pass: 1, completedPasses: 0, consumedPass: false },
    });
    expect(resolveReviewPolicy({
      ...common,
      completedPasses: 1,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        reviewOperationId: "local/aggregate-1",
        chunkSeriesComplete: true,
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/aggregate-1",
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        coverageAdequate: true,
      },
    })).toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: { pass: 1, completedPasses: 1, consumedPass: true },
    });
  });

  it("admits a named additional pass after convergence without erasing the earlier result", () => {
    const prior = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean" as const,
        reviewOperationId: "local/clean-1",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/clean-1",
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        coverageAdequate: true,
      },
    };
    const additionalPassAuthorization = {
      target, lane: "standard" as const, precedingProducerId: "local/clean-1",
      completedPasses: 1, nextPass: 2,
    };
    expect(resolveReviewPolicy(prior)).toMatchObject({ state: "pass-complete", nextAction: "none" });
    expect(resolveReviewPolicy({ ...prior, additionalPassAuthorization })).toMatchObject({
      state: "ready", nextAction: "local-prepare", payload: { pass: 2 },
    });
    expect(resolveReviewPolicy({
      ...prior, additionalPassAuthorization: { ...additionalPassAuthorization, precedingProducerId: "other" },
    })).toMatchObject({
      state: "invalid-override", payload: { reason: "preceding-producer-mismatch" },
    });
    expect(resolveReviewPolicy({
      ...prior, completedPasses: 2, maxPasses: 2,
      attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: "local/clean-2" }],
      verifiedTerminalSignal: { ...prior.verifiedTerminalSignal, reviewOperationId: "local/clean-2" },
      additionalPassAuthorization,
    })).toMatchObject({ state: "invalid-override", payload: { reason: "pass-count-mismatch" } });
    expect(resolveReviewPolicy({
      ...prior, completedPasses: 2, maxPasses: 2,
      attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: "local/clean-2" }],
      verifiedTerminalSignal: { ...prior.verifiedTerminalSignal, reviewOperationId: "local/clean-2" },
      additionalPassAuthorization: {
        ...additionalPassAuthorization, precedingProducerId: "local/clean-2", completedPasses: 2, nextPass: 3,
      },
    })).toMatchObject({ state: "ready", payload: { pass: 3, ceilingOverrideApplied: true } });
    for (const completedPasses of [3, 4, 7]) {
      const producer = `local/clean-${String(completedPasses)}`;
      expect(resolveReviewPolicy({
        ...prior, completedPasses,
        attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: producer }],
        verifiedTerminalSignal: { ...prior.verifiedTerminalSignal, reviewOperationId: producer },
        additionalPassAuthorization: {
          ...additionalPassAuthorization, precedingProducerId: producer,
          completedPasses, nextPass: completedPasses + 1,
        },
      })).toMatchObject({ state: "ready", payload: { pass: completedPasses + 1 } });
    }
    const material = {
      ...prior, completedPasses: 3,
      attempts: [{ sourceId: "delegated-agent", outcome: "findings" as const,
        reviewOperationId: "local/material-3" }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/material-3", confirmedFindingCount: 1,
        maxConfirmedSeverity: "major" as const, coverageAdequate: true,
      },
    };
    expect(resolveReviewPolicy(material)).toMatchObject({ state: "findings", nextAction: "respond" });
    expect(resolveReviewPolicy({
      ...material,
      additionalPassAuthorization: {
        ...additionalPassAuthorization, precedingProducerId: "local/material-3",
        completedPasses: 3, nextPass: 4,
      },
    })).toMatchObject({ state: "invalid-override", payload: { reason: "pass-not-converged" } });
  });

  it("requires exceptional approval when a lane exhausts its ceiling", () => {
    const approval = resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [],
    });
    expect(approval).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      diagnostics: [{ code: "review-pass-ceiling-exhausted" }],
      payload: {
        lane: "standard",
        consumedPass: false,
        consequence: {
          target,
          lane: "standard",
          exhaustedPassCount: 2,
          nextPass: 3,
        },
      },
    });
    if (approval.state !== "approval-required") throw new Error("expected approval consequence");
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [],
      ceilingOverride: approval.payload.consequence,
    })).toMatchObject({
      state: "ready",
      payload: { pass: 3, ceilingOverrideApplied: true },
    });
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 3,
      maxPasses: 2,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        reviewOperationId: "local/attempt-3",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/attempt-3",
        confirmedFindingCount: 0,
        maxConfirmedSeverity: null,
        coverageAdequate: true,
      },
      ceilingOverride: approval.payload.consequence,
    })).toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: {
        pass: 3,
        completedPasses: 3,
        consumedPass: true,
      },
    });
  });

  it("lets the Work Unit Owner accept a non-converged terminus without claiming a pass result", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 5,
      maxPasses: 2,
      attempts: [],
      terminus: {
        schemaVersion: 1,
        semanticsVersion: "review-terminus/v1",
        kind: "owner-accepted",
        lane: "standard",
        acceptedBy: "andrew",
        completedPasses: 5,
      },
    })).toMatchObject({
      state: "owner-accepted",
      nextAction: "none",
      payload: {
        lane: "standard",
        completedPasses: 5,
        consumedPass: false,
        terminus: {
          kind: "owner-accepted",
          acceptedBy: "andrew",
        },
      },
    });
  });

  it("does not let Owner acceptance suppress an outstanding findings result", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 5,
      maxPasses: 2,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "findings",
        reviewOperationId: "local/attempt-5",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "local/attempt-5",
        confirmedFindingCount: 1,
        maxConfirmedSeverity: "major",
        coverageAdequate: true,
      },
      terminus: {
        schemaVersion: 1,
        semanticsVersion: "review-terminus/v1",
        kind: "owner-accepted",
        lane: "standard",
        acceptedBy: "andrew",
        completedPasses: 4,
      },
    })).toMatchObject({
      state: "findings",
      nextAction: "respond",
      payload: { postResponseAction: "resolve-next-pass" },
    });
  });

  it("rejects terminal progress from a source ineligible for the selected scope", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{
        sourceId: "coderabbit-pr",
        outcome: "clean",
        reviewOperationId: "hosted/attempt-1",
      }],
      scopeSelection: { mode: "chunked", target },
    })).toThrow(/attempt source is ineligible/u);
  });

  it("enforces the ceiling while preserving safe-unavailability attempts", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
    })).toMatchObject({
      state: "approval-required",
      payload: {
        attemptedSources: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
      },
    });
  });

  it("applies a valid ceiling override after only safe-unavailability attempts", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
      ceilingOverride: {
        target,
        lane: "standard",
        exhaustedPassCount: 2,
        nextPass: 3,
      },
    })).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: {
        sourceId: "delegated-agent",
        pass: 3,
        ceilingOverrideApplied: true,
      },
    });
  });

  it("keeps frontline activation independent and honors an exempt standard obligation", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      frontlineActive: false,
    })).toMatchObject({
      state: "skipped",
      nextAction: "none",
      payload: { lane: "frontline", reason: "inactive" },
    });
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview: {
        ...standardReview,
        obligation: "exempt",
        reasons: ["auto-eligible-planning"],
        retrigger: "none",
      },
      sources: ["coderabbit-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "no-op",
      nextAction: "none",
      payload: { lane: "standard", attemptedSources: [] },
    });
  });

  it("honors an explicit one-run frontline skip without disabling the configured lane", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      frontlineActive: true,
      invocation: { mode: "skip" },
    })).toMatchObject({
      state: "skipped",
      nextAction: "none",
      payload: {
        lane: "frontline",
        scope: "whole-target",
        attemptedSources: [],
        reason: "invocation-skip",
      },
    });
  });

  it("closes the opening frontline phase once a change request is open", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      frontlineActive: true,
    })).toMatchObject({
      state: "skipped",
      nextAction: "none",
      diagnostics: [expect.objectContaining({ code: "frontline-phase-closed" })],
      payload: {
        lane: "frontline",
        scope: "whole-target",
        attemptedSources: [],
        reason: "phase-closed",
      },
    });
  });

  it.each([
    { frontlineActive: false, sources: ["coderabbit-cli"], invocation: undefined },
    { frontlineActive: true, sources: ["coderabbit-cli"], invocation: { mode: "skip" as const } },
    { frontlineActive: true, sources: ["coderabbit-cli"], invocation: undefined },
  ])("retains an admitted frontline findings response across activation changes and an open change request %j", ({
    frontlineActive, sources, invocation,
  }) => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources,
      completedPasses: 1,
      maxPasses: 2,
      attempts: [{
        sourceId: "coderabbit-cli",
        outcome: "findings",
        reviewOperationId: "frontline/attempt-1",
      }],
      verifiedTerminalSignal: {
        reviewOperationId: "frontline/attempt-1",
        confirmedFindingCount: 1,
        maxConfirmedSeverity: "major",
        coverageAdequate: true,
      },
      frontlineActive,
      ...(invocation === undefined ? {} : { invocation }),
    })).toMatchObject({ state: "findings", nextAction: "respond" });
  });

  it("rejects a frontline invocation override on the standard lane", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      invocation: { mode: "skip" },
    })).toThrow(/frontline invocation override/i);
  });

  it("rejects a standard source invocation on the frontline lane", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      frontlineActive: true,
      invocation: { mode: "force", sourceId: "coderabbit-cli" },
    })).toThrow(/standard source invocation.*frontline lane/i);
  });

  it("rejects an Owner terminus on the advisory frontline lane", () => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "frontline",
      standardReview,
      sources: ["coderabbit-cli"],
      completedPasses: 1,
      maxPasses: 2,
      attempts: [],
      frontlineActive: true,
      terminus: {
        schemaVersion: 1,
        semanticsVersion: "review-terminus/v1",
        kind: "owner-accepted",
        lane: "standard",
        acceptedBy: "andrew",
        completedPasses: 1,
      },
    })).toThrow(/owner-accepted terminus.*standard lane/i);
  });

  it("preserves safe attempts when an exempt standard obligation no-ops", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview: {
        ...standardReview,
        obligation: "exempt",
        reasons: ["auto-eligible-planning"],
        retrigger: "none",
      },
      sources: ["coderabbit-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
    })).toMatchObject({
      state: "no-op",
      payload: {
        attemptedSources: [{ sourceId: "coderabbit-pr", outcome: "rate-limited" }],
      },
    });
  });

  it("applies one exact one-pass override idempotently before the pass advances", () => {
    const request = {
      schemaVersion: 1 as const,
      target,
      lane: "standard" as const,
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [],
      ceilingOverride: {
        target,
        lane: "standard" as const,
        exhaustedPassCount: 2,
        nextPass: 3,
      },
    };

    const first = resolveReviewPolicy(request);
    const repeated = resolveReviewPolicy(request);

    expect(first).toMatchObject({
      state: "ready",
      nextAction: "local-prepare",
      payload: {
        pass: 3,
        maxPasses: 2,
        ceilingOverrideApplied: true,
      },
    });
    expect(repeated).toEqual(first);
  });

  it.each([
    {
      name: "wrong target",
      patch: {
        ceilingOverride: {
          target: { ...target, headSha: "c".repeat(40) },
          lane: "standard" as const,
          exhaustedPassCount: 2,
          nextPass: 3,
        },
      },
      reason: "target-mismatch",
    },
    {
      name: "wrong lane",
      patch: {
        ceilingOverride: {
          target,
          lane: "frontline" as const,
          exhaustedPassCount: 2,
          nextPass: 3,
        },
      },
      reason: "lane-mismatch",
    },
    {
      name: "advanced state",
      patch: { completedPasses: 3 },
      reason: "pass-count-mismatch",
    },
    {
      name: "wrong next pass",
      patch: {
        ceilingOverride: {
          target,
          lane: "standard" as const,
          exhaustedPassCount: 2,
          nextPass: 4,
        },
      },
      reason: "next-pass-mismatch",
    },
    {
      name: "ceiling not exhausted",
      patch: {
        completedPasses: 1,
        ceilingOverride: {
          target,
          lane: "standard" as const,
          exhaustedPassCount: 1,
          nextPass: 2,
        },
      },
      reason: "ceiling-not-exhausted",
    },
  ])("rejects a stale or mismatched override: $name", ({ patch, reason }) => {
    const ceilingOverride = {
      target,
      lane: "standard" as const,
      exhaustedPassCount: 2,
      nextPass: 3,
    };
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [],
      ceilingOverride,
      ...patch,
    })).toMatchObject({
      state: "invalid-override",
      nextAction: "stop",
      diagnostics: [{ code: `ceiling-override-${reason}` }],
      payload: { consumedPass: false, reason },
    });
  });

  it.each([
    {
      name: "out-of-order attempts",
      attempts: [
        { sourceId: "codex-pr", outcome: "rate-limited" as const },
        { sourceId: "coderabbit-pr", outcome: "transient-unavailable" as const },
      ],
    },
    {
      name: "attempt after terminal outcome",
      attempts: [
        { sourceId: "coderabbit-pr", outcome: "terminal-failure" as const },
        { sourceId: "codex-pr", outcome: "rate-limited" as const },
      ],
    },
  ])("rejects the request invariant for $name", ({ attempts }) => {
    expect(() => resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts,
    })).toThrow();
  });
});

describe("standard review execution admission", () => {
  const base = {
    target,
    frontlineActive: false,
    standardReview,
    attempts: [],
    sources: ["codex-pr", "delegated-agent"],
    maxPasses: 2,
  } as const;

  it("refuses an exhausted producer admission without exact one-pass authority", () => {
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 2,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
    })).toThrow(/approval-required\/obtain-ceiling-override/u);
  });

  it("binds a targetless ceiling judgment to exactly its named next pass", () => {
    const judgment = {
      ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 },
    } as const;
    expect(assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 2,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
      judgment,
    }).payload).toMatchObject({ pass: 3, ceilingOverrideApplied: true });
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 3,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
      judgment,
    })).toThrow(/invalid-override\/stop/u);
  });

  it("does not rebind full ceiling authority onto another target or lane", () => {
    const judgment = {
      ceilingOverride: { exhaustedPassCount: 2, nextPass: 3 },
    } as const;
    const foreignTarget = {
      target: { ...target, headSha: "c".repeat(40) },
      lane: "standard" as const,
      exhaustedPassCount: 2,
      nextPass: 3,
    };
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 2,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
      judgment,
      ceilingOverride: foreignTarget,
    } as Parameters<typeof assertStandardReviewExecutionAdmission>[0])).toThrow(/target-mismatch/u);
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 2,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
      judgment,
      ceilingOverride: { ...foreignTarget, target, lane: "frontline" },
    } as Parameters<typeof assertStandardReviewExecutionAdmission>[0])).toThrow(/lane-mismatch/u);
  });

  it("rejects conflicting full and targetless additional-pass authority", () => {
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 1,
      expectedSourceId: "codex-pr",
      expectedNextAction: "hosted-request",
      judgment: { additionalPassAuthorization: {
        headSha: target.headSha, precedingProducerId: "local/clean-1",
        completedPasses: 1, nextPass: 2,
      } },
      additionalPassAuthorization: {
        target, lane: "standard", precedingProducerId: "local/other",
        completedPasses: 1, nextPass: 2,
      },
    })).toThrow(/authority disagree/u);
  });

  it("refuses a public producer that is not the driver's selected source", () => {
    expect(() => assertStandardReviewExecutionAdmission({
      ...base,
      completedPasses: 0,
      expectedSourceId: "delegated-agent",
      expectedNextAction: "hosted-request",
    })).toThrow(/not driver-admissible/u);
  });
});
