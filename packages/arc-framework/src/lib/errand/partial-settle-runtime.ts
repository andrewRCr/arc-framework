/** Marker-origin settlement for identity-free partial Errands. */

import type { GitExec } from "../git/exec.js";
import { pinGroomOpenedBaseHead } from "./identity-claims.js";
import { createLocusMutationResult } from "../locus/mutation.js";
import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import {
  locusErrorCode,
  type LocusMutationResultV1,
  type LocusRefusalReason,
} from "../locus/schema/index.js";
import {
  authorizeErrandTerminal,
  type ErrandTerminalSubject,
} from "./terminal-authority.js";
import {
  createTerminalOccupancyIO,
  settleTerminalOccupancy,
} from "./terminal-occupancy.js";
import type { PartialErrandInboxSettlement } from "./partial-settle.js";

export type { PartialErrandInboxSettlement } from "./partial-settle.js";

export interface SettlePartialErrandRuntimeOptions {
  readonly slug: string;
  readonly action: "close" | "abandon";
  readonly base: string;
  readonly exec: GitExec;
  readonly readFrame: () => Promise<DerivedLocusFrame>;
  readonly confirmForeignGeneration?: string;
  readonly settleInbox: (binding: {
    readonly originEntry: string | null;
    readonly parentCheckoutPath: string | null;
  }) => Promise<PartialErrandInboxSettlement>;
}

/** Settle one exact partial-Errand marker generation and its capture binding. */
export async function settlePartialErrandAtRuntime(
  options: SettlePartialErrandRuntimeOptions,
): Promise<LocusMutationResultV1> {
  const operation = options.action === "close" ? "errand-close" : "errand-abandon";
  const frame = await options.readFrame();
  const subject: ErrandTerminalSubject = { kind: "partial-errand", slug: options.slug, claimId: null };
  const matches = frame.roster.filter((row) => row.subject?.kind === subject.kind
    && row.subject.key === subject.slug);
  if (matches.length === 0) return success(options, "idempotent", null, null, null);
  const authority = authorizeErrandTerminal({
    frame,
    operation: options.action,
    subject,
    confirmForeignGeneration: options.confirmForeignGeneration,
  });
  if (authority.kind === "confirmation-required") {
    return refusal(operation, "role-conflict", authority.recommendedPromptText);
  }
  if (authority.kind === "refused") return refusal(operation, "role-conflict", authority.message);
  if (authority.row === null || authority.checkoutPath === null || !authority.row.checkout.primary) {
    return refusal(operation, "record-malformed", "Partial Errand occupancy is incomplete or not primary-owned.");
  }
  const pinned = await pinGroomOpenedBaseHead(options.exec, { remote: "origin", baseRef: options.base });
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
    authority.row.origin?.entry ?? null,
    settled.parentCheckoutPath,
    inbox.nextOffer,
  );
}

function success(
  options: SettlePartialErrandRuntimeOptions,
  outcome: "applied" | "idempotent",
  originEntry: string | null,
  parentCheckoutPath: string | null,
  nextOffer: Extract<LocusMutationResultV1, { outcome: "applied" | "idempotent" }>["nextOffer"],
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome,
    operation: options.action === "close" ? "errand-close" : "errand-abandon",
    allocation: null,
    recordId: null,
    leaseId: null,
    activeLocusPath: null,
    sessionHomePath: parentCheckoutPath,
    identity: null,
    originEntry,
    restoredParent: null,
    nextOffer,
    recommendedPromptText: options.action === "close"
      ? `Completed partial Errand '${options.slug}' on the configured base.`
      : `Abandoned partial Errand '${options.slug}' and retained its capture.`,
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
  suffix: "inbox" | "cleanup",
  message: string,
): LocusMutationResultV1 {
  return createLocusMutationResult({
    outcome: "error",
    operation,
    error: { code: locusErrorCode(operation, suffix), message },
    recommendedPromptText: "Inspect the retained partial Errand marker and exact base evidence before retrying.",
  });
}

function primaryPath(frame: DerivedLocusFrame): string | null {
  return frame.roster.find((row) => row.checkout.primary)?.checkout.path ?? null;
}
