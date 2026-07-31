/** Exact, byte-preserving Git object readers shared by decomposition authorities. */

import { digestBytes } from "../canonical/canonical-json.js";
import type { GitExec } from "../git/exec.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { V3ManagedPathResult } from "./decompose-v3-receipt.js";

export interface GitCommit {
  head: string;
  tree: string;
  parents: string[];
}

export interface GitTreeEntry {
  mode: string;
  type: string;
  oid: string;
}

export interface GitDecompositionObjectReaderDependencies {
  exec: GitExec;
  readBlob(oid: string): Promise<Uint8Array>;
}

export type GitAncestryResult = "ancestor" | "not-ancestor" | "unresolvable";

const COMMIT_LINE = /^([0-9a-f]{40}|[0-9a-f]{64})(?: ([0-9a-f ]+))?$/u;
const TREE_LINE = /^([0-7]{6}) ([^ ]+) ([0-9a-f]+)\t(.+)$/u;

/** Resolve a ref to one exact commit object. */
export async function resolveCommit(exec: GitExec, ref: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Read one exact commit's tree and ordered parent list. */
export async function readCommit(exec: GitExec, head: string): Promise<GitCommit | null> {
  try {
    const [{ stdout: line }, { stdout: tree }] = await Promise.all([
      exec("git", ["rev-list", "--parents", "-n", "1", head]),
      exec("git", ["rev-parse", `${head}^{tree}`]),
    ]);
    const match = COMMIT_LINE.exec(line.trim());
    const treeId = tree.trim();
    if (match === null || match[1] !== head || treeId === "") return null;
    return {
      head,
      tree: treeId,
      parents: match[2]?.split(" ").filter(Boolean) ?? [],
    };
  } catch {
    return null;
  }
}

/**
 * Read one exact tree entry.
 *
 * @returns `null` for an absent path, `false` for a malformed, duplicate, or unreadable entry, or the exact entry
 */
export async function readTreeEntry(
  exec: GitExec,
  ref: string,
  path: string,
): Promise<GitTreeEntry | null | false> {
  try {
    const { stdout } = await exec("git", ["ls-tree", "-z", ref, "--", `:(literal)${path}`]);
    if (stdout === "") return null;
    const records = stdout.split("\0").filter(Boolean);
    if (records.length !== 1) return false;
    const match = TREE_LINE.exec(records[0] ?? "");
    if (match === null
      || match[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] !== path) return false;
    return { mode: match[1], type: match[2], oid: match[3] };
  } catch {
    return false;
  }
}

/** Test one exact path against a canonical absent-or-regular-file state. */
export async function stateMatches(
  deps: GitDecompositionObjectReaderDependencies,
  ref: string,
  path: string,
  expected: V3ManagedPathResult["before"],
): Promise<boolean> {
  const entry = await readTreeEntry(deps.exec, ref, path);
  if (expected.kind === "absent") return entry === null;
  if (entry === null || entry === false || entry.type !== "blob" || entry.mode !== expected.mode) return false;
  try {
    return digestBytes(await deps.readBlob(entry.oid)) === expected.contentDigest;
  } catch {
    return false;
  }
}

/** Read the byte-sorted path set changed between two exact commits. */
export async function changedPaths(exec: GitExec, before: string, after: string): Promise<string[] | null> {
  try {
    const { stdout } = await exec("git", [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      "-z",
      before,
      after,
    ]);
    return stdout.split("\0").filter(Boolean).sort((left, right) =>
      Buffer.compare(Buffer.from(left), Buffer.from(right)));
  } catch {
    return null;
  }
}

/** Distinguish a proven ancestry relation, a valid negative, and unreadable objects. */
export async function readAncestry(
  exec: GitExec,
  ancestor: string,
  descendant: string,
): Promise<GitAncestryResult> {
  const [resolvedAncestor, resolvedDescendant] = await Promise.all([
    resolveCommit(exec, ancestor),
    resolveCommit(exec, descendant),
  ]);
  if (resolvedAncestor !== ancestor || resolvedDescendant !== descendant) return "unresolvable";
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await exec("git", args);
    return "ancestor";
  } catch (error) {
    const normalized = normalizeGitRejection(error, { command: "git", args });
    return normalized.kind === "nonzero-exit" && normalized.exitCode === 1
      ? "not-ancestor"
      : "unresolvable";
  }
}
