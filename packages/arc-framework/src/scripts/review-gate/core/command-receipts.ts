/** Turn authorized human commands into current, durable receipt plans. */

import type { AuthorizedReviewCommandEvent } from "./command-ingestion.js";
import type { NormalizedChangeRequest, ReviewRequirement } from "./contracts.js";
import type { ReviewReceipt, ReviewRequest } from "./execution.js";
import { admitRefresh } from "./admission.js";
import { createReceipt } from "./request-key.js";

/** Synthetic source retained only for requirement-level command overrides. */
export const COMMAND_RECEIPT_SOURCE = "review-gate-command";

/** One direct command receipt or a stable replay/conflict result. */
export type DirectCommandReceiptResult =
  | { ok: true; receipt: ReviewReceipt; replay: boolean }
  | { ok: false; error: string };

/** Inputs for a command that persists without provider invocation. */
export interface DirectCommandReceiptInput {
  event: AuthorizedReviewCommandEvent;
  changeRequest: NormalizedChangeRequest;
  requirement: ReviewRequirement;
  expectedLedgerVersion: number;
  priorReceipts: ReviewReceipt[];
}

/** Inputs for an authorized refresh reservation plan. */
export interface CommandRefreshInput extends DirectCommandReceiptInput {
  qualifiedSourceIdentities: string[];
  reviewedChainHead: string | null;
}

/** Refresh reservation plan, exact replay, or a fail-closed admission result. */
export type CommandRefreshResult =
  | { ok: true; request: ReviewRequest; reservation: ReviewReceipt; replay: boolean }
  | { ok: false; error: string };

/** Apply only a current, scoped require receipt to an otherwise policy-derived requirement. */
export function applyRequiredOverride(
  requirement: ReviewRequirement,
  receipts: ReviewReceipt[],
): ReviewRequirement {
  const required = receipts.some((receipt) => receipt.action === "required"
    && receipt.request.sourceIdentity === COMMAND_RECEIPT_SOURCE
    && receipt.request.requirementId === requirement.id
    && receipt.request.changeSetId === requirement.changeSetId
    && receipt.request.policyVersion === requirement.policyVersion
    && receipt.request.rubricVersion === requirement.rubricVersion);
  return required ? { ...requirement, obligation: "required" } : requirement;
}

function currentRequirement(input: Pick<DirectCommandReceiptInput, "event" | "changeRequest" | "requirement">): string | null {
  if (input.event.command.requirementId !== input.requirement.id) return "requirement-mismatch";
  if (
    input.requirement.changeSetId !== input.changeRequest.changeSetId
    || input.requirement.headSha !== input.changeRequest.headSha
  ) return "stale-requirement";
  return null;
}

function commandRequest(
  input: DirectCommandReceiptInput,
  sourceIdentity: string,
): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: input.changeRequest.repositoryId,
    changeRequestId: input.changeRequest.changeRequestId,
    changeSetId: input.requirement.changeSetId,
    policyVersion: input.requirement.policyVersion,
    rubricVersion: input.requirement.rubricVersion,
    requirementId: input.requirement.id,
    sourceIdentity,
    coverage: "full",
    coverageFromSha: input.changeRequest.diffBaseSha,
    coverageThroughSha: input.changeRequest.headSha,
    generation: 0,
    actorIdentity: input.event.actorIdentity,
  };
}

/** Create or replay one authorized require, waive, or dismiss receipt. */
export function createDirectCommandReceipt(input: DirectCommandReceiptInput): DirectCommandReceiptResult {
  const requirementError = currentRequirement(input);
  if (requirementError !== null) return { ok: false, error: requirementError };
  if (input.event.command.kind === "refresh") return { ok: false, error: "refresh-requires-reservation" };

  const action = input.event.command.kind === "require"
    ? "required" as const
    : input.event.command.kind === "waive" ? "waived" as const : "dismissed" as const;
  const sourceIdentity = input.event.command.kind === "dismiss"
    ? input.event.command.sourceIdentity
    : COMMAND_RECEIPT_SOURCE;
  const prior = input.priorReceipts.find((receipt) => receipt.eventId === input.event.eventId);
  const receipt = createReceipt({
    eventId: input.event.eventId,
    previousLedgerVersion: prior?.previousLedgerVersion ?? input.expectedLedgerVersion,
    action,
    request: commandRequest(input, sourceIdentity),
    result: null,
    reason: input.event.command.reason,
    evidenceUrlOrId: input.event.durableRef,
    findingIds: input.event.command.kind === "dismiss" ? [input.event.command.findingId] : [],
  });
  if (prior === undefined) return { ok: true, receipt, replay: false };
  if (prior.receiptHash !== receipt.receiptHash) return { ok: false, error: "conflicting-command-replay" };
  return { ok: true, receipt: prior, replay: true };
}

