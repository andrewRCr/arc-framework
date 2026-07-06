/**
 * The sibling sync-state ref — its name, IO types, and keyed entry
 * read/write/transport primitives. The cross-machine companion to the
 * user-notes ref.
 *
 * The key-agnostic tree-commit mechanism lives in the shared
 * {@link module:lib/git/ref-tree}; this module binds it to
 * `refs/arc/user/{identity}/sync-state`, where typed marker entries are keyed
 * by notes-push intent. Distinct keys union cleanly, so concurrent writes
 * preserve each other. The ref lives under `refs/arc/`, so `git notes` never
 * operates on it.
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
 * The base name for the temp tracking ref the remote sync-state ref is fetched
 * into before a reconcile reads it — kept distinct from the local ref so a fetch
 * never disturbs this machine's own writes. A reconcile appends a per-call
 * {@link uniqueRefToken} so concurrent same-machine reconciles never share one.
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

/** Every entry in the ref's tree, keyed by entry name → blob-sha; empty when the ref is absent. */
export async function readEntries(io: SyncStateRefReadIO): Promise<Map<string, string>> {
  return readTreeEntries(io.exec, syncStateRef(io.identity));
}

/**
 * Read one raw entry blob, or `null` when the ref or the key is
 * absent. The blob is opaque here — the typed marker schema parses it.
 *
 * @param io - Injected read seam and identity.
 * @param entryKey - The entry key in the ref's tree.
 * @returns The entry's blob content, or `null` when missing.
 */
export async function readEntry(io: SyncStateRefReadIO, entryKey: string): Promise<string | null> {
  const ref = syncStateRef(io.identity);
  try {
    const { stdout } = await io.exec("git", ["cat-file", "-p", `${ref}:${entryKey}`]);
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Write (create or overwrite) one entry, keyed by `entryKey`. Builds
 * a tree carrying every existing entry plus this one, commits it onto the ref's
 * prior tip, and moves the ref — touching only this key, so a
 * concurrent sibling's entry is preserved. No working-tree file is touched.
 *
 * @param io - Injected git seams (including the stdin-fed writer) and identity.
 * @param entryKey - The entry key to write.
 * @param content - The serialized entry blob to store.
 * @returns The new commit sha.
 */
export async function writeEntry(
  io: SyncStateRefIO,
  entryKey: string,
  content: string,
): Promise<string> {
  const ref = syncStateRef(io.identity);
  const blobSha = await hashBlob(io.execInput, content);
  const outcome = await writeTreeWithCasRetry(io, ref, `sync-state: write ${entryKey}`, (entries) => {
    entries.set(entryKey, blobSha);
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
 * Fetch origin's sync-state ref into the given tracking ref, force-updating it.
 * The orphan ref's tips share no ancestry across machines, so the force refspec
 * is required; the tracking ref is the reconcile input the merge reads. The
 * caller supplies the tracking ref so a reconcile can pass a per-call unique one.
 *
 * @param io - Injected git seams and identity.
 * @param incoming - The tracking ref to fetch into.
 */
export async function fetchSyncStateRef(io: SyncStateRefReadIO, incoming: string): Promise<void> {
  const ref = syncStateRef(io.identity);
  // Never let the destination be the live ref — a `+ref:ref` refspec would force-reset
  // this machine's own sync-state. Reconcile callers pass a per-call unique tracking ref.
  if (incoming === ref) {
    throw new Error(`fetchSyncStateRef: refusing to fetch into the live ref ${ref}`);
  }
  await io.exec("git", ["fetch", "origin", `+${ref}:${incoming}`]);
}
