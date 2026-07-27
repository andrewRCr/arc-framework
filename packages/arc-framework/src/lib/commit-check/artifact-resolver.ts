/** Filesystem-backed resolver for Context trailer artifact references. */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  CommitCheckArtifactFamily,
  CommitCheckArtifactResolution,
  CommitCheckArtifactResolver,
} from "./types.js";

/** One family search root and whether filename match may recurse under it. */
interface SearchRoot {
  /** Path relative to `.arc/`. */
  path: string;
  /**
   * When true, match `filename` at any depth under the root (completed archives,
   * backlog cohorts). When false, only the root directory itself (flat `active/`
   * task lists).
   */
  recursive: boolean;
}

/**
 * Family → search roots. Task lists stay flat under `active/` but must resolve
 * after archive under nested `completed/` quarter/order/cohort layouts.
 */
const SEARCH_ROOTS: Readonly<Record<CommitCheckArtifactFamily, readonly SearchRoot[]>> = {
  tasks: [
    { path: "active", recursive: false },
    { path: "completed", recursive: true },
  ],
  design: [
    { path: "active", recursive: true },
    { path: "backlog", recursive: true },
  ],
  meta: [
    { path: "active", recursive: true },
    { path: "completed", recursive: true },
  ],
};

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "ENOENT"
  );
}

async function inspectRoot(
  root: string,
  filename: string,
  recursive: boolean,
): Promise<CommitCheckArtifactResolution> {
  try {
    const entries = await readdir(root, { recursive, withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name === filename)
      ? "found"
      : "not-found";
  } catch (error: unknown) {
    return isMissing(error) ? "not-found" : "unresolvable";
  }
}

/**
 * Create the repository adapter used by commit-message validation.
 *
 * @param arcRoot - Absolute or repository-relative path to the `.arc` directory
 * @returns Artifact resolver with family-specific search roots
 */
export function createFilesystemArtifactResolver(arcRoot: string): CommitCheckArtifactResolver {
  return async ({ family, filename }) => {
    try {
      const rootState = await stat(arcRoot);
      if (!rootState.isDirectory()) return "unresolvable";
    } catch {
      return "unresolvable";
    }

    let unavailable = false;
    for (const searchRoot of SEARCH_ROOTS[family]) {
      const result = await inspectRoot(
        join(arcRoot, searchRoot.path),
        filename,
        searchRoot.recursive,
      );
      if (result === "found") return "found";
      if (result === "unresolvable") unavailable = true;
    }

    return unavailable ? "unresolvable" : "not-found";
  };
}
