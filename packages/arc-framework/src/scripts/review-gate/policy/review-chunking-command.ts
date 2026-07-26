/** Read-only composition of config, target validation, Git metrics, and chunking policy. */

import type { RawGitExec } from "../../../lib/change-facts.js";
import { resolveChangeStats } from "../../../lib/change-stats.js";
import type { ReaderResult } from "../../../lib/config/status-reader.js";
import { validateReviewTarget } from "../core/gate-contract-v2.js";
import {
  ReviewChunkingResolveEnvelopeSchema,
} from "../core/review-command-envelope.js";
import {
  ReviewChunkingResolveRequestSchema,
} from "../core/review-chunking-command-schema.js";
import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
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
    exec: RawGitExec;
  },
) {
  const parsed = ReviewChunkingResolveRequestSchema.parse(request);
  let target;
  try {
    target = validateReviewTarget(parsed.target);
  } catch (error) {
    throw new ReviewChunkingCommandError(
      error instanceof Error ? error.message : "invalid review target",
    );
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
      return resolveReviewChunkingPolicy({
        thresholds: thresholds.thresholds,
        metrics: stats.metrics,
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
  return ReviewChunkingResolveEnvelopeSchema.parse({
    ...base,
    state: "consider-chunks",
    nextAction: "select-review-scope",
    payload: {
      target,
      metrics: policy.metrics,
      thresholds: policy.thresholds,
      tripped: policy.tripped,
      advisory: policy.advisory,
    },
  });
}
