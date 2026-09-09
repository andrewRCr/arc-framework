/** Field-specific validation for hosted settlement requests against approved attempt state. */

import type { HostedSettleEnvelope } from "./settle.js";
import type { HostedTarget } from "./request.js";

interface HostedSettlementFindingBinding {
  readonly findingId: string;
  readonly origin: string;
  readonly commentId?: string;
  readonly threadId?: string;
}

/** Persisted approved-attempt fields a hosted settlement request must reproduce. */
export interface HostedSettlementAttemptBinding {
  readonly dispositionSetId: string | null;
  readonly actorIdentity: string;
  readonly target: HostedTarget;
  readonly findings: readonly HostedSettlementFindingBinding[];
}

function rendered(value: unknown): string {
  if (value === undefined) return "undefined";
  return JSON.stringify(value);
}

/**
 * Identify the first hosted-settlement field that differs from its approved attempt.
 *
 * @param binding - Persisted hosted attempt authorized by the approved disposition set.
 * @param request - Proposed provider settlement request.
 * @returns A field-specific diagnostic, or `null` when the bindings match.
 */
export function explainHostedSettlementBindingMismatch(
  binding: HostedSettlementAttemptBinding,
  request: HostedSettleEnvelope,
): string | null {
  if (binding.dispositionSetId !== request.response.dispositionSetId) {
    return `response.dispositionSetId differs: expected ${rendered(binding.dispositionSetId)}, received ${rendered(request.response.dispositionSetId)}`;
  }

  const finding = binding.findings.find(({ findingId }) => findingId === request.response.findingId);
  if (finding === undefined) {
    return `response.findingId is unavailable: ${rendered(request.response.findingId)}`;
  }
  if (finding.origin !== "review-thread") {
    return `finding origin does not support hosted settlement: ${rendered(finding.origin)}`;
  }
  if (finding.commentId !== request.finding.commentId) {
    return `finding.commentId differs: expected ${rendered(finding.commentId)}, received ${rendered(request.finding.commentId)}`;
  }
  if (finding.threadId !== request.finding.threadId) {
    return `finding.threadId differs: expected ${rendered(finding.threadId)}, received ${rendered(request.finding.threadId)}`;
  }
  if (binding.actorIdentity !== request.actorIdentity) {
    return `actorIdentity differs: expected ${rendered(binding.actorIdentity)}, received ${rendered(request.actorIdentity)}`;
  }
  if (binding.target.repository !== request.target.repository
    || binding.target.pullRequest !== request.target.pullRequest
    || binding.target.headSha !== request.target.headSha) {
    return `target differs: expected ${rendered(binding.target)}, received ${rendered(request.target)}`;
  }
  return null;
}
