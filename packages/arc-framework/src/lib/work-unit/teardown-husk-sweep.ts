/** Confirmed cleanup of stamped detached husks through the ordinary exact-path retirement drivers. */
import { isDeepStrictEqual } from "node:util";
import { OwnerIdentitySchema } from "../store/identity.js";
import { readWorktreeMarker, decodeWorktreeHuskStamp, type WorktreeMarker } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { checkWorktreeRemoval, describeRemovalRefusal } from "../git/worktree-removal.js";
import { decideHuskCleanup } from "../git/worktree-cleanup.js";
import { isSelfTeardown } from "./mutators/reconcile-work-unit-worktree.js";
import { runBranchTeardown, runTeardown, type TeardownContext, type TeardownParams } from "./verbs/teardown.js";

interface LeftHusk { path: string; reason: string }
interface Candidate { path: string; head: string; marker: WorktreeMarker }
type Selection = { status: "selected"; candidates: Candidate[]; left: LeftHusk[] } | { status: "rejected"; reason: string };
/** A preview cannot mutate; a completed sweep names every admitted removal and retained candidate. */
export type TeardownHuskSweepResult =
  | { status: "rejected"; reason: string }
  | { status: "confirmation-required"; candidates: string[]; left: LeftHusk[] }
  | { status: "swept"; removed: string[]; left: LeftHusk[] };

/** Remove eligible husks one at a time, preserving live checkouts and all unproven generations. */
export async function runTeardownHuskSweep(ctx: TeardownContext,
  options: Pick<TeardownParams, "base" | "protection"> & { confirmed: boolean }): Promise<TeardownHuskSweepResult> {
  const selected = await selectHusks(ctx);
  if (selected.status === "rejected") return selected;
  if (!options.confirmed && selected.candidates.length > 0) return { status: "confirmation-required",
    candidates: selected.candidates.map(candidate => candidate.path), left: selected.left };
  const removed: string[] = [], left = [...selected.left];
  for (const candidate of selected.candidates) {
    try {
      const reason = await removeHusk(ctx, options, candidate);
      if (reason === null) removed.push(candidate.path);
      else left.push({ path: candidate.path, reason });
    } catch (error) { left.push({ path: candidate.path, reason: error instanceof Error ? error.message : String(error) }); }
  }
  return { status: "swept", removed, left };
}

async function selectHusks(ctx: TeardownContext): Promise<Selection> {
  const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
  if (!scan.ok) return { status: "rejected", reason: `Cannot list registered husks: ${scan.message}. Repair the observation and retry arc teardown.` };
  const candidates: Candidate[] = [], left: LeftHusk[] = [];
  for (const row of scan.worktrees) {
    if (row.primary || !row.detached) continue;
    const marker = await (ctx.readMarker ?? readWorktreeMarker)(row.path);
    const self = await isSelfTeardown(row.path, ctx.cwd);
    if (self && (marker.kind === "malformed" || marker.kind === "present" && marker.marker.husk !== undefined)) {
      return { status: "rejected", reason: "Run arc teardown from outside the current husk, such as the primary checkout; this sweep removes no checkout from inside a husk." };
    }
    if (marker.kind === "malformed") { left.push({ path: row.path, reason: `unreadable marker: ${marker.message}` }); continue; }
    if (marker.kind !== "present" || marker.marker.husk === undefined) continue;
    if (!marker.marker.spawnedByArc) { left.push({ path: row.path, reason: "externally managed husk" }); continue; }
    candidates.push({ path: row.path, head: row.head, marker: marker.marker });
  }
  return { status: "selected", candidates, left };
}

async function removeHusk(ctx: TeardownContext, options: Pick<TeardownParams, "base" | "protection">,
  candidate: Candidate): Promise<string | null> {
  const current = await (ctx.readMarker ?? readWorktreeMarker)(candidate.path);
  if (current.kind !== "present" || !isDeepStrictEqual(current.marker, candidate.marker)) {
    return "husk marker changed; inspect it and retry the sweep";
  }
  const stamp = current.marker.husk;
  if (stamp === undefined) return "terminal stamp is missing";
  const decoded = decodeWorktreeHuskStamp(stamp, { stateOffBranch: ctx.store?.capabilities.stateOffBranch });
  if (decoded.kind !== "current") return decoded.reason;
  const check = await checkWorktreeRemoval({ exec: ctx.exec, checkoutPath: candidate.path, disposition: "remove",
    check: ctx.projectionRemovalSlots?.check, folderExists: ctx.worktreeFs?.directoryExists.bind(ctx.worktreeFs) });
  if (check.kind === "refused") return describeRemovalRefusal(check);
  const decision = decideHuskCleanup({ marker: current, clean: check.kind === "removable", head: candidate.head });
  if (decision.action !== "removable") return decision.reason;
  const subject = stamp.subject;
  if (subject.kind === "errand") return "No exact husk cleanup driver serves this Errand; inspect its own cleanup state.";
  const result = subject.kind === "branch"
    ? await runBranchTeardown(ctx, { ...options, branch: subject.ref, huskPath: candidate.path })
    : await runTeardown(ctx, { ...options, huskPath: candidate.path,
      subject: subject.uid === undefined ? { kind: "slug", slug: subject.name }
        : { kind: "owner", owner: OwnerIdentitySchema.parse({ type: "work-item", name: subject.name, uid: subject.uid }) } });
  if (result.status === "rejected") return result.reason;
  return result.worktreeRemoved === candidate.path ? null
    : result.notices.join(" ") || "Branch obligations remain unresolved; retry its exact outside teardown.";
}
