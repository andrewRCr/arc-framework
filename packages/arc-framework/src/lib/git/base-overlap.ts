/**
 * Rename-conservative changed-path overlap analysis for base drift.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import {
  classifyPathTreatment,
  type PathTreatmentContext,
} from "../evidence-applicability/index.js";
import type { OverlapEvidence, PathTreatmentClassifier } from "./base-drift-types.js";
import { isGitObjectId } from "./object-id.js";
import { isGitProcessError } from "./process-error.js";

export interface AnalyzeBaseOverlapOptions {
  exec: GitExec;
  baseOid: string;
  headOid: string;
  ahead: number;
  behind: number;
  classify: PathTreatmentClassifier;
}

export interface AnalyzeRevisionOverlapOptions {
  exec: GitExec;
  leftRevision: string;
  rightRevision: string;
  treatmentContext: PathTreatmentContext;
}

export type RevisionOverlapResult =
  | {
      readonly status: "available";
      readonly mergeBase: string;
      readonly overlap: Extract<OverlapEvidence, { readonly status: "available" }>;
    }
  | {
      readonly status: "unrelated";
      readonly leftRevision: string;
      readonly rightRevision: string;
      readonly detail: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: "invalid-revision" | "merge-base-failed" | "left-diff-failed" | "right-diff-failed"
        | "classification-failed";
      readonly detail: string;
    };

/**
 * Classify changed-path overlap between two explicit commit revisions.
 *
 * @param options - Exact revisions, Git boundary, and explicit path-treatment context.
 * @returns Their unique merge base and classified overlap, or a precise non-success result.
 */
export async function analyzeRevisionOverlap(
  options: AnalyzeRevisionOverlapOptions,
): Promise<RevisionOverlapResult> {
  if (!isGitObjectId(options.leftRevision) || !isGitObjectId(options.rightRevision)) {
    return {
      status: "unavailable",
      reason: "invalid-revision",
      detail: "Both overlap coordinates must be exact commit object IDs.",
    };
  }
  return analyzeRevisionOverlapWithClassifier({
    exec: options.exec,
    leftRevision: options.leftRevision,
    rightRevision: options.rightRevision,
    classify: (path) => classifyPathTreatment(path, options.treatmentContext),
  });
}

export async function analyzeBaseOverlap(
  options: AnalyzeBaseOverlapOptions,
): Promise<OverlapEvidence> {
  if (options.ahead === 0 || options.behind === 0) {
    return { status: "available", substantivePaths: [], regenerablePaths: [] };
  }

  const result = await analyzeRevisionOverlapWithClassifier({
    exec: options.exec,
    leftRevision: options.headOid,
    rightRevision: options.baseOid,
    classify: options.classify,
  });
  if (result.status === "available") return result.overlap;
  if (result.status === "unrelated" || result.reason === "merge-base-failed") {
    return { status: "unavailable", reason: "merge-base-failed" };
  }
  if (result.reason === "left-diff-failed") return { status: "unavailable", reason: "branch-diff-failed" };
  if (result.reason === "right-diff-failed") return { status: "unavailable", reason: "base-diff-failed" };
  return { status: "unavailable", reason: "classification-failed" };
}

async function analyzeRevisionOverlapWithClassifier(options: {
  exec: GitExec;
  leftRevision: string;
  rightRevision: string;
  classify: PathTreatmentClassifier;
}): Promise<RevisionOverlapResult> {
  let mergeBase: string;
  try {
    mergeBase = (await options.exec(
      "git",
      ["merge-base", options.leftRevision, options.rightRevision],
    )).stdout.trim();
    if (!isGitObjectId(mergeBase)) throw new Error("Invalid merge base.");
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) {
      return {
        status: "unrelated",
        leftRevision: options.leftRevision,
        rightRevision: options.rightRevision,
        detail: "The revisions have no common ancestor.",
      };
    }
    return {
      status: "unavailable",
      reason: "merge-base-failed",
      detail: "The merge base could not be established.",
    };
  }

  const leftPaths = await readChangedPaths(options.exec, mergeBase, options.leftRevision);
  if (leftPaths === null) {
    return {
      status: "unavailable",
      reason: "left-diff-failed",
      detail: "Changed paths for the left revision could not be established.",
    };
  }
  const rightPaths = await readChangedPaths(options.exec, mergeBase, options.rightRevision);
  if (rightPaths === null) {
    return {
      status: "unavailable",
      reason: "right-diff-failed",
      detail: "Changed paths for the right revision could not be established.",
    };
  }

  const rightSet = new Set(rightPaths);
  const sharedPaths = [...new Set(leftPaths.filter((path) => rightSet.has(path)))].sort();
  const substantivePaths: string[] = [];
  const regenerablePaths: string[] = [];
  try {
    for (const path of sharedPaths) {
      const treatment = options.classify(path);
      if (treatment === "regenerable") regenerablePaths.push(path);
      if (treatment === "reviewable") substantivePaths.push(path);
    }
  } catch {
    return {
      status: "unavailable",
      reason: "classification-failed",
      detail: "A shared path could not be classified.",
    };
  }
  return {
    status: "available",
    mergeBase,
    overlap: { status: "available", substantivePaths, regenerablePaths },
  };
}

async function readChangedPaths(exec: GitExec, mergeBase: string, revision: string): Promise<string[] | null> {
  try {
    return parseNulPaths((await exec("git", [
      "diff", "--name-only", "-z", "--no-renames", `${mergeBase}..${revision}`,
    ])).stdout);
  } catch {
    return null;
  }
}

function parseNulPaths(stdout: string): string[] {
  if (stdout === "") return [];
  if (!stdout.endsWith("\0")) throw new Error("Malformed NUL-delimited path output.");
  const paths = stdout.slice(0, -1).split("\0");
  if (paths.some((path) => path === "")) throw new Error("Malformed empty path.");
  return paths;
}
