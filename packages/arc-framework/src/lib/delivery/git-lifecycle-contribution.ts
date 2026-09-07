/** Git-backed revalidation of exact lifecycle-contribution entry identity. */

import { posix } from "node:path";

import type { GitExec } from "../git/exec.js";
import { validateManagedPath, type ManagedPath } from "../kernel/index.js";
import { resolveCandidateRecordRelativePath } from "../work-unit/candidate-record-store.js";
import { readTreeEntry } from "../work-unit/git-decomposition-object-readers.js";
import { resolveSubmissionBoundaryPath } from "../work-unit/submission-boundary-store.js";
import { artifactMatcher } from "../work-unit/mutators/relocate-artifacts.js";
import {
  classifyDeliveryTerminalDelta,
  compareDeliveryLifecycleContribution,
  CurrentDeliveryLifecycleContributionPathSource,
  type DeliveryLifecycleTreeState,
  type DeliveryTerminalDeltaClassification,
} from "./lifecycle-contribution.js";

/** Closed result of one fresh lifecycle-contribution revalidation. */
export type DeliveryLifecycleContributionRevalidation =
  | { readonly status: "ok" }
  | {
      readonly status: "refused";
      readonly reason: "entry-unavailable" | "contribution-mismatch";
      readonly paths: readonly string[];
    };

/**
 * Read every lifecycle artifact for one work unit from an exact Git revision.
 *
 * @param exec - Git boundary for the repository that owns the delivery.
 * @param ref - Exact revision whose lifecycle paths are inspected.
 * @param workUnitId - Work unit whose movable artifacts are selected.
 * @returns Validated repository-relative lifecycle artifact paths.
 */
export async function readGitDeliveryLifecycleArtifactsAtRef(
  exec: GitExec,
  ref: string,
  workUnitId: string,
): Promise<readonly ManagedPath[]> {
  const { stdout } = await exec("git", [
    "ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--",
    ".arc/active", ".arc/backlog/planned", ".arc/backlog/provisional", ".arc/completed",
  ]);
  const matcher = artifactMatcher(workUnitId);
  return stdout.split("\0")
    .filter((path) => path !== "" && posix.basename(path) !== `cohort-${workUnitId}.md`
      && matcher.test(posix.basename(path)))
    .map(validateManagedPath);
}

/**
 * Classify one revision range against a work unit's lifecycle-contribution paths.
 *
 * @param input - Git boundary, work-unit lifecycle locators, and the exact revision range to read.
 * @returns The delta classification, or `null` when the range or artifact group cannot be read.
 */
export async function classifyGitDeliveryTerminalDelta(input: {
  readonly exec: GitExec;
  readonly workUnitId: string;
  readonly activeMetaPath: ManagedPath;
  readonly protectedBaseRef: string;
  readonly topRef: string;
  readonly fromRevision: string;
  readonly toRevision: string;
  readonly readDirectory: (path: string) => Promise<readonly string[]>;
  readonly readArtifactsAtRef?: (
    ref: string,
    workUnitId: string,
  ) => Promise<readonly ManagedPath[]>;
  readonly projectReadinessPath?: ManagedPath | null;
}): Promise<DeliveryTerminalDeltaClassification | null> {
  try {
    const resolved = await new CurrentDeliveryLifecycleContributionPathSource({
      readDirectory: input.readDirectory,
      ...(input.readArtifactsAtRef === undefined
        ? {}
        : { readArtifactsAtRef: input.readArtifactsAtRef }),
      ...(input.projectReadinessPath === undefined
        ? {}
        : { projectReadinessPath: input.projectReadinessPath }),
    }).resolve({
      workUnitId: input.workUnitId,
      activeMetaPath: input.activeMetaPath,
      protectedBaseRef: input.protectedBaseRef,
      topRef: input.topRef,
    });
    const { stdout } = await input.exec("git", [
      "diff", "--name-only", "-z", input.fromRevision, input.toRevision, "--",
    ]);
    return classifyDeliveryTerminalDelta({
      changedPaths: stdout.split("\0").filter((path) => path !== ""),
      lifecyclePaths: [
        ...resolved.workUnitArtifacts,
        ...resolved.sharedProjections,
        // Machine-owned records for this work unit are never a delivery member's content.
        resolveCandidateRecordRelativePath(input.workUnitId),
        resolveSubmissionBoundaryPath(input.workUnitId),
      ],
    });
  } catch {
    return null;
  }
}

/** Freshly compare protected-base and candidate tree entries at every supplied path. */
export async function revalidateDeliveryLifecycleContribution(input: {
  readonly exec: GitExec;
  readonly protectedBaseRef: string;
  readonly candidateRef: string;
  readonly paths: readonly string[];
}): Promise<DeliveryLifecycleContributionRevalidation> {
  const paths = [...new Set(input.paths)].sort(byteSort);
  const [protectedBase, candidate] = await Promise.all([
    readEntries(input.exec, input.protectedBaseRef, paths),
    readEntries(input.exec, input.candidateRef, paths),
  ]);
  const unavailable = paths.filter((path) => protectedBase.get(path) === false || candidate.get(path) === false);
  if (unavailable.length > 0) {
    return { status: "refused", reason: "entry-unavailable", paths: unavailable };
  }
  const comparison = compareDeliveryLifecycleContribution({
    paths,
    protectedBase: protectedBase as DeliveryLifecycleTreeState,
    candidate: candidate as DeliveryLifecycleTreeState,
  });
  return comparison.status === "match"
    ? { status: "ok" }
    : { status: "refused", reason: "contribution-mismatch", paths: comparison.mismatchedPaths };
}

async function readEntries(
  exec: GitExec,
  ref: string,
  paths: readonly string[],
): Promise<ReadonlyMap<string, Awaited<ReturnType<typeof readTreeEntry>>>> {
  const entries = await Promise.all(paths.map(async (path) => [path, await readTreeEntry(exec, ref, path)] as const));
  return new Map(entries);
}

function byteSort(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
