/**
 * Interactive push with divergence recovery.
 *
 * Wraps `runUserPush` with the "remote diverged" recovery flow used by both
 * `arc user push` and `arc sync`. Returns a discriminated result so callers
 * can render context-appropriate messaging without the helper knowing about
 * its embedding.
 *
 * @module
 */

import * as p from "@clack/prompts";

import { runUserPush, runUserFetch } from "../commands/user.js";
import type { UserIOContext } from "../commands/user.js";
import { isNonInteractiveEnvironment, isRemoteError, runWithSpinner } from "./shared.js";

/** Outcome of an interactive push attempt. */
export type PushResult =
  | { kind: "ok" }
  | { kind: "ok-recovered"; via: "force" | "pull-then-push" }
  | { kind: "cancelled" }
  | { kind: "no-remote" }
  | { kind: "failed"; error: unknown };

function isDivergentPushError(msg: string): boolean {
  return msg.includes("non-fast-forward") || msg.includes("[rejected]");
}

/**
 * Push user notes with interactive recovery on divergence.
 *
 * On non-fast-forward rejection, prompts the user to force-push, pull-first,
 * or cancel. Non-divergence errors are returned as `{ kind: "failed" }` or
 * `{ kind: "no-remote" }` for the caller to render.
 */
export async function pushWithInteractiveRecovery(
  io: UserIOContext,
  identity: string,
): Promise<PushResult> {
  try {
    await runWithSpinner(
      "Pushing user notes...",
      () => runUserPush({ io, identity }),
      "Push complete.",
    );
    return { kind: "ok" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (isRemoteError(msg)) return { kind: "no-remote" };

    if (!isDivergentPushError(msg)) return { kind: "failed", error: err };

    // Divergence requires an interactive choice. In non-interactive environments,
    // surface as a failure so the caller can guide the user to re-run interactively.
    if (isNonInteractiveEnvironment()) return { kind: "failed", error: err };

    p.log.warn("Push rejected — remote has diverged from local notes.");
    const action = await p.select({
      message: "How would you like to resolve this?",
      options: [
        { value: "force", label: "Force push (overwrite remote with local)" },
        { value: "pull", label: "Pull first (overwrite local with remote)" },
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
          () => runUserPush({ io, identity, force: true }),
          "Force push complete.",
        );
        return { kind: "ok-recovered", via: "force" };
      }

      // Pull first (force — we know refs have diverged), then retry push
      await runWithSpinner(
        "Pulling user notes...",
        () => runUserFetch({ io, identity, force: true }),
        "Pull complete.",
      );
      await runWithSpinner(
        "Pushing user notes...",
        () => runUserPush({ io, identity }),
        "Push complete.",
      );
      return { kind: "ok-recovered", via: "pull-then-push" };
    } catch (recoveryErr) {
      return { kind: "failed", error: recoveryErr };
    }
  }
}
