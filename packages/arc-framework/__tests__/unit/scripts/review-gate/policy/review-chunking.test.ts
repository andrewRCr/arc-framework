import { describe, expect, it } from "vitest";

import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
} from "../../../../../src/scripts/review-gate/policy/review-chunking.js";

describe("parseReviewChunkingThresholds", () => {
  it("accepts normalized unsigned safe integers including zero", () => {
    expect(parseReviewChunkingThresholds({
      "changeset.advisory_threshold_lines": "  \"5000\" ",
      "changeset.advisory_threshold_files": "'0'",
    })).toEqual({
      kind: "valid",
      thresholds: { lines: 5000, files: 0 },
    });
  });

  it.each(["+1", "-1", "1.5", "1 2", "9007199254740992", ""])(
    "rejects malformed threshold %s",
    (value) => {
      expect(parseReviewChunkingThresholds({
        "changeset.advisory_threshold_lines": value,
        "changeset.advisory_threshold_files": "0",
      })).toMatchObject({
        kind: "invalid",
        key: "changeset.advisory_threshold_lines",
      });
    },
  );
});

describe("resolveReviewChunkingPolicy", () => {
  it("short-circuits disabled thresholds without metrics", () => {
    expect(resolveReviewChunkingPolicy({
      thresholds: { lines: 0, files: 0 },
    })).toEqual({ disposition: "disabled" });
  });

  it("returns below-threshold when no enabled dimension trips", () => {
    expect(resolveReviewChunkingPolicy({
      thresholds: { lines: 100, files: 10 },
      metrics: { lines: 99, files: 9 },
    })).toEqual({
      disposition: "below-threshold",
      metrics: { lines: 99, files: 9 },
      thresholds: { lines: 100, files: 10 },
    });
  });

  it.each([
    [{ lines: 100, files: 0 }, { lines: 100, files: 999 }, ["lines"]],
    [{ lines: 0, files: 10 }, { lines: 999, files: 10 }, ["files"]],
    [{ lines: 100, files: 10 }, { lines: 100, files: 10 }, ["lines", "files"]],
  ] as const)("trips enabled dimensions at equality", (thresholds, metrics, tripped) => {
    const result = resolveReviewChunkingPolicy({
      thresholds,
      metrics,
      deliveryBinding: { status: "authoritative-unbound" },
    });
    expect(result).toMatchObject({
      disposition: "consider-chunks",
      metrics,
      thresholds,
      tripped,
      remedy: "review-chunks",
    });
    expect(result).toHaveProperty("recommendedActionText");
  });

  it("suppresses a tripped signal when chunked scope is already selected", () => {
    expect(resolveReviewChunkingPolicy({
      thresholds: { lines: 10, files: 0 },
      metrics: { lines: 10, files: 1 },
      scopeSelected: true,
      deliveryBinding: { status: "authoritative-unbound" },
    })).toMatchObject({ disposition: "scope-selected", tripped: ["lines"] });
  });

  it("selects only bound-delivery continuation for coherent bound evidence", () => {
    const result = resolveReviewChunkingPolicy({
      thresholds: { lines: 10, files: 0 },
      metrics: { lines: 10, files: 1 },
      deliveryBinding: { status: "bound", planId: "plan-1" },
    });
    expect(result).toMatchObject({
      disposition: "delivery-bound",
      remedy: "continue-bound-delivery",
      planId: "plan-1",
    });
    expect(result).not.toHaveProperty("advisory");
  });

  it("keeps unavailable delivery evidence silent with its diagnostic reason", () => {
    expect(resolveReviewChunkingPolicy({
      thresholds: { lines: 10, files: 0 },
      metrics: { lines: 10, files: 1 },
      deliveryBinding: { status: "unavailable", reason: "namespace-corrupt" },
    })).toMatchObject({
      disposition: "evidence-unavailable",
      reason: "namespace-corrupt",
      tripped: ["lines"],
    });
  });

  it("requires metrics when automatic consideration is enabled", () => {
    expect(() => resolveReviewChunkingPolicy({
      thresholds: { lines: 1, files: 0 },
    })).toThrow("exact-target metrics");
  });
});
