/**
 * Generic git plumbing for an ARC orphan state-ref stored as a tree of
 * content-addressed blobs keyed by an arbitrary name — the shared mechanism
 * behind the errand record ref and the sibling sync-state ref.
 *
 * A state-ref under `refs/arc/` carries no working-tree projection: entries are
 * read and written straight through git plumbing (`ls-tree`, `hash-object`,
 * `mktree`, `commit-tree`, `update-ref`). Per-key ownership is what lets two
 * machines' writes union cleanly — each owns its own key. The ref name and the
 * per-domain record schema live with each consumer; only the key-agnostic
 * mechanism lives here.
 *
 * Reads run over the standard {@link GitExec}; blob and tree construction need
 * stdin, so they take the {@link GitExecInput} seam — the same split the
 * user-notes path uses between its `exec` and its spawn-backed note writer.
 *
 * @module
 */

import type { GitExec, GitExecInput } from "./exec.js";

/** The injected git seams a tree-commit *write* runs over — reads plus the stdin-fed builder. */
export interface RefTreeWriteIO {
  /** Standard executor for reads and ref moves (`rev-parse`, `ls-tree`, `commit-tree`, `update-ref`). */
  exec: GitExec;
  /** Stdin-fed executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
}

/** Current commit a ref points at, or `null` when it does not resolve. */
export async function readRefTip(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", ref]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** key → blob-sha entries in a ref's tree, or empty when the ref is absent. */
export async function readTreeEntries(exec: GitExec, ref: string): Promise<Map<string, string>> {
  const entries = new Map<string, string>();
  let stdout: string;
  try {
    ({ stdout } = await exec("git", ["ls-tree", ref]));
  } catch {
    return entries;
  }
  for (const line of stdout.split("\n")) {
    // `<mode> SP <type> SP <sha> TAB <name>`
    const match = /^\d{6} blob ([0-9a-f]{40}|[0-9a-f]{64})\t(.+)$/u.exec(line.trimEnd());
    if (match) {
      const [, sha, key] = match;
      if (sha && key) entries.set(key, sha);
    }
  }
  return entries;
}

/** Hash content into the object store as a blob, returning its sha. */
export async function hashBlob(execInput: GitExecInput, content: string): Promise<string> {
  const stdout = await execInput(["hash-object", "-w", "--stdin"], content);
  return stdout.trim();
}

/**
 * Build a tree from the given key→blob entries, commit it onto `parents`, and
 * move `ref` to the new commit. `parents` is the set of commits the new one
 * descends from — the current tip for a linear write, or both the local and the
 * fetched-remote tip for a reconcile so the follow-up push fast-forwards. An
 * empty `parents` mints the ref's first (root) commit.
 *
 * The final ref move is a **compare-and-swap**: `expectedOldTip` is the tip the
 * caller read at the start of its read-modify-write, threaded through to git's
 * `update-ref <ref> <new> <old>` old-value check. The move rejects (git errors)
 * if canonical advanced since that read, so a same-machine writer racing the same
 * ref cannot silently overwrite the other's commit. A `null` `expectedOldTip`
 * uses git's zero-old-value form (`update-ref <ref> <new> ""`) — the ref must not
 * yet exist, so the create-from-absent case fails rather than clobbering a ref a
 * concurrent writer just minted.
 *
 * @param io - Injected git seams (reads plus the stdin-fed builder).
 * @param ref - The ref to move to the new commit.
 * @param entries - The key → blob-sha entries the tree carries.
 * @param message - The commit message.
 * @param parents - The new commit's parents (empty for the root commit).
 * @param expectedOldTip - The tip the ref is expected to hold for the CAS, or `null` to require an absent ref.
 * @returns The new commit sha.
 */
export async function writeTreeCommit(
  io: RefTreeWriteIO,
  ref: string,
  entries: Map<string, string>,
  message: string,
  parents: string[],
  expectedOldTip: string | null,
): Promise<string> {
  const treeLines = [...entries.entries()].map(([key, sha]) => `100644 blob ${sha}\t${key}`);
  // Empty entries (the last record removed) must feed `mktree` zero bytes — a lone
  // trailing newline reads as a blank line and `mktree` rejects it outside batch mode.
  const treeInput = treeLines.length === 0 ? "" : `${treeLines.join("\n")}\n`;
  const treeSha = (await io.execInput(["mktree"], treeInput)).trim();

  const commitArgs = [
    "commit-tree",
    treeSha,
    ...parents.flatMap((parent) => ["-p", parent]),
    "-m",
    message,
  ];
  const { stdout: commitSha } = await io.exec("git", commitArgs);
  const sha = commitSha.trim();

  // Compare-and-swap: an absent expected tip maps to git's empty old-value form,
  // which requires the ref not to exist; otherwise the move requires the ref to
  // still hold the tip the caller read. Either mismatch rejects with a git error.
  await io.exec("git", ["update-ref", ref, sha, expectedOldTip ?? ""]);
  return sha;
}
