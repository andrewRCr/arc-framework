/** Ordered provider selection with durable, one-live-source supersession. */

import type { ReviewReceipt, ReviewRequest, SourceCapacity } from "./execution.js";
import { computeRequestKey } from "./request-key.js";
import { planSourceSupersession, type SourceSupersessionProof } from "./source-supersession.js";

export type ProviderFallbackResolution =
  | { kind: "selected"; request: ReviewRequest }
  | { kind: "append-supersession"; receipt: ReviewReceipt }
  | { kind: "blocked"; reason: string; request?: ReviewRequest };

function sourceReceiptHistory(request: ReviewRequest, receipts: readonly ReviewReceipt[]): ReviewReceipt[] {
  const requestKey = computeRequestKey(request);
  return receipts.filter((receipt) => computeRequestKey(receipt.request) === requestKey);
}

function nextCandidate(
  current: ReviewRequest,
  candidates: readonly ReviewRequest[],
): ReviewRequest | null {
  const index = candidates.findIndex((candidate) => candidate.sourceIdentity === current.sourceIdentity);
  return index < 0 ? null : candidates[index + 1] ?? null;
}

function existingSelection(
  candidates: readonly ReviewRequest[],
  receipts: readonly ReviewReceipt[],
): ReviewRequest | null {
  let current = candidates[0] ?? null;
  const visited = new Set<string>();
  while (current !== null && !visited.has(current.sourceIdentity)) {
    const currentSourceIdentity = current.sourceIdentity;
    visited.add(currentSourceIdentity);
    const supersession = [...receipts].reverse().find((receipt) =>
      receipt.action === "source-superseded"
      && receipt.request.sourceIdentity === currentSourceIdentity
      && receipt.payload.kind === "source-supersession");
    if (supersession?.payload.kind !== "source-supersession") return current;
    const alternateSourceIdentity = supersession.payload.alternateSourceIdentity;
    current = candidates.find((candidate) =>
      candidate.sourceIdentity === alternateSourceIdentity) ?? null;
  }
  return current;
}

function terminalProof(history: readonly ReviewReceipt[]): SourceSupersessionProof | null {
  const terminal = [...history].reverse().find((receipt) => receipt.action === "terminal-failure");
  if (terminal?.reason?.startsWith("pre-effect-rejection:") === true) {
    return { kind: "pre-effect-rejection", receipt: terminal };
  }
  if (
    terminal?.payload.kind === "terminal-evidence"
    && terminal.payload.terminalAt !== null
    && terminal.evidenceUrlOrId !== null
  ) return { kind: "terminal-failure", receipt: terminal };
  const repair = [...history].reverse().find((receipt) => receipt.action === "abandoned");
  return repair === undefined ? null : { kind: "explicit-repair", receipt: repair };
}

function planAlternate(input: {
  current: ReviewRequest;
  alternate: ReviewRequest | null;
  proof: SourceSupersessionProof;
  receipts: readonly ReviewReceipt[];
  ledgerVersion: number;
  now: Date;
}): ProviderFallbackResolution {
  if (input.alternate === null) return { kind: "blocked", reason: "no-qualified-alternate", request: input.current };
  const plan = planSourceSupersession({
    priorRequest: input.current,
    alternateSourceIdentity: input.alternate.sourceIdentity,
    actorIdentity: input.current.actorIdentity,
    proof: input.proof,
    receipts: input.receipts,
    expectedLedgerVersion: input.ledgerVersion,
    supersededAt: input.now,
    reason: `fallback from ${input.current.sourceIdentity} to ${input.alternate.sourceIdentity}`,
  });
  return plan.ok
    ? { kind: "append-supersession", receipt: plan.receipt }
    : { kind: "blocked", reason: plan.error, request: input.current };
}

/** Select one source, or emit the sole durable transition required before its alternate can be selected. */
export function resolveProviderFallback(input: {
  orderedCandidates: readonly ReviewRequest[];
  capacities: readonly SourceCapacity[];
  receipts: readonly ReviewReceipt[];
  ledgerVersion: number;
  now: Date;
}): ProviderFallbackResolution {
  const current = existingSelection(input.orderedCandidates, input.receipts);
  if (current === null) return { kind: "blocked", reason: "no-qualified-source" };
  const alternate = nextCandidate(current, input.orderedCandidates);
  const history = sourceReceiptHistory(current, input.receipts)
    .filter((receipt) => receipt.action !== "source-superseded");
  const capacity = input.capacities.find((candidate) => candidate.sourceIdentity === current.sourceIdentity);
  if (capacity === undefined) return { kind: "blocked", reason: "capacity-missing", request: current };

  if (history.length === 0) {
    if (capacity.status !== "exhausted") return { kind: "selected", request: current };
    return planAlternate({
      current,
      alternate,
      proof: { kind: "capacity-exhausted", capacity },
      receipts: input.receipts,
      ledgerVersion: input.ledgerVersion,
      now: input.now,
    });
  }

  const proof = terminalProof(history);
  if (proof === null) return { kind: "blocked", reason: "prior-effect-not-terminal", request: current };
  return planAlternate({
    current,
    alternate,
    proof,
    receipts: input.receipts,
    ledgerVersion: input.ledgerVersion,
    now: input.now,
  });
}
