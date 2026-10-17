/** Compare-and-swap publication acknowledgments without overwriting another fetch. */

import type { PushOutcome } from "../../git/push.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import type { RefPushListing } from "./push-listing.js";

/** Acknowledge every successful state ref only against its captured tracking value. */
export async function recordPushTracking(context: RefBackendContext, remote: string, listing: RefPushListing, outcome: PushOutcome): Promise<void> {
  if (outcome.status !== "refs") return;
  const changes = new Map(listing.changes.map((change) => [change.ref, change]));
  for (const row of outcome.refs) {
    if (row.status !== "ok") continue;
    const change = changes.get(row.ref);
    if (!change) continue;
    const ref = `refs/arc-remotes/${remote}/${row.ref.slice("refs/arc/".length)}`;
    const expected = listing.tracking.get(row.ref) ?? null;
    const update: RefChange | null = change.next !== null ? { ref, next: change.next, expected }
      : expected !== null ? { ref, delete: true, expected } : null;
    if (update) await updateRefTransaction(context, [update], { cwd: context.checkoutRoot });
  }
}
