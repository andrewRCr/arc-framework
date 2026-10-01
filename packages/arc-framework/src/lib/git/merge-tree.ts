/** Shared byte-preserving execution and parsing for Git merge-tree composition. */

import type { RawGitExec } from "./exec.js";
import { gitFailureText, normalizeGitRejection } from "./process-error.js";
import { supportsMergeTreeWriteTree } from "./merge-tree-capability.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const objectId = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export type MergeTreeCompositionResult =
  | { state: "clean"; tree: string }
  | { state: "conflict"; tree: string; paths: string[] }
  | {
      state: "unavailable";
      reason: "merge-tree-write-tree-unsupported" | "malformed-output" | "execution-failed";
      detail: string;
    };

export interface ReadMergeTreeCompositionOptions {
  exec: RawGitExec;
  left: string;
  right: string;
  mergeBase?: string;
}

function fields(bytes: Uint8Array): string[] | null {
  try {
    const decoded = decoder.decode(bytes);
    if (decoded.includes("\0")) {
      if (!decoded.endsWith("\0")) return null;
      return decoded.split("\0").filter(Boolean);
    }
    const [first] = decoded.trim().split(/\n/u);
    return first === undefined ? [] : [first];
  } catch {
    return null;
  }
}

function parseClean(bytes: Uint8Array): { state: "clean"; tree: string } | null {
  const parsed = fields(bytes);
  const [tree] = parsed ?? [];
  return tree !== undefined && objectId.test(tree) ? { state: "clean", tree } : null;
}

function parseConflict(bytes: Uint8Array): { state: "conflict"; tree: string; paths: string[] } | null {
  const parsed = fields(bytes);
  const [tree, ...rawPaths] = parsed ?? [];
  if (tree === undefined || !objectId.test(tree)) return null;
  const paths = [...new Set(rawPaths)].sort();
  return paths.length === 0 ? null : { state: "conflict", tree, paths };
}

function sanitizedFailureDetail(error: unknown): string {
  const detail = gitFailureText(error).replace(/\s+/gu, " ").trim();
  return (detail === "" ? "Git merge-tree execution failed." : detail).slice(0, 1_024);
}

/** Compose two exact commits without touching the index or worktree. */
export async function readMergeTreeComposition(
  options: ReadMergeTreeCompositionOptions,
): Promise<MergeTreeCompositionResult> {
  if (!await supportsMergeTreeWriteTree(options.exec, options.left)) {
    return {
      state: "unavailable",
      reason: "merge-tree-write-tree-unsupported",
      detail: "Git merge-tree write-tree capability is unavailable.",
    };
  }
  const args = [
    "merge-tree",
    "--write-tree",
    ...(options.mergeBase === undefined ? [] : ["--merge-base", options.mergeBase]),
    "--name-only",
    "-z",
    "--no-messages",
    options.left,
    options.right,
  ];
  try {
    const parsed = parseClean((await options.exec(args, { objectAccess: "local-only" })).stdout);
    return parsed ?? {
      state: "unavailable",
      reason: "malformed-output",
      detail: "Git merge-tree returned malformed output.",
    };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    if (failure.kind === "nonzero-exit" && failure.exitCode === 1) {
      const parsed = parseConflict(Buffer.from(failure.stdout, "latin1"));
      return parsed ?? {
        state: "unavailable",
        reason: "malformed-output",
        detail: "Git merge-tree returned malformed conflict output.",
      };
    }
    return {
      state: "unavailable",
      reason: "execution-failed",
      detail: sanitizedFailureDetail(error),
    };
  }
}
