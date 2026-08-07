/** Receipt-free append-only base advancement for one committed decomposition transition. */

import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalize, digestBytes } from "../canonical/canonical-json.js";
import type { ProtectionMode } from "../git/write-context.js";
import { readWorktreeMarker, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import { createDecomposeTransitionRecord } from "./decompose-transition-record.js";
import { decomposeCandidateBranch } from "./decompose-candidate.js";
import type { V3PlanCanonicalPathState, ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import {
  decodeV3DecomposeCutMap,
  v3IncomingEdgeId,
  v3PreflightId,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";
import {
  composeGitV3RepositoryPlan,
  type GitV3RepositoryPlanDependencies,
  type GitV3RepositoryPlanResult,
} from "./git-decompose-v3-repository-plan.js";
import { readGitV3DecomposeTreeSnapshot } from "./git-decompose-v3-preflight.js";
import { serializeTransitionRecord } from "./transition-record.js";
import { resolveTransitionRecordRelativePath } from "./transition-record-store.js";

export interface GitDecomposeTransitionBaseAdvancementDependencies
  extends GitV3RepositoryPlanDependencies {
  scanWorktrees?: () => Promise<RegisteredWorktreeScanResult>;
  readMarker?: (path: string) => Promise<WorktreeMarkerReadResult>;
  composePlan?: (baseRef: string, completedMap: unknown) => Promise<GitV3RepositoryPlanResult>;
}

export interface GitDecomposeTransitionBaseAdvancementInput {
  protection: ProtectionMode;
  baseBranch: string;
  completedMap: unknown;
}

export type GitDecomposeTransitionBaseAdvancementResult =
  | {
      status: "advanced";
      candidateBranch: string;
      candidateHead: string;
      previousBaseHead: string;
      currentBaseHead: string;
    }
  | { status: "unchanged"; candidateBranch: string; candidateHead: string; currentBaseHead: string }
  | { status: "refused"; reason: string };

type ComposedPlan = Extract<GitV3RepositoryPlanResult, { status: "composed" }>;

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function restateMap(map: V3DecomposeCutMap, baseRef: string, baseHead: string): V3DecomposeCutMap {
  const machineWithoutId = {
    ...map.machine,
    resultBase: { ref: baseRef, head: baseHead },
  };
  const preflightFacts = {
    source: machineWithoutId.source,
    resultBase: machineWithoutId.resultBase,
    planningProfile: machineWithoutId.planningProfile,
    sourceUnits: machineWithoutId.sourceUnits,
    incomingEdges: machineWithoutId.incomingEdges,
    outgoingEdges: machineWithoutId.outgoingEdges,
  };
  return {
    ...map,
    machine: { ...preflightFacts, preflightId: v3PreflightId(preflightFacts) },
  };
}

async function resolveCommit(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
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

async function isAncestor(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  ancestor: string,
  descendant: string,
): Promise<boolean | null> {
  try {
    await dependencies.exec(
      "git",
      ["merge-base", "--is-ancestor", ancestor, descendant],
      { cwd: dependencies.cwd },
    );
    return true;
  } catch (error) {
    const failure = error as { exitCode?: unknown; code?: unknown };
    if (failure.exitCode === 1 || failure.code === 1) return false;
    return null;
  }
}

function markerMatches(marker: WorktreeMarkerReadResult, candidateBranch: string): boolean {
  return marker.kind === "present"
    && marker.marker.spawnedByArc
    && marker.marker.createdFor?.kind === "branch"
    && marker.marker.createdFor.ref === candidateBranch;
}

async function changedPaths(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  before: string,
  after: string | null,
): Promise<string[] | null> {
  try {
    const args = after === null
      ? ["diff", "--cached", "--name-only", "--no-renames", "-z", before]
      : ["diff-tree", "--no-commit-id", "--name-only", "--no-renames", "-r", "-z", before, after];
    const { stdout } = await dependencies.exec("git", args, { cwd });
    return stdout.split("\0").filter(Boolean).sort(compareUtf8);
  } catch {
    return null;
  }
}

async function committedState(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  ref: string,
  path: string,
): Promise<V3PlanCanonicalPathState | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["ls-tree", "-z", ref, `:(literal)${path}`],
      { cwd: dependencies.cwd },
    );
    if (stdout === "") return { kind: "absent" };
    const match = /^(100644|100755) blob ([0-9a-f]{40,64})\t/u.exec(stdout);
    if (match?.[1] === undefined || match[2] === undefined) return null;
    return {
      kind: "file",
      mode: match[1] === "100755" ? "100755" : "100644",
      contentDigest: digestBytes(await dependencies.readObject(match[2], "blob")),
    };
  } catch {
    return null;
  }
}

async function indexState(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  path: string,
): Promise<V3PlanCanonicalPathState | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["ls-files", "--stage", "-z", "--", path],
      { cwd },
    );
    if (stdout === "") return { kind: "absent" };
    const match = /^(100644|100755) ([0-9a-f]{40,64}) 0\t/u.exec(stdout);
    if (match?.[1] === undefined || match[2] === undefined) return null;
    return {
      kind: "file",
      mode: match[1] === "100755" ? "100755" : "100644",
      contentDigest: digestBytes(await dependencies.readObject(match[2], "blob")),
    };
  } catch {
    return null;
  }
}

