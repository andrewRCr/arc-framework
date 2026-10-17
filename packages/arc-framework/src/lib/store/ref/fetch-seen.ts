/** Preserve the last verified tracking head across pruning without making it stored state. */

import type { FetchOutcome } from "../../git/fetch.js";
import { updateRefTransaction } from "../../git/ref-transaction.js";
import type { PullNotice } from "../sync.js";
import type { RefBackendContext } from "./context.js";
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import { readSyncRefs, syncRefIsAncestor } from "./sync-graph.js";
import { refFetchRewriteRemedy } from "./fetch-remedy.js";
import { rethrowRefFetchKeeperLock } from "./fetch-keeper-lock.js";

/** Both namespaces are captured before Git can create or prune a tracking ref. */
export interface RefFetchBasis { tracking: Map<string, string>; seen: Map<string, string> }

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

/** Drop temporary keepers only where a tracking ref still retains the observed objects. */
export async function finishRefFetchBasis(context: RefBackendContext, remote: string, basis: RefFetchBasis): Promise<void> {
  const prefix = `refs/arc-remotes/${remote}/`, current = await readSyncRefs(context, prefix);
  for (const [ref, tip] of basis.tracking) {
    if (!current.has(ref) || ref === `${prefix}project/moved`) continue;
    const retained = `refs/arc/tmp/seen/${remote}/${ref.slice(prefix.length)}`;
    await updateRefTransaction(context, [{ ref: retained, delete: true, expected: tip }], { cwd: context.checkoutRoot });
  }
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
      await updateRefTransaction(context, [{ ref: retained, delete: true, expected: kept }], { cwd: context.checkoutRoot });
      continue;
    }
    await updateRefTransaction(context, [{ ref: row.ref, delete: true, expected: row.next }], { cwd: context.checkoutRoot });
    row.flag = "!"; blocked.add(row.ref);
    notices.push({ kind: "history-diverged", ref, local: kept, remote: row.next,
      condition: `The returned ${ref} neither descends from its kept tip nor is an ancestor of it; both local heads were kept.`,
      remedy: await refFetchRewriteRemedy(context, remote, designation, ref, row.next) });
  }
  return { notices, blocked };
}
