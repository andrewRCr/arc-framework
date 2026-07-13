import { describe, expect, it } from "vitest";

import {
  qualifyResolvedCodeRabbitConfiguration,
  validateCodeRabbitRepositoryDelta,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/config.js";

const delta = {
  inheritance: true,
  reviews: {
    request_changes_workflow: true,
    commit_status: true,
    fail_commit_status: true,
    auto_review: {
      enabled: true,
      labels: ["arc-review-gate"],
      drafts: false,
      auto_incremental_review: false,
      description_keyword: "",
    },
  },
};

describe("CodeRabbit repository delta", () => {
  it("accepts only the inherited controller-label handshake", () => {
    expect(validateCodeRabbitRepositoryDelta(delta)).toEqual(delta);
  });

  it.each([
    ["credential", { ...delta, token: "secret" }],
    ["provider preference", { ...delta, provider: "coderabbit" }],
    ["blanket auto review", { ...delta, reviews: { ...delta.reviews, auto_review: { ...delta.reviews.auto_review, labels: [] } } }],
    ["incremental review", { ...delta, reviews: { ...delta.reviews, auto_review: { ...delta.reviews.auto_review, auto_incremental_review: true } } }],
    ["review status override", { ...delta, reviews: { ...delta.reviews, review_status: true } }],
  ])("rejects %s", (_name, input) => {
    expect(() => validateCodeRabbitRepositoryDelta(input)).toThrow();
  });
});

describe("resolved-configuration qualification", () => {
  const resolved = {
    command: "@coderabbitai configuration",
    observedAt: "2026-07-11T12:00:00Z",
    effectiveAutomaticPaths: ["label:arc-review-gate"],
    inheritedAutomaticPaths: [],
    globalAutomaticPaths: [],
    keywordAutomaticPaths: [],
    pathExclusionsResolved: true,
    requestMechanisms: ["label", "full-review-command"] as const,
    exactFullCoverage: true,
    durableFindings: true,
    durableCleanResults: true,
    settlementCapability: "source-confirmed" as const,
  };

  it("derives a satisfying capability declaration only from complete resolved evidence", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      ...resolved,
    })).toEqual({
      qualified: true,
      satisfying: true,
      reasons: [],
      capabilities: {
        resolvedConfiguration: true,
        exclusiveLabelTrigger: true,
        labelOneShot: true,
        fullReviewCommand: true,
        exactCoverage: true,
        durableFindings: true,
        durableCleanResults: true,
        sourceConfirmedClosures: true,
      },
    });
  });

  it.each([
    ["inherited extra label", ["label:arc-review-gate", "label:review"]],
    ["description keyword", ["label:arc-review-gate", "description-keyword"]],
    ["global override", ["label:arc-review-gate", "global:auto-review"]],
    ["missing label", []],
  ])("keeps label qualification disabled for %s", (_name, effectiveAutomaticPaths) => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      ...resolved,
      effectiveAutomaticPaths,
    }).qualified).toBe(false);
  });

  it("retains independently proven partial capabilities without enabling satisfaction", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      ...resolved,
      durableCleanResults: false,
      settlementCapability: "coordinator-only",
    })).toMatchObject({
      qualified: true,
      satisfying: false,
      reasons: ["durable-clean-results-unproven", "source-settlement-unproven"],
      capabilities: {
        resolvedConfiguration: true,
        exclusiveLabelTrigger: true,
        fullReviewCommand: true,
        exactCoverage: true,
        durableFindings: true,
        durableCleanResults: false,
        sourceConfirmedClosures: false,
      },
    });
  });

  it("keeps a proven label request usable when later full-review transport is unproven", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      ...resolved,
      requestMechanisms: ["label"],
    })).toMatchObject({
      qualified: true,
      satisfying: false,
      reasons: ["full-review-request-unproven"],
      capabilities: { exclusiveLabelTrigger: true, fullReviewCommand: false },
    });
  });

  it.each([
    ["inherited", { inheritedAutomaticPaths: ["label:review"] }],
    ["global", { globalAutomaticPaths: ["global:auto-review"] }],
    ["keyword", { keywordAutomaticPaths: ["description-keyword"] }],
    ["unresolved path exclusions", { pathExclusionsResolved: false }],
  ])("rejects a bypassing %s review path", (_name, override) => {
    expect(qualifyResolvedCodeRabbitConfiguration({ ...resolved, ...override })).toMatchObject({
      qualified: false,
      capabilities: { resolvedConfiguration: false, exclusiveLabelTrigger: false },
    });
  });

  it("fails unavailable rather than inferring capability from stale or wrong evidence", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      ...resolved,
      command: "@coderabbitai rate limit",
      observedAt: "not-a-time",
    })).toMatchObject({ qualified: false, reasons: ["wrong-command", "invalid-observed-at"] });
  });
});
