import { describe, expect, it } from "vitest";

import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
} from "../../../../../src/scripts/review-gate/policy/review-chunking.js";

describe("parseReviewChunkingThresholds", () => {
  it("accepts normalized unsigned safe integers including zero", () => {
    expect(parseReviewChunkingThresholds({
      "review.chunking_threshold_lines": "  \"5000\" ",
      "review.chunking_threshold_files": "'0'",
    })).toEqual({
      kind: "valid",
      thresholds: { lines: 5000, files: 0 },
    });
  });

  it.each(["+1", "-1", "1.5", "1 2", "9007199254740992", ""])(
    "rejects malformed threshold %s",
    (value) => {
      expect(parseReviewChunkingThresholds({
        "review.chunking_threshold_lines": value,
        "review.chunking_threshold_files": "0",
      })).toMatchObject({
        kind: "invalid",
        key: "review.chunking_threshold_lines",
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
    const result = resolveReviewChunkingPolicy({ thresholds, metrics });
    expect(result).toMatchObject({
      disposition: "consider-chunks",
      metrics,
      thresholds,
      tripped,
    });
    expect(result).toHaveProperty("advisory");
  });

  it("requires metrics when automatic consideration is enabled", () => {
    expect(() => resolveReviewChunkingPolicy({
      thresholds: { lines: 1, files: 0 },
    })).toThrow("exact-target metrics");
  });
});
