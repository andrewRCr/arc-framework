/** Filesystem-backed resolver for Context trailer artifact references. */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type {
  CommitCheckArtifactFamily,
  CommitCheckArtifactResolution,
  CommitCheckArtifactResolver,
} from "./types.js";

const SEARCH_ROOTS: Readonly<Record<CommitCheckArtifactFamily, readonly string[]>> = {
  tasks: ["active"],
  design: ["active", "backlog"],
  meta: ["active", "completed"],
};

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: string }).code === "ENOENT"
  );
}

async function inspectRoot(root: string, filename: string): Promise<CommitCheckArtifactResolution> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
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
    for (const relativeRoot of SEARCH_ROOTS[family]) {
      const result = await inspectRoot(join(arcRoot, relativeRoot), filename);
      if (result === "found") return "found";
      if (result === "unresolvable") unavailable = true;
    }

    return unavailable ? "unresolvable" : "not-found";
  };
}
