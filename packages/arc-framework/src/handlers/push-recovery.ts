/**
 * Interactive push with conflict recovery.
 *
 * Wraps `runUserPush` with the "remote conflict" recovery flow used by both
 * `arc user push` and `arc sync`. Returns a discriminated result so callers
 * can render context-appropriate messaging without the helper knowing about
 * its embedding.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runUserPush, runUserFetch, runUserSave, UserPushBlockedError } from "../commands/user.js";
import type { UserIOContext } from "../commands/user.js";
import type { AccessFn, PushabilityCondition } from "../lib/git/index.js";
import { isNonInteractiveEnvironment, isRemoteError, runWithSpinner } from "./shared.js";

/** Outcome of an interactive push attempt. */
export type PushResult =
  | { kind: "ok" }
  | { kind: "noop" }
  | { kind: "ok-recovered"; via: "force" | "merge" }
  | { kind: "cancelled" }
  | { kind: "no-remote" }
  | { kind: "failed-nontty-conflict" }
  | { kind: "blocked"; conditions: PushabilityCondition[] }
  | { kind: "failed"; error: unknown };

function isDivergentPushError(msg: string): boolean {
  return msg.includes("non-fast-forward") || msg.includes("[rejected]");
}

export interface PushWithInteractiveRecoveryOptions {
  io: UserIOContext;
  identity: string;
  cwd: string;
  access?: AccessFn;
  /** Current worktree branch — threaded into the pushability matrix. */
  worktreeBranch?: string;
}

/**
 * Push user notes with interactive recovery on conflict.
 *
 * On non-fast-forward rejection, prompts the user to force-push, merge, or
 * cancel. The merge option aligns the local ref with remote, re-saves the
 * current disk state on top of the new base, and pushes the combined state —
 * avoiding the silent-discard bug the former "pull first" option exhibited.
 * Non-conflict errors are returned as `{ kind: "failed" }` or
 * `{ kind: "no-remote" }` for the caller to render.
 */
export async function pushWithInteractiveRecovery(
  options: PushWithInteractiveRecoveryOptions,
): Promise<PushResult> {
  const { io, identity, cwd, access, worktreeBranch } = options;
  const spinner = p.spinner();
  spinner.start("Pushing user notes...");
  try {
    const pushResult = await runUserPush({ cwd, io, identity, access, worktreeBranch });
    spinner.stop(pushResult.kind === "noop" ? "Already up to date." : "Push complete.");
    return { kind: pushResult.kind === "noop" ? "noop" : "ok" };
  } catch (err) {
    spinner.stop("Failed.");
    if (err instanceof UserPushBlockedError) {
      return { kind: "blocked", conditions: err.conditions };
    }

    const msg = err instanceof Error ? err.message : String(err);

    if (isRemoteError(msg)) return { kind: "no-remote" };

    if (!isDivergentPushError(msg)) return { kind: "failed", error: err };

    // Conflict requires an interactive choice. In non-interactive environments,
    // surface an explicit discriminant so callers can render a dedicated
    // "save preserved; push skipped" banner instead of a generic failure.
    if (isNonInteractiveEnvironment()) return { kind: "failed-nontty-conflict" };

    p.log.warn("Push rejected — local and remote notes conflict (both moved since common ancestor).");
    const action = await p.select({
      message: "How would you like to resolve this?",
      options: [
        { value: "force", label: "Force push (overwrite remote with local)" },
        { value: "merge", label: "Merge: rebase my save onto remote, then push" },
        { value: "cancel", label: "Cancel" },
      ],
    });

    if (p.isCancel(action) || action === "cancel") {
      return { kind: "cancelled" };
    }

    try {
      if (action === "force") {
        await runWithSpinner(
          "Force-pushing user notes...",
          () => runUserPush({ cwd, io, identity, force: true, access, worktreeBranch }),
          "Force push complete.",
        );
        return { kind: "ok-recovered", via: "force" };
      }

      // Merge: force-fetch aligns the local notes ref with remote, then re-save
      // writes the current disk state as a new note on top of the aligned base,
      // and push sends the combined state. Re-save after fetch is the critical
      // step the former "pull first" option skipped.
      await runWithSpinner(
        "Fetching remote notes...",
        () => runUserFetch({ io, identity, force: true }),
        "Fetch complete.",
      );
      await runWithSpinner(
        "Saving current user directory on top...",
        () => runUserSave({ cwd, io, identity }),
        "Save complete.",
      );
      await runWithSpinner(
        "Pushing user notes...",
        () => runUserPush({ cwd, io, identity, access, worktreeBranch }),
        "Push complete.",
      );
      return { kind: "ok-recovered", via: "merge" };
    } catch (recoveryErr) {
      if (recoveryErr instanceof UserPushBlockedError) {
        return { kind: "blocked", conditions: recoveryErr.conditions };
      }
      return { kind: "failed", error: recoveryErr };
    }
  }
}
