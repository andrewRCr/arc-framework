/** Marker-origin settlement for identity-free partial Errands. */

import type { GitExec } from "../git/exec.js";
import { pinRemoteBaseHead } from "./identity-claims.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import { errandErrorCode, type ErrandRefusalReason } from "./result-common.js";
import {
  authorizeErrandTerminal,
  type ErrandTerminalAuthority,
  type ErrandTerminalSubject,
} from "./terminal-authority.js";
import {
  createTerminalOccupancyIO,
  settleTerminalOccupancy,
} from "./terminal-occupancy.js";
import {
  createTerminalOperationOutcome,
  type TerminalOperationOutcome,
} from "./terminal-result.js";

export type PartialErrandInboxSettlement =
  | {
      readonly kind: "applied" | "idempotent";
      readonly nextOffer: {
        readonly kind: "errand";
        readonly key: string;
        readonly parentCheckoutPath: string | null;
      } | null;
    }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "error"; readonly message: string };

export interface SettlePartialErrandRuntimeOptions {
  readonly slug: string;
  readonly action: "close" | "abandon";
  readonly base: string;
  readonly exec: GitExec;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
  readonly onAuthority?: (authority: ErrandTerminalAuthority) => void;
  readonly settleInbox: (binding: {
    readonly originEntry: string | null;
    readonly parentCheckoutPath: string | null;
  }) => Promise<PartialErrandInboxSettlement>;
}

/** Settle one exact partial-Errand marker generation and its capture binding. */
export async function settlePartialErrandAtRuntime(
  options: SettlePartialErrandRuntimeOptions,
): Promise<TerminalOperationOutcome> {
  const operation = options.action === "close" ? "errand-close" : "errand-abandon";
  const frame = await options.readFrame();
  const subject: ErrandTerminalSubject = { kind: "partial-errand", slug: options.slug, claimId: null };
  const matches = frame.roster.filter((row) => row.subject?.kind === subject.kind
    && row.subject.key === subject.slug);
  if (matches.length > 1) {
    return refusal(operation, "authority-unresolved", "Multiple checkouts claim the partial Errand subject.");
  }
  if (matches.length === 0) {
    return currentPrimaryProvesAbsence(frame)
      ? success(options, "idempotent", null)
      : refusal(
          operation,
          "authority-unresolved",
          "The current primary checkout cannot prove that partial Errand occupancy is absent.",
        );
  }
  const authority = authorizeErrandTerminal({
    frame,
    operation: options.action,
    subject,
    confirmForeignGeneration: options.confirmForeignGeneration,
  });
  options.onAuthority?.(authority);
  if (authority.kind === "confirmation-required") {
    return refusal(operation, "role-conflict", authority.recommendedPromptText);
  }
  if (authority.kind === "refused") return refusal(operation, "role-conflict", authority.message);
  if (authority.row === null || authority.checkoutPath === null || !authority.row.checkout.primary) {
    return refusal(operation, "authority-unresolved", "Partial Errand occupancy is incomplete or not primary-owned.");
  }
  const pinned = await pinRemoteBaseHead(options.exec, { remote: "origin", baseRef: options.base });
  if (pinned.kind !== "pinned") {
    return refusal(
      operation,
      "preservation-unproven",
      pinned.kind === "refused" ? pinned.reason : pinned.message,
    );
  }
  if (authority.row.checkout.branch !== options.base || authority.row.checkout.head !== pinned.head) {
    return refusal(
      operation,
      "preservation-unproven",
      "Partial Errand checkout is off the configured base or not at its freshly pushed head.",
    );
  }
  const inbox = await options.settleInbox({
    originEntry: authority.row.origin?.entry ?? null,
    parentCheckoutPath: authority.parentCheckoutPath,
  });
  if (inbox.kind === "refused") return refusal(operation, "identity-conflict", inbox.reason);
  if (inbox.kind === "error") return failure(operation, "inbox", inbox.message);
  const primaryCheckoutPath = primaryPath(frame);
  if (primaryCheckoutPath === null) return refusal(operation, "checkout-missing", "Primary checkout is unavailable.");
  const settled = await settleTerminalOccupancy({
    authority,
    primaryCheckoutPath,
    io: createTerminalOccupancyIO(options.exec),
  });
  if (settled.kind === "refused") return refusal(operation, "preservation-unproven", settled.message);
  if (settled.kind === "error") return failure(operation, "cleanup", settled.message);
  return success(
    options,
    settled.kind === "applied" || inbox.kind === "applied" ? "applied" : "idempotent",
    inbox.nextOffer,
  );
}

function success(
  options: SettlePartialErrandRuntimeOptions,
  outcome: "applied" | "idempotent",
  nextOffer: Extract<TerminalOperationOutcome, { outcome: "applied" | "idempotent" }>["nextOffer"],
): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome,
    operation: options.action === "close" ? "errand-close" : "errand-abandon",
    identity: null,
    nextOffer,
    recommendedPromptText: options.action === "close"
      ? `Completed partial Errand '${options.slug}' on the configured base.`
      : `Abandoned partial Errand '${options.slug}' and retained its capture.`,
  });
}

function refusal(
  operation: "errand-close" | "errand-abandon",
  reason: ErrandRefusalReason,
  text: string,
): TerminalOperationOutcome {
  return createTerminalOperationOutcome({ outcome: "refused", operation, reason, recommendedPromptText: text });
}

function failure(
  operation: "errand-close" | "errand-abandon",
  suffix: "inbox" | "cleanup",
  message: string,
): TerminalOperationOutcome {
  return createTerminalOperationOutcome({
    outcome: "error",
    operation,
    error: { code: errandErrorCode(operation, suffix), message },
    recommendedPromptText: "Inspect the retained partial Errand marker and exact base evidence before retrying.",
  });
}

function primaryPath(frame: DerivedLocusFrame): string | null {
  return frame.roster.find((row) => row.checkout.primary)?.checkout.path ?? null;
}

function currentPrimaryProvesAbsence(frame: DerivedLocusFrame): boolean {
  if (frame.entering.kind !== "selected") return false;
  const primaryRows = frame.roster.filter((row) => row.checkout.primary);
  const primary = primaryRows.length === 1 ? primaryRows[0] : undefined;
  return primary !== undefined
    && primary.kind === "free-primary"
    && primary.markerGeneration === null
    && frame.entering.row.checkout.path === primary.checkout.path;
}
