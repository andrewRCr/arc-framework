import { describe, expect, it } from "vitest";

import { resolveReviewPolicy } from "../../../../../src/scripts/review-gate/policy/review-policy-driver.js";

const target = {
  repository: "arc-framework/example",
  pullRequest: 42,
  headSha: "a".repeat(40),
};

const standardReview = {
  obligation: "required" as const,
  reasons: ["sensitive-change-set"] as const,
  rubricVersion: "standard-review/v1",
  rubricDigest: `sha256:${"b".repeat(64)}`,
  retrigger: "full-final" as const,
  count: 1 as const,
};

describe("resolveReviewPolicy", () => {
  it("no-ops standard review when no standard source is configured", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: [],
      completedPasses: 0,
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
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [],
      scopeSelection: { mode: "chunked", target },
    })).toMatchObject({
      state: "unavailable",
      nextAction: "stop",
      payload: {
        lane: "standard",
        scope: "chunked",
        consumedPass: false,
        attemptedSources: [],
        ineligibleSources: ["coderabbit-pr", "codex-pr"],
      },
    });
  });

  it("selects exactly one source for each lane independently", () => {
    const frontline = resolveReviewPolicy({
      schemaVersion: 1,
      target,
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

  it("precomposes the human disposition consequence for findings", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "codex-pr", outcome: "findings" }],
    })).toMatchObject({
      state: "findings",
      nextAction: "respond",
      payload: {
        sourceId: "codex-pr",
        pass: 1,
        completedPasses: 1,
        consumedPass: true,
        consequence: "disposition-required",
      },
    });
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
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["coderabbit-pr", "codex-pr"],
      completedPasses: 0,
      maxPasses: 2,
      attempts: [{ sourceId: "coderabbit-pr", outcome }],
    })).toMatchObject({
      state: "blocked",
      nextAction: "stop",
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
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        chunkSeriesComplete: false,
      }],
    })).toMatchObject({
      state: "chunk-pending",
      nextAction: "continue-chunks",
      payload: { pass: 1, completedPasses: 0, consumedPass: false },
    });
    expect(resolveReviewPolicy({
      ...common,
      attempts: [{
        sourceId: "delegated-agent",
        outcome: "clean",
        chunkSeriesComplete: true,
      }],
    })).toMatchObject({
      state: "pass-complete",
      nextAction: "none",
      payload: { pass: 1, completedPasses: 1, consumedPass: true },
    });
  });

  it("requires exceptional approval when a lane exhausts its ceiling", () => {
    expect(resolveReviewPolicy({
      schemaVersion: 1,
      target,
      lane: "standard",
      standardReview,
      sources: ["delegated-agent"],
      completedPasses: 2,
      maxPasses: 2,
      attempts: [],
    })).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      payload: {
        lane: "standard",
        consumedPass: false,
        consequence: {
          repository: target.repository,
          pullRequest: target.pullRequest,
          headSha: target.headSha,
          exhaustedPassCount: 2,
          nextPass: 3,
        },
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
      payload: { lane: "standard" },
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
      name: "started pass",
      patch: { attempts: [{ sourceId: "delegated-agent", outcome: "clean" as const }] },
      reason: "pass-started",
    },
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
      payload: { consumedPass: false, reason },
    });
  });
});
