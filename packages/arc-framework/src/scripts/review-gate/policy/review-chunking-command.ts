/** Read-only composition of config, target validation, Git metrics, and chunking policy. */

import type { RawGitExec } from "../../../lib/change-facts.js";
import { resolveChangeStats } from "../../../lib/change-stats.js";
import type { ReaderResult } from "../../../lib/config/status-reader.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import {
  ReviewChunkingResolveEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  ReviewChunkingResolveCommandRequestSchema,
} from "../core/review-chunking-command-schema.js";
import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
  type ReviewAttentionDeliveryBinding,
} from "./review-chunking.js";

export class ReviewChunkingCommandError extends Error {
  readonly code = "invalid-input";
}

/**
 * Resolve one immutable target's chunking recommendation without mutating review state.
 */
export async function resolveReviewChunkingCommand(
  request: unknown,
  dependencies: {
    readSettings(): Promise<ReaderResult>;
    readDeliveryBinding(): Promise<ReviewAttentionDeliveryBinding>;
    exec: RawGitExec;
  },
) {
  const parsed = ReviewChunkingResolveCommandRequestSchema.parse(request);
  let target;
  try {
    target = validateReviewTarget(parsed.target);
  } catch (error) {
    throw new ReviewChunkingCommandError(
      error instanceof Error ? error.message : "invalid review target",
    );
  }
  let scopeSelected = false;
  if (parsed.scopeSelection !== undefined) {
    let selectedTarget;
    try {
      selectedTarget = validateReviewTarget(parsed.scopeSelection.target);
    } catch (error) {
      throw new ReviewChunkingCommandError(
        error instanceof Error ? error.message : "invalid selected review target",
      );
    }
    if (selectedTarget.targetId !== target.targetId) {
      throw new ReviewChunkingCommandError("selected review scope does not belong to the current target");
    }
    scopeSelected = true;
  }
  const config = await dependencies.readSettings();
  const thresholds = parseReviewChunkingThresholds(config.settings);
  if (thresholds.kind === "invalid") {
    throw new ReviewChunkingCommandError(
      `${thresholds.key}: '${thresholds.value}' is not a valid ${thresholds.expected}`,
    );
  }
  const diagnostics = config.warnings.map((message) => ({ code: "config-warning", message }));
  const policy = thresholds.thresholds.lines === 0 && thresholds.thresholds.files === 0
    ? resolveReviewChunkingPolicy({ thresholds: thresholds.thresholds })
    : await (async () => {
      const stats = await resolveChangeStats(
        dependencies.exec,
        target.diffBaseSha,
        target.headSha,
      );
      if (stats.kind === "unknown") {
        throw new ReviewChunkingCommandError(
          `Unable to measure exact review target: ${stats.reason}`,
        );
      }
      const initial = resolveReviewChunkingPolicy({
        thresholds: thresholds.thresholds,
        metrics: stats.metrics,
        scopeSelected,
        deliveryBinding: { status: "unavailable", reason: "not-read" },
      });
      if (initial.disposition !== "evidence-unavailable") return initial;
      let deliveryBinding: ReviewAttentionDeliveryBinding;
      try {
        deliveryBinding = await dependencies.readDeliveryBinding();
      } catch {
        deliveryBinding = { status: "unavailable", reason: "reader-failure" };
      }
      return resolveReviewChunkingPolicy({
        thresholds: thresholds.thresholds,
        metrics: stats.metrics,
        scopeSelected,
        deliveryBinding,
      });
    })();
  const base = {
    schemaVersion: 1 as const,
    mode: "review-chunking-resolve" as const,
    diagnostics,
  };
  if (policy.disposition === "disabled") {
    return ReviewChunkingResolveEnvelopeSchema.parse({
      ...base,
      state: "disabled",
      nextAction: "none",
      payload: { target },
    });
  }
  if (policy.disposition === "below-threshold") {
    return ReviewChunkingResolveEnvelopeSchema.parse({
      ...base,
      state: "below-threshold",
      nextAction: "continue-review",
      payload: { target, metrics: policy.metrics, thresholds: policy.thresholds },
    });
  }
  const measuredPayload = {
    target,
    metrics: policy.metrics,
    thresholds: policy.thresholds,
    tripped: policy.tripped,
  };
  if (policy.disposition === "scope-selected") {
    return ReviewChunkingResolveEnvelopeSchema.parse({
      ...base,
      state: "scope-selected",
      nextAction: "continue-review",
      payload: measuredPayload,
    });
  }
  if (policy.disposition === "evidence-unavailable") {
    return ReviewChunkingResolveEnvelopeSchema.parse({
      ...base,
      diagnostics: [
        ...diagnostics,
        {
          code: "delivery-evidence-unavailable",
          message: `Delivery evidence is unavailable: ${policy.reason}.`,
        },
      ],
      state: "evidence-unavailable",
      nextAction: "continue-review",
      payload: measuredPayload,
    });
  }
  if (policy.disposition === "delivery-bound") {
    return ReviewChunkingResolveEnvelopeSchema.parse({
      ...base,
      state: "delivery-bound",
      nextAction: "continue-review",
      payload: {
        ...measuredPayload,
        planId: policy.planId,
        remedy: policy.remedy,
        recommendedActionText: policy.recommendedActionText,
      },
    });
  }
  return ReviewChunkingResolveEnvelopeSchema.parse({
    ...base,
    state: "consider-chunks",
    nextAction: "select-review-scope",
    payload: {
      ...measuredPayload,
      remedy: policy.remedy,
      recommendedActionText: policy.recommendedActionText,
    },
  });
}
