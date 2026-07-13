/** Validation and duplicate reduction for receipt-ledger envelopes. */

import type { ReceiptEnvelope, ReviewReceipt } from "./execution.js";
import { computeRequestKey, receiptIdentityValid } from "./request-key.js";

/** Inputs from paginated storage plus its stable anchor. */
export interface ReceiptLedgerInput {
  envelopes: ReceiptEnvelope[];
  anchorVersion: number;
  anchorCount: number;
}

/** Validated ledger or fail-closed diagnostics. */
export interface ReceiptLedgerResult {
  valid: boolean;
  ledgerVersion: number;
  receipts: ReviewReceipt[];
  errors: string[];
}

/** Validate hashes, linear versions, edits, duplicates, and anchor parity. */
export function validateReceiptLedger(input: ReceiptLedgerInput): ReceiptLedgerResult {
  const errors: string[] = [];
  const byVersion = new Map<number, ReceiptEnvelope>();
  const idempotencyVersions = new Map<string, number>();
  for (const envelope of input.envelopes) {
    if (envelope.recordedAt !== envelope.lastModifiedAt) errors.push(`edited-record:${envelope.durableRecordId}`);
    if (!receiptIdentityValid(envelope.receipt)) errors.push(`invalid-receipt-hash:${envelope.durableRecordId}`);
    const prior = byVersion.get(envelope.ledgerVersion);
    if (prior === undefined) {
      byVersion.set(envelope.ledgerVersion, envelope);
    } else if (
      prior.receipt.receiptHash !== envelope.receipt.receiptHash
      || prior.receipt.idempotencyKey !== envelope.receipt.idempotencyKey
    ) {
      errors.push(`divergent-ledger-version:${envelope.ledgerVersion}`);
    }
    const priorIdempotencyVersion = idempotencyVersions.get(envelope.receipt.idempotencyKey);
    if (priorIdempotencyVersion === undefined) {
      idempotencyVersions.set(envelope.receipt.idempotencyKey, envelope.ledgerVersion);
    } else if (priorIdempotencyVersion !== envelope.ledgerVersion) {
      errors.push(`replayed-idempotency-key:${envelope.receipt.idempotencyKey}`);
    }
  }

  const ordered = [...byVersion.values()].sort((left, right) => left.ledgerVersion - right.ledgerVersion);
  for (let index = 0; index < ordered.length; index += 1) {
    const expectedVersion = index + 1;
    const envelope = ordered[index];
    if (envelope?.ledgerVersion !== expectedVersion) errors.push(`missing-ledger-version:${expectedVersion}`);
    if (envelope?.receipt.previousLedgerVersion !== expectedVersion - 1) {
      errors.push(`forked-predecessor:${envelope?.ledgerVersion ?? expectedVersion}`);
    }
  }
  validateReceiptSemantics(ordered, errors);
  if (input.anchorVersion !== ordered.length) errors.push("anchor-version-mismatch");
  if (input.anchorCount !== ordered.length) errors.push("anchor-count-mismatch");
  return {
    valid: errors.length === 0,
    ledgerVersion: ordered.length,
    receipts: ordered.map((envelope) => envelope.receipt),
    errors,
  };
}

