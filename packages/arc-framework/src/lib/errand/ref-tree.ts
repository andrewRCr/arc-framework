/**
 * Low-level git plumbing for the errand orphan state-ref — the shared substrate
 * the record primitives and the per-slug tree-merge both build on.
 *
 * The ref, `refs/arc/user/{identity}/errands`, holds a tree of per-slug blobs.
 * Reads (`ls-tree`, `rev-parse`) run over the standard {@link GitExec}; tree and
 * blob construction (`hash-object --stdin`, `mktree`) need stdin, so they take
 * the {@link GitExecInput} seam — the same split the user-notes path uses
 * between its `exec` and its spawn-backed note writer.
 *
 * @module
 */

import type { GitExec, GitExecInput } from "../git/exec.js";

export type { GitExecInput };

/** Orphan state-ref namespace for errand records; `{identity}` is appended. */
const ERRAND_REF_PREFIX = "refs/arc/user";

/** The full errand state-ref for an identity. */
export function errandsRef(identity: string): string {
  return `${ERRAND_REF_PREFIX}/${identity}/errands`;
}

/** The injected git seams an errand-ref operation runs over. */
export interface ErrandRecordIO {
  /** Standard executor for reads and non-stdin writes (`commit-tree`, `update-ref`). */
  exec: GitExec;
  /** Stdin-fed executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
  /** The identity whose errand ref is read or written. */
  identity: string;
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

/** Slug → blob-sha entries in a ref's tree, or empty when the ref is absent. */
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
    const match = /^\d{6} blob ([0-9a-f]{40})\t(.+)$/u.exec(line.trimEnd());
    if (match) {
      const [, sha, slug] = match;
      if (sha && slug) entries.set(slug, sha);
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
 * Build a tree from the given slug→blob entries, commit it onto `parents`, and
 * move the identity's errand ref to the new commit. `parents` is the set of
 * commits the new one descends from — the current tip for a linear write, or
 * both the local and the fetched-remote tip for a reconcile so the follow-up
 * push fast-forwards. An empty `parents` mints the ref's first (root) commit.
 *
 * @returns The new commit sha.
 */
export async function writeTreeCommit(
  io: ErrandRecordIO,
  entries: Map<string, string>,
  message: string,
  parents: string[],
): Promise<string> {
  const treeInput = [...entries.entries()]
    .map(([slug, sha]) => `100644 blob ${sha}\t${slug}`)
    .join("\n");
  const treeSha = (await io.execInput(["mktree"], `${treeInput}\n`)).trim();

  const commitArgs = [
    "commit-tree",
    treeSha,
    ...parents.flatMap((parent) => ["-p", parent]),
    "-m",
    message,
  ];
  const { stdout: commitSha } = await io.exec("git", commitArgs);
  const sha = commitSha.trim();

  await io.exec("git", ["update-ref", errandsRef(io.identity), sha]);
  return sha;
}
