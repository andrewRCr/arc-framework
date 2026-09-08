/** Git proof boundary for extraction source finish. */

import { readFile } from "node:fs/promises";
import { posix, resolve as resolvePath } from "node:path";

import {
  canonicalDigest,
  digestBytes,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { validateManagedPath } from "../canonical/managed-path.js";
import { resolveArcPath } from "../layout/index.js";
import type {
  V3ExtractionFinishPreview,
  V3ExtractionFinishEvidence,
} from "./decompose-v3-finish.js";
import {
  V3ExtractionFinishResultSchema,
  type V3ExtractionFinishResult,
} from "./decompose-v3-finish.js";
import {
  v3DecomposeRemedy,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import { executeV3ExtractionSourceFinish } from "./decompose-v3-finish-operation.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import {
  createV3DecomposePreflight,
  revalidateV3DecomposeCutMapBinding,
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
import {
  readGitV3RepositoryTree,
  renderGitV3RepositoryTreeRoadmap,
} from "./git-decompose-v3-repository-plan.js";
import {
  readGitV3DecomposeTreeSnapshot,
} from "./git-decompose-v3-preflight.js";
import {
  decodeV3DecomposeCutMap,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";
import type { V3RepositoryPlanTree } from "./decompose-v3-repository-plan.js";
import {
  planV3ExtractionSourceThinning,
  type V3ExtractionSourceThinningFilePlan,
} from "./decompose-v3-thinning.js";
import { createGitV3ExtractionSourceFinishIO } from "./git-decompose-v3-operation-io.js";
import { replaceDependencySlot } from "./decompose-sweep.js";
import { v3CohortDocumentPath } from "./decompose-v3-topology.js";

/** Inputs shared by finish preview and explicit application. */
export interface GitV3ExtractionFinishInput {
  cwd: string;
  baseBranch: string;
  origin: string;
  cutMapPath: string;
  applyAuthority: CanonicalDigest | null;
}

type V3ExtractionFinishOperationResult =
  | { status: "previewed"; preview: V3ExtractionFinishPreview }
  | { status: "finished" }
  | { status: "already-finished" }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

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

/** Semantic authority needed to validate owner-authored extraction destinations. */
export interface V3ExtractionDestinationValidationAuthority {
  completedMap: V3DecomposeCutMap;
  blobs: ReadonlyArray<{ contentDigest: CanonicalDigest; bytes: Uint8Array }>;
  expectedRoadmap: Uint8Array;
}

function composeFinishPreview(
  preparation: V3ExtractionFinishPreparation,
  files: readonly V3ExtractionSourceThinningFilePlan[],
): V3ExtractionFinishPreview {
  const evidence: V3ExtractionFinishEvidence = {
    liveBase: {
      ref: preparation.proof.baseRef,
      head: preparation.proof.baseHead,
      destinations: structuredClone(preparation.proof.destinations),
    },
    sources: files.map((file) => ({
      path: file.path,
      before: structuredClone(file.before),
      after: file.after.kind === "absent"
        ? { kind: "absent" }
        : {
            kind: "file",
            mode: file.after.mode,
            contentBase64: Buffer.from(file.after.bytes).toString("base64"),
          },
      removedLocators: structuredClone(file.removedLocators),
    })),
  };
  return {
    ...evidence,
    applyAuthority: canonicalDigest({
      schemaVersion: 1,
      kind: "v3-extraction-finish-preview",
      evidence,
    }),
  };
}

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
  authority?: V3ExtractionDestinationValidationAuthority,
): V3ExtractionDestinationValidationResult {
  const blobBytes = new Map(authority?.blobs.map(({ contentDigest, bytes }) => [contentDigest, bytes]) ?? []);
  const destinations: V3ExtractionDestinationState[] = [];
  let roadmapPath: string | null = null;
  for (const mutation of plan.mutations) {
    if (mutation.kind === "exclusive" && mutation.role === "roadmap") {
      roadmapPath = mutation.path;
      continue;
    }
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
    if (authority === undefined && digestBytes(observed.bytes) !== mutation.after.contentDigest) {
      return { status: "refused", reason: "destination-bytes", locus: mutation.path };
    }
    if (mutation.kind === "composed") {
      let semanticallyOwned = false;
      const projections = mutation.contributors.flatMap((contributor) =>
        contributor.kind === "content" ? contributor.sourceProjection : []);
      if (projections.length > 0) {
        semanticallyOwned = true;
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
      const expectedBytes = blobBytes.get(mutation.after.contentDigest);
      const metaContributor = mutation.contributors.find((contributor) =>
        contributor.kind === "content"
        && contributor.destinationKind === "new-member"
        && contributor.artifactRole === "meta");
      const dependencyContributor = mutation.contributors.find(({ kind }) => kind === "dependency");
      if ((metaContributor !== undefined || dependencyContributor !== undefined)
        && expectedBytes !== undefined) {
        semanticallyOwned = true;
        try {
          const decoder = new TextDecoder("utf-8", { fatal: true });
          const expectedMeta = parseMetaRecord(decoder.decode(expectedBytes));
          const observedMeta = parseMetaRecord(decoder.decode(observed.bytes));
          const fixed = metaContributor === undefined
            ? ["dependsOn"] as const
            : ["state", "owner", "branch", "workClass", "priority", "cohort", "dependsOn", "origin", "design"] as const;
          if (fixed.some((field) => canonicalDigest(expectedMeta[field]) !== canonicalDigest(observedMeta[field]))) {
            return { status: "refused", reason: "destination-meta", locus: mutation.path };
          }
        } catch {
          return { status: "refused", reason: "destination-meta", locus: mutation.path };
        }
      }
      if (authority !== undefined && !semanticallyOwned
        && mutation.contributors.every(({ kind }) => kind !== "topology")
        && digestBytes(observed.bytes) !== mutation.after.contentDigest) {
        return { status: "refused", reason: "destination-bytes", locus: mutation.path };
      }
    }
    destinations.push({
      path: mutation.path,
      mode: mutation.after.mode,
      contentDigest: digestBytes(observed.bytes),
    });
  }
  if (authority !== undefined) {
    const map = authority.completedMap;
    for (const [index, edge] of map.machine.incomingEdges.entries()) {
      const authored = map.authoring.incomingDispositions[index];
      const expected = authored?.disposition.kind === "replace"
        ? replaceDependencySlot(edge.currentTargets, map.machine.source.origin, authored.disposition.replacementTargets)
        : replaceDependencySlot(edge.currentTargets, map.machine.source.origin, []);
      const matches = Object.entries(tree).filter(([path, state]) =>
        posix.basename(path) === `meta-${edge.dependent}.md`
        && state.kind === "object"
        && state.objectKind === "blob");
      const match = matches[0];
      if (authored === undefined || matches.length !== 1 || match === undefined || match[1].kind === "absent") {
        return { status: "refused", reason: "dependency-claim", locus: edge.dependent };
      }
      try {
        const actual = parseMetaRecord(new TextDecoder("utf-8", { fatal: true }).decode(match[1].bytes)).dependsOn;
        if (canonicalDigest(sortByCanonicalBytes(actual)) !== canonicalDigest(sortByCanonicalBytes(expected))) {
          return { status: "refused", reason: "dependency-claim", locus: match[0] };
        }
      } catch {
        return { status: "refused", reason: "dependency-claim", locus: match[0] };
      }
    }
    const placement = map.authoring.placement;
    const cohortClaims = placement.kind === "direct-member"
      ? []
      : placement.kind === "subcohort"
        ? [placement.cohort.split("/")[0] ?? "", placement.cohort]
        : [placement.kind === "at-cap" ? placement.parent : placement.cohort];
    for (const cohort of cohortClaims) {
      const path = v3CohortDocumentPath(cohort);
      const state = tree[path];
      if (state === undefined || state.kind === "absent" || state.objectKind !== "blob") {
        return { status: "refused", reason: "topology-claim", locus: path };
      }
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(state.bytes);
      } catch {
        return { status: "refused", reason: "topology-claim", locus: path };
      }
      const segments = cohort.split("/");
      const leaf = segments.at(-1);
      const parent = segments.length === 2 ? segments[0] : null;
      const purpose = /^\*\*Purpose:\*\*\s*(.+)$/mu.exec(text)?.[1]?.trim();
      const parentLines = [...text.matchAll(/^\*\*Parent:\*\*\s*(.+)$/gmu)].map((match) => match[1]);
      if (leaf === undefined || !text.startsWith(`# Cohort: \`${leaf}\`\n`)
        || (parent === null ? parentLines.length !== 0 : parentLines.length !== 1 || parentLines[0] !== parent)
        || purpose === undefined || purpose === "—") {
        return { status: "refused", reason: "topology-claim", locus: path };
      }
    }
    if (placement.kind === "at-cap") {
      const path = v3CohortDocumentPath(placement.parent);
      const state = tree[path];
      const members = map.authoring.destinations.flatMap((destination) =>
        destination.kind === "new-member" ? [destination.slug] : []).sort();
      const block = [
        `<!-- arc:decompose-fanout:${map.machine.source.origin}:start -->`,
        `### \`${map.machine.source.origin}\` decomposition fan-out`,
        "",
        ...members.map((slug) => `- \`${slug}\``),
        `<!-- arc:decompose-fanout:${map.machine.source.origin}:end -->`,
      ].join("\n");
      if (state === undefined || state.kind === "absent" || state.objectKind !== "blob"
        || !new TextDecoder().decode(state.bytes).includes(block)) {
        return { status: "refused", reason: "topology-claim", locus: path };
      }
    }
    if (roadmapPath === null) {
      return { status: "refused", reason: "roadmap-missing", locus: ROADMAP_PATH };
    }
    const roadmap = tree[roadmapPath];
    if (roadmap === undefined || roadmap.kind === "absent") {
      return { status: "refused", reason: "roadmap-missing", locus: roadmapPath };
    }
    if (roadmap.objectKind !== "blob"
      || !Buffer.from(roadmap.bytes).equals(Buffer.from(authority.expectedRoadmap))) {
      return { status: "refused", reason: "roadmap-current-render", locus: roadmapPath };
    }
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

async function changedPaths(
  dependencies: GitV3RepositoryPlanDependencies,
  args: string[],
  path: string,
): Promise<string[]> {
  const { stdout } = await dependencies.exec(
    "git",
    [...args, "--", literalPath(path)],
    { cwd: dependencies.cwd },
  );
  return stdout.split("\0").filter((entry) => entry !== "");
}

async function sourceDirt(
  dependencies: GitV3RepositoryPlanDependencies,
  sourceDir: string,
): Promise<{ index: string[]; worktree: string[]; untracked: string[] }> {
  const [index, worktree, untracked] = await Promise.all([
    changedPaths(
      dependencies,
      ["diff", "--cached", "--name-only", "--no-renames", "-z"],
      sourceDir,
    ),
    changedPaths(
      dependencies,
      ["diff", "--name-only", "--no-renames", "-z"],
      sourceDir,
    ),
    changedPaths(
      dependencies,
      ["ls-files", "--others", "--exclude-standard", "-z"],
      sourceDir,
    ),
  ]);
  return { index, worktree, untracked };
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

    const [sourceSnapshot, originalSourceSnapshot, originalBaseSnapshot] = await Promise.all([
      readGitV3DecomposeTreeSnapshot(
        dependencies,
        map.machine.source.ref,
        head,
        input.origin,
      ),
      readGitV3DecomposeTreeSnapshot(
        dependencies,
        map.machine.source.ref,
        map.machine.source.head,
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
    let selected: {
      completedMap: V3DecomposeCutMap;
      preflight: V3DecomposePreflight;
      sourceHead: string;
    } | null = null;
    const original = createV3DecomposePreflight({
      origin: input.origin,
      sourceBase: map.machine.source.ref === map.machine.resultBase.ref
        ? originalSourceSnapshot
        : originalBaseSnapshot,
      resultBase: map.machine.resultBase,
      localBranches: map.machine.source.ref === map.machine.resultBase.ref
        ? []
        : [originalSourceSnapshot],
    });
    if (original.status === "rejected") {
      return refused(`source:${original.reason}`, original.locus);
    }
    const originalBinding = revalidateV3DecomposeCutMapBinding(map, original.preflight);
    if (originalBinding.status === "stale") {
      return refused(`source:${originalBinding.reason}`, originalBinding.locus);
    }
    if (refreshed.status === "ready") {
      const binding = refreshV3ExtractionCutMap(map, refreshed.preflight);
      if (binding.status !== "reauthor") {
        selected = {
          completedMap: binding.completedMap,
          preflight: binding.preflight,
          sourceHead: head,
        };
      } else if (binding.reason !== "source-units" || binding.locus.endsWith(".contentDigest")) {
        return refused(`source:${binding.reason}`, binding.locus);
      }
    } else if (refreshed.reason !== "planning-profile" && refreshed.reason !== "source-scan") {
      return refused(`source:${refreshed.reason}`, refreshed.locus);
    }
    if (selected === null) {
      selected = {
        completedMap: map,
        preflight: originalBinding.preflight,
        sourceHead: map.machine.source.head,
      };
    }
    const [sourceTree, originalSourceTree, originalBaseTree, currentBaseTree] = await Promise.all([
      readGitV3RepositoryTree(dependencies, selected.sourceHead),
      readGitV3RepositoryTree(dependencies, map.machine.source.head),
      readGitV3RepositoryTree(dependencies, map.machine.resultBase.head),
      readGitV3RepositoryTree(dependencies, baseHead),
    ]);
    if (sourceTree === null) return refused("source-tree-unreadable", selected.sourceHead);
    if (originalSourceTree === null) return refused("source-tree-unreadable", map.machine.source.head);
    if (originalBaseTree === null) return refused("result-base-tree-unreadable", map.machine.resultBase.head);
    if (currentBaseTree === null) return refused("base-tree-unreadable", baseHead);
    const originalRoadmap = roadmapBytes(originalBaseTree);
    if (originalRoadmap === null) return refused("result-base-roadmap-unreadable", ROADMAP_PATH);
    const expected = await composeV3ExtractionRepositoryPlan({
      completedMap: map,
      currentPreflight: originalBinding.preflight,
      sourceTree: originalSourceTree,
      mergeBaseTree: originalBaseTree,
      resultBaseTree: originalBaseTree,
      mergeBases: [map.machine.resultBase.head],
      cohortTemplate: dependencies.cohortTemplate,
      renderRoadmap: () => Promise.resolve(new Uint8Array(originalRoadmap)),
    });
    if (expected.status === "refused") return planRefusal(expected);
    const expectedRoadmap = await renderGitV3RepositoryTreeRoadmap(
      dependencies,
      input.baseBranch,
      currentBaseTree,
      baseHead,
    );
    const destinations = validateV3ExtractionDestinationStates(expected.plan, currentBaseTree, {
      completedMap: map,
      blobs: expected.blobs,
      expectedRoadmap,
    });
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

    return {
      status: "proven",
      preparation: {
        completedMap: selected.completedMap,
        currentPreflight: selected.preflight,
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
async function finishGitV3ExtractionOperation(
  dependencies: GitV3RepositoryPlanDependencies,
  input: GitV3ExtractionFinishInput,
): Promise<V3ExtractionFinishOperationResult> {
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
  const sourceDir = posix.dirname(proof.preparation.currentPreflight.sourceOriginPath);
  let dirt: Awaited<ReturnType<typeof sourceDirt>>;
  try {
    dirt = await sourceDirt(dependencies, sourceDir);
  } catch {
    return { status: "refused", reason: "source-dirt-read", locus: sourceDir };
  }
  const plannedPaths = new Set(thinning.files.map(({ path }) => path));
  const outsidePlan = [
    ["source-index-dirty", dirt.index],
    ["source-worktree-dirty", dirt.worktree],
    ["source-untracked", dirt.untracked],
  ] as const;
  for (const [reason, paths] of outsidePlan) {
    if (paths.some((path) => !plannedPaths.has(path))) {
      return { status: "refused", reason, locus: sourceDir };
    }
  }
  const result = await executeV3ExtractionSourceFinish(
    thinning.files,
    input.applyAuthority !== null,
    {
      ...createGitV3ExtractionSourceFinishIO(dependencies),
      authorizeApply: (files) => {
        const expected = composeFinishPreview(proof.preparation, files).applyAuthority;
        return Promise.resolve(expected === input.applyAuthority
          ? { status: "ready" as const }
          : {
              status: "refused" as const,
              reason: "apply-authority",
              locus: "apply",
              evidence: { expected, actual: input.applyAuthority },
            });
      },
      beforeApply: async () => {
        const [liveBase, liveSource, liveBranch, liveHead] = await Promise.all([
          exactRef(dependencies, proof.preparation.proof.baseRef),
          exactRef(dependencies, proof.preparation.completedMap.machine.source.ref),
          currentBranch(dependencies),
          exactRef(dependencies, "HEAD"),
        ]);
        if (liveSource !== liveHead
          || liveBranch !== proof.preparation.completedMap.machine.source.logicalBranch
          || liveHead !== proof.preparation.completedMap.machine.source.head) {
          return {
            status: "refused" as const,
            reason: "source-raced",
            locus: proof.preparation.completedMap.machine.source.ref,
          };
        }
        return liveBase === proof.preparation.proof.baseHead
          ? { status: "ready" as const }
          : {
              status: "refused" as const,
              reason: "base-raced",
              locus: proof.preparation.proof.baseRef,
            };
      },
    },
  );
  if (result.status === "refused"
    && result.reason === "source-index-preimage"
    && dirt.index.length > 0) {
    return { status: "refused", reason: "source-index-dirty", locus: sourceDir };
  }
  if (result.status === "refused"
    && result.reason === "source-worktree-preimage"
    && dirt.worktree.length > 0) {
    return { status: "refused", reason: "source-worktree-dirty", locus: sourceDir };
  }
  if (result.status === "previewed") {
    return {
      status: "previewed",
      preview: composeFinishPreview(proof.preparation, result.files),
    };
  }
  return result;
}

/**
 * Preview or apply source finish and compose every refusal with the selected command remedy.
 *
 * @param dependencies - Git, object, and bundled-template boundaries.
 * @param input - Exact finish invocation operands.
 * @returns A strict success result or core decompose refusal envelope.
 */
export async function finishGitV3Extraction(
  dependencies: GitV3RepositoryPlanDependencies,
  input: GitV3ExtractionFinishInput,
): Promise<V3ExtractionFinishResult> {
  const result = await finishGitV3ExtractionOperation(dependencies, input);
  if (result.status !== "refused") return V3ExtractionFinishResultSchema.parse(result);
  const invocation = input.applyAuthority === null
    ? { mode: "finish-preview" as const, origin: input.origin, cutMapPath: input.cutMapPath }
    : {
        mode: "finish-apply" as const,
        origin: input.origin,
        cutMapPath: input.cutMapPath,
        applyAuthority: input.applyAuthority,
      };
  return V3ExtractionFinishResultSchema.parse({
    ...result,
    remedy: v3DecomposeRemedy({
      invocation,
      reason: result.reason,
      ...(result.locus === undefined ? {} : { locus: result.locus }),
    }),
  });
}
