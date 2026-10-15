/** Exact detached husk admission against the selected operational retirement version. */
import { isAbsolute, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { readWorktreeMarker, decodeWorktreeHuskStamp, type WorktreeMarker } from "../git/worktree-marker.js";
import { decideHuskCleanup, isWorktreeClean } from "../git/worktree-cleanup.js";
import { isContainedIn, isLandedInBase } from "../git/branch-containment.js";
import { scanRegisteredWorktrees, type RegisteredWorktree } from "../git/worktree-roster.js";
import type { StoreRetirementEvidence } from "./store-retirement-evidence.js";
import type { TeardownContext } from "./verbs/teardown.js";
/** Captured exact selection rechecked while the existing physical lock is held. */
export interface SelectedStoreRetirementHusk { path: string; revalidate: () => Promise<void> }
interface HuskInput { ctx: TeardownContext; evidence: StoreRetirementEvidence; baseOid: string; path: string }
/** Select one exact linked husk, retaining its marker and HEAD predicates through final locked removal. */
export async function selectStoreRetirementHusk(input: HuskInput, worktrees: readonly RegisteredWorktree[]): Promise<SelectedStoreRetirementHusk> {
  if (!isAbsolute(input.path)) throw Error("--husk requires an absolute registered checkout path; inspect git worktree list and retry.");
  const selected = await readHusk(input, worktrees);
  return { path: selected.path, revalidate: async () => {
    const scan = await (input.ctx.scanWorktrees ?? scanRegisteredWorktrees)(input.ctx.exec);
    if (!scan.ok) throw Error(scan.message);
    const fresh = await readHusk(input, scan.worktrees);
    if (fresh.head !== selected.head || !isDeepStrictEqual(fresh.marker, selected.marker)) throw Error("The selected husk generation changed; inspect its marker and HEAD, then retry teardown.");
  } };
}
async function readHusk(input: HuskInput, worktrees: readonly RegisteredWorktree[]) {
  const matches = worktrees.filter((entry) => resolve(entry.path) === resolve(input.path));
  const checkout = matches[0];
  if (matches.length !== 1 || checkout === undefined || checkout.primary || !checkout.detached) throw Error(`No exact registered detached linked husk matches ${input.path}; inspect git worktree list and retry with its absolute path.`);
  const marker = await (input.ctx.readMarker ?? readWorktreeMarker)(checkout.path);
  if (marker.kind !== "present" || !marker.marker.spawnedByArc || marker.marker.husk?.subject.kind !== "work-unit" || marker.marker.husk.subject.name !== input.evidence.name) throw Error("The selected husk does not carry the current work unit's ARC stamp; repair the exact subject/marker evidence, then retry.");
  const decoded = decodeWorktreeHuskStamp(marker.marker.husk);
  if (decoded.kind !== "current" || !await huskEvidenceMatches(input, decoded.evidence)) throw Error("The selected husk's retirement evidence does not match the exact selected store version; repair its trusted lineage reference/version/digest, then retry.");
  const clean = await isWorktreeClean({ exec: input.ctx.exec, cwd: checkout.path });
  const decision = decideHuskCleanup({ marker, clean, head: checkout.head });
  if (decision.action !== "removable") throw Error(`Selected husk cleanup is blocked (${decision.reason}); preserve or discard changes, restore its stamped HEAD if appropriate, then retry.`);
  const stamp = marker.marker.husk;
  if (input.evidence.rule === "landed" && !await stampedHeadPreserved(input, stamp.sha, stamp.branch)) {
    throw Error(`The selected husk's stamped commit ${stamp.sha} is not proven landed in base or preserved on its upstream. Preserve that exact commit on base or origin/${stamp.branch}, refresh those refs, then retry arc teardown ${input.evidence.name} --husk ${input.path}.`);
  }
  return { path: checkout.path, head: checkout.head, marker: marker.marker };
}
async function stampedHeadPreserved(input: HuskInput, sha: string, branch: string): Promise<boolean> {
  return await isLandedInBase(input.ctx.exec, sha, input.baseOid)
    || await isContainedIn(input.ctx.exec, sha, `refs/remotes/origin/${branch}`);
}
async function huskEvidenceMatches(input: HuskInput, stamp: NonNullable<WorktreeMarker["husk"]>["evidence"]): Promise<boolean> {
  const selected = input.evidence.evidence;
  if (stamp?.kind === "lineage") return isDeepStrictEqual(stamp, selected);
  if (stamp?.kind !== "shipped" || selected.kind !== "shipped") return false;
  return stamp.expectedLifecycle === "completed" && stamp.resultDigest === selected.resultDigest
    && typeof stamp.baseProofOid === "string" && await isContainedIn(input.ctx.exec, stamp.baseProofOid, input.baseOid);
}
