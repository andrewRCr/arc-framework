/** Dependency-injectable exact-head mutability guard. */

import type { ReviewReceipt } from "../core/execution.js";
import {
  queryHeadMutability,
  type HeadMutabilityResult,
  type HostFlightObservation,
} from "../core/head-mutability.js";

export interface HeadMutabilityScope {
  repositoryId: string;
  changeRequestId: string;
  currentHeadSha: string;
  proposedHeadSha: string;
  authorizationReceiptHash: string | null;
}

export interface HeadMutabilitySnapshot {
  repositoryId: string;
  changeRequestId: string;
  headSha: string;
  receipts: ReviewReceipt[];
  observations: HostFlightObservation[];
}

export interface HeadMutabilityReader {
  read(scope: HeadMutabilityScope): Promise<HeadMutabilitySnapshot>;
}

type GuardReason = HeadMutabilityResult["reason"]
  | "authorization-mismatch"
  | "canonical-state-moved"
  | "controller-state-unavailable";

export interface HeadMutabilityGuardResult {
  schemaVersion: 1;
  kind: "allow" | "refuse";
  repositoryId: string;
  changeRequestId: string;
  currentHeadSha: string;
  proposedHeadSha: string;
  reason: GuardReason;
  authorizationReceiptHash: string | null;
}

function result(
  input: HeadMutabilityScope,
  kind: HeadMutabilityGuardResult["kind"],
  reason: GuardReason,
  authorizationReceiptHash: string | null = input.authorizationReceiptHash,
): HeadMutabilityGuardResult {
  return {
    schemaVersion: 1,
    kind,
    repositoryId: input.repositoryId,
    changeRequestId: input.changeRequestId,
    currentHeadSha: input.currentHeadSha,
    proposedHeadSha: input.proposedHeadSha,
    reason,
    authorizationReceiptHash,
  };
}

/** Re-read canonical state and decide one exact outgoing head transition. */
export async function runAssertHeadMutable(
  input: HeadMutabilityScope,
  reader: HeadMutabilityReader,
): Promise<HeadMutabilityGuardResult> {
  let snapshot: HeadMutabilitySnapshot;
  try {
    snapshot = await reader.read(input);
  } catch {
    return result(input, "refuse", "controller-state-unavailable");
  }
  if (
    snapshot.repositoryId !== input.repositoryId
    || snapshot.changeRequestId !== input.changeRequestId
    || snapshot.headSha !== input.currentHeadSha
  ) return result(input, "refuse", "canonical-state-moved");
  const decision = queryHeadMutability({
    receipts: snapshot.receipts,
    observations: snapshot.observations,
    currentHeadSha: snapshot.headSha,
    proposedHeadSha: input.proposedHeadSha,
  });
  if (decision.kind === "refuse") return result(input, "refuse", decision.reason);
  const canonicalAuthorization = decision.authorizationReceiptHash ?? null;
  if (
    input.authorizationReceiptHash !== null
    && input.authorizationReceiptHash !== canonicalAuthorization
  ) return result(input, "refuse", "authorization-mismatch", canonicalAuthorization);
  return result(input, "allow", decision.reason, canonicalAuthorization);
}
