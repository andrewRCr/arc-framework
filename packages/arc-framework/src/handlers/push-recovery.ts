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

import {
  findNearestUserNote,
  runUserPush,
  runUserFetch,
  runUserSave,
  UserPushBlockedError,
} from "../commands/user.js";
import type { UserIOContext } from "../commands/user.js";
import type { AccessFn, PushabilityCondition } from "../lib/git/index.js";
import type { SyncOutput } from "../lib/sync-output.js";
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
  /**
   * Auto-accept safe-default recovery on conflict — `--yes` semantics.
   *
   * On non-fast-forward rejection, the conflict resolves via the merge path
   * (force-fetch, re-save on top, push) without prompting. Force-push is
   * never auto-selected; `--yes` does not opt into destructive defaults.
   */
  yes?: boolean;
  /**
   * Output routing for spinner and log emission. Required so JSON-mode
   * callers route spinner cursor codes and log lines through a no-op
   * spinner / stderr sink, keeping subprocess stdout free of Clack
   * artifacts. Human-mode callers pass `createSyncOutput(false)` for a
   * pass-through wrapper around `@clack/prompts`.
   */
  output: SyncOutput;
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
  const { io, identity, cwd, access, worktreeBranch, yes, output } = options;
  const spinner = output.spinner();
  spinner.start("Pushing user notes...");
  try {
    const pushResult = await runUserPush({ cwd, io, identity, access, worktreeBranch });
    if (pushResult.kind === "noop") {
      spinner.stop("Remote user notes already match local user notes.");
      await warnIfLocalNoteStaleForHead(output, { cwd, io, identity });
      return { kind: "noop" };
    }
    spinner.stop("Push complete.");
    return { kind: "ok" };
  } catch (err) {
    spinner.stop("Failed.");
    if (err instanceof UserPushBlockedError) {
      return { kind: "blocked", conditions: err.conditions };
    }

    const msg = err instanceof Error ? err.message : String(err);

    if (isRemoteError(msg)) return { kind: "no-remote" };

    if (!isDivergentPushError(msg)) return { kind: "failed", error: err };

    // Conflict requires an interactive choice. Under `--yes`, auto-accept the
    // safe default (merge); force-push is destructive and never auto-selected.
    // Without `--yes`, non-interactive environments surface an explicit
    // discriminant so callers can render a dedicated "save preserved; push
    // skipped" banner instead of a generic failure.
    const action: ConflictAction = yes === true
      ? "merge"
      : await promptConflictResolution(output);

    if (action === "non-interactive") return { kind: "failed-nontty-conflict" };
    if (action === "cancel") return { kind: "cancelled" };

    try {
      if (action === "force") {
        await runWithSpinner(
          output,
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
        output,
        "Fetching remote notes...",
        () => runUserFetch({ io, identity, force: true }),
        "Fetch complete.",
      );
      await runWithSpinner(
        output,
        "Saving current user directory on top...",
        () => runUserSave({ cwd, io, identity }),
        "Save complete.",
      );
      await runWithSpinner(
        output,
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

/** Prompt result discriminator — `non-interactive` covers the no-TTY fallback. */
type ConflictAction = "force" | "merge" | "cancel" | "non-interactive";

async function promptConflictResolution(output: SyncOutput): Promise<ConflictAction> {
  if (isNonInteractiveEnvironment()) return "non-interactive";

  output.log.warn("Push rejected — local and remote notes conflict (both moved since common ancestor).");
  const action = await output.select<"force" | "merge" | "cancel">({
    message: "How would you like to resolve this?",
    options: [
      { value: "force", label: "Force push (overwrite remote with local)" },
      { value: "merge", label: "Merge: rebase my save onto remote, then push" },
      { value: "cancel", label: "Cancel" },
    ],
    jsonModeDefault: "cancel",
  });
  if (output.isCancel(action)) return "cancel";
  return action as "force" | "merge" | "cancel";
}

async function warnIfLocalNoteStaleForHead(
  output: SyncOutput,
  options: Pick<PushWithInteractiveRecoveryOptions, "cwd" | "io" | "identity">,
): Promise<void> {
  const { cwd, io, identity } = options;
  const { note } = await findNearestUserNote({ cwd, io, identity });
  if (!note?.reachableFromHead || note.ancestorDistance <= 0) return;

  output.log.warn(
    `Latest local user note is attached to a commit ${note.ancestorDistance} commit(s) behind HEAD.`,
  );
  output.log.info("Run `arc user save` or `arc sync` before relying on handoff.");
}
