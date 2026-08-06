/** Subject-scoped authority for Errand terminal operations. */

import type { DerivedLocusFrame } from "../locus/derived-reader.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";

export type ErrandTerminalOperation = "close" | "abandon" | "leave" | "promote";

export type ErrandTerminalSubject =
  | { readonly kind: "errand"; readonly slug: string; readonly claimId: string }
  | { readonly kind: "partial-errand"; readonly slug: string; readonly claimId: null };

export type ErrandTerminalAuthority =
  | {
      readonly kind: "authorized";
      readonly authority: "current-checkout" | "confirmed-foreign";
      readonly subject: ErrandTerminalSubject;
      readonly checkoutPath: string;
      readonly parentCheckoutPath: string | null;
      readonly generation: string;
      readonly row: DerivedCheckoutRow;
    }
  | {
      readonly kind: "confirmation-required";
      readonly operation: ErrandTerminalOperation;
      readonly subject: ErrandTerminalSubject;
      readonly checkoutPath: string;
      readonly generation: string;
      readonly destructiveEffect: string;
      readonly recommendedPromptText: string;
    }
  | { readonly kind: "refused"; readonly reason: string; readonly message: string };

export interface AuthorizeErrandTerminalOptions {
  readonly frame: DerivedLocusFrame;
  readonly operation: ErrandTerminalOperation;
  readonly subject: ErrandTerminalSubject;
  readonly confirmForeignGeneration?: string;
  readonly retryArguments?: readonly string[];
}

/** Authorize one terminal act from the exact derived checkout subject. */
export function authorizeErrandTerminal(
  options: AuthorizeErrandTerminalOptions,
): ErrandTerminalAuthority {
  if (options.subject.kind === "errand"
    && (options.frame.identityDiscovery.kind !== "complete"
      || options.frame.identityDiscovery.diagnostics.length > 0)) {
    return {
      kind: "refused",
      reason: "identity-conflict",
      message: "The shared Errand identity basis is incomplete.",
    };
  }
  const matches = options.frame.roster.filter((row) => sameSubject(row, options.subject));
  const row = matches.length === 1 ? matches[0] : undefined;
  if (row === undefined || row.kind !== "transient") {
    return { kind: "refused", reason: "authority-unresolved", message: "Terminal authority is unavailable." };
  }
  const generation = terminalGeneration(row, options.subject);
  if (generation === null) {
    return { kind: "refused", reason: "authority-unresolved", message: "Terminal generation is unavailable." };
  }
  if (options.frame.entering.kind === "selected"
    && options.frame.entering.row.checkout.path === row.checkout.path
    && sameSubject(options.frame.entering.row, options.subject)) {
    return {
      kind: "authorized",
      authority: "current-checkout",
      subject: options.subject,
      checkoutPath: row.checkout.path,
      parentCheckoutPath: row.parentCheckoutPath,
      generation,
      row,
    };
  }
  if (options.confirmForeignGeneration === generation) {
    return {
      kind: "authorized",
      authority: "confirmed-foreign",
      subject: options.subject,
      checkoutPath: row.checkout.path,
      parentCheckoutPath: row.parentCheckoutPath,
      generation,
      row,
    };
  }
  if (options.confirmForeignGeneration !== undefined) {
    return {
      kind: "refused",
      reason: "generation-mismatch",
      message: "The supplied foreign confirmation does not match the current Errand generation.",
    };
  }
  return {
    kind: "confirmation-required",
    operation: options.operation,
    subject: options.subject,
    checkoutPath: row.checkout.path,
    generation,
    destructiveEffect: destructiveEffect(options.operation),
    recommendedPromptText: renderRetry(options, generation),
  };
}

function sameSubject(row: DerivedCheckoutRow, subject: ErrandTerminalSubject): boolean {
  return row.subject?.kind === subject.kind
    && row.subject.key === subject.slug
    && row.subject.claimId === subject.claimId;
}

function terminalGeneration(row: DerivedCheckoutRow, subject: ErrandTerminalSubject): string | null {
  return subject.kind === "errand"
    ? `errand-v1/${subject.slug}/${subject.claimId}`
    : row.markerGeneration;
}

function destructiveEffect(operation: ErrandTerminalOperation): string {
  switch (operation) {
    case "close": return "close and retire this Errand";
    case "abandon": return "abandon and retire this Errand";
    case "leave": return "preserve this Errand and remove its local occupancy";
    case "promote": return "convert this Errand into a work unit";
  }
}

function renderRetry(options: AuthorizeErrandTerminalOptions, generation: string): string {
  const args = [
    "arc",
    "errand",
    options.operation,
    options.subject.slug,
    ...(options.retryArguments ?? []),
    "--confirm-foreign-generation",
    generation,
  ];
  return `Retry with: ${args.map(renderArgument).join(" ")}`;
}

function renderArgument(value: string): string {
  return /^[A-Za-z0-9_./:@+-]+$/u.test(value)
    ? value
    : `'${value.replaceAll("'", `'"'"'`)}`;
}
