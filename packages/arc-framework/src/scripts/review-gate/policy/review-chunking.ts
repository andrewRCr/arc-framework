/** Pure threshold parsing and exact-target review-chunking policy. */

import type { ChangeStats } from "../../../lib/change-stats.js";

export const REVIEW_CHUNKING_THRESHOLD_KEYS = [
  "changeset.advisory_threshold_lines",
  "changeset.advisory_threshold_files",
] as const;

export type ReviewChunkingThresholdKey = (typeof REVIEW_CHUNKING_THRESHOLD_KEYS)[number];

export interface ReviewChunkingThresholds {
  lines: number;
  files: number;
}

/** Fresh repository delivery evidence used only after an attention threshold trips. */
export type ReviewAttentionDeliveryBinding =
  | {
    readonly status: "bound";
    readonly planId: string;
    readonly targetKind: "work-unit" | "delivery-member";
  }
  | { readonly status: "authoritative-unbound" }
  | { readonly status: "unavailable"; readonly reason: string };

export type ReviewChunkingThresholdParseResult =
  | { kind: "valid"; thresholds: ReviewChunkingThresholds }
  | {
    kind: "invalid";
    key: ReviewChunkingThresholdKey;
    value: string;
    expected: "unsigned base-10 safe integer";
  };

export type ReviewChunkingPolicyResult =
  | { disposition: "disabled" }
  | {
    disposition: "below-threshold";
    metrics: ChangeStats;
    thresholds: ReviewChunkingThresholds;
  }
  | {
    disposition: "consider-chunks";
    metrics: ChangeStats;
    thresholds: ReviewChunkingThresholds;
    tripped: Array<"lines" | "files">;
    remedy: "review-chunks";
    recommendedActionText: string;
  }
  | {
    disposition: "scope-selected";
    metrics: ChangeStats;
    thresholds: ReviewChunkingThresholds;
    tripped: Array<"lines" | "files">;
  }
  | {
    disposition: "evidence-unavailable";
    metrics: ChangeStats;
    thresholds: ReviewChunkingThresholds;
    tripped: Array<"lines" | "files">;
    reason: string;
  }
  | {
    disposition: "delivery-bound";
    metrics: ChangeStats;
    thresholds: ReviewChunkingThresholds;
    tripped: Array<"lines" | "files">;
    planId: string;
    remedy: "continue-bound-delivery";
    recommendedActionText: string;
  };

function normalizeScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if ((first === "'" || first === "\"") && last === first) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseThreshold(
  key: ReviewChunkingThresholdKey,
  value: string,
): number | Extract<ReviewChunkingThresholdParseResult, { kind: "invalid" }> {
  const normalized = normalizeScalar(value);
  if (!/^\d+$/u.test(normalized)) {
    return { kind: "invalid", key, value, expected: "unsigned base-10 safe integer" };
  }
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) {
    return { kind: "invalid", key, value, expected: "unsigned base-10 safe integer" };
  }
  return parsed;
}

/**
 * Parse the raw review tripwire settings at the consuming command boundary.
 *
 * @param settings - Raw config values after or before normal YAML scalar normalization.
 * @returns Typed thresholds or one key-specific diagnostic.
 */
export function parseReviewChunkingThresholds(
  settings: Record<ReviewChunkingThresholdKey, string>,
): ReviewChunkingThresholdParseResult {
  const lines = parseThreshold(
    "changeset.advisory_threshold_lines",
    settings["changeset.advisory_threshold_lines"],
  );
  if (typeof lines !== "number") return lines;
  const files = parseThreshold(
    "changeset.advisory_threshold_files",
    settings["changeset.advisory_threshold_files"],
  );
  if (typeof files !== "number") return files;
  return { kind: "valid", thresholds: { lines, files } };
}

function reviewChunksActionText(
  metrics: ChangeStats,
  thresholds: ReviewChunkingThresholds,
  tripped: Array<"lines" | "files">,
): string {
  const triggers = tripped.map((dimension) => (
    dimension === "lines"
      ? `lines ${metrics.lines} >= ${thresholds.lines}`
      : `files ${metrics.files} >= ${thresholds.files}`
  )).join(", ");
  return `Consider review chunks for this exact target (${metrics.lines} changed lines, `
    + `${metrics.files} changed files; tripped: ${triggers}). Draw boundaries by contract cohesion, `
    + "then preserve complete union and seam coverage.";
}

function boundDeliveryActionText(
  metrics: ChangeStats,
  thresholds: ReviewChunkingThresholds,
  tripped: Array<"lines" | "files">,
): string {
  const triggers = tripped.map((dimension) => (
    dimension === "lines"
      ? `lines ${metrics.lines} >= ${thresholds.lines}`
      : `files ${metrics.files} >= ${thresholds.files}`
  )).join(", ");
  return `Continue the bound delivery plan for this exact target (${metrics.lines} changed lines, `
    + `${metrics.files} changed files; tripped: ${triggers}). Use its planned review and delivery members `
    + "instead of starting a second chunking mechanism.";
}

/**
 * Resolve whether one immutable target warrants chunk consideration.
 *
 * @param input - Validated thresholds, metrics, exact-target selection, and fresh delivery evidence.
 * @returns One closed attention result with at most one remedy.
 */
export function resolveReviewChunkingPolicy(input: {
  thresholds: ReviewChunkingThresholds;
  metrics?: ChangeStats;
  scopeSelected?: boolean;
  deliveryBinding?: ReviewAttentionDeliveryBinding;
}): ReviewChunkingPolicyResult {
  const { thresholds } = input;
  if (thresholds.lines === 0 && thresholds.files === 0) return { disposition: "disabled" };
  if (input.metrics === undefined) {
    throw new Error("exact-target metrics are required when review chunking thresholds are enabled");
  }

  const tripped: Array<"lines" | "files"> = [];
  if (thresholds.lines > 0 && input.metrics.lines >= thresholds.lines) tripped.push("lines");
  if (thresholds.files > 0 && input.metrics.files >= thresholds.files) tripped.push("files");
  if (tripped.length === 0) {
    return { disposition: "below-threshold", metrics: input.metrics, thresholds };
  }
  if (input.scopeSelected === true) {
    return {
      disposition: "scope-selected",
      metrics: input.metrics,
      thresholds,
      tripped,
    };
  }
  if (input.deliveryBinding === undefined) {
    throw new Error("fresh delivery binding is required when review attention trips");
  }
  if (input.deliveryBinding.status === "unavailable") {
    return {
      disposition: "evidence-unavailable",
      metrics: input.metrics,
      thresholds,
      tripped,
      reason: input.deliveryBinding.reason,
    };
  }
  if (input.deliveryBinding.status === "bound"
    && input.deliveryBinding.targetKind === "work-unit") {
    return {
      disposition: "delivery-bound",
      metrics: input.metrics,
      thresholds,
      tripped,
      planId: input.deliveryBinding.planId,
      remedy: "continue-bound-delivery",
      recommendedActionText: boundDeliveryActionText(input.metrics, thresholds, tripped),
    };
  }
  return {
    disposition: "consider-chunks",
    metrics: input.metrics,
    thresholds,
    tripped,
    remedy: "review-chunks",
    recommendedActionText: reviewChunksActionText(input.metrics, thresholds, tripped),
  };
}
