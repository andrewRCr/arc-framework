/** Record and staged-path mechanics for the in-repository v3 decomposition driver. */

import type { CanonicalDigest } from "../canonical/canonical-json.js";
import type { InRepoDecomposeRetirementDeps } from "./decompose-retirement-driver.js";
import { resolveRetirementRecordPath } from "./retirement-record-store.js";

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/** Read one decomposition record from the driver worktree. */
export async function readDecomposeRecord(
  deps: InRepoDecomposeRetirementDeps,
  receiptId: CanonicalDigest,
): Promise<string | null> {
  try {
    return await deps.readFile(resolveRetirementRecordPath(deps.cwd, receiptId));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return null;
    throw error;
  }
}

/** Return the exact ordered path set currently staged in the driver worktree. */
export async function readDecomposeStagedPaths(deps: InRepoDecomposeRetirementDeps): Promise<string[]> {
  const { stdout } = await deps.exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    { cwd: deps.cwd },
  );
  return stdout.split("\0").filter(Boolean).sort(compareBytes);
}

/** Stage only decomposition paths whose worktree projection differs from the index. */
export async function stageDecomposePaths(
  deps: InRepoDecomposeRetirementDeps,
  paths: readonly string[],
): Promise<void> {
  const candidates: string[] = [];
  for (const path of paths) {
    const [tracked, untracked] = await Promise.all([
      deps.exec("git", ["diff", "--name-only", "--no-renames", "-z", "--", path], { cwd: deps.cwd }),
      deps.exec("git", ["ls-files", "--others", "--exclude-standard", "-z", "--", path], { cwd: deps.cwd }),
    ]);
    if (tracked.stdout !== "" || untracked.stdout !== "") candidates.push(path);
  }
  if (candidates.length > 0) await deps.exec("git", ["add", "-A", "--", ...candidates], { cwd: deps.cwd });
}
