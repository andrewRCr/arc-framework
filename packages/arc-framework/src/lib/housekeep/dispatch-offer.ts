/** Generation-bound sibling continuation over visible inbox dispatch bindings. */

import type { LocusMutationResultV1 } from "../locus/schema/index.js";
import { listDispatchInboxEntries } from "../user-sync/inbox-writer.js";

export type DispatchNextOffer = Extract<
  LocusMutationResultV1,
  { outcome: "applied" | "idempotent" }
>["nextOffer"];

export type DispatchOfferResolution =
  | { readonly kind: "resolved"; readonly nextOffer: DispatchNextOffer }
  | { readonly kind: "refused"; readonly reason: string };

/** Select the first exact sibling after completion, or the first sibling after routing close. */
export function resolveDispatchNextOffer(options: {
  readonly content: string;
  readonly dispatchId: string;
  readonly completedTitle: string | null;
  readonly parentCheckoutPath: string | null;
}): DispatchOfferResolution {
  let entries;
  try {
    entries = listDispatchInboxEntries(options.content, options.dispatchId);
  } catch (error) {
    return { kind: "refused", reason: error instanceof Error ? error.message : String(error) };
  }
  const completedTitle = options.completedTitle?.trim() ?? null;
  if (completedTitle !== null && entries.some((entry) => entry.title === completedTitle)) {
    return { kind: "refused", reason: `Completed capture '${completedTitle}' remains dispatch-bound.` };
  }
  const next = entries[0];
  return {
    kind: "resolved",
    nextOffer: next === undefined ? null : {
      kind: "errand",
      key: next.title,
      dispatchId: next.dispatchId,
      parentCheckoutPath: options.parentCheckoutPath,
    },
  };
}
