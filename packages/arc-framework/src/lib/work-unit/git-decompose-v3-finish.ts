/** Git proof boundary for extraction source finish. */

import { readFile } from "node:fs/promises";
import { posix, resolve as resolvePath } from "node:path";

import { digestBytes, type CanonicalDigest } from "../canonical/canonical-json.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import { resolveArcPath } from "../layout/index.js";
import type { V3ExtractionFinishResult } from "./decompose-v3-finish.js";
import { executeV3ExtractionSourceFinish } from "./decompose-v3-finish-operation.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import {
  createV3DecomposePreflight,
  type V3DecomposePreflight,
} from "./decompose-v3-preflight.js";
import { refreshV3ExtractionCutMap } from "./decompose-v3-refresh.js";
import {
  composeV3ExtractionRepositoryPlan,
  type V3RepositoryPlanResult,
} from "./decompose-v3-repository-plan.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import type {
  GitV3RepositoryPlanDependencies,
} from "./git-decompose-v3-repository-plan.js";
import { readGitV3RepositoryTree } from "./git-decompose-v3-repository-plan.js";
import {
  readGitV3DecomposeTreeSnapshot,
} from "./git-decompose-v3-preflight.js";
import {
  decodeV3DecomposeCutMap,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";
import type { V3RepositoryPlanTree } from "./decompose-v3-repository-plan.js";
import { planV3ExtractionSourceThinning } from "./decompose-v3-thinning.js";
import { createGitV3ExtractionSourceFinishIO } from "./git-decompose-v3-operation-io.js";

/** Inputs shared by finish preview and explicit application. */
export interface GitV3ExtractionFinishInput {
  cwd: string;
  baseBranch: string;
  origin: string;
  cutMapPath: string;
  apply: boolean;
}

/** One exact destination state proven on the configured integration base. */
export interface V3ExtractionDestinationState {
  path: string;
  mode: "100644" | "100755";
  contentDigest: CanonicalDigest;
}

/** Immutable base proof consumed by later source-thinning planning. */
export interface V3ExtractionDestinationProof {
  baseRef: string;
  baseHead: string;
  destinations: V3ExtractionDestinationState[];
}

/** Exact source and destination facts retained for thinning planning. */
export interface V3ExtractionFinishPreparation {
  completedMap: V3DecomposeCutMap;
  currentPreflight: V3DecomposePreflight;
  sourceTree: V3RepositoryPlanTree;
  proof: V3ExtractionDestinationProof;
}

/** Git-backed proof result returned before any source mutation. */
export type GitV3ExtractionDestinationProofResult =
  | { status: "proven"; preparation: V3ExtractionFinishPreparation }
  | { status: "refused"; reason: string; locus?: string };

/** Pure destination-state validation result. */
export type V3ExtractionDestinationValidationResult =
  | { status: "proven"; destinations: V3ExtractionDestinationState[] }
  | { status: "refused"; reason: string; locus?: string };

/**
 * Compare an extraction plan's destination mutations with one pinned base tree.
 *
 * @param plan - Exact additive plan reconstructed from its original base.
 * @param tree - Current configured-base tree pinned at one commit.
 * @returns Proven destination facts or one deterministic mismatch.
 */
export function validateV3ExtractionDestinationStates(
  plan: ValidatedDecomposePlan,
  tree: V3RepositoryPlanTree,
): V3ExtractionDestinationValidationResult {
  const destinations: V3ExtractionDestinationState[] = [];
  for (const mutation of plan.mutations) {
    if (mutation.kind === "exclusive" && mutation.role === "roadmap") continue;
    if (mutation.after.kind !== "file") {
      return { status: "refused", reason: "destination-plan-state", locus: mutation.path };
    }
    const observed = tree[mutation.path];
    if (observed === undefined || observed.kind === "absent") {
      return { status: "refused", reason: "destination-missing", locus: mutation.path };
    }
    if (observed.objectKind !== "blob") {
      return { status: "refused", reason: "destination-object-kind", locus: mutation.path };
    }
    if (observed.mode !== mutation.after.mode) {
      return { status: "refused", reason: "destination-mode", locus: mutation.path };
    }
    if (digestBytes(observed.bytes) !== mutation.after.contentDigest) {
      return { status: "refused", reason: "destination-bytes", locus: mutation.path };
    }
    if (mutation.kind === "composed") {
      const projections = mutation.contributors.flatMap((contributor) =>
        contributor.kind === "content" ? contributor.sourceProjection : []);
      if (projections.length > 0) {
        const artifact = posix.basename(mutation.path);
        const scan = scanV3DecomposeContent(artifact, observed.bytes);
        if (scan.status === "rejected") {
          return { status: "refused", reason: "destination-scan", locus: mutation.path };
        }
        for (const projection of projections) {
          const resolution = resolveV3DecomposeContentLocator(
            scan.units,
            projection.targetLocator,
            artifact,
          );
          if (resolution.status === "rejected") {
            return { status: "refused", reason: "destination-locator", locus: mutation.path };
          }
        }
      }
    }
    destinations.push({
      path: mutation.path,
      mode: mutation.after.mode,
      contentDigest: mutation.after.contentDigest,
    });
  }
  if (destinations.length === 0) {
    return { status: "refused", reason: "destination-plan-empty" };
  }
  return { status: "proven", destinations };
}

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

function refused(reason: string, locus?: string): GitV3ExtractionDestinationProofResult {
  return {
    status: "refused",
    reason,
    ...(locus === undefined ? {} : { locus }),
  };
}

async function exactRef(
  dependencies: GitV3RepositoryPlanDependencies,
  ref: string,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-parse", "--verify", `${ref}^{commit}`],
      { cwd: dependencies.cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function currentBranch(
  dependencies: GitV3RepositoryPlanDependencies,
): Promise<string | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      { cwd: dependencies.cwd },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function literalPath(path: string): string {
  return `:(literal)${validateManagedPath(path)}`;
}

async function changedPath(
  dependencies: GitV3RepositoryPlanDependencies,
  args: string[],
  path: string,
): Promise<boolean> {
  const { stdout } = await dependencies.exec(
    "git",
    [...args, "--", literalPath(path)],
    { cwd: dependencies.cwd },
  );
  return stdout !== "";
}

async function sourceDirt(
  dependencies: GitV3RepositoryPlanDependencies,
  sourceDir: string,
): Promise<"source-index-dirty" | "source-worktree-dirty" | "source-untracked" | null> {
  if (await changedPath(
    dependencies,
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    sourceDir,
  )) return "source-index-dirty";
  if (await changedPath(
    dependencies,
    ["diff", "--name-only", "--no-renames", "-z"],
    sourceDir,
  )) return "source-worktree-dirty";
  if (await changedPath(
    dependencies,
    ["ls-files", "--others", "--exclude-standard", "-z"],
    sourceDir,
  )) return "source-untracked";
  return null;
}

function roadmapBytes(tree: V3RepositoryPlanTree): Uint8Array | null {
  const state = tree[ROADMAP_PATH];
  return state?.kind === "object"
    && state.objectKind === "blob"
    && (state.mode === "100644" || state.mode === "100755")
    ? new Uint8Array(state.bytes)
    : null;
}

function planRefusal(result: Extract<V3RepositoryPlanResult, { status: "refused" }>):
GitV3ExtractionDestinationProofResult {
  return refused(
    `destination-plan:${result.refusal.stage}:${result.refusal.reason}`,
    result.refusal.locus,
  );
}

/**
 * Prove the surviving source and every additive destination from immutable Git objects.
 *
 * @param dependencies - Git, object, and bundled-template boundaries.
 * @param input - Exact finish invocation operands.
 * @returns A pinned preparation or one typed refusal without mutation.
 */
export async function proveGitV3ExtractionDestinations(
  dependencies: GitV3RepositoryPlanDependencies,
  input: GitV3ExtractionFinishInput,
): Promise<GitV3ExtractionDestinationProofResult> {
  let rawMap: unknown;
  try {
    rawMap = JSON.parse(await readFile(resolvePath(input.cwd, input.cutMapPath), "utf8"));
  } catch {
    return refused("map:invalid", input.cutMapPath);
  }
  const decoded = decodeV3DecomposeCutMap(rawMap);
  if (decoded.status === "rejected") {
    return refused(`map:${decoded.issue.code}`, decoded.issue.path);
  }
  const map = decoded.value;
  if (map.authoring.shape !== "extraction") return refused("map:authoring-shape", "authoring.shape");
  if (map.machine.source.origin !== input.origin) return refused("map:origin", "machine.source.origin");
  const baseRef = `refs/heads/${input.baseBranch}`;
  if (map.machine.resultBase.ref !== baseRef) {
    return refused("base-ref-mismatch", "machine.resultBase.ref");
  }

  try {
    const [branch, head, sourceRef, baseHead] = await Promise.all([
      currentBranch(dependencies),
      exactRef(dependencies, "HEAD"),
      exactRef(dependencies, map.machine.source.ref),
      exactRef(dependencies, baseRef),
    ]);
    if (branch === null) return refused("source-detached", "HEAD");
    if (branch !== map.machine.source.logicalBranch) {
      return refused("source-branch", "machine.source.logicalBranch");
    }
    if (head === null) return refused("source-head", "HEAD");
    if (sourceRef !== head) return refused("source-ref-moved", map.machine.source.ref);
    if (baseHead === null) return refused("base-missing", baseRef);
    try {
      await dependencies.exec(
        "git",
        ["merge-base", "--is-ancestor", map.machine.resultBase.head, baseHead],
        { cwd: dependencies.cwd },
      );
    } catch {
      return refused("base-not-descendant", baseRef);
    }

    const [sourceSnapshot, originalBaseSnapshot] = await Promise.all([
      readGitV3DecomposeTreeSnapshot(
        dependencies,
        map.machine.source.ref,
        head,
        input.origin,
      ),
      readGitV3DecomposeTreeSnapshot(
        dependencies,
        map.machine.resultBase.ref,
        map.machine.resultBase.head,
        input.origin,
      ),
    ]);
    const refreshed = createV3DecomposePreflight({
      origin: input.origin,
      sourceBase: map.machine.source.ref === map.machine.resultBase.ref
        ? sourceSnapshot
        : originalBaseSnapshot,
      resultBase: map.machine.resultBase,
      localBranches: map.machine.source.ref === map.machine.resultBase.ref ? [] : [sourceSnapshot],
    });
    if (refreshed.status === "rejected") {
      return refused(`source:${refreshed.reason}`, refreshed.locus);
    }
    const binding = refreshV3ExtractionCutMap(map, refreshed.preflight);
    if (binding.status === "reauthor") return refused(`source:${binding.reason}`, binding.locus);
    const sourceDir = posix.dirname(binding.preflight.sourceOriginPath);
    const dirt = await sourceDirt(dependencies, sourceDir);
    if (dirt !== null) return refused(dirt, sourceDir);

    const [sourceTree, originalBaseTree, currentBaseTree] = await Promise.all([
      readGitV3RepositoryTree(dependencies, head),
      readGitV3RepositoryTree(dependencies, map.machine.resultBase.head),
      readGitV3RepositoryTree(dependencies, baseHead),
    ]);
    if (sourceTree === null) return refused("source-tree-unreadable", head);
    if (originalBaseTree === null) return refused("result-base-tree-unreadable", map.machine.resultBase.head);
    if (currentBaseTree === null) return refused("base-tree-unreadable", baseHead);
    const originalRoadmap = roadmapBytes(originalBaseTree);
    if (originalRoadmap === null) return refused("result-base-roadmap-unreadable", ROADMAP_PATH);
    const expected = await composeV3ExtractionRepositoryPlan({
      completedMap: binding.completedMap,
      currentPreflight: binding.preflight,
      sourceTree,
      mergeBaseTree: originalBaseTree,
      resultBaseTree: originalBaseTree,
      mergeBases: [map.machine.resultBase.head],
      cohortTemplate: dependencies.cohortTemplate,
      renderRoadmap: () => Promise.resolve(new Uint8Array(originalRoadmap)),
    });
    if (expected.status === "refused") return planRefusal(expected);
    const destinations = validateV3ExtractionDestinationStates(expected.plan, currentBaseTree);
    if (destinations.status === "refused") return destinations;

    const [sourceAfter, baseAfter, branchAfter, headAfter] = await Promise.all([
      exactRef(dependencies, map.machine.source.ref),
      exactRef(dependencies, baseRef),
      currentBranch(dependencies),
      exactRef(dependencies, "HEAD"),
    ]);
    if (sourceAfter !== head
      || branchAfter !== map.machine.source.logicalBranch
      || headAfter !== head) {
      return refused("source-raced", map.machine.source.ref);
    }
    if (baseAfter !== baseHead) return refused("base-raced", baseRef);
    const dirtAfter = await sourceDirt(dependencies, sourceDir);
    if (dirtAfter !== null) return refused("source-raced", sourceDir);

    return {
      status: "proven",
      preparation: {
        completedMap: binding.completedMap,
        currentPreflight: binding.preflight,
        sourceTree,
        proof: {
          baseRef,
          baseHead,
          destinations: destinations.destinations,
        },
      },
    };
  } catch (error) {
    return refused(
      "destination-proof-failed",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * Preview a source finish after proving its exact source and landed destinations.
 *
 * @param dependencies - Git, object, and bundled-template boundaries.
 * @param input - Exact finish invocation operands.
 * @returns A preview, finished application, or typed refusal with bounded recovery.
 */
export async function finishGitV3Extraction(
  dependencies: GitV3RepositoryPlanDependencies,
  input: GitV3ExtractionFinishInput,
): Promise<V3ExtractionFinishResult> {
  const proof = await proveGitV3ExtractionDestinations(dependencies, input);
  if (proof.status === "refused") return proof;
  const thinning = planV3ExtractionSourceThinning({
    completedMap: proof.preparation.completedMap,
    currentPreflight: proof.preparation.currentPreflight,
    sourceTree: proof.preparation.sourceTree,
  });
  if (thinning.status === "refused") {
    return {
      status: "refused",
      reason: `source-plan:${thinning.reason}`,
      ...(thinning.locus === undefined ? {} : { locus: thinning.locus }),
    };
  }
  return await executeV3ExtractionSourceFinish(
    thinning.files,
    input.apply,
    createGitV3ExtractionSourceFinishIO(dependencies),
  );
}
