/** Chunked-or-whole scope selection for a delivery member's review status. */

import type { readConfigSettings } from "../../lib/config/status-reader.js";
import type { RawGitExec } from "../../lib/git/exec.js";
import { resolveChangeStats } from "../../lib/change-stats.js";
import { HostedProviderIdSchema } from "./hosted/request.js";
import type { DeliveryLocalReviewScopeSelection } from
  "./policy/delivery-local-review-admission.js";
import {
  parseReviewChunkingThresholds,
  resolveReviewChunkingPolicy,
} from "./policy/review-chunking.js";

/**
 * Select the local review scope for one delivery member from the configured chunking thresholds.
 *
 * @param input - Byte-level Git executor, configuration settings, delivery plan, selected source, and exact member
 *   target.
 * @returns A chunked selection when the member's measured change crosses a threshold and the source is not hosted;
 *   otherwise undefined, leaving whole-target review.
 * @throws When a threshold is invalid, the target cannot be measured, or chunking returns an unexpected disposition.
 */
export async function resolveDeliveryMemberScopeSelection(input: {
  readonly rawExec: RawGitExec;
  readonly settings: Awaited<ReturnType<typeof readConfigSettings>>["settings"];
  readonly planId: string;
  readonly sourceId?: string;
  readonly target: {
    readonly repository: string;
    readonly pullRequest: number;
    readonly baseRevision: string;
    readonly headSha: string;
  };
}): Promise<DeliveryLocalReviewScopeSelection | undefined> {
  const parsed = parseReviewChunkingThresholds({
    "changeset.advisory_threshold_lines": input.settings["changeset.advisory_threshold_lines"],
    "changeset.advisory_threshold_files": input.settings["changeset.advisory_threshold_files"],
  });
  if (parsed.kind === "invalid") {
    throw new Error(`Invalid review chunking threshold ${parsed.key}: ${parsed.value}`);
  }
  if (parsed.thresholds.lines === 0 && parsed.thresholds.files === 0) return undefined;
  const stats = await resolveChangeStats(
    input.rawExec,
    input.target.baseRevision,
    input.target.headSha,
  );
  if (stats.kind === "unknown") {
    throw new Error(`Unable to measure exact delivery-member review target: ${stats.reason}`);
  }
  const resolution = resolveReviewChunkingPolicy({
    thresholds: parsed.thresholds,
    metrics: stats.metrics,
    deliveryBinding: {
      status: "bound",
      planId: input.planId,
      targetKind: "delivery-member",
    },
  });
  if (resolution.disposition === "consider-chunks") {
    if (HostedProviderIdSchema.safeParse(input.sourceId).success) return undefined;
    return {
      mode: "chunked",
      target: {
        repository: input.target.repository,
        pullRequest: input.target.pullRequest,
        headSha: input.target.headSha,
      },
    };
  }
  if (resolution.disposition === "below-threshold" || resolution.disposition === "disabled") {
    return undefined;
  }
  throw new Error(`Delivery-member review chunking returned ${resolution.disposition}.`);
}
