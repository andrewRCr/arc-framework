/**
 * The user-workspace satellite side-effect — open / close the per-WU developer
 * workspace (`user/{identity}/{wuName}/`) across the worktree-touching verbs
 * (`init` / `start` / `activate` / `integrate` / `decompose` / `park` / `resume`
 * / `abandon`). The transition's direction (open vs close) is decided by the
 * executor per edge and passed as `action`; this side-effect only executes it.
 *
 * It routes exclusively to the **non-interactive** `runUserOpen` / `runUserClose`
 * lib functions (bound by the executor) — never the interactive `handleUserOpen`
 * / `handleUserClose` CLI handlers, whose clack prompt blocks on a TTY and whose
 * default option *deletes* a prior WU's SESSION-NOTES (that handler-layer hang is
 * owned by `cli-substrate-adoption`). Keeping the open / close functions behind
 * injected seams both enforces that routing and keeps this leg unit-testable.
 *
 * @module
 */

import type {
  UserCloseOptions,
  UserIOContext,
  UserOpenOptions,
} from "../../../commands/user/types.js";

/** Dependencies for {@link userWorkspace} — the non-interactive open / close seams. */
export interface UserWorkspaceContext {
  /** Production binds `runUserOpen` (idempotent; seeds SESSION-NOTES). */
  open: (options: UserOpenOptions) => Promise<void>;
  /** Production binds `runUserClose` (recursive remove of the WU subdir). */
  close: (options: UserCloseOptions) => Promise<void>;
}

/**
 * The workspace operation — open or close, with the inputs each needs. Open
 * additionally carries the I/O context and template dir for the SESSION-NOTES
 * seed; close is filesystem-only.
 */
export type UserWorkspaceOp =
  | {
      action: "open";
      cwd: string;
      identity: string | null;
      wuName: string;
      io: UserIOContext;
      internalTemplateDir: string;
    }
  | { action: "close"; cwd: string; identity: string | null; wuName: string };

/** Outcome of a {@link userWorkspace} call. */
export interface UserWorkspaceResult {
  /** Whether the open / close ran (false when skipped for an absent identity). */
  ran: boolean;
}

/**
 * Open or close a work unit's per-developer workspace, routing to the injected
 * non-interactive function. Skips when no identity is resolved (the workspace is
 * identity-scoped).
 *
 * @param ctx - The injected open / close seams.
 * @param op - The action and its inputs.
 * @returns Whether the operation ran.
 */
export async function userWorkspace(
  ctx: UserWorkspaceContext,
  op: UserWorkspaceOp,
): Promise<UserWorkspaceResult> {
  if (op.identity === null) return { ran: false };

  if (op.action === "open") {
    await ctx.open({
      cwd: op.cwd,
      io: op.io,
      identity: op.identity,
      wuName: op.wuName,
      internalTemplateDir: op.internalTemplateDir,
    });
  } else {
    await ctx.close({ cwd: op.cwd, identity: op.identity, wuName: op.wuName });
  }
  return { ran: true };
}
