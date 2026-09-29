/** Git proof boundary for extraction source finish. */

import { readFile } from "node:fs/promises";
import { posix, resolve as resolvePath } from "node:path";

import {
  canonicalDigest,
  digestBytes,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../kernel/canonical/canonical-json.js";
import { validateManagedPath } from "../kernel/canonical/managed-path.js";
import { normalizeGitRejection } from "../git/process-error.js";
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
  v3DecomposeAbsentEvidence,
  v3DecomposeByteEvidence,
  v3DecomposeRemedy,
  type V3DecomposeEvidenceValue,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import { executeV3ExtractionSourceFinish } from "./decompose-v3-finish-operation.js";
import {
  createV3DecomposePreflight,
  revalidateV3DecomposeCutMapBinding,
  type V3DecomposePreflight,
  type V3DecomposeTreeSnapshot,
} from "./decompose-v3-preflight.js";
import { refreshV3ExtractionCutMap } from "./decompose-v3-refresh.js";
import {
  composeV3ExtractionRepositoryPlan,
  type V3RepositoryPlanResult,
} from "./decompose-v3-repository-plan.js";
import type {
  GitV3RepositoryPlanDependencies,
} from "./git-decompose-v3-repository-plan.js";
import {
  readGitV3RepositoryTree,
  renderGitV3RepositoryTreeRoadmap,
} from "./git-decompose-v3-repository-plan.js";
import {
  isGitV3DecomposeSourceArtifactPath,
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
import {
  validateV3ExtractionDestinationStates,
  type GitV3ExtractionDestinationProofResult,
  type V3ExtractionFinishPreparation,
} from "./git-decompose-v3-destination-validation.js";

export { validateV3ExtractionDestinationStates } from "./git-decompose-v3-destination-validation.js";
export type {
  GitV3ExtractionDestinationProofResult,
  V3ExtractionDestinationProof,
  V3ExtractionDestinationValidationAuthority,
  V3ExtractionDestinationValidationResult,
  V3ExtractionDestinationState,
  V3ExtractionFinishPreparation,
} from "./git-decompose-v3-destination-validation.js";

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

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

function refused(
  reason: string,
  locus?: string,
  evidence?: V3DecomposeRefusalEvidence,
): Extract<GitV3ExtractionDestinationProofResult, { status: "refused" }> {
  return {
    status: "refused",
    reason,
    ...(locus === undefined ? {} : { locus }),
    ...(evidence === undefined ? {} : { evidence }),
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

type V3ExtractionSourceGroupClassification =
  | { status: "admitted" }
  | { status: "reauthor"; locus: string; evidence?: V3DecomposeRefusalEvidence };

interface V3ExtractionSourceGroupArtifact {
  path: string;
  objectKind: string;
  mode: string;
  bytes: Uint8Array;
}

function sourceGroupArtifacts(
  tree: V3RepositoryPlanTree,
  sourceOriginPath: string,
  origin: string,
): V3ExtractionSourceGroupArtifact[] {
  const sourceDirectory = posix.dirname(sourceOriginPath);
  return Object.entries(tree).flatMap(([path, state]) => (
    state.kind === "object"
      && isGitV3DecomposeSourceArtifactPath(path, sourceDirectory, origin)
      ? [{
          path,
          objectKind: state.objectKind,
          mode: state.mode,
          bytes: state.bytes,
        }]
      : []
  )).sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
}

function sourceArtifactEvidence(
  artifact: V3ExtractionSourceGroupArtifact | undefined,
): V3DecomposeEvidenceValue {
  return artifact === undefined
    ? v3DecomposeAbsentEvidence()
    : {
        kind: "object",
        objectKind: artifact.objectKind,
        mode: artifact.mode,
        ...v3DecomposeByteEvidence(artifact.bytes),
      };
}

function plannedAfterEvidence(
  file: V3ExtractionSourceThinningFilePlan,
): V3DecomposeEvidenceValue {
  return file.after.kind === "absent"
    ? v3DecomposeAbsentEvidence()
    : {
        kind: "object",
        objectKind: "blob",
        mode: file.after.mode,
        ...v3DecomposeByteEvidence(file.after.bytes),
      };
}

function artifactsEqual(
  left: V3ExtractionSourceGroupArtifact | undefined,
  right: V3ExtractionSourceGroupArtifact,
): boolean {
  return left !== undefined
    && right.objectKind === "blob"
    && left.objectKind === right.objectKind
    && left.mode === right.mode
    && Buffer.from(left.bytes).equals(Buffer.from(right.bytes));
}

function artifactMatchesAfter(
  artifact: V3ExtractionSourceGroupArtifact | undefined,
  file: V3ExtractionSourceThinningFilePlan,
): boolean {
  if (file.after.kind === "absent") return artifact === undefined;
  return artifact !== undefined
    && artifact.objectKind === "blob"
    && artifact.mode === file.after.mode
    && Buffer.from(artifact.bytes).equals(Buffer.from(file.after.bytes));
}

function companionPlanIsNoop(
  original: V3ExtractionSourceGroupArtifact,
  file: V3ExtractionSourceThinningFilePlan | undefined,
): boolean {
  return file === undefined || (
    file.before.mode === original.mode
    && file.before.contentDigest === digestBytes(original.bytes)
    && file.before.byteLength === original.bytes.byteLength
    && file.after.kind === "file"
    && file.after.mode === original.mode
    && Buffer.from(file.after.bytes).equals(Buffer.from(original.bytes))
    && file.removedLocators.length === 0
  );
}

function classifyV3ExtractionSourceGroup(
  map: V3DecomposeCutMap,
  sourceOriginPath: string,
  originalArtifacts: readonly V3ExtractionSourceGroupArtifact[],
  currentArtifacts: readonly V3ExtractionSourceGroupArtifact[],
  originalFiles: readonly V3ExtractionSourceThinningFilePlan[],
): V3ExtractionSourceGroupClassification {
  const original = new Map(originalArtifacts
    .filter(({ path }) => path !== sourceOriginPath)
    .map((artifact) => [artifact.path, artifact]));
  const current = new Map(currentArtifacts
    .filter(({ path }) => path !== sourceOriginPath)
    .map((artifact) => [artifact.path, artifact]));
  const files = new Map(originalFiles.map((file) => [file.path, file]));
  const paths = sortByCanonicalBytes([...new Set([...original.keys(), ...current.keys()])]);

  for (const path of paths) {
    const before = original.get(path);
    const observed = current.get(path);
    const file = files.get(path);
    if (before === undefined) {
      return {
        status: "reauthor",
        locus: path,
        evidence: {
          expected: v3DecomposeAbsentEvidence(),
          actual: sourceArtifactEvidence(observed),
        },
      };
    }
    const companion = !map.machine.planningProfile.sourceDesign.includes(posix.basename(path));
    const admitted = companion
      ? companionPlanIsNoop(before, file) && artifactsEqual(observed, before)
      : file !== undefined
        && (artifactsEqual(observed, before) || artifactMatchesAfter(observed, file));
    if (!admitted) {
      return {
        status: "reauthor",
        locus: path,
        evidence: {
          expected: companion
            ? sourceArtifactEvidence(before)
            : {
                before: sourceArtifactEvidence(before),
                after: file === undefined ? v3DecomposeAbsentEvidence() : plannedAfterEvidence(file),
              },
          actual: sourceArtifactEvidence(observed),
        },
      };
    }
  }
  return { status: "admitted" };
}

function planRefusal(result: Extract<V3RepositoryPlanResult, { status: "refused" }>):
Extract<GitV3ExtractionDestinationProofResult, { status: "refused" }> {
  return refused(
    `destination-plan:${result.refusal.stage}:${result.refusal.reason}`,
    result.refusal.locus,
    result.refusal.evidence,
  );
}

type DestinationProofRefusal = Extract<GitV3ExtractionDestinationProofResult, { status: "refused" }>;

interface ExtractionMapInput {
  map: V3DecomposeCutMap;
  baseRef: string;
}

type ExtractionMapInputResult =
  | { status: "ready"; value: ExtractionMapInput }
  | DestinationProofRefusal;

async function readExtractionMapInput(
  input: GitV3ExtractionFinishInput,
): Promise<ExtractionMapInputResult> {
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
  if (map.authoring.shape !== "extraction") {
    return refused("map:authoring-shape", "authoring.shape");
  }
  if (map.machine.source.origin !== input.origin) {
    return refused("map:origin", "machine.source.origin", {
      expected: map.machine.source.origin,
      actual: input.origin,
    });
  }
  const baseRef = `refs/heads/${input.baseBranch}`;
  if (map.machine.resultBase.ref !== baseRef) {
    return refused("base-ref-mismatch", "machine.resultBase.ref", {
      expected: map.machine.resultBase.ref,
      actual: baseRef,
    });
  }
  return { status: "ready", value: { map, baseRef } };
}

interface ExtractionProofRefs {
  head: string;
  baseHead: string;
}

type ExtractionProofRefsResult =
  | { status: "ready"; value: ExtractionProofRefs }
  | DestinationProofRefusal;

async function validateExtractionProofRefs(
  dependencies: GitV3RepositoryPlanDependencies,
  map: V3DecomposeCutMap,
  baseRef: string,
): Promise<ExtractionProofRefsResult> {
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
  if (sourceRef !== head) {
    return refused(
      "source-ref-moved",
      map.machine.source.ref,
      sourceRef === null ? undefined : { expected: head, actual: sourceRef },
    );
  }
  if (baseHead === null) return refused("base-missing", baseRef);
  const ancestryArgs = ["merge-base", "--is-ancestor", map.machine.resultBase.head, baseHead];
  try {
    await dependencies.exec("git", ancestryArgs, { cwd: dependencies.cwd });
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args: ancestryArgs });
    return failure.kind === "nonzero-exit" && failure.exitCode === 1
      ? refused("base-not-descendant", baseRef)
      : refused("base-ancestry-unavailable", failure.message);
  }
  return { status: "ready", value: { head, baseHead } };
}

interface ExtractionSourceState {
  sourceSnapshot: V3DecomposeTreeSnapshot;
  originalSourceSnapshot: V3DecomposeTreeSnapshot;
  originalBaseSnapshot: V3DecomposeTreeSnapshot;
  currentSourceRepositoryTree: V3RepositoryPlanTree;
  originalSourceRepositoryTree: V3RepositoryPlanTree;
}

type ExtractionSourceStateResult =
  | { status: "ready"; value: ExtractionSourceState }
  | DestinationProofRefusal;

async function readExtractionSourceState(
  dependencies: GitV3RepositoryPlanDependencies,
  map: V3DecomposeCutMap,
  input: GitV3ExtractionFinishInput,
  head: string,
): Promise<ExtractionSourceStateResult> {
  const [
    sourceSnapshot,
    originalSourceSnapshot,
    originalBaseSnapshot,
    currentSourceRepositoryTree,
    originalSourceRepositoryTree,
  ] = await Promise.all([
    readGitV3DecomposeTreeSnapshot(
      dependencies,
      map.machine.source.ref,
      head,
      input.origin,
      { unsupportedArtifacts: "omit" },
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
    readGitV3RepositoryTree(dependencies, head),
    readGitV3RepositoryTree(dependencies, map.machine.source.head),
  ]);
  if (currentSourceRepositoryTree === null) return refused("source-tree-unreadable", head);
  if (originalSourceRepositoryTree === null) {
    return refused("source-tree-unreadable", map.machine.source.head);
  }
  return {
    status: "ready",
    value: {
      sourceSnapshot,
      originalSourceSnapshot,
      originalBaseSnapshot,
      currentSourceRepositoryTree,
      originalSourceRepositoryTree,
    },
  };
}

interface OriginalSourceProof {
  preflight: V3DecomposePreflight;
}

type OriginalSourceProofResult =
  | { status: "ready"; value: OriginalSourceProof }
  | DestinationProofRefusal;

function preflightSourceBase(
  map: V3DecomposeCutMap,
  sourceSnapshot: V3DecomposeTreeSnapshot,
  baseSnapshot: V3DecomposeTreeSnapshot,
): V3DecomposeTreeSnapshot {
  return map.machine.source.ref === map.machine.resultBase.ref ? sourceSnapshot : baseSnapshot;
}

function validateOriginalSourceProof(
  map: V3DecomposeCutMap,
  input: GitV3ExtractionFinishInput,
  state: ExtractionSourceState,
): OriginalSourceProofResult {
  const original = createV3DecomposePreflight({
    origin: input.origin,
    sourceBase: preflightSourceBase(map, state.originalSourceSnapshot, state.originalBaseSnapshot),
    resultBase: map.machine.resultBase,
    localBranches: map.machine.source.ref === map.machine.resultBase.ref
      ? []
      : [state.originalSourceSnapshot],
  });
  if (original.status === "rejected") {
    return refused(`source:${original.reason}`, original.locus, original.evidence);
  }
  const binding = revalidateV3DecomposeCutMapBinding(map, original.preflight);
  if (binding.status === "stale") {
    return refused(`source:${binding.reason}`, binding.locus, binding.evidence);
  }
  const sourceTree = Object.fromEntries(state.originalSourceSnapshot.sourceArtifacts.map((artifact) => [
    artifact.path,
    {
      kind: "object" as const,
      objectKind: artifact.objectKind,
      mode: artifact.mode,
      bytes: artifact.bytes,
    },
  ]));
  const thinning = planV3ExtractionSourceThinning({
    completedMap: map,
    currentPreflight: binding.preflight,
    sourceTree,
  });
  if (thinning.status === "refused") {
    return refused(`source-plan:${thinning.reason}`, thinning.locus, thinning.evidence);
  }
  const group = classifyV3ExtractionSourceGroup(
    map,
    binding.preflight.sourceOriginPath,
    state.originalSourceSnapshot.sourceArtifacts,
    sourceGroupArtifacts(
      state.currentSourceRepositoryTree,
      binding.preflight.sourceOriginPath,
      input.origin,
    ),
    thinning.files,
  );
  return group.status === "reauthor"
    ? refused("source:source-units", group.locus, group.evidence)
    : { status: "ready", value: { preflight: binding.preflight } };
}

interface SelectedSourceProof {
  completedMap: V3DecomposeCutMap;
  preflight: V3DecomposePreflight;
  sourceHead: string;
}

type SelectedSourceProofResult =
  | { status: "ready"; value: SelectedSourceProof }
  | DestinationProofRefusal;

function selectExtractionSourceProof(
  map: V3DecomposeCutMap,
  input: GitV3ExtractionFinishInput,
  state: ExtractionSourceState,
  head: string,
  original: OriginalSourceProof,
): SelectedSourceProofResult {
  const refreshed = createV3DecomposePreflight({
    origin: input.origin,
    sourceBase: preflightSourceBase(map, state.sourceSnapshot, state.originalBaseSnapshot),
    resultBase: map.machine.resultBase,
    localBranches: map.machine.source.ref === map.machine.resultBase.ref ? [] : [state.sourceSnapshot],
  });
  if (refreshed.status === "ready") {
    const binding = refreshV3ExtractionCutMap(map, refreshed.preflight);
    if (binding.status !== "reauthor") {
      return {
        status: "ready",
        value: {
          completedMap: binding.completedMap,
          preflight: binding.preflight,
          sourceHead: head,
        },
      };
    }
    if (binding.reason !== "source-units" || binding.locus.endsWith(".contentDigest")) {
      return refused(`source:${binding.reason}`, binding.locus, binding.evidence);
    }
  } else if (refreshed.reason !== "planning-profile" && refreshed.reason !== "source-scan") {
    return refused(`source:${refreshed.reason}`, refreshed.locus, refreshed.evidence);
  }
  return {
    status: "ready",
    value: {
      completedMap: map,
      preflight: original.preflight,
      sourceHead: map.machine.source.head,
    },
  };
}

type DestinationBaseProofResult =
  | { status: "ready"; destinations: V3ExtractionFinishPreparation["proof"]["destinations"] }
  | DestinationProofRefusal;

async function proveExtractionDestinationBase(
  dependencies: GitV3RepositoryPlanDependencies,
  input: GitV3ExtractionFinishInput,
  map: V3DecomposeCutMap,
  original: OriginalSourceProof,
  originalSourceRepositoryTree: V3RepositoryPlanTree,
  baseHead: string,
): Promise<DestinationBaseProofResult> {
  const [originalBaseTree, currentBaseTree] = await Promise.all([
    readGitV3RepositoryTree(dependencies, map.machine.resultBase.head),
    readGitV3RepositoryTree(dependencies, baseHead),
  ]);
  if (originalBaseTree === null) {
    return refused("result-base-tree-unreadable", map.machine.resultBase.head);
  }
  if (currentBaseTree === null) return refused("base-tree-unreadable", baseHead);
  const originalRoadmap = roadmapBytes(originalBaseTree);
  if (originalRoadmap === null) return refused("result-base-roadmap-unreadable", ROADMAP_PATH);
  const expected = await composeV3ExtractionRepositoryPlan({
    completedMap: map,
    currentPreflight: original.preflight,
    sourceTree: originalSourceRepositoryTree,
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
  return destinations.status === "refused"
    ? destinations
    : { status: "ready", destinations: destinations.destinations };
}

async function validateExtractionProofRace(
  dependencies: GitV3RepositoryPlanDependencies,
  map: V3DecomposeCutMap,
  baseRef: string,
  head: string,
  baseHead: string,
): Promise<DestinationProofRefusal | null> {
  const [sourceAfter, baseAfter, branchAfter, headAfter] = await Promise.all([
    exactRef(dependencies, map.machine.source.ref),
    exactRef(dependencies, baseRef),
    currentBranch(dependencies),
    exactRef(dependencies, "HEAD"),
  ]);
  if (sourceAfter !== head
    || branchAfter !== map.machine.source.logicalBranch
    || headAfter !== head) {
    const evidence = sourceAfter === null || branchAfter === null || headAfter === null
      ? undefined
      : {
          expected: { ref: head, branch: map.machine.source.logicalBranch, head },
          actual: { ref: sourceAfter, branch: branchAfter, head: headAfter },
        };
    return refused("source-raced", map.machine.source.ref, evidence);
  }
  return baseAfter === baseHead
    ? null
    : refused(
      "base-raced",
      baseRef,
      baseAfter === null ? undefined : { expected: baseHead, actual: baseAfter },
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
  const decoded = await readExtractionMapInput(input);
  if (decoded.status === "refused") return decoded;
  const { map, baseRef } = decoded.value;
  try {
    const refs = await validateExtractionProofRefs(dependencies, map, baseRef);
    if (refs.status === "refused") return refs;
    const { head, baseHead } = refs.value;
    const sourceState = await readExtractionSourceState(dependencies, map, input, head);
    if (sourceState.status === "refused") return sourceState;
    const original = validateOriginalSourceProof(map, input, sourceState.value);
    if (original.status === "refused") return original;
    const selected = selectExtractionSourceProof(map, input, sourceState.value, head, original.value);
    if (selected.status === "refused") return selected;
    const destination = await proveExtractionDestinationBase(
      dependencies,
      input,
      map,
      original.value,
      sourceState.value.originalSourceRepositoryTree,
      baseHead,
    );
    if (destination.status === "refused") return destination;
    const race = await validateExtractionProofRace(dependencies, map, baseRef, head, baseHead);
    if (race !== null) return race;
    const sourceTree = selected.value.sourceHead === head
      ? sourceState.value.currentSourceRepositoryTree
      : sourceState.value.originalSourceRepositoryTree;
    return {
      status: "proven",
      preparation: {
        completedMap: selected.value.completedMap,
        currentPreflight: selected.value.preflight,
        sourceTree,
        proof: {
          baseRef,
          baseHead,
          destinations: destination.destinations,
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

type ExtractionSourceDirt = Awaited<ReturnType<typeof sourceDirt>>;

type ExtractionSourceDirtResult =
  | { status: "ready"; dirt: ExtractionSourceDirt }
  | Extract<V3ExtractionFinishOperationResult, { status: "refused" }>;

async function validateExtractionSourceDirt(
  dependencies: GitV3RepositoryPlanDependencies,
  sourceDir: string,
  files: readonly V3ExtractionSourceThinningFilePlan[],
): Promise<ExtractionSourceDirtResult> {
  let dirt: ExtractionSourceDirt;
  try {
    dirt = await sourceDirt(dependencies, sourceDir);
  } catch {
    return { status: "refused", reason: "source-dirt-read", locus: sourceDir };
  }
  const plannedPaths = new Set(files.map(({ path }) => path));
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
  return { status: "ready", dirt };
}

async function validateFinishApplyRefs(
  dependencies: GitV3RepositoryPlanDependencies,
  preparation: V3ExtractionFinishPreparation,
): Promise<
  | { status: "ready" }
  | { status: "refused"; reason: string; locus: string; evidence?: V3DecomposeRefusalEvidence }
> {
  const [liveBase, liveSource, liveBranch, liveHead] = await Promise.all([
    exactRef(dependencies, preparation.proof.baseRef),
    exactRef(dependencies, preparation.completedMap.machine.source.ref),
    currentBranch(dependencies),
    exactRef(dependencies, "HEAD"),
  ]);
  const expectedSource = preparation.completedMap.machine.source;
  if (liveSource !== liveHead
    || liveBranch !== expectedSource.logicalBranch
    || liveHead !== expectedSource.head) {
    return {
      status: "refused",
      reason: "source-raced",
      locus: expectedSource.ref,
      ...(liveSource === null || liveBranch === null || liveHead === null ? {} : {
        evidence: {
          expected: {
            ref: expectedSource.head,
            branch: expectedSource.logicalBranch,
            head: expectedSource.head,
          },
          actual: { ref: liveSource, branch: liveBranch, head: liveHead },
        },
      }),
    };
  }
  return liveBase === preparation.proof.baseHead
    ? { status: "ready" }
    : {
        status: "refused",
        reason: "base-raced",
        locus: preparation.proof.baseRef,
        ...(liveBase === null ? {} : {
          evidence: { expected: preparation.proof.baseHead, actual: liveBase },
        }),
      };
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
      ...(thinning.evidence === undefined ? {} : { evidence: thinning.evidence }),
    };
  }
  const sourceDir = posix.dirname(proof.preparation.currentPreflight.sourceOriginPath);
  const dirtResult = await validateExtractionSourceDirt(dependencies, sourceDir, thinning.files);
  if (dirtResult.status === "refused") return dirtResult;
  const { dirt } = dirtResult;
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
      beforeApply: () => validateFinishApplyRefs(dependencies, proof.preparation),
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
