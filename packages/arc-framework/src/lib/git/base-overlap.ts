/**
 * Rename-conservative changed-path overlap analysis for base drift.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import type { OverlapEvidence, ReconciliationClassifier } from "./base-drift-types.js";
import { isGitObjectId } from "./object-id.js";

export interface AnalyzeBaseOverlapOptions {
  exec: GitExec;
  baseOid: string;
  ahead: number;
  behind: number;
  classify: ReconciliationClassifier;
}

export async function analyzeBaseOverlap(
  options: AnalyzeBaseOverlapOptions,
): Promise<OverlapEvidence> {
  if (options.ahead === 0 || options.behind === 0) {
    return { status: "available", substantivePaths: [], regenerablePaths: [] };
  }

  let mergeBase: string;
  try {
    mergeBase = (await options.exec("git", ["merge-base", "HEAD", options.baseOid])).stdout.trim();
    if (!isGitObjectId(mergeBase)) throw new Error("Invalid merge base.");
  } catch {
    return { status: "unavailable", reason: "merge-base-failed" };
  }

  let branchPaths: string[];
  try {
    branchPaths = parseNulPaths((await options.exec("git", [
      "diff", "--name-only", "-z", "--no-renames", `${mergeBase}..HEAD`,
    ])).stdout);
  } catch {
    return { status: "unavailable", reason: "branch-diff-failed" };
  }

  let basePaths: string[];
  try {
    basePaths = parseNulPaths((await options.exec("git", [
      "diff", "--name-only", "-z", "--no-renames", `${mergeBase}..${options.baseOid}`,
    ])).stdout);
  } catch {
    return { status: "unavailable", reason: "base-diff-failed" };
  }

  const baseSet = new Set(basePaths);
  const overlap = [...new Set(branchPaths.filter((path) => baseSet.has(path)))].sort();
  const substantivePaths: string[] = [];
  const regenerablePaths: string[] = [];
  try {
    for (const path of overlap) {
      (options.classify(path) === "regenerable" ? regenerablePaths : substantivePaths).push(path);
    }
  } catch {
    return { status: "unavailable", reason: "classification-failed" };
  }
  return { status: "available", substantivePaths, regenerablePaths };
}

function parseNulPaths(stdout: string): string[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw new Error("Malformed NUL-delimited path output.");
  const paths = stdout.slice(0, -1).split("\0");
  if (paths.some((path) => path === "")) throw new Error("Malformed empty path.");
  return paths;
}