function validateReceiptSemantics(ordered: ReceiptEnvelope[], errors: string[]): void {
  const reserved = new Set<string>();
  const acknowledged = new Set<string>();
  const terminalFailures = new Map<string, ReviewReceipt>();
  const abandoned = new Set<string>();
  const sourceSupersessions = new Set<string>();
  const knownFindings = new Set<string>();
  const terminalFindings = new Map<string, string[]>();
  const repairAuthorizations = new Map<string, ReviewReceipt>();
  const consumedAuthorizations = new Set<string>();
  const dispositions = new Map<string, ReviewReceipt>();
  for (const envelope of ordered) {
    const receipt = envelope.receipt;
    const requestKey = computeRequestKey(receipt.request);
    switch (receipt.action) {
      case "reserved":
        if (receipt.result !== null || receipt.findingIds.length > 0) {
          errors.push(`contradictory-reservation:${envelope.ledgerVersion}`);
        }
        reserved.add(requestKey);
        break;
      case "acknowledged":
        if (!reserved.has(requestKey)) errors.push(`acknowledgement-without-reservation:${envelope.ledgerVersion}`);
        if (receipt.result !== null || receipt.findingIds.length > 0) {
          errors.push(`contradictory-acknowledgement:${envelope.ledgerVersion}`);
        }
        acknowledged.add(requestKey);
        break;
      case "terminal-failure":
        if (!reserved.has(requestKey)) errors.push(`failure-without-reservation:${envelope.ledgerVersion}`);
        if (
          (receipt.result !== "failed" && receipt.result !== "unavailable")
          || receipt.findingIds.length > 0
        ) {
          errors.push(`contradictory-terminal-failure:${envelope.ledgerVersion}`);
        }
        terminalFailures.set(requestKey, receipt);
        break;
      case "attested":
      case "unadmitted":
        if (receipt.result === null) errors.push(`missing-result:${envelope.ledgerVersion}`);
        validateResultFindings(receipt, envelope.ledgerVersion, errors);
        for (const findingId of receipt.findingIds) {
          knownFindings.add(findingKey(receipt.request.sourceIdentity, findingId));
        }
        if (receipt.result === "findings") terminalFindings.set(requestKey, receipt.findingIds);
        break;
      case "running":
      case "abandoned":
        if (
          !reserved.has(requestKey)
          || receipt.result !== null
          || receipt.findingIds.length > 0
          || receipt.evidenceUrlOrId === null
          || receipt.payload.kind !== "flight-state"
          || receipt.payload.state !== receipt.action
        ) errors.push(`contradictory-${receipt.action}:${envelope.ledgerVersion}`);
        if (receipt.action === "abandoned") abandoned.add(requestKey);
        break;
      case "source-superseded": {
        const payload = receipt.payload;
        const identity = payload.kind === "source-supersession"
          ? `${requestKey}:${payload.alternateSourceIdentity}`
          : "invalid";
        const terminal = terminalFailures.get(requestKey);
        const proofValid = payload.kind === "source-supersession" && (
          (payload.proofKind === "capacity-exhausted" && !reserved.has(requestKey) && !acknowledged.has(requestKey))
          || (payload.proofKind === "pre-effect-rejection"
            && terminal?.reason?.startsWith("pre-effect-rejection:") === true
            && terminal.payload.kind === "terminal-evidence"
            && terminal.payload.terminalAt === null
            && !acknowledged.has(requestKey))
          || (payload.proofKind === "terminal-failure"
            && terminal?.payload.kind === "terminal-evidence"
            && terminal.payload.terminalAt !== null
            && terminal.evidenceUrlOrId !== null)
          || (payload.proofKind === "explicit-repair" && abandoned.has(requestKey))
        );
        if (
          payload.kind !== "source-supersession"
          || payload.priorRequestKey !== requestKey
          || receipt.result !== null
          || receipt.findingIds.length > 0
          || receipt.evidenceUrlOrId !== payload.proofRef
          || sourceSupersessions.has(identity)
          || !proofValid
        ) errors.push(`contradictory-source-supersession:${envelope.ledgerVersion}`);
        sourceSupersessions.add(identity);
        break;
      }
      case "begin-fix": {
        const terminal = terminalFindings.get(requestKey);
        const payload = receipt.payload;
        if (
          payload.kind !== "head-update-authorization"
          || terminal === undefined
          || !sameStrings(terminal, receipt.findingIds)
          || payload.terminalRequestKey !== requestKey
          || repairAuthorizations.has(requestKey)
        ) {
          errors.push(`contradictory-begin-fix:${envelope.ledgerVersion}`);
        } else {
          repairAuthorizations.set(requestKey, receipt);
        }
        break;
      }
      case "head-update-consumed": {
        const payload = receipt.payload;
        const authorization = payload.kind === "head-update-consumption"
          ? [...repairAuthorizations.values()].find((candidate) => candidate.receiptHash === payload.authorizationReceiptHash)
          : undefined;
        if (
          payload.kind !== "head-update-consumption"
          || authorization === undefined
          || consumedAuthorizations.has(payload.authorizationReceiptHash)
          || !sameStrings(authorization.findingIds, receipt.findingIds)
        ) {
          errors.push(`contradictory-head-update-consumption:${envelope.ledgerVersion}`);
        } else {
          consumedAuthorizations.add(payload.authorizationReceiptHash);
        }
        break;
      }
      case "trigger-deleted":
        if (
          !reserved.has(requestKey)
          || receipt.result !== null
          || receipt.findingIds.length > 0
          || receipt.payload.kind !== "trigger-deleted"
          || receipt.evidenceUrlOrId !== receipt.payload.authenticatedEventRef
        ) errors.push(`contradictory-trigger-deletion:${envelope.ledgerVersion}`);
        break;
      case "fixed":
      case "deferred":
      case "rejected":
      case "provider-closed": {
        const payload = receipt.payload;
        if (
          payload.kind !== "finding-disposition"
          || payload.disposition !== receipt.action
          || !knownFindings.has(findingKey(payload.sourceIdentity, payload.findingId))
          || dispositions.has(receipt.receiptHash)
        ) errors.push(`contradictory-${receipt.action}:${envelope.ledgerVersion}`);
        dispositions.set(receipt.receiptHash, receipt);
        break;
      }
      case "conversation-resolved": {
        const payload = receipt.payload;
        const prior = payload.kind === "conversation-resolved"
          ? dispositions.get(payload.dispositionReceiptHash)
          : undefined;
        if (
          payload.kind !== "conversation-resolved"
          || prior === undefined
          || prior.request.sourceIdentity !== payload.sourceIdentity
          || prior.findingIds[0] !== payload.findingId
        ) errors.push(`contradictory-conversation-resolution:${envelope.ledgerVersion}`);
        break;
      }
      case "required":
      case "waived":
        if (receipt.result !== null || receipt.findingIds.length > 0 || !hasCommandProvenance(receipt)) {
          errors.push(`contradictory-${receipt.action}:${envelope.ledgerVersion}`);
        }
        break;
    }
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function findingKey(sourceIdentity: string, findingId: string): string {
  return `${sourceIdentity}\0${findingId}`;
}

function hasCommandProvenance(receipt: ReviewReceipt): boolean {
  return receipt.reason !== null
    && receipt.reason.trim().length > 0
    && Buffer.byteLength(receipt.reason, "utf8") <= 1024
    && receipt.evidenceUrlOrId !== null;
}

function validateResultFindings(receipt: ReviewReceipt, version: number, errors: string[]): void {
  if (receipt.result === "findings" && receipt.findingIds.length === 0) {
    errors.push(`findings-result-without-findings:${version}`);
  }
  if (receipt.result !== "findings" && receipt.findingIds.length > 0) {
    errors.push(`non-findings-result-with-findings:${version}`);
  }
}