function sourceForRefresh(
  event: AuthorizedReviewCommandEvent,
  qualifiedSourceIdentities: string[],
): string | null {
  if (event.command.kind !== "refresh") return null;
  if (event.command.sourceIdentity !== "auto") return qualifiedSourceIdentities.includes(event.command.sourceIdentity)
    ? event.command.sourceIdentity
    : null;
  return qualifiedSourceIdentities.length === 1 ? qualifiedSourceIdentities[0] ?? null : null;
}

function priorGenerations(input: CommandRefreshInput, sourceIdentity: string): number[] {
  return input.priorReceipts
    .filter((receipt) => receipt.request.requirementId === input.requirement.id
      && receipt.request.changeSetId === input.requirement.changeSetId
      && receipt.request.policyVersion === input.requirement.policyVersion
      && receipt.request.rubricVersion === input.requirement.rubricVersion
      && receipt.request.sourceIdentity === sourceIdentity
      && ["reserved", "acknowledged", "terminal-failure"].includes(receipt.action))
    .map((receipt) => receipt.request.generation);
}

function matchingRefreshReservation(input: CommandRefreshInput, receipt: ReviewReceipt): boolean {
  const command = input.event.command;
  if (command.kind !== "refresh") return false;
  if (
    receipt.action !== "reserved"
    || receipt.result !== null
    || receipt.findingIds.length !== 0
    || receipt.reason !== command.reason
    || receipt.evidenceUrlOrId !== input.event.durableRef
  ) return false;
  const request = receipt.request;
  if (
    request.repositoryId !== input.changeRequest.repositoryId
    || request.changeRequestId !== input.changeRequest.changeRequestId
    || request.changeSetId !== input.requirement.changeSetId
    || request.policyVersion !== input.requirement.policyVersion
    || request.rubricVersion !== input.requirement.rubricVersion
    || request.requirementId !== input.requirement.id
    || request.actorIdentity !== input.event.actorIdentity
    || request.coverage !== command.coverage
  ) return false;
  return command.sourceIdentity === "auto" || request.sourceIdentity === command.sourceIdentity;
}

/** Plan a current authorized refresh as its first durable reservation. */
export function planCommandRefresh(input: CommandRefreshInput): CommandRefreshResult {
  const requirementError = currentRequirement(input);
  if (requirementError !== null) return { ok: false, error: requirementError };
  if (input.event.command.kind !== "refresh") return { ok: false, error: "command-is-not-refresh" };

  const prior = input.priorReceipts.find((receipt) => receipt.eventId === input.event.eventId);
  if (prior !== undefined) {
    if (!matchingRefreshReservation(input, prior)) return { ok: false, error: "conflicting-command-replay" };
    return { ok: true, request: prior.request, reservation: prior, replay: true };
  }

  const sourceIdentity = sourceForRefresh(input.event, input.qualifiedSourceIdentities);
  if (sourceIdentity === null) return { ok: false, error: "unqualified-refresh-source" };
  const coverageFromSha = input.event.command.coverage === "full"
    ? input.changeRequest.diffBaseSha
    : input.reviewedChainHead;
  if (coverageFromSha === null) return { ok: false, error: "incremental-chain-head-missing" };
  const admission = admitRefresh({
    authorized: true,
    priorGenerations: priorGenerations(input, sourceIdentity),
    coverage: input.event.command.coverage,
    chainHeadSha: input.reviewedChainHead ?? "",
    coverageFromSha,
  });
  if (!admission.admit || admission.generation === null) return { ok: false, error: admission.reason };
  const request: ReviewRequest = {
    schemaVersion: 1,
    repositoryId: input.changeRequest.repositoryId,
    changeRequestId: input.changeRequest.changeRequestId,
    changeSetId: input.requirement.changeSetId,
    policyVersion: input.requirement.policyVersion,
    rubricVersion: input.requirement.rubricVersion,
    requirementId: input.requirement.id,
    sourceIdentity,
    coverage: input.event.command.coverage,
    coverageFromSha,
    coverageThroughSha: input.changeRequest.headSha,
    generation: admission.generation,
    actorIdentity: input.event.actorIdentity,
  };
  const reservation = createReceipt({
    eventId: input.event.eventId,
    previousLedgerVersion: input.expectedLedgerVersion,
    action: "reserved",
    request,
    result: null,
    reason: input.event.command.reason,
    evidenceUrlOrId: input.event.durableRef,
    findingIds: [],
  });
  return { ok: true, request, reservation, replay: false };
}
