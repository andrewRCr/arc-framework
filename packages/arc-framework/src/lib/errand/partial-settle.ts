/** Exact completion and abandonment composition for identity-free partial Errands. */

import { createLocusMutationResult } from "../locus/mutation.js";
import type {
  LocusMutationResultV1,
  LocusRefusalReason,
  LocusRowV1,
  LocusStateV1,
} from "../locus/schema/index.js";
import type { LockedLocusGenerationAcquisition } from "./locked-generation.js";

type NextOffer = Extract<
  LocusMutationResultV1,
  { outcome: "applied" | "idempotent" }
>["nextOffer"];

export type PartialErrandInboxSettlement =
  | { kind: "applied" | "idempotent"; nextOffer: NextOffer }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

export type PartialErrandBasePin =
  | { kind: "pinned"; head: string }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };


/** The exact generation the composition selected, carried into the lock rather than re-derived. */
export interface PartialErrandTarget {
  readonly checkoutPath: string;
  readonly recordId: string;
  readonly leaseId: string;
}

export interface SettlePartialErrandDependencies {
  readState(): Promise<LocusStateV1>;
  pinBaseHead(): Promise<PartialErrandBasePin>;
  /** Null when the checkout sits clean on the configured base at the pinned head; else the reason. */
  verifyBase(checkoutPath: string, expectedHead: string): Promise<string | null>;
  acquireLock(target: PartialErrandTarget): Promise<LockedLocusGenerationAcquisition>;
  settleInbox(binding: {
    readonly originEntry: string | null;
    readonly parentCheckoutPath: string | null;
  }): Promise<PartialErrandInboxSettlement>;
}

export interface SettlePartialErrandOptions {
  readonly slug: string;
  readonly action: "close" | "abandon";
  readonly dependencies: SettlePartialErrandDependencies;
}

/** Prove one direct-base result, settle its capture binding, and pop the exact live role. */
export async function settlePartialErrand(
  options: SettlePartialErrandOptions,
): Promise<LocusMutationResultV1> {
  const operation = options.action === "close" ? "errand-close" : "errand-abandon";
  let state: LocusStateV1;
  try {
    state = await options.dependencies.readState();
  } catch (error) {
    return failure(operation, "state", error);
  }
  const selected = exactPartialErrandRow(state, options.slug);
  if (selected.kind === "duplicate") {
    return refusal(operation, "duplicate-locus", `Partial Errand '${options.slug}' has ambiguous occupancy.`);
  }
  if (selected.row === null) {
    return success(options, "idempotent", null, null, null, `Partial Errand '${options.slug}' is already settled.`);
  }
  const row = selected.row;
  if (row.primary !== true || row.checkoutPath === null || row.recordId === null || row.lease?.leaseId === undefined) {
    return refusal(operation, "record-malformed", "Partial Errand occupancy is incomplete or not primary-owned.");
  }
  const role = row.role;
  if (role === null) return refusal(operation, "record-malformed", "Partial Errand role is absent.");
  const target: PartialErrandTarget = {
    checkoutPath: row.checkoutPath,
    recordId: row.recordId,
    leaseId: row.lease.leaseId,
  };

  let pinned: PartialErrandBasePin;
  try {
    pinned = await options.dependencies.pinBaseHead();
  } catch (error) {
    return failure(operation, "base-ref", error);
  }
  if (pinned.kind !== "pinned") {
    return refusal(
      operation,
      "preservation-unproven",
      pinned.kind === "refused" ? pinned.reason : pinned.message,
    );
  }
  const ready = await options.dependencies.verifyBase(target.checkoutPath, pinned.head);
  if (ready !== null) return refusal(operation, "preservation-unproven", ready);

  const acquired = await options.dependencies.acquireLock(target);
  if (acquired.kind !== "acquired") {
    return refusal(
      operation,
      acquired.reason === "live" ? "lease-live" : "lease-unknown",
      "Partial Errand session locus lock is unavailable.",
    );
  }
  try {
    const revalidated = await options.dependencies.verifyBase(target.checkoutPath, pinned.head);
    if (revalidated !== null) return refusal(operation, "preservation-unproven", revalidated);

    // Ownership is proven under the lock before the capture is touched: the roster read above
    // establishes only that some lease exists, and the capture lives outside the record, so a
    // later generation refusal could not undo a settlement performed on another session's behalf.
    const owned = await acquired.generation.validate();
    if (owned.kind === "refused") {
      return refusal(operation, owned.reason, `Partial Errand '${options.slug}' is not this session's generation.`);
    }
    if (owned.kind === "absent") {
      return success(options, "idempotent", null, null, null, `Partial Errand '${options.slug}' is already settled.`);
    }

    let inbox: PartialErrandInboxSettlement;
    try {
      inbox = await options.dependencies.settleInbox({
        originEntry: role.originEntry,
        parentCheckoutPath: role.parentCheckoutPath,
      });
    } catch (error) {
      return failure(operation, "inbox", error);
    }
    if (inbox.kind === "refused") return refusal(operation, "identity-conflict", inbox.reason);
    if (inbox.kind === "error") return failure(operation, "inbox", inbox.message);

    const popped = await acquired.generation.pop();
    if (popped.outcome === "refused" || popped.outcome === "error") return popped;
    return success(
      options,
      popped.outcome === "applied" || inbox.kind === "applied" ? "applied" : "idempotent",
      row,
      restoredParent(state, row),
      inbox.nextOffer,
      options.action === "close"
        ? `Completed partial Errand '${options.slug}' on the configured base.`
        : `Abandoned partial Errand '${options.slug}' and retained its capture.`,
    );
  } finally {
    await acquired.release();
  }
}

