/** Human rename reports preserve store refusals and physical continuation instructions. */
import * as p from "../lib/terminal.js";
import { refuse } from "./lifecycle-shared.js";
import type { RunRenameResult } from "../lib/work-unit/verbs/rename.js";
/** Report the logical rename and every retained branch or pending physical action.
 * @param renameSource - Requested old work-unit name.
 * @param renameTarget - Requested new work-unit name.
 * @param result - Authoritative verb outcome.
 */
export function reportRenameResult(renameSource: string, renameTarget: string, result: RunRenameResult): void {
  if (result.status !== "renamed") {
    refuse(result.reason, result.status === "rejected" ? result.refusal : undefined, result.remedy);
    return;
  }
  for (const advisory of result.advisories) p.log.warn(advisory);
  const lines = [
    `Work unit: ${renameSource} → ${renameTarget}`,
    `Shape:     ${result.shape}`,
  ];
  if (result.pendingIntegration) {
    lines.push("Visibility: pending integration of the rename branch");
  }
  if (result.remote?.status === "retained") lines.push(`Remote:    retained personal branch ${result.remote.oldBranch}`);
  for (const branch of result.keptBranches ?? []) lines.push(`Branch:    kept ${branch}`);
  if (result.remote?.status === "unpublished") lines.push("Remote:    unpublished; no ref created");
  if (result.shape === "in-place" && result.recordBatch === undefined) {
    lines.push("Checkout:  unmanaged; no ownership marker was minted");
    lines.push("Worktree:  unchanged; the primary worktree cannot be moved");
  }
  if (result.recordBatch !== undefined && result.worktree === undefined && (result.checkout?.kind === "renamed" || result.checkout?.kind === "idempotent")) {
    lines.push(`Checkout:  ${result.checkout.checkoutPath} (ownership renamed; path unchanged)`);
  }
  lines.push(...worktreeLines(result));
  p.note(lines.join("\n"), "Renamed");
  p.outro("Done.");
}

function worktreeLines(result: Extract<RunRenameResult, { status: "renamed" }>): string[] {
  const worktree = result.worktree;
  if (worktree === undefined) return [];
  if ("mutation" in worktree) return mutationLines(worktree);
  const lines: string[] = [];
  if (worktree.status === "already-moved") {
      lines.push(`Worktree:  unchanged; registered path already carries the new slug: ${worktree.worktreePath}`);
    } else if (worktree.status === "anchored") {
      lines.push(`Worktree:  unchanged; anchored checkout: ${worktree.worktreePath}`);
    } else if (worktree.status === "unmatched") {
      lines.push(`Worktree:  unchanged; registered path does not contain the old slug: ${worktree.worktreePath}`);
    } else if (worktree.status === "deferred-self-move") {
      lines.push(`Worktree:  move deferred; current session remains at ${worktree.from}`);
      if (result.checkout?.kind === "renamed" || result.checkout?.kind === "idempotent") {
        lines.push(`Follow-up:  from outside it, \`git worktree move -f -f ${worktree.from} ${worktree.to}\``);
      } else {
        lines.push(`Checkout:  ${result.checkout?.kind ?? "unavailable"}; no move action projected`);
      }
    } else {
      lines.push("Worktree:  unchanged; no linked worktree is registered for the renamed branch");
    }
  return lines;
}
function mutationLines(worktree: import("../lib/work-unit/mutators/reconcile-work-unit-worktree.js").ReconcileWorkUnitWorktreeResult): string[] {
  const lines: string[] = [];
      if (worktree.mutation !== "move") {
        lines.push("Worktree:  unchanged; rename returned an unexpected worktree result");
      } else {
        const notice = worktree.followUpNotice;
        if (notice !== undefined) {
          lines.push(`Follow-up:  ${notice}`);
        } else {
          lines.push(
            `Worktree:  ${worktree.to}`
            + (worktree.locusHopped ? " (process relocated)" : ""),
          );
        }
      }
  return lines;
}
