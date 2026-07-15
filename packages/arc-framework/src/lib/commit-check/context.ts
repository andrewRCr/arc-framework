/** Shared exemption, configuration, and advisory-context preparation. */

import { resolveCommitCheckPolicy } from "./config.js";
import type {
  CommitCheckContext,
  CommitCheckContextInput,
  CommitCheckOutcome,
  CommitCheckPolicy,
  CommitCheckRepositoryState,
} from "./types.js";

/** Internal result consumed by the grammar validator after shared gating. */
export type PreparedCommitCheckContext =
  | { kind: "outcome"; outcome: CommitCheckOutcome }
  | { kind: "ready"; policy: CommitCheckPolicy; repository: CommitCheckRepositoryState };

/**
 * Normalize repository facts for hook, standalone, and wrapper validation.
 *
 * @param input - Raw configuration and repository facts
 * @returns Shared validation context with a stable role default
 */
export function createCommitCheckContext(input: CommitCheckContextInput): CommitCheckContext {
  return {
    configuration: input.configuration,
    repository: {
      mergeInProgress: input.mergeInProgress,
      role: input.role === "contributor" ? "contributor" : "maintainer",
      resolveArtifact: input.resolveArtifact,
    },
  };
}

/**
 * Apply exemptions and active configuration validation before grammar work.
 *
 * @param context - Shared validation context
 * @returns Terminal outcome or normalized policy and repository facts
 */
export function prepareCommitCheckContext(context: CommitCheckContext): PreparedCommitCheckContext {
  if (context.repository.mergeInProgress) {
    return { kind: "outcome", outcome: { kind: "skipped", reason: "merge-in-progress" } };
  }

  const policyResolution = resolveCommitCheckPolicy(context.configuration);
  if (policyResolution.kind === "disabled") {
    return { kind: "outcome", outcome: { kind: "skipped", reason: "disabled" } };
  }
  if (policyResolution.kind === "invalid") {
    return {
      kind: "outcome",
      outcome: { kind: "validated", verdict: "fail", findings: policyResolution.findings },
    };
  }
  return {
    kind: "ready",
    policy: policyResolution.policy,
    repository: context.repository,
  };
}
