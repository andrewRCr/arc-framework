/**
 * The errand orphan state-ref — its name, its IO types, and the errand-flavored
 * tree-commit write. The key-agnostic tree-commit mechanism lives in the shared
 * {@link module:lib/git/ref-tree}; this module binds it to
 * `refs/arc/user/{identity}/errands`, where the tree's keys are errand slugs.
 *
 * @module
 */

import {
  readRefTip,
  readTreeEntries,
  hashBlob,
  writeTreeCommit as writeRefTreeCommit,
} from "../git/ref-tree.js";
import type { GitExec, GitExecInput } from "../git/exec.js";

export { readRefTip, readTreeEntries, hashBlob };
export type { GitExecInput };

/** Orphan state-ref namespace for errand records; `{identity}` is appended. */
const ERRAND_REF_PREFIX = "refs/arc/user";

/** The full errand state-ref for an identity. */
export function errandsRef(identity: string): string {
  return `${ERRAND_REF_PREFIX}/${identity}/errands`;
}

/** The injected git seams an errand-ref *read* runs over — no stdin writer needed. */
export interface ErrandRecordReadIO {
  /** Standard executor for reads (`rev-parse`, `ls-tree`, `cat-file`). */
  exec: GitExec;
  /** The identity whose errand ref is read. */
  identity: string;
}

/** The injected git seams an errand-ref *write* runs over — adds the stdin-fed builder. */
export interface ErrandRecordIO extends ErrandRecordReadIO {
  /** Stdin-fed executor for blob/tree construction (`hash-object`, `mktree`). */
  execInput: GitExecInput;
}

/**
 * Build a tree from the given slug→blob entries, commit it onto `parents`, and
 * move the identity's errand ref to the new commit — the shared tree-commit
 * mechanism bound to {@link errandsRef}. `expectedOldTip` threads the
 * compare-and-swap (the tip the caller read, or `null` to require an absent ref).
 *
 * @returns The new commit sha.
 */
export async function writeTreeCommit(
  io: ErrandRecordIO,
  entries: Map<string, string>,
  message: string,
  parents: string[],
  expectedOldTip: string | null,
): Promise<string> {
  return writeRefTreeCommit(io, errandsRef(io.identity), entries, message, parents, expectedOldTip);
}
