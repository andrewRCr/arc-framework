/**
 * Content-level three-way merge wrapper.
 *
 * Wraps the file-path-based `gitMergeFile()` with a content-string API,
 * temp file lifecycle management, and fast-path optimizations for the
 * common cases where one side is unchanged.
 *
 * @module
 */

import type { MergeResult } from "./git.js";

/** A file-path-based merge function matching gitMergeFile's signature. */
export type FileMergeFn = (
  current: string,
  base: string,
  other: string,
) => Promise<MergeResult>;

/** Merge outcome status. */
export type MergeStatus = "clean" | "conflict" | "unchanged";

/** Result of a content-level merge operation. */
export interface ContentMergeResult {
  content: string;
  status: MergeStatus;
}

/**
 * Three-way merge operating on content strings.
 *
 * Fast paths avoid calling git when one or both sides are unchanged:
 * - `base === current` (no adopter changes): return `updated`
 * - `base === updated` (no framework changes): return `current`
 * - `current === updated` (both changed identically, or neither changed): return `current`
 *
 * For the general case, delegates to the injected merge function.
 *
 * @param merge - File-path-based merge function (e.g., bound `gitMergeFile`)
 * @param current - Current file content (adopter's version)
 * @param base - Common ancestor content (pristine from last install/update)
 * @param updated - New framework content
 * @returns Merged content and status
 */
export async function mergeFileContents(
  merge: FileMergeFn,
  current: string,
  base: string,
  updated: string,
): Promise<ContentMergeResult> {
  // Fast path: no adopter changes — take the new framework version
  if (base === current) {
    return { content: updated, status: "clean" };
  }

  // Fast path: no framework changes — keep adopter's version
  if (base === updated) {
    return { content: current, status: "unchanged" };
  }

  // Fast path: both sides identical (same change, or neither changed relative to each other)
  if (current === updated) {
    return { content: current, status: "unchanged" };
  }

  // General case: both sides changed differently — delegate to git merge-file
  const { content, hasConflicts } = await merge(current, base, updated);
  return {
    content,
    status: hasConflicts ? "conflict" : "clean",
  };
}