function exactPartialErrandRow(
  state: LocusStateV1,
  slug: string,
): { kind: "ready"; row: LocusRowV1 | null } | { kind: "duplicate" } {
  const rows = state.roster.rows.filter((row) => row.role?.subject.kind === "partial-errand"
    && row.role.subject.key === slug && row.role.subject.claimId === null);
  if (rows.length > 1) return { kind: "duplicate" };
  return { kind: "ready", row: rows[0] ?? null };
}

function restoredParent(
  state: LocusStateV1,
  row: LocusRowV1,
): { recordId: string; checkoutPath: string } | null {
  const parentPath = row.role?.parentCheckoutPath;
  if (parentPath === null || parentPath === undefined) return null;
  const parent = state.roster.rows.find((candidate) => candidate.checkoutPath === parentPath
    && candidate.role?.kind === "work-unit" && candidate.recordId !== null);
  return parent?.recordId !== null && parent?.recordId !== undefined && parent.checkoutPath !== null
    ? { recordId: parent.recordId, checkoutPath: parent.checkoutPath }
    : null;
}

function success(
  options: SettlePartialErrandOptions,
  outcome: "applied" | "idempotent",
  row: LocusRowV1 | null,
  parent: { recordId: string; checkoutPath: string } | null,
  nextOffer: NextOffer,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome,
    operation: options.action === "close" ? "errand-close" : "errand-abandon",
    allocation: null,
    recordId: row?.recordId ?? null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: parent?.checkoutPath ?? null,
    identity: null,
    originEntry: row?.role?.originEntry ?? null,
    restoredParent: parent,
    nextOffer,
    recommendedPromptText: text,
  });
}

function refusal(
  operation: "errand-close" | "errand-abandon",
  reason: LocusRefusalReason,
  text: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(
  operation: "errand-close" | "errand-abandon",
  suffix: string,
  error: unknown,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation,
    error: {
      code: `locus.${operation}.${suffix}`,
      message: error instanceof Error ? error.message : String(error),
    },
    recommendedPromptText: "Inspect the retained partial Errand role and exact base evidence before retrying.",
  });
}
