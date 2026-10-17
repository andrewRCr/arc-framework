/** Capture changed state refs under a stable, globally ordered local lock set. */

import type { PushRefChange } from "../../git/push.js";
import { HistoryRefSchema, type HistoryRef } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { isManifestRef } from "./manifest.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { withRefLocks } from "./write-locks.js";
import { readPendingRefEnds } from "./sync-lifecycle.js";

/** Immutable source and tracking tips read while the selected refs were locked. */
export interface RefPushListing {
  local: Map<string, string>; tracking: Map<string, string>; changes: PushRefChange[];
}

/** Release and retake the whole lock set whenever the locked listing gains a ref. */
export async function capturePushListing(context: RefBackendContext, remote: string, identity: string | null): Promise<RefPushListing> {
  for (;;) {
    const initial = await readPushListing(context, remote, identity);
    const locked = new Set(initial.changes.map(({ ref }) => ref));
    const result = await withRefLocks(context, locked, async () => {
      const current = await readPushListing(context, remote, identity);
      return current.changes.some(({ ref }) => !locked.has(ref)) ? null : current;
    });
    if (result) return result;
  }
}

/** Name pending history creates, updates, and deletes for the push loop's next fetch. */
export async function readPushHistoryRefs(context: RefBackendContext, remote: string, identity: string | null): Promise<HistoryRef[]> {
  const listing = await readPushListing(context, remote, identity);
  return listing.changes.flatMap(({ ref }) => {
    const history = HistoryRefSchema.safeParse(ref);
    return history.success ? [history.data] : [];
  });
}

/** A shared tracking advance can lift a lease only after the captured local tip includes it. */
export async function pushListingIncludesTracking(context: RefBackendContext, listing: RefPushListing,
  merged: ReadonlyMap<string, string>): Promise<boolean> {
  for (const { ref, next } of listing.changes) {
    const tracking = listing.tracking.get(ref);
    if (tracking === merged.get(ref)) continue;
    if (!tracking || !next || !await syncRefIsAncestor(context, tracking, next)) return false;
  }
  return true;
}

async function readPushListing(context: RefBackendContext, remote: string, identity: string | null): Promise<RefPushListing> {
  const prefix = `refs/arc-remotes/${remote}/`;
  const [allLocal, allTracking] = await Promise.all([readSyncRefs(context, "refs/arc/"), readSyncRefs(context, prefix)]);
  const local = new Map([...allLocal].filter(([ref]) => publishableRef(ref, identity)));
  const tracking = new Map([...allTracking].map(([ref, tip]) => [`refs/arc/${ref.slice(prefix.length)}`, tip]));
  const pending = [...local].some(([ref, tip]) => /^refs\/arc\/(work|cohort)\//u.test(ref) && tracking.get(ref) !== tip)
    ? new Set((await readPendingRefEnds(context, local, local, tracking)).filter(({ ownReopen }) => !ownReopen).map(({ live }) => live)) : new Set<string>();
  const changes: PushRefChange[] = [...local].filter(([ref, tip]) => !pending.has(ref) && tracking.get(ref) !== tip).map(([ref, next]) => ({ ref, next }));
  for (const ref of tracking.keys()) {
    if (local.has(ref)) continue;
    const counterpart = ref.startsWith("refs/arc/history/") ? ref.replace("refs/arc/history/", "refs/arc/")
      : /^refs\/arc\/(work|cohort)\//u.test(ref) ? ref.replace("refs/arc/", "refs/arc/history/") : null;
    if (counterpart && local.has(counterpart)) changes.push({ ref, next: null });
  }
  return { local, tracking, changes };
}

function publishableRef(ref: string, identity: string | null): boolean {
  if (!isManifestRef(ref) && !HistoryRefSchema.safeParse(ref).success) return false;
  return !ref.startsWith("refs/arc/user/") || identity !== null
    && (ref === `refs/arc/user/${identity}/personal` || ref === `refs/arc/user/${identity}/claims`);
}
