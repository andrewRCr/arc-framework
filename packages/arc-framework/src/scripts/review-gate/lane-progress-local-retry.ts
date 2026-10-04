/** Project admitted local retry generations without changing durable evidence. */

import { canonicalize } from "../../lib/kernel/index.js";
import type { LaneProgressState } from "./core/operation-state-schema.js";
import { localAttemptCoverageAdmission } from "./policy/local-review-coverage-selection.js";

type LaneAttempt = LaneProgressState["attempts"][number];
type LocalBinding = NonNullable<LaneAttempt["local"]>;

function localRetryBinding(binding: LocalBinding): unknown {
  const { target } = binding;
  return {
    vehicle: binding.vehicle,
    scopeMode: binding.scopeMode,
    coverageAdmission: localAttemptCoverageAdmission(binding),
    rubricIdentity: binding.rubricIdentity,
    target: {
      kind: target.kind, repositoryId: target.repositoryId, baseRef: target.baseRef,
      headSha: target.headSha, headTree: target.headTree,
    },
  };
}

function localRetryCanAdvance(previous: LaneAttempt, next: LaneAttempt): boolean {
  if (previous.local === undefined || next.local === undefined) return false;
  if (previous.local.rubricIdentity === undefined || next.local.rubricIdentity === undefined) return false;
  // Only the native admission retry outcomes can be replaced. Findings, pending
  // operations, and uncertain failures retain their own authority.
  return (previous.outcome === "stale-target" || previous.outcome === "terminal-failure")
    && !previous.terminalProducer
    && previous.sourceId === next.sourceId
    && previous.logicalPass === next.logicalPass
    && next.retryGeneration > previous.retryGeneration
    && canonicalize(localRetryBinding(previous.local)) === canonicalize(localRetryBinding(next.local));
}

/**
 * Present adjacent generations within one validated lane owner as one policy attempt.
 *
 * Run before exact-head filtering so unrelated intervening attempts cannot become adjacent.
 * The original attempts remain available through the complete owner and operation stores.
 *
 * @param attempts - Ordered attempts from one validated lane owner.
 * @returns Current retry generations plus every attempt without a proven retry continuation.
 */
export function projectLocalRetryAttempts(attempts: readonly LaneAttempt[]): readonly LaneAttempt[] {
  const projected: LaneAttempt[] = [];
  for (const attempt of attempts) {
    const previous = projected.at(-1);
    if (previous !== undefined && localRetryCanAdvance(previous, attempt)) {
      projected[projected.length - 1] = attempt;
    } else {
      projected.push(attempt);
    }
  }
  return projected;
}
