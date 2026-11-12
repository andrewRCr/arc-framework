/** Recoverable full-protection ordinary-Errand leave composition. */

import {
  projectLocusIdentity,
  serializeTransientIdentityRecord,
  type TransientIdentityRecord,
} from "./identity-record.js";
import type { IdentityTransactionOutcome } from "./identity-transaction.js";
import type { OrdinaryErrandRecord, OrdinaryErrandTransition } from "./identity-transitions.js";
import type { ErrandErrorCode, ErrandRefusalReason } from "./result-common.js";
import {
  createTerminalOperationOutcome,
  type TerminalOperationOutcome,
} from "./terminal-result.js";

type LeaveTransition = Extract<OrdinaryErrandTransition, { kind: "pause" | "await-merge" }>;

export type LeaveAuthorization =
  | { kind: "authorized"; transition: LeaveTransition }
  | { kind: "refused"; reason: ErrandRefusalReason; message: string }
  | { kind: "error"; code: ErrandErrorCode; message: string };

export type LeaveCleanupResult =
  | {
      kind: "applied" | "idempotent";
      parentCheckoutPath: string | null;
    }
  | { kind: "refused"; reason: ErrandRefusalReason; message: string }
  | { kind: "error"; code: ErrandErrorCode; message: string };

export interface LeaveOrdinaryErrandDependencies {
  readIdentity(): Promise<IdentityTransactionOutcome<TransientIdentityRecord | null>>;
  authorize(record: OrdinaryErrandRecord): Promise<LeaveAuthorization>;
  persist(transition: LeaveTransition): Promise<IdentityTransactionOutcome<OrdinaryErrandRecord | null>>;
  cleanup(record: OrdinaryErrandRecord): Promise<LeaveCleanupResult>;
}
export interface LeaveOrdinaryErrandOptions {
  slug: string;
  state: "paused" | "awaiting-merge";
  protection: "full" | "partial";
  updatedAt: string;
  dependencies: LeaveOrdinaryErrandDependencies;
}

/** Persist an exact ordinary-Errand tail, then close only its exact local occupancy. */
export async function leaveOrdinaryErrand(
  options: LeaveOrdinaryErrandOptions,
): Promise<TerminalOperationOutcome> {
  if (options.protection !== "full") {
    return leaveRefusal("full-protection-required", "Errand leave requires full branch protection.");
  }
  const slug = options.slug.trim();
  if (slug === "") return leaveRefusal("identity-conflict", "Errand slug must be non-empty.");

  let basis: IdentityTransactionOutcome<TransientIdentityRecord | null>;
  try {
    basis = await options.dependencies.readIdentity();
  } catch (error) {
    return leaveError("locus.errand-leave.basis", errorMessage(error));
  }
  if (basis.kind === "error") return leaveError(`locus.errand-leave.${basis.stage}`, basis.message);
  if (basis.kind === "refused") return leaveRefusal("identity-conflict", basis.reason);
  if (basis.value === null || !isOrdinaryErrand(basis.value) || basis.value.slug !== slug) {
    return leaveRefusal("identity-conflict", `Identity '${slug}' is not a current ordinary Errand.`);
  }

  let identityOutcome: "applied" | "idempotent" = "idempotent";
  let target = existingTail(basis.value, options.state);
  if (target === null) {
    if (basis.value.state !== "open") {
      return leaveRefusal("identity-conflict", `Errand '${slug}' cannot leave from state '${basis.value.state}'.`);
    }
    let authorization: LeaveAuthorization;
    try {
      authorization = await options.dependencies.authorize(basis.value);
    } catch (error) {
      return leaveError("locus.errand-leave.preservation", errorMessage(error));
    }
    if (authorization.kind === "refused") return leaveRefusal(authorization.reason, authorization.message);
    if (authorization.kind === "error") return leaveError(authorization.code, authorization.message);
    if (authorization.transition.kind !== transitionKind(options.state)
      || serializeTransientIdentityRecord(authorization.transition.previous)
        !== serializeTransientIdentityRecord(basis.value)) {
      return leaveRefusal("identity-conflict", "Leave authorization does not match the exact identity generation.");
    }
    let persisted: IdentityTransactionOutcome<OrdinaryErrandRecord | null>;
    try {
      persisted = await options.dependencies.persist(authorization.transition);
    } catch (error) {
      return leaveError("locus.errand-leave.identity", errorMessage(error));
    }
    if (persisted.kind === "error") return leaveError(`locus.errand-leave.${persisted.stage}`, persisted.message);
    if (persisted.kind === "refused") return leaveRefusal("identity-conflict", persisted.reason);
    if (persisted.value === null) return leaveError("locus.errand-leave.identity", "Identity transition returned no record");
    target = persisted.value;
    identityOutcome = persisted.kind;
  }

  let cleanup: LeaveCleanupResult;
  try {
    cleanup = await options.dependencies.cleanup(target);
  } catch (error) {
    return leaveError("locus.errand-leave.cleanup", errorMessage(error));
  }
  if (cleanup.kind === "refused") return leaveRefusal(cleanup.reason, cleanup.message);
  if (cleanup.kind === "error") return leaveError(cleanup.code, cleanup.message);
  const outcome = identityOutcome === "applied" || cleanup.kind === "applied" ? "applied" : "idempotent";
  return createTerminalOperationOutcome({
    outcome,
    operation: "errand-leave",
    identity: projectLocusIdentity(target),
    nextOffer: null,
    recommendedPromptText: cleanup.parentCheckoutPath === null
      ? `Left Errand '${slug}' ${options.state}; no parent session was restored.`
      : `Left Errand '${slug}' ${options.state}; restored session home '${cleanup.parentCheckoutPath}'.`,
  });
}

function existingTail(
  record: OrdinaryErrandRecord,
  state: LeaveOrdinaryErrandOptions["state"],
): OrdinaryErrandRecord | null {
  return record.state === state ? record : null;
}

function transitionKind(state: LeaveOrdinaryErrandOptions["state"]): LeaveTransition["kind"] {
  return state === "paused" ? "pause" : "await-merge";
}

function isOrdinaryErrand(record: TransientIdentityRecord): record is OrdinaryErrandRecord {
  return record.kind === "errand" && record.purpose === "errand";
}

function leaveRefusal(reason: ErrandRefusalReason, message: string): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome: "refused",
    operation: "errand-leave",
    reason,
    recommendedPromptText: message,
  });
}

function leaveError(code: ErrandErrorCode, message: string): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome: "error",
    operation: "errand-leave",
    error: { code, message: message || "Errand leave failed" },
    recommendedPromptText: "Inspect the preserved identity tail and local marker evidence before retrying.",
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
