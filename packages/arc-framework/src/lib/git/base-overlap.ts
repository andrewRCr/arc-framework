/**
 * Rename-conservative changed-path overlap analysis for base drift.
 *
 * @module
 */

import type { GitExec } from "./exec.js";
import {
  classifyPathTreatment,
  PathTreatmentSchema,
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
      readonly status: "ambiguous";
      readonly detail: string;
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

/** Whether two revisions have exactly one base to be compared from, and what stands in the way when they do not. */
export type SoleMergeBaseResult =
  | { readonly status: "resolved"; readonly mergeBase: string }
  | { readonly status: "ambiguous"; readonly count: number; readonly detail: string }
  | { readonly status: "unrelated"; readonly detail: string }
  | { readonly status: "unavailable"; readonly detail: string };

/**
 * Resolve the single base two revisions can be compared from.
 *
 * Reads every best common ancestor rather than the one Git would otherwise choose, so a history leaving more
 * than one is reported as leaving more than one instead of resolving to whichever side that choice exposes.
 * The arms split on what a caller can do next — `ambiguous` is cleared by merging the base into the branch and
 * re-running, `unrelated` by giving the two histories one common ancestor, and `unavailable` by reading again —
 * and each caller applies its own failure policy, so none is baked in here.
 *
 * @param options - The Git boundary and the two revisions to relate.
 * @returns The sole base, or the arm naming why there is not exactly one. Never throws.
 */
export async function resolveSoleMergeBase(options: {
  readonly exec: GitExec;
  readonly leftRevision: string;
  readonly rightRevision: string;
}): Promise<SoleMergeBaseResult> {
  let mergeBases: string[];
  try {
    mergeBases = (await options.exec(
      "git",
      ["merge-base", "--all", options.leftRevision, options.rightRevision],
    )).stdout.trim().split(/\r?\n/u).filter(Boolean);
  } catch (error) {
    return isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1
      ? { status: "unrelated", detail: "The revisions have no common ancestor." }
      : { status: "unavailable", detail: "The merge base could not be established." };
  }
  if (mergeBases.length > 1) {
    return {
      status: "ambiguous",
      count: mergeBases.length,
      detail: "The revisions have more than one best merge base.",
    };
  }
  const [mergeBase] = mergeBases;
  return mergeBase !== undefined && isGitObjectId(mergeBase)
    ? { status: "resolved", mergeBase }
    : { status: "unavailable", detail: "The merge base could not be established." };
}

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
  if (result.status === "ambiguous") return { status: "ambiguous" };
  if (result.status === "unrelated") return { status: "unrelated" };
  if (result.reason === "merge-base-failed") return { status: "unavailable", reason: "merge-base-failed" };
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
  const base = await resolveSoleMergeBase({
    exec: options.exec,
    leftRevision: options.leftRevision,
    rightRevision: options.rightRevision,
  });
  if (base.status === "ambiguous") {
    return {
      status: "ambiguous",
      detail: "The revisions have multiple best merge bases; overlap cannot be proved from one.",
    };
  }
  if (base.status === "unrelated") {
    return {
      status: "unrelated",
      leftRevision: options.leftRevision,
      rightRevision: options.rightRevision,
      detail: base.detail,
    };
  }
  if (base.status !== "resolved") {
    return { status: "unavailable", reason: "merge-base-failed", detail: base.detail };
  }
  const mergeBase = base.mergeBase;

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
      const treatment = PathTreatmentSchema.parse(options.classify(path));
      switch (treatment) {
        case "reviewable":
          substantivePaths.push(path);
          break;
        case "evidence-neutral":
          break;
        case "regenerable":
          regenerablePaths.push(path);
          break;
        default:
          assertNever(treatment);
      }
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

function assertNever(value: never): never {
  throw new Error(`Unhandled path treatment: ${String(value)}`);
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
