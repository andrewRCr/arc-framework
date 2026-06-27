/**
 * The sibling sync-state ref — its name, IO types, and the per-machine entry
 * read/write/transport primitives. The cross-machine companion to the
 * user-notes ref.
 *
 * The key-agnostic tree-commit mechanism lives in the shared
 * {@link module:lib/git/ref-tree}; this module binds it to
 * `refs/arc/user/{identity}/sync-state`, where the tree's keys are machine ids.
 * Per-machine ownership is what lets concurrent cross-machine writes union
 * cleanly — each machine writes only its own key; the union-merge reconcile
 * that depends on it lands in a later phase. The ref lives under `refs/arc/`,
 * so `git notes` never operates on it.
 *
 * @module
 */

import { hashBlob, readTreeEntries } from "../git/ref-tree.js";
import { writeTreeWithCasRetry } from "./cas-retry.js";
import type { GitExec, GitExecInput } from "../git/exec.js";

export type { GitExec, GitExecInput };

/** Sync-state ref namespace; `{identity}` is appended. */
const SYNC_STATE_REF_PREFIX = "refs/arc/user";

/** The full sync-state ref for an identity. */
export function syncStateRef(identity: string): string {
  return `${SYNC_STATE_REF_PREFIX}/${identity}/sync-state`;
}

/**
 * The temp tracking ref the remote sync-state ref is fetched into before a
 * reconcile reads it — kept distinct from the local ref so a fetch never
 * disturbs this machine's own writes.
 */
export function incomingSyncStateRef(ref: string): string {
  return `${ref}__incoming`;
}

/** The injected git seams a sync-state-ref *read* runs over — no stdin writer needed. */
export interface SyncStateRefReadIO {
  /** Standard executor for reads (`rev-parse`, `ls-tree`, `cat-file`). */
  exec: GitExec;
  /** The identity whose sync-state ref is read. */
  identity: string;
}

/** The injected git seams a sync-state-ref *write* runs over — adds the stdin-fed builder. */
export interface SyncStateRefIO extends SyncStateRefReadIO {
  /** Stdin-fed executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
}

/** Every machine's entry in the ref's tree, keyed by `machineId` → blob-sha; empty when the ref is absent. */
export async function readEntries(io: SyncStateRefReadIO): Promise<Map<string, string>> {
  return readTreeEntries(io.exec, syncStateRef(io.identity));
}

/**
 * Read one machine's raw entry blob, or `null` when the ref or the key is
 * absent. The blob is opaque here — the typed marker schema parses it.
 *
 * @param io - Injected read seam and identity.
 * @param machineId - The key identifying the machine's entry in the ref's tree.
 * @returns The entry's blob content, or `null` when missing.
 */
export async function readEntry(io: SyncStateRefReadIO, machineId: string): Promise<string | null> {
  const ref = syncStateRef(io.identity);
  try {
    const { stdout } = await io.exec("git", ["cat-file", "-p", `${ref}:${machineId}`]);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Write (create or overwrite) one machine's entry, keyed by `machineId`. Builds
 * a tree carrying every existing entry plus this one, commits it onto the ref's
 * prior tip, and moves the ref — touching only the writer's own key, so a
 * concurrent sibling's entry is preserved. No working-tree file is touched.
 *
 * @param io - Injected git seams (including the stdin-fed writer) and identity.
 * @param machineId - The writing machine's id; its tree key.
 * @param content - The serialized entry blob to store.
 * @returns The new commit sha.
 */
export async function writeEntry(
  io: SyncStateRefIO,
  machineId: string,
  content: string,
): Promise<string> {
  const ref = syncStateRef(io.identity);
  const blobSha = await hashBlob(io.execInput, content);
  const outcome = await writeTreeWithCasRetry(io, ref, `sync-state: write ${machineId}`, (entries) => {
    entries.set(machineId, blobSha);
    return entries;
  });
  if (outcome.kind === "failed") throw outcome.error;
  return outcome.sha;
}

/**
 * Push the sync-state ref to origin. A plain push — the union-merge reconcile
 * that wraps it around a concurrent-remote non-fast-forward lands in a later
 * phase.
 *
 * @param io - Injected git seams and identity.
 */
export async function pushSyncStateRef(io: SyncStateRefReadIO): Promise<void> {
  await io.exec("git", ["push", "origin", syncStateRef(io.identity)]);
}

/**
 * Fetch origin's sync-state ref into the local tracking ref, force-updating it.
 * The orphan ref's tips share no ancestry across machines, so the force refspec
 * is required; the tracking ref is the reconcile input a later phase merges.
 *
 * @param io - Injected git seams and identity.
 */
export async function fetchSyncStateRef(io: SyncStateRefReadIO): Promise<void> {
  const ref = syncStateRef(io.identity);
  await io.exec("git", ["fetch", "origin", `+${ref}:${incomingSyncStateRef(ref)}`]);
}
