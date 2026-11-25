/** Assign every member's final quarter coordinates before any cohort closeout reads them. */

import type { StoreResult } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import type { RefTreeEntry } from "./batch-read.js";
import type { RefWriteGroup } from "./write-commits.js";
import type { PreparedRefMutation } from "./write-merge.js";
import type { ResolvedBatch } from "./write-resolution.js";
import { planRefArchives, type RefArchivePlan, type RefCloseoutPlanning } from "./write-archive.js";
import { planCompletedMoves } from "./write-completed.js";

/** Keep member allocation order, then plan live and transferred cohorts over their complete assignments. */
export async function planRefCloseouts(context: RefBackendContext, batch: ResolvedBatch, writes: readonly PreparedRefMutation[],
  groups: ReadonlyMap<string, RefWriteGroup>, batchId: string,
  reopened?: Map<string, Map<string, RefTreeEntry>>): Promise<StoreResult<RefArchivePlan[]>> {
  const quarters = reopened ?? new Map<string, Map<string, RefTreeEntry>>();
  const planning: RefCloseoutPlanning = { members: [], reservations: new Map() };
  const archives: RefArchivePlan[] = [];
  for (const cohorts of [false, true]) {
    const live = writes.filter(({ mutation }) => (mutation.reference.kind === "cohort/document") === cohorts);
    const assigned = await planRefArchives(context, live, groups, batch.tips, batchId, quarters, planning);
    if (assigned.status === "refused") return assigned;
    archives.push(...assigned.result);
    const moves = await planCompletedMoves(context, batch, groups, { archives, writes, planning, cohorts }, reopened);
    if (moves.status === "refused") return moves;
  }
  return { status: "ok", result: archives };
}
