/** Recover unpublished commit and batch membership from immutable publication tips. */

import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { PushRefChange } from "../../git/push.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";
import { RecordReferenceSchema } from "../identity.js";

/** One unpublished commit's batch identity and first-parent mutation basis. */
export interface UnpublishedRefCommit { revision: string; parent: string | null; batch: string }

/** Index every reachable unpublished commit, including merged branches of state history. */
export async function readUnpublishedRefBatches(context: RefBackendContext, listing: { local: ReadonlyMap<string, string>; tracking: ReadonlyMap<string, string>; changes: readonly PushRefChange[]; pending?: ReadonlySet<string> }): Promise<Map<string, UnpublishedRefCommit[]>> {
  const result = new Map<string, UnpublishedRefCommit[]>();
  const changed = new Map([...listing.changes.map(({ ref, next }) => [ref, next] as const),
    ...[...listing.pending ?? []].map((ref) => [ref, listing.local.get(ref)] as const)]);
  for (const [ref, next] of changed) {
    const tip = next ?? listing.local.get(ref.startsWith("refs/arc/history/") ? ref.replace("refs/arc/history/", "refs/arc/")
      : ref.replace("refs/arc/", "refs/arc/history/"));
    if (!tip) continue;
    const family = viewRefFamily(ref.replace("refs/arc/history/", "refs/arc/"));
    const reference = family ? refPrototype(context, ref, family)
      : RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    const tracking = listing.tracking.get(ref);
    const { stdout } = await context.exec("git", ["log", "--format=%H %P%n%B%x00", tip, ...tracking ? [`^${tracking}`] : []],
      { cwd: context.checkoutRoot, objectAccess: "local-only" });
    const commits = stdout.split("\0").flatMap((block) => {
      const [header = "", ...message] = block.trimStart().split("\n"), [revision, parent] = header.split(" ");
      if (!revision) return [];
      const provenance = parseStoreCommitProvenance(message.join("\n"), reference);
      return [{ revision, parent: parent ?? null, batch: "batchId" in provenance ? provenance.batchId ?? revision : revision }];
    });
    result.set(ref, commits);
  }
  return result;
}

/** A batch touching any excluded ref excludes every other unpublished contribution to it. */
export function expandRefBatchExclusion(excluded: Set<string>, commits: ReadonlyMap<string, readonly UnpublishedRefCommit[]>): void {
  let changed = true;
  while (changed) {
    changed = false;
    const batches = new Set([...excluded].flatMap((ref) => commits.get(ref)?.map(({ batch }) => batch) ?? []));
    for (const [ref, rows] of commits) {
      if (excluded.has(ref) || !rows.some(({ batch }) => batches.has(batch))) continue;
      excluded.add(ref); changed = true;
    }
  }
}
