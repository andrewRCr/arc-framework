/** Operation-local lifecycle holds keep unavailable evidence distinct from absent item history. */
import type { RefBackendContext } from "./context.js";
import type { PullNotice } from "../sync.js";
import { primeLifecycleLogs } from "./sync-lifecycle-evidence.js";
import { corruptRef } from "./namespace-health.js";

/** Hold both coordinates of an item without inferring whether it is live or ended. */
export function holdLifecycleRef(held: Set<string>, ref: string): void {
  held.add(ref);
  if (!/^refs\/arc\/(?:history\/)?(?:work|cohort)\//u.test(ref)) return;
  const live = ref.replace("refs/arc/history/", "refs/arc/");
  held.add(live); held.add(live.replace("refs/arc/", "refs/arc/history/"));
}

/** A folder or lineage owner remains held even when a ref snapshot omitted one of its coordinates. */
export function lifecycleRefHeld(held: ReadonlySet<string>, ref: string): boolean {
  const live = ref.replace("refs/arc/history/", "refs/arc/");
  return held.has(live) || held.has(live.replace("refs/arc/", "refs/arc/history/"));
}

/** Acquire admitted roots and attach explicit holds to every captured alias of an unavailable history. */
export async function primeLifecycleHolds(context: RefBackendContext, snapshots: readonly ReadonlyMap<string, string>[],
  held: Set<string>): Promise<PullNotice[]> {
  const admitted = snapshots.map(snapshot => new Map([...snapshot].filter(([ref]) => !lifecycleRefHeld(held, ref))));
  const unavailable = await primeLifecycleLogs(context, admitted);
  const lives = new Set(snapshots.flatMap(snapshot => [...snapshot].filter(([, tip]) => unavailable.has(tip))
    .map(([ref]) => ref.replace("refs/arc/history/", "refs/arc/"))));
  const notices: PullNotice[] = [];
  for (const live of lives) {
    holdLifecycleRef(held, live);
    notices.push({ kind: "namespace-corrupt", ref: live,
      condition: `An object required to establish lifecycle history for ${live} is unavailable locally.`,
      remedy: corruptRef(live, true).remedy });
  }
  return notices;
}
