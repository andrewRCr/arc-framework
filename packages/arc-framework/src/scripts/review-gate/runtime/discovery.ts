/** Secretless, bounded candidate discovery for reconciliation matrix fan-out. */

import { hashContent } from "../../../lib/manifest/hash.js";
import { parseTriggerDeletionEvent, type TriggerDeletionEvent } from "../core/trigger-tombstone.js";
import { isControllerSelfCheckEvent, normalizeWakeup, type WakeupHint } from "./wakeup.js";

export interface ReconcileCandidate {
  repositoryId: number;
  pullRequestNumber: number;
  triggerDeletion?: TriggerDeletionEvent;
}

export interface DiscoveryPort {
  resolveOpenPullRequestsByHead(repositoryId: number, headSha: string): Promise<number[]>;
  listOpenPullRequests(repositoryId: number): AsyncIterable<number[]>;
  resolvePullRequestHead?(repositoryId: number, pullRequestNumber: number): Promise<string>;
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

/**
 * Resolve the reconcile-matrix output for a wake-up, or `null` when the reconcile
 * job must not run: a controller self-check event (suppressed before expansion to
 * break the recursive-wake-up loop) or a candidate-less wake-up. Returning `null`
 * so the caller writes no `matrix=` output keeps the reconcile job's matrix input
 * empty and skipped, rather than expanding an empty include vector and failing the run.
 */
export async function resolveMatrixOutput(
  eventName: string,
  payload: unknown,
  expectedAppId: number,
  port: DiscoveryPort,
  maximum = 100,
): Promise<string | null> {
  if (eventName === "check_run" && isControllerSelfCheckEvent(payload, expectedAppId)) return null;
  let candidates = await discoverCandidates(normalizeWakeup(eventName, payload), port, maximum);
  if (eventName === "issue_comment" && deletionAction(payload)) {
    if (candidates.length !== 1 || port.resolvePullRequestHead === undefined) {
      throw new Error("trigger-deletion-route-unavailable");
    }
    const candidate = candidates[0];
    if (candidate === undefined) throw new Error("trigger-deletion-candidate-missing");
    const headSha = await port.resolvePullRequestHead(candidate.repositoryId, candidate.pullRequestNumber);
    candidates = [{ ...candidate, triggerDeletion: deletionEvent(payload, headSha) }];
  }
  return candidates.length === 0 ? null : JSON.stringify({ include: candidates });
}

function payloadRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${path}: expected object`);
  return value as Record<string, unknown>;
}

function deletionAction(payload: unknown): boolean {
  return payloadRecord(payload, "payload").action === "deleted";
}

function deletionEvent(payload: unknown, observedHeadSha: string): TriggerDeletionEvent {
  const root = payloadRecord(payload, "payload");
  const comment = payloadRecord(root.comment, "payload.comment");
  const user = payloadRecord(comment.user, "payload.comment.user");
  const id = comment.id;
  const actor = user.id;
  const body = comment.body;
  const deletedAt = comment.updated_at;
  if (!Number.isSafeInteger(id) || (id as number) <= 0) throw new Error("payload.comment.id: invalid");
  if (!Number.isSafeInteger(actor) || (actor as number) <= 0) throw new Error("payload.comment.user.id: invalid");
  if (typeof body !== "string" || typeof deletedAt !== "string") throw new Error("payload.comment: invalid deletion");
  const providerIdentity = /@codex\s+review/iu.test(body)
    ? "codex-pr"
    : /@coderabbit(?:ai)?\b/iu.test(body) ? "coderabbit-pr" : "unknown";
  return parseTriggerDeletionEvent({
    schemaVersion: 1,
    commentId: String(id),
    actorIdentity: String(actor),
    priorBodyDigest: hashContent(body),
    deletedAt,
    observedHeadSha,
    providerIdentity,
    triggerClassification: providerIdentity === "unknown" ? "other" : "provider-trigger",
    authenticatedEventRef: `github-event:issue-comment-deleted:${String(id)}:${deletedAt}`,
  });
}

/** Stable write-lane identity shared by reconciliation and attestation jobs. */
export function reconciliationGroup(candidate: ReconcileCandidate): string {
  return `review-gate-${candidate.repositoryId}-${candidate.pullRequestNumber}`;
}
