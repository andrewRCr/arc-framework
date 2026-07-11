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
  it("qualifies the label only from current configuration-command evidence with one effective path", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      command: "@coderabbitai configuration",
      observedAt: "2026-07-11T12:00:00Z",
      effectiveAutomaticPaths: ["label:arc-review-gate"],
    })).toEqual({ qualified: true, reasons: [] });
  });

  it.each([
    ["inherited extra label", ["label:arc-review-gate", "label:review"]],
    ["description keyword", ["label:arc-review-gate", "description-keyword"]],
    ["global override", ["label:arc-review-gate", "global:auto-review"]],
    ["missing label", []],
  ])("keeps label qualification disabled for %s", (_name, effectiveAutomaticPaths) => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      command: "@coderabbitai configuration",
      observedAt: "2026-07-11T12:00:00Z",
      effectiveAutomaticPaths,
    }).qualified).toBe(false);
  });

  it("fails unavailable rather than inferring capability from stale or wrong evidence", () => {
    expect(qualifyResolvedCodeRabbitConfiguration({
      command: "@coderabbitai rate limit",
      observedAt: "not-a-time",
      effectiveAutomaticPaths: ["label:arc-review-gate"],
    })).toMatchObject({ qualified: false, reasons: ["wrong-command", "invalid-observed-at"] });
  });
});
