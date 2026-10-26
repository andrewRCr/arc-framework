/** Compare-and-swap publication acknowledgments without overwriting another fetch. */

import type { PushOutcome } from "../../git/push.js";
import { updateRefTransaction, type RefChange } from "../../git/ref-transaction.js";
import type { RefBackendContext } from "./context.js";
import type { RefPushListing } from "./push-listing.js";
import { RefFetchKeeperLockError, rethrowRefFetchKeeperLock } from "./fetch-keeper-lock.js";

/** A local acknowledgment lock cannot revoke the receiver's reported accepted refs. */
export class RefPushTrackingLockError extends Error {
  constructor(readonly lock: string, readonly acceptedRefs: readonly string[], cause: unknown) {
    super(`The receiver accepted ${acceptedRefs.join(", ")}, but local tracking acknowledgment was blocked by ${lock}.`, { cause });
    this.name = "RefPushTrackingLockError";
  }
}

/** Acknowledge every successful state ref only against its captured tracking value. */
export async function recordPushTracking(context: RefBackendContext, remote: string, listing: RefPushListing, outcome: PushOutcome): Promise<void> {
  if (outcome.status !== "refs") return;
  try { await acknowledgePushRefs(context, remote, listing, outcome); }
  catch (error) {
    if (!(error instanceof RefFetchKeeperLockError)) throw error;
    throw new RefPushTrackingLockError(error.lock, outcome.refs.filter(row => row.status === "ok").map(({ ref }) => ref), error);
  }
}

async function acknowledgePushRefs(context: RefBackendContext, remote: string, listing: RefPushListing,
  outcome: Extract<PushOutcome, { status: "refs" }>): Promise<void> {
  const changes = new Map(listing.changes.map((change) => [change.ref, change]));
  for (const row of outcome.refs) {
    if (row.status !== "ok") continue;
    const change = changes.get(row.ref);
    if (!change) continue;
    const ref = `refs/arc-remotes/${remote}/${row.ref.slice("refs/arc/".length)}`;
    const expected = listing.tracking.get(row.ref) ?? null;
    const update: RefChange | null = change.next !== null ? { ref, next: change.next, expected }
      : expected !== null ? { ref, delete: true, expected } : null;
    if (update) await updateRefTransaction(context, [update], { cwd: context.checkoutRoot })
      .catch((error: unknown) => rethrowRefFetchKeeperLock(context, [ref], error));
  }
}