function statesEqual(
  left: V3PlanCanonicalPathState | null,
  right: V3PlanCanonicalPathState,
): boolean {
  return left !== null
    && left.kind === right.kind
    && (left.kind === "absent" || (right.kind === "file"
      && left.mode === right.mode
      && left.contentDigest === right.contentDigest));
}

function expectedPaths(plan: ValidatedDecomposePlan, recordPath: string): string[] {
  return [
    ...plan.mutations
      .filter(({ before, after }) => !statesEqual(before, after))
      .map(({ path }) => path),
    recordPath,
  ].sort(compareUtf8);
}

async function exactTransitionTree(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  baseHead: string,
  candidateHead: string,
  composed: ComposedPlan,
  recordPath: string,
  recordBytes: Uint8Array,
  tolerateGeneratedRoadmap: boolean,
): Promise<string | null> {
  const changed = await changedPaths(dependencies, dependencies.cwd, baseHead, candidateHead);
  const expected = expectedPaths(composed.plan, recordPath);
  if (changed === null) return "changed-paths-unavailable";
  if (changed.join("\0") !== expected.join("\0")) {
    return `changed-paths:${changed.join(",")}:${expected.join(",")}`;
  }
  for (const mutation of composed.plan.mutations) {
    if (tolerateGeneratedRoadmap && mutation.kind === "exclusive" && mutation.role === "roadmap") continue;
    if (!statesEqual(await committedState(dependencies, candidateHead, mutation.path), mutation.after)) {
      return `path-state:${mutation.path}`;
    }
  }
  const record = await committedState(dependencies, candidateHead, recordPath);
  return record?.kind === "file"
    && record.mode === "100644"
    && record.contentDigest === digestBytes(recordBytes)
    ? null
    : `transition-record:${recordPath}`;
}

async function applyPlan(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  composed: ComposedPlan,
): Promise<string | null> {
  const blobs = new Map(composed.blobs.map(({ contentDigest, bytes }) => [contentDigest, bytes]));
  try {
    for (const mutation of composed.plan.mutations) {
      if (statesEqual(mutation.before, mutation.after)) continue;
      const target = join(cwd, mutation.path);
      if (mutation.after.kind === "absent") {
        await rm(target, { force: true });
        await dependencies.exec("git", ["update-index", "--force-remove", "--", mutation.path], { cwd });
      } else {
        const bytes = blobs.get(mutation.after.contentDigest);
        if (bytes === undefined) return `blob-unavailable:${mutation.path}`;
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
        await chmod(target, mutation.after.mode === "100755" ? 0o755 : 0o644);
        await dependencies.exec("git", ["add", "--", mutation.path], { cwd });
      }
    }
    return null;
  } catch (error) {
    return `write-failed:${error instanceof Error ? error.message : String(error)}`;
  }
}

async function exactIndexTree(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  baseHead: string,
  composed: ComposedPlan,
  recordPath: string,
  recordBytes: Uint8Array,
): Promise<string | null> {
  const changed = await changedPaths(dependencies, cwd, baseHead, null);
  const expected = expectedPaths(composed.plan, recordPath);
  if (changed === null) return "changed-paths-unavailable";
  if (changed.join("\0") !== expected.join("\0")) {
    return `changed-paths:${changed.join(",")}:${expected.join(",")}`;
  }
  for (const mutation of composed.plan.mutations) {
    if (!statesEqual(await indexState(dependencies, cwd, mutation.path), mutation.after)) {
      return `path-state:${mutation.path}`;
    }
  }
  const record = await indexState(dependencies, cwd, recordPath);
  return record?.kind === "file"
    && record.mode === "100644"
    && record.contentDigest === digestBytes(recordBytes)
    ? null
    : `transition-record:${recordPath}`;
}

