/** Sibling continuation over the global visible execute-bound inbox queue. */

import type { LocusMutationResultV1 } from "../locus/schema/index.js";
import { listExecuteBoundInboxEntries } from "../user-sync/inbox-writer.js";

export type ExecutionNextOffer = Extract<
  LocusMutationResultV1,
  { outcome: "applied" | "idempotent" }
>["nextOffer"];

export type ExecutionOfferResolution =
  | { readonly kind: "resolved"; readonly nextOffer: ExecutionNextOffer }
  | { readonly kind: "refused"; readonly reason: string };

/** Select the first marked capture after completion or housekeeping close. */
export function resolveExecutionNextOffer(options: {
  readonly content: string;
  readonly completedTitle: string | null;
  readonly parentCheckoutPath: string | null;
}): ExecutionOfferResolution {
  let entries;
  try {
    entries = listExecuteBoundInboxEntries(options.content);
  } catch (error) {
    return { kind: "refused", reason: error instanceof Error ? error.message : String(error) };
  }
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
