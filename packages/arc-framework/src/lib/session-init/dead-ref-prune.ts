/**
 * Dead-ref prune — the session-init hygiene backstop.
 *
 * A reviewed-lane errand PR merges out-of-session and auto-delete-head removes
 * the remote branch on the host. The errand's in-session branch teardown never
 * runs for that case, so `origin/chore/<slug>` lingers as a stale
 * remote-tracking ref. A broad `git fetch --prune` at session start drops those
 * dead refs, keeping the local ref namespace clean.
 *
 * This is hygiene only, decoupled from classification: the in-flight oracle is
 * prune-independent — it intersects local refs with live `ls-remote` membership,
 * so it never miscounts a dead ref regardless of whether this ran. Best-effort
 * by design — an offline or failed fetch leaves the last-known refs in place and
 * never throws.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";

/**
 * Best-effort `git fetch --prune origin`. Never throws: an offline or failed
 * fetch is swallowed, leaving the last-known remote-tracking refs in place.
 *
 * @param exec - Injected git executor.
 */
export async function pruneRemoteTrackingRefs(exec: GitExec): Promise<void> {
  try {
    await exec("git", ["fetch", "--prune", "origin"]);
  } catch {
    // Offline / no remote — degrade to the last-known local remote-tracking refs.
  }
}