async function restoreCandidate(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  candidatePath: string,
  candidateHead: string,
): Promise<boolean> {
  try {
    await dependencies.exec("git", ["merge", "--abort"], { cwd: candidatePath });
  } catch {
    // A failed merge may not have installed MERGE_HEAD; the exact reset remains authoritative.
  }
  try {
    await dependencies.exec("git", ["reset", "--hard", candidateHead], { cwd: candidatePath });
    return true;
  } catch {
    return false;
  }
}

async function commitParents(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  commit: string,
): Promise<string[] | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-list", "--parents", "-n", "1", commit],
      { cwd: dependencies.cwd },
    );
    const fields = stdout.trim().split(/\s+/u);
    return fields[0] === commit ? fields.slice(1) : null;
  } catch {
    return null;
  }
}

async function firstParentChain(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  baseHead: string,
  candidateHead: string,
): Promise<string[] | null> {
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["rev-list", "--first-parent", "--reverse", `${baseHead}..${candidateHead}`],
      { cwd: dependencies.cwd },
    );
    const commits = stdout.split(/\r?\n/u).filter(Boolean);
    return commits.length === 0 ? null : commits;
  } catch {
    return null;
  }
}

/** Advance one exact committed transition candidate over a descendant configured base. */
export async function advanceGitDecomposeTransitionBase(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  input: GitDecomposeTransitionBaseAdvancementInput,
): Promise<GitDecomposeTransitionBaseAdvancementResult> {
  if (input.protection !== "full") return { status: "refused", reason: "full-protection-required" };
  const decoded = decodeV3DecomposeCutMap(input.completedMap);
  if (decoded.status === "rejected") return { status: "refused", reason: `map:${decoded.issue.code}` };
  const map = decoded.value;
  const candidateBranch = decomposeCandidateBranch(map.machine.source.origin);
  const scan = await (dependencies.scanWorktrees ?? (() => scanRegisteredWorktrees(
    async (command, args, options) => await dependencies.exec(command, args, {
      ...options,
      cwd: options?.cwd ?? dependencies.cwd,
    }),
  )))();
  if (!scan.ok) return { status: "refused", reason: "candidate-topology-unavailable" };
  const registrations = scan.worktrees.filter(({ branch }) => branch === candidateBranch);
  if (registrations.length !== 1 || registrations[0] === undefined) {
    return { status: "refused", reason: "candidate-registration-mismatch" };
  }
  const registration = registrations[0];
  const marker = await (dependencies.readMarker ?? readWorktreeMarker)(registration.path);
  if (!markerMatches(marker, candidateBranch)) return { status: "refused", reason: "candidate-marker-mismatch" };
  const [candidateHead, currentBaseHead] = await Promise.all([
    resolveCommit(dependencies, candidateBranch),
    resolveCommit(dependencies, input.baseBranch),
  ]);
  if (candidateHead === null || currentBaseHead === null || registration.head !== candidateHead) {
    return { status: "refused", reason: "binding-unavailable" };
  }
  try {
    const { stdout } = await dependencies.exec(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd: registration.path },
    );
    if (stdout !== "") return { status: "refused", reason: "candidate-dirty" };
  } catch {
    return { status: "refused", reason: "binding-unavailable" };
  }

  const authoredBaseHead = map.machine.resultBase.head;
  const ancestry = await isAncestor(dependencies, authoredBaseHead, currentBaseHead);
  if (ancestry !== true) {
    return { status: "refused", reason: ancestry === false ? "base-not-descendant" : "binding-unavailable" };
  }
  const record = createDecomposeTransitionRecord(map);
  if (record === null) return { status: "refused", reason: "transition-record-projection-invalid" };
  const recordPath = resolveTransitionRecordRelativePath(record.origin);
  const recordBytes = new TextEncoder().encode(serializeTransitionRecord(record));
  const compose = dependencies.composePlan ?? (async (baseRef, completedMap) =>
    await composeGitV3RepositoryPlan(dependencies, baseRef, completedMap));
  let currentIncomingEdges: V3DecomposeCutMap["machine"]["incomingEdges"];
  try {
    const snapshot = await readGitV3DecomposeTreeSnapshot(
      dependencies,
      map.machine.resultBase.ref,
      currentBaseHead,
      map.machine.source.origin,
    );
    currentIncomingEdges = snapshot.incomingEdges.map((edge) => ({
      edgeId: v3IncomingEdgeId({ dependent: edge.dependent, currentTargets: [...edge.currentTargets] }),
      dependent: edge.dependent,
      currentTargets: [...edge.currentTargets],
    }));
  } catch {
    return { status: "refused", reason: "base-dependency-snapshot-unavailable" };
  }
  if (canonicalize(currentIncomingEdges) !== canonicalize(map.machine.incomingEdges)) {
    return { status: "refused", reason: "base-acquired-incoming-dependency" };
  }
  const currentMap = restateMap(map, map.machine.resultBase.ref, currentBaseHead);
  const currentPlan = await compose(input.baseBranch, currentMap);
  if (currentPlan.status !== "composed") {
    return {
      status: "refused",
      reason: `advancement-plan-refused:${currentPlan.refusal.stage}:${currentPlan.refusal.reason}`,
    };
  }
  const chain = await firstParentChain(dependencies, authoredBaseHead, candidateHead);
  if (chain === null) return { status: "refused", reason: "candidate-history-unavailable" };
  const initialCommit = chain[0];
  if (initialCommit === undefined) return { status: "refused", reason: "candidate-history-unavailable" };
  const initialParents = await commitParents(dependencies, initialCommit);
  if (initialParents?.length !== 1 || initialParents[0] !== authoredBaseHead) {
    return { status: "refused", reason: "candidate-initial-transition-invalid" };
  }
  const initialMismatch = await exactTransitionTree(
    dependencies,
    authoredBaseHead,
    initialCommit,
    currentPlan,
    recordPath,
    recordBytes,
    true,
  );
  if (initialMismatch !== null) {
    return { status: "refused", reason: `candidate-transform-mismatch:${initialMismatch}` };
  }

  let previousCandidateHead = initialCommit;
  let previousBaseHead = authoredBaseHead;
  for (const advancementCommit of chain.slice(1)) {
    const parents = await commitParents(dependencies, advancementCommit);
    if (parents?.length !== 2 || parents[0] !== previousCandidateHead || parents[1] === undefined) {
      return { status: "refused", reason: "candidate-advancement-chain-invalid" };
    }
    const absorbedBaseHead = parents[1];
    if (await isAncestor(dependencies, previousBaseHead, absorbedBaseHead) !== true) {
      return { status: "refused", reason: "candidate-advancement-base-invalid" };
    }
    const mismatch = await exactTransitionTree(
      dependencies,
      absorbedBaseHead,
      advancementCommit,
      currentPlan,
      recordPath,
      recordBytes,
      true,
    );
    if (mismatch !== null) {
      return { status: "refused", reason: `candidate-advancement-chain-invalid:${mismatch}` };
    }
    previousCandidateHead = advancementCommit;
    previousBaseHead = absorbedBaseHead;
  }
  if (previousCandidateHead !== candidateHead) {
    return { status: "refused", reason: "candidate-advancement-chain-invalid" };
  }
  if (await isAncestor(dependencies, previousBaseHead, currentBaseHead) !== true) {
    return { status: "refused", reason: "base-not-descendant" };
  }
  if (await resolveCommit(dependencies, candidateBranch) !== candidateHead
    || await resolveCommit(dependencies, input.baseBranch) !== currentBaseHead) {
    return { status: "refused", reason: "binding-raced" };
  }

  if (currentBaseHead === previousBaseHead) {
    return { status: "unchanged", candidateBranch, candidateHead, currentBaseHead };
  }
  if (await resolveCommit(dependencies, candidateBranch) !== candidateHead
    || await resolveCommit(dependencies, input.baseBranch) !== currentBaseHead) {
    return { status: "refused", reason: "binding-raced" };
  }
  try {
    await dependencies.exec(
      "git",
      ["merge", "--no-commit", "--no-ff", currentBaseHead],
      { cwd: registration.path },
    );
  } catch {
    const restored = await restoreCandidate(dependencies, registration.path, candidateHead);
    return { status: "refused", reason: restored ? "merge-refused" : "candidate-restore-failed" };
  }
  const applicationMismatch = await applyPlan(dependencies, registration.path, currentPlan);
  const indexMismatch = applicationMismatch === null
    ? await exactIndexTree(
        dependencies,
        registration.path,
        currentBaseHead,
        currentPlan,
        recordPath,
        recordBytes,
      )
    : applicationMismatch;
  const candidateAfter = await resolveCommit(dependencies, candidateBranch);
  const baseAfter = await resolveCommit(dependencies, input.baseBranch);
  if (indexMismatch !== null || candidateAfter !== candidateHead || baseAfter !== currentBaseHead) {
    const restored = await restoreCandidate(dependencies, registration.path, candidateHead);
    return {
      status: "refused",
      reason: restored
        ? `post-merge-validation-refused:${indexMismatch ?? "binding-raced"}`
        : "candidate-restore-failed",
    };
  }
  return {
    status: "advanced",
    candidateBranch,
    candidateHead,
    previousBaseHead,
    currentBaseHead,
  };
}
