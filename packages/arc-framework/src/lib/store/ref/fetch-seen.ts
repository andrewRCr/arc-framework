/** Preserve the last verified tracking head across pruning without making it stored state. */

import type { FetchOutcome } from "../../git/fetch.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { refFetchRewriteRemedy } from "./fetch-remedy.js";
import { rethrowRefFetchKeeperLock } from "./fetch-keeper-lock.js";
import { withRefLocks } from "./write-locks.js";
import { REF_SYNC_DEADLINE_MS } from "./sync-deadline.js";

/** Both namespaces are captured before Git can create or prune a tracking ref. */
export interface RefFetchBasis { tracking: Map<string, string>; seen: Map<string, string> }

/**
 * Every checkout of the clone shares one remote's keepers, and a pull releases those whose tracking ref survived its
 * fetch, so a sibling's basis, fetch, and release must not interleave with it: one pull's release would drop a keeper
 * the other's pruning fetch still needs. A sibling holds the lock for at most its own sync deadline.
 */
export async function withRefFetchKeepers<T>(context: RefBackendContext, remote: string, operation: () => Promise<T>): Promise<T> {
  return withRefLocks(context, [`refs/arc/tmp/seen/${remote}`], operation, REF_SYNC_DEADLINE_MS);
}

/** Capture tracking and retained heads in one immutable ref listing. */
export async function readRefFetchBasis(context: RefBackendContext, remote: string, patterns: readonly string[]): Promise<RefFetchBasis> {
  const tracking = `refs/arc-remotes/${remote}/`, seen = `refs/arc/tmp/seen/${remote}/`;
  for (;;) {
    const tips = await readSyncRefs(context, [tracking, seen]);
    const basis = { tracking: new Map([...tips].filter(([ref]) => ref.startsWith(tracking)
      && patterns.some((pattern) => `refs/arc/${ref.slice(tracking.length)}`.startsWith(pattern.slice(0, -1))))),
      seen: new Map([...tips].filter(([ref]) => ref.startsWith(seen))) };
    const changes = [...basis.tracking].filter(([ref]) => ref !== `${tracking}project/moved`).flatMap(([ref, tip]) => {
      const retained = `${seen}${ref.slice(tracking.length)}`, prior = basis.seen.get(retained) ?? null;
      return prior === tip ? [] : [{ ref: retained, next: tip, expected: prior }];
    });
    if (!changes.length) return basis;
    const outcome = await updateRefTransaction(context, changes, { cwd: context.checkoutRoot })
      .catch((error: unknown) => rethrowRefFetchKeeperLock(context, changes.map(({ ref }) => ref), error));
    if (outcome.status === "committed") return basis;
  }
}

/** Drop temporary keepers only where a tracking ref still retains the observed objects, in one transaction. */
export async function finishRefFetchBasis(context: RefBackendContext, remote: string, basis: RefFetchBasis): Promise<void> {
  const prefix = `refs/arc-remotes/${remote}/`, current = await readSyncRefs(context, prefix);
  const releases = [...basis.tracking].filter(([ref]) => current.has(ref) && ref !== `${prefix}project/moved`)
    .map(([ref, tip]) => ({ ref: `refs/arc/tmp/seen/${remote}/${ref.slice(prefix.length)}`, delete: true as const, expected: tip }));
  if (!releases.length) return;
  const outcome = await updateRefTransaction(context, releases, { cwd: context.checkoutRoot })
    .catch((error: unknown) => rethrowRefFetchKeeperLock(context, releases.map(({ ref }) => ref), error));
  if (outcome.status === "committed") return;
  // A keeper another step already moved stays; each other one is still released.
  for (const release of releases) await updateRefTransaction(context, [release], { cwd: context.checkoutRoot })
    .catch((error: unknown) => rethrowRefFetchKeeperLock(context, [release.ref], error));
}

/** A returned ref must agree with its kept history until an explicit forced fetch chooses a new basis. */
export async function checkSeenRefFetch(context: RefBackendContext, remote: RefRemoteDesignation, designation: RefDesignation,
  fetched: Extract<FetchOutcome, { status: "refs" }>, basis: RefFetchBasis): Promise<{ notices: PullNotice[]; blocked: Set<string> }> {
  const tracking = `refs/arc-remotes/${remote.name}/`, seen = `refs/arc/tmp/seen/${remote.name}/`;
  const notices: PullNotice[] = [], blocked = new Set<string>();
  for (const row of fetched.refs) {
    if (!row.ref.startsWith(tracking)) continue;
    const path = row.ref.slice(tracking.length), retained = `${seen}${path}`, ref = `refs/arc/${path}`;
    if (ref === "refs/arc/project/moved") continue;
    if (row.flag === "-") {
      continue;
    }
    const kept = basis.seen.get(retained);
    if (!kept || basis.tracking.has(row.ref) || row.flag === "!") continue;
    if (await syncRefIsAncestor(context, kept, row.next) || await syncRefIsAncestor(context, row.next, kept)) {
      await updateRefTransaction(context, [{ ref: retained, delete: true, expected: kept }], { cwd: context.checkoutRoot })
        .catch((error: unknown) => rethrowRefFetchKeeperLock(context, [retained], error));
      continue;
    }
    await updateRefTransaction(context, [{ ref: row.ref, delete: true, expected: row.next }], { cwd: context.checkoutRoot })
      .catch((error: unknown) => rethrowRefFetchKeeperLock(context, [row.ref], error));
    row.flag = "!"; blocked.add(row.ref);
    notices.push({ kind: "history-diverged", ref, local: kept, remote: row.next,
      condition: `The returned ${ref} neither descends from its kept tip nor is an ancestor of it; both local heads were kept.`,
      remedy: await refFetchRewriteRemedy(context, remote, designation, ref, row.next) });
  }
  return { notices, blocked };
}
