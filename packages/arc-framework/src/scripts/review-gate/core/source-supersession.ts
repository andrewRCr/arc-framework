/** Durable provider-source supersession after proven effect terminality. */

import type { ReviewReceipt, ReviewRequest, SourceCapacity } from "./execution.js";
import { computeRequestKey, createReceipt } from "./request-key.js";

export type SourceSupersessionProof =
  | { kind: "capacity-exhausted"; capacity: SourceCapacity }
  | { kind: "pre-effect-rejection"; receipt: ReviewReceipt }
  | { kind: "terminal-failure"; receipt: ReviewReceipt }
  | { kind: "explicit-repair"; receipt: ReviewReceipt };

export type SourceSupersessionResult =
  | { ok: true; receipt: ReviewReceipt; replay: boolean }
  | { ok: false; error: string };

/** Author one explicit repair record for an effect whose terminality cannot be inferred. */
export function planExplicitFlightAbandonment(input: {
  request: ReviewRequest;
  actorIdentity: string;
  authorizedActorIdentities: readonly string[];
  evidenceRef: string;
  reason: string;
  expectedLedgerVersion: number;
  observedAt: Date;
}): { ok: true; receipt: ReviewReceipt } | { ok: false; error: string } {
  if (!input.authorizedActorIdentities.includes(input.actorIdentity)) return { ok: false, error: "unauthorized" };
  if (input.actorIdentity !== input.request.actorIdentity) return { ok: false, error: "actor-mismatch" };
  if (input.reason.trim().length === 0 || input.evidenceRef.trim().length === 0) {
    return { ok: false, error: "repair-evidence-required" };
  }
  return {
    ok: true,
    receipt: createReceipt({
      eventId: `request:${computeRequestKey(input.request)}:abandoned`,
      previousLedgerVersion: input.expectedLedgerVersion,
      action: "abandoned",
      request: input.request,
      result: null,
      reason: input.reason,
      evidenceUrlOrId: input.evidenceRef,
      findingIds: [],
      payload: {
        kind: "flight-state",
        state: "abandoned",
        observedAt: input.observedAt.toISOString(),
        evidenceRef: input.evidenceRef,
      },
    }),
  };
}

function receiptInHistory(receipt: ReviewReceipt, history: readonly ReviewReceipt[]): boolean {
  return history.some((candidate) => candidate.receiptHash === receipt.receiptHash);
}

function proofReference(proof: SourceSupersessionProof): string {
  return proof.kind === "capacity-exhausted" ? proof.capacity.provenance : proof.receipt.evidenceUrlOrId ?? proof.receipt.eventId;
}

function validateProof(
  proof: SourceSupersessionProof,
  priorRequest: ReviewRequest,
  receipts: readonly ReviewReceipt[],
): string | null {
  const priorKey = computeRequestKey(priorRequest);
  const priorReceipts = receipts.filter((receipt) => computeRequestKey(receipt.request) === priorKey);
  switch (proof.kind) {
    case "capacity-exhausted":
      if (
        proof.capacity.sourceIdentity !== priorRequest.sourceIdentity
        || proof.capacity.status !== "exhausted"
        || proof.capacity.reason !== "provider-reported"
      ) return "capacity-proof-invalid";
      if (priorReceipts.some((receipt) => ["reserved", "acknowledged", "running"].includes(receipt.action))) {
        return "capacity-proof-after-effect";
      }
      return null;
    case "pre-effect-rejection":
      if (!receiptInHistory(proof.receipt, receipts)) return "proof-not-canonical";
      if (
        computeRequestKey(proof.receipt.request) !== priorKey
        || proof.receipt.action !== "terminal-failure"
        || !proof.receipt.reason?.startsWith("pre-effect-rejection:")
        || proof.receipt.payload.kind !== "terminal-evidence"
        || proof.receipt.payload.terminalAt !== null
      ) return "pre-effect-proof-invalid";
      if (priorReceipts.some((receipt) => receipt.action === "acknowledged")) return "pre-effect-proof-after-acknowledgement";
      return null;
    case "terminal-failure":
      if (!receiptInHistory(proof.receipt, receipts)) return "proof-not-canonical";
      if (
        computeRequestKey(proof.receipt.request) !== priorKey
        || proof.receipt.action !== "terminal-failure"
        || proof.receipt.payload.kind !== "terminal-evidence"
        || proof.receipt.payload.terminalAt === null
        || proof.receipt.evidenceUrlOrId === null
      ) return "terminal-proof-missing";
      return null;
    case "explicit-repair":
      if (!receiptInHistory(proof.receipt, receipts)) return "proof-not-canonical";
      if (
        computeRequestKey(proof.receipt.request) !== priorKey
        || proof.receipt.action !== "abandoned"
        || proof.receipt.payload.kind !== "flight-state"
        || proof.receipt.payload.state !== "abandoned"
      ) return "repair-proof-invalid";
      return null;
  }
}

/** Plan one idempotent source handoff; caller must append and canonically re-read it before alternate admission. */
export function planSourceSupersession(input: {
  priorRequest: ReviewRequest;
  alternateSourceIdentity: string;
  actorIdentity: string;
  proof: SourceSupersessionProof;
  receipts: readonly ReviewReceipt[];
  expectedLedgerVersion: number;
  supersededAt: Date;
  reason: string;
}): SourceSupersessionResult {
  if (input.alternateSourceIdentity === input.priorRequest.sourceIdentity) {
    return { ok: false, error: "alternate-source-must-change" };
  }
  if (input.actorIdentity !== input.priorRequest.actorIdentity) return { ok: false, error: "actor-mismatch" };
  const priorRequestKey = computeRequestKey(input.priorRequest);
  const replay = input.receipts.find((receipt) => receipt.action === "source-superseded"
    && computeRequestKey(receipt.request) === priorRequestKey
    && receipt.payload.kind === "source-supersession"
    && receipt.payload.alternateSourceIdentity === input.alternateSourceIdentity);
  if (replay !== undefined) return { ok: true, receipt: replay, replay: true };
  const proofError = validateProof(input.proof, input.priorRequest, input.receipts);
  if (proofError !== null) return { ok: false, error: proofError };
  const proofRef = proofReference(input.proof);
  const receipt = createReceipt({
    eventId: `source-supersession:${priorRequestKey}:${input.alternateSourceIdentity}`,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: "source-superseded",
    request: input.priorRequest,
    result: null,
    reason: input.reason,
    evidenceUrlOrId: proofRef,
    findingIds: [],
    payload: {
      kind: "source-supersession",
      supersededAt: input.supersededAt.toISOString(),
      priorRequestKey,
      priorSourceIdentity: input.priorRequest.sourceIdentity,
      priorGeneration: input.priorRequest.generation,
      proofKind: input.proof.kind,
      proofRef,
      alternateSourceIdentity: input.alternateSourceIdentity,
      actorIdentity: input.actorIdentity,
      reason: input.reason,
    },
  });
  return { ok: true, receipt, replay: false };
}
