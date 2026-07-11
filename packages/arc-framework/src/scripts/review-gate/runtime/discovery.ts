/** Secretless, bounded candidate discovery for reconciliation matrix fan-out. */

import type { WakeupHint } from "./wakeup.js";

export interface ReconcileCandidate { repositoryId: number; pullRequestNumber: number }

export interface DiscoveryPort {
  resolveOpenPullRequestsByHead(repositoryId: number, headSha: string): Promise<number[]>;
  listOpenPullRequests(repositoryId: number): AsyncIterable<number[]>;
}

/** Resolve every candidate, failing instead of emitting a partial matrix. */
export async function discoverCandidates(
  hint: WakeupHint,
  port: DiscoveryPort,
  maximum = 100,
): Promise<ReconcileCandidate[]> {
  let numbers = hint.pullRequestNumbers;
  if (numbers.length === 0 && hint.headSha !== null) {
    numbers = await port.resolveOpenPullRequestsByHead(hint.repositoryId, hint.headSha);
  }
  if (hint.kind === "schedule" || (numbers.length === 0 && hint.kind === "workflow-run")) {
    numbers = [];
    for await (const page of port.listOpenPullRequests(hint.repositoryId)) numbers.push(...page);
  }
  const deduplicated = [...new Set(numbers)].sort((left, right) => left - right);
  if (deduplicated.some((number) => !Number.isSafeInteger(number) || number <= 0)) throw new Error("invalid-candidate");
  if (deduplicated.length > maximum) throw new Error(`candidate-cap-exceeded:${maximum}`);
  return deduplicated.map((pullRequestNumber) => ({ repositoryId: hint.repositoryId, pullRequestNumber }));
}

/** Stable write-lane identity shared by reconciliation and attestation jobs. */
export function reconciliationGroup(candidate: ReconcileCandidate): string {
  return `review-gate-${candidate.repositoryId}-${candidate.pullRequestNumber}`;
}
