/** Sibling continuation over the global visible execute-bound inbox queue. */

import { listExecuteBoundInboxEntries } from "./inbox-writer.js";

export type ExecutionNextOffer = {
  readonly kind: "errand";
  readonly key: string;
  readonly parentCheckoutPath: string | null;
} | null;

export type ExecutionOfferResolution =
  | { readonly kind: "resolved"; readonly nextOffer: ExecutionNextOffer }
  | { readonly kind: "refused"; readonly reason: string };

/**
 * Select the first marked capture after one execute-bound concern completes.
 *
 * @param options - Current inbox bytes, completed title, and optional warm parent checkout.
 * @returns The next sibling offer, or a refusal when the queue cannot be proven safe.
 */
export function resolveExecutionNextOffer(options: {
  readonly content: string;
  readonly completedTitle: string | null;
  readonly parentCheckoutPath: string | null;
}): ExecutionOfferResolution {
  const listing = listExecuteBoundInboxEntries(options.content);
  // Fails closed where the init guidance path degrades gracefully: this path must prove the
  // completed capture is no longer execute-bound, and a capture that could not be read cannot be
  // excluded from that set.
  const unreadable = listing.diagnostics[0];
  if (unreadable !== undefined) return { kind: "refused", reason: unreadable };
  const entries = listing.entries;
  const completedTitle = options.completedTitle?.trim() ?? null;
  if (completedTitle !== null && entries.some((entry) => entry.title === completedTitle)) {
    return { kind: "refused", reason: `Completed capture '${completedTitle}' remains execute-bound.` };
  }
  const next = entries[0];
  return {
    kind: "resolved",
    nextOffer: next === undefined ? null : {
      kind: "errand",
      key: next.title,
      parentCheckoutPath: options.parentCheckoutPath,
    },
  };
}
