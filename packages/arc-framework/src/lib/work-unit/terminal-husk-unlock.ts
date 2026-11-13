/** Release ARC's Git lock only for the exact terminal husk generation. */
import { isDeepStrictEqual } from "node:util";
import { resolve } from "node:path";
import { readWorktreeMarker, type WorktreeHuskStamp } from "../git/worktree-marker.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { PROJECTION_LOCK_REASON, unlockProjectionCheckout } from "../git/worktree-removal.js";
import { withWorktreeOperationLock } from "./worktree-operation-lock.js";
import type { TeardownContext } from "./verbs/teardown.js";

/** Unlock a stamped detached checkout, retaining an actionable notice if the lock cannot be released. */
export async function unlockTerminalHusk(ctx: TeardownContext, path: string, stamp: WorktreeHuskStamp): Promise<string | null> {
  try {
    const scan = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
    if (!scan.ok) throw new Error(scan.message);
    const row = scan.worktrees.find(entry => resolve(entry.path) === resolve(path));
    if (row?.locked === undefined) return null;
    if (row.locked !== PROJECTION_LOCK_REASON) throw new Error("another tool owns the Git lock");
    const revalidate = async (): Promise<void> => {
      const marker = await (ctx.readMarker ?? readWorktreeMarker)(path);
      const current = await (ctx.scanWorktrees ?? scanRegisteredWorktrees)(ctx.exec);
      if (!current.ok) throw new Error(current.message);
      const checkout = current.worktrees.find(entry => resolve(entry.path) === resolve(path));
      if (marker.kind !== "present" || !marker.marker.spawnedByArc || !isDeepStrictEqual(marker.marker.husk, stamp)
        || checkout?.primary !== false || !checkout.detached || checkout.head !== stamp.sha) {
        throw new Error("terminal husk marker or topology changed");
      }
    };
    await revalidate();
    if (ctx.readTeardownSelection !== undefined && ctx.teardownWorktree !== undefined) {
      const selected = await ctx.readTeardownSelection({ checkoutPath: path, subject: stamp.subject });
      if (selected.kind !== "clear") throw new Error(selected.message);
      await ctx.teardownWorktree.retire({ expectedSelection: selected, revalidateLocal: revalidate,
        retireProjection: () => unlockProjectionCheckout(ctx.exec, path) });
    } else {
      const operation = async (): Promise<void> => { await revalidate(); await unlockProjectionCheckout(ctx.exec, path); };
      if (ctx.serializeWorktreeOperation !== undefined) await ctx.serializeWorktreeOperation(ctx.cwd, operation);
      else await withWorktreeOperationLock({ exec: ctx.exec, cwd: ctx.cwd, operation });
    }
    return null;
  } catch (error) {
    return `The husk folder remains locked at ${path}: ${error instanceof Error ? error.message : String(error)}. `
      + "Retry its named teardown command from outside the husk.";
  }
}
