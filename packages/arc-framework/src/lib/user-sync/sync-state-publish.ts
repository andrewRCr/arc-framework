/**
 * Publish this machine's outstanding notes-push intent to the sibling
 * sync-state ref — written and pushed *ahead* of the user-notes leg so a
 * landed marker reads "about to push notes for HEAD X" to a sibling clone.
 *
 * This is the producer-side composition over the primitives built in earlier
 * phases: resolve the machine-id ({@link getOrCreateMachineId}), stamp the
 * marker payload (HEAD as `lastAttemptedCommit`, the planned notes export target
 * as the self-invalidation `intent`), write this machine's entry
 * ({@link writeSyncStateMarker}), and push it with the per-machine union
 * reconcile ({@link reconcileSyncStatePush}).
 *
 * Degrade-safe by construction: it never throws, and the caller (the paired
 * push) treats every outcome as best-effort. A successful notes push later
 * self-invalidates the entry by comparison (origin's notes ref reaches the
 * recorded `intent`), so the success path needs no follow-up clear. When the
 * notes leg fails the entry stays `live` until the push lands or the TTL ages
 * it out.
 *
 * @module
 */

import { readRefTip } from "../git/ref-tree.js";
import { getOrCreateMachineId } from "./sync-state.js";
import { reconcileSyncStatePush } from "./sync-state-merge.js";
import { writeSyncStateMarker, type SyncStateMarker } from "./sync-state-marker.js";
import type { GitExec, GitExecInput } from "../git/exec.js";
import type { CoreIO } from "../types.js";

/** Notes ref prefix; mirrors the notes-ref module's internal `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";

/** Why a publish attempt produced no remote write — all non-fatal. */
export type PublishSkipReason = "no-notes-ref" | "no-head" | "no-remote" | "nothing-to-push";

/**
 * Outcome of {@link publishSyncStateMarker}. Every variant is non-fatal to the
 * surrounding push — `failed` carries the error for diagnostics but the caller
 * does not act on it.
 */
export type PublishSyncStateMarkerOutcome =
  | { kind: "published" }
  | { kind: "reconciled" }
  | { kind: "skipped"; reason: PublishSkipReason }
  | { kind: "failed"; error: Error };

/** Inputs for {@link publishSyncStateMarker}. */
export interface PublishSyncStateMarkerInput {
  /** Repository root — the machine-id home (`.sync-state.json`). */
  cwd: string;
  /** Core I/O seam; `io.exec` runs the ref reads and the push. */
  io: CoreIO;
  /** Stdin-fed git executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
  /** Identity whose sync-state ref is written. */
  identity: string;
  /**
   * The HEAD the notes push is advancing for. Resolved from `git rev-parse HEAD`
   * when omitted; injectable so callers that already hold the sha avoid a probe.
   */
  lastAttemptedCommit?: string;
  /** Attempt timestamp stamped on the marker. Defaults to the wall clock. */
  now?: string;
  /**
   * Notes-ref target this publish is about to attempt. When omitted, the local
   * notes-ref tip is used for the single-leg full-ref notes push path.
   */
  intent?: string;
}

/**
 * Write and push this machine's sync-state marker entry, capturing the
 * outstanding notes-push intent.
 *
 * Skips (no write, no push) when the local notes ref is absent (nothing to
 * advance toward) or HEAD cannot be resolved. Otherwise stamps the marker,
 * writes this machine's key, and reconcile-pushes it. Never throws — a remote
 * push refusal (fetch-only clone, ref-level ACL), an unreachable remote, or any
 * git error resolves to `failed` / `skipped`, so the caller's notes leg
 * proceeds exactly as today.
 *
 * @param input - See {@link PublishSyncStateMarkerInput}.
 * @returns The non-fatal publish outcome.
 */
export async function publishSyncStateMarker(
  input: PublishSyncStateMarkerInput,
): Promise<PublishSyncStateMarkerOutcome> {
  const { cwd, io, execInput, identity } = input;
  try {
    const intent = input.intent ?? await readLocalNotesRefTip(io.exec, identity);
    if (intent === null) return { kind: "skipped", reason: "no-notes-ref" };

    const lastAttemptedCommit = input.lastAttemptedCommit ?? (await readHead(io.exec));
    if (lastAttemptedCommit === null) return { kind: "skipped", reason: "no-head" };

    const machineId = await getOrCreateMachineId(cwd, io, identity);
    const marker: SyncStateMarker = {
      version: 1,
      machineId,
      lastAttemptedCommit,
      attemptTimestamp: input.now ?? new Date().toISOString(),
      intent,
    };

    const refIo = { exec: io.exec, execInput, identity };
    await writeSyncStateMarker(refIo, marker);
    const outcome = await reconcileSyncStatePush(refIo, machineId);
    switch (outcome.kind) {
      case "pushed":
        return { kind: "published" };
      case "reconciled":
        return { kind: "reconciled" };
      case "no-remote":
        return { kind: "skipped", reason: "no-remote" };
      case "noop":
        return { kind: "skipped", reason: "nothing-to-push" };
      case "failed":
        return { kind: "failed", error: outcome.error };
    }
  } catch (err) {
    return { kind: "failed", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/** Origin-bound target of a full-ref notes push: this machine's local notes-ref tip, or `null` when absent. */
async function readLocalNotesRefTip(exec: GitExec, identity: string): Promise<string | null> {
  return readRefTip(exec, `${USER_NOTES_REF}/${identity}`);
}

/** Current HEAD commit sha, or `null` when unresolvable (detached without a commit, fresh repo). */
async function readHead(exec: GitExec): Promise<string | null> {
  return readRefTip(exec, "HEAD");
}
