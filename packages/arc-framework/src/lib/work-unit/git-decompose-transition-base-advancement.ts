/** Receipt-free append-only base advancement for one committed decomposition transition. */

import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseMetaRecord } from "../active/meta-reader.js";
import {
  canonicalize,
  digestBytes,
  sortByCanonicalBytes,
} from "../canonical/canonical-json.js";
import { normalizeGitRejection } from "../git/process-error.js";
import type { ProtectionMode } from "../git/write-context.js";
import { readWorktreeMarker, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import {
  scanRegisteredWorktrees,
  type RegisteredWorktreeScanResult,
} from "../git/worktree-roster.js";
import { identifyWorkUnitArtifactPath } from "../layout/index.js";
import { createDecomposeTransitionRecord } from "./decompose-transition-record.js";
import { decomposeCandidateBranch } from "./decompose-candidate.js";
import type {
  V3DecomposeEvidenceValue,
  V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
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
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

type ComposedPlan = Extract<GitV3RepositoryPlanResult, { status: "composed" }>;
type AdvancementRefusal = Extract<GitDecomposeTransitionBaseAdvancementResult, { status: "refused" }>;

interface AdvancementMismatch {
  reason: string;
  locus?: string;
  evidence?: V3DecomposeRefusalEvidence;
}

interface CandidateAdvancementCommit {
  commit: string;
  absorbedBaseHead: string;
}

type CandidateChainResult =
  | {
      status: "ready";
      initialCommit: string;
      advancements: CandidateAdvancementCommit[];
      previousBaseHead: string;
    }
  | { status: "refused"; refusal: AdvancementRefusal };

type DependencyRecipientComparison =
  | { status: "matched" }
  | { status: "unavailable"; locus: string }
  | {
      status: "drift";
      locus: string;
      evidence: V3DecomposeRefusalEvidence;
    };

interface DependencyRecipient {
  dependent: string;
  path: string;
}

type DependencyRecipientObservation =
  | { status: "present"; path: string; targets: string[] }
  | { status: "absent" }
  | { status: "unavailable"; locus: string };

function refuse(
  reason: string,
  locus?: string,
  evidence?: V3DecomposeRefusalEvidence,
): AdvancementRefusal {
  return {
    status: "refused",
    reason,
    ...(locus === undefined ? {} : { locus }),
    ...(evidence === undefined ? {} : { evidence }),
  };
}

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

type AncestryObservation =
  | { status: "ancestor" }
  | { status: "not-ancestor" }
  | { status: "unavailable"; locus: string };

async function observeAncestry(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  ancestor: string,
  descendant: string,
): Promise<AncestryObservation> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    await dependencies.exec("git", args, { cwd: dependencies.cwd });
    return { status: "ancestor" };
  } catch (error) {
    const failure = normalizeGitRejection(error, { command: "git", args });
    return failure.kind === "nonzero-exit" && failure.exitCode === 1
      ? { status: "not-ancestor" }
      : { status: "unavailable", locus: failure.message };
  }
}

function markerMatches(marker: WorktreeMarkerReadResult, candidateBranch: string): boolean {
  return marker.kind === "present"
    && marker.marker.spawnedByArc
    && marker.marker.createdFor?.kind === "branch"
    && marker.marker.createdFor.ref === candidateBranch;
}

function markerEvidence(marker: WorktreeMarkerReadResult): V3DecomposeEvidenceValue | null {
  if (marker.kind === "malformed") return null;
  if (marker.kind === "absent") return { kind: "absent" };
  return {
    kind: "present",
    spawnedByArc: marker.marker.spawnedByArc,
    createdFor: marker.marker.createdFor ?? { kind: "absent" },
  };
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

function firstMismatchingPath(expected: string[], actual: string[]): string {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (expected[index] !== actual[index]) return actual[index] ?? expected[index] ?? "changed-paths";
  }
  return "changed-paths";
}

function bindingMismatch(
  candidateBranch: string,
  baseBranch: string,
  expectedCandidateHead: string,
  expectedBaseHead: string,
  actualCandidateHead: string | null,
  actualBaseHead: string | null,
): AdvancementMismatch | null {
  if (actualCandidateHead === expectedCandidateHead && actualBaseHead === expectedBaseHead) return null;
  return {
    reason: "binding-raced",
    locus: actualCandidateHead !== expectedCandidateHead ? candidateBranch : baseBranch,
    evidence: {
      expected: { candidateHead: expectedCandidateHead, baseHead: expectedBaseHead },
      actual: {
        candidateHead: actualCandidateHead ?? { kind: "absent" },
        baseHead: actualBaseHead ?? { kind: "absent" },
      },
    },
  };
}

async function observeBindingMismatch(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  candidateBranch: string,
  baseBranch: string,
  expectedCandidateHead: string,
  expectedBaseHead: string,
): Promise<AdvancementMismatch | null> {
  const [actualCandidateHead, actualBaseHead] = await Promise.all([
    resolveCommit(dependencies, candidateBranch),
    resolveCommit(dependencies, baseBranch),
  ]);
  return bindingMismatch(
    candidateBranch,
    baseBranch,
    expectedCandidateHead,
    expectedBaseHead,
    actualCandidateHead,
    actualBaseHead,
  );
}

async function exactTransitionTree(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  baseHead: string,
  candidateHead: string,
  composed: ComposedPlan,
  recordPath: string,
  recordBytes: Uint8Array,
  tolerateGeneratedRoadmap: boolean,
): Promise<AdvancementMismatch | null> {
  const changed = await changedPaths(dependencies, dependencies.cwd, baseHead, candidateHead);
  const expected = expectedPaths(composed.plan, recordPath);
  if (changed === null) return { reason: "changed-paths-unavailable" };
  if (changed.join("\0") !== expected.join("\0")) {
    return {
      reason: "changed-paths",
      locus: firstMismatchingPath(expected, changed),
      evidence: { expected, actual: changed },
    };
  }
  for (const mutation of composed.plan.mutations) {
    if (tolerateGeneratedRoadmap && mutation.kind === "exclusive" && mutation.role === "roadmap") continue;
    const actual = await committedState(dependencies, candidateHead, mutation.path);
    if (!statesEqual(actual, mutation.after)) {
      return {
        reason: "path-state",
        locus: mutation.path,
        ...(actual === null ? {} : { evidence: { expected: mutation.after, actual } }),
      };
    }
  }
  const record = await committedState(dependencies, candidateHead, recordPath);
  const expectedRecord = {
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: digestBytes(recordBytes),
  };
  return statesEqual(record, expectedRecord)
    ? null
    : {
        reason: "transition-record",
        locus: recordPath,
        ...(record === null ? {} : { evidence: { expected: expectedRecord, actual: record } }),
      };
}

async function applyPlan(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  composed: ComposedPlan,
): Promise<AdvancementMismatch | null> {
  const blobs = new Map(composed.blobs.map(({ contentDigest, bytes }) => [contentDigest, bytes]));
  let locus = cwd;
  try {
    for (const mutation of composed.plan.mutations) {
      if (statesEqual(mutation.before, mutation.after)) continue;
      locus = mutation.path;
      const target = join(cwd, mutation.path);
      if (mutation.after.kind === "absent") {
        await rm(target, { force: true });
        await dependencies.exec("git", ["update-index", "--force-remove", "--", mutation.path], { cwd });
      } else {
        const bytes = blobs.get(mutation.after.contentDigest);
        if (bytes === undefined) return { reason: "blob-unavailable", locus: mutation.path };
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
        await chmod(target, mutation.after.mode === "100755" ? 0o755 : 0o644);
        await dependencies.exec("git", ["add", "--", mutation.path], { cwd });
      }
    }
    return null;
  } catch {
    return { reason: "write-failed", locus };
  }
}

async function exactIndexTree(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  cwd: string,
  baseHead: string,
  composed: ComposedPlan,
  recordPath: string,
  recordBytes: Uint8Array,
): Promise<AdvancementMismatch | null> {
  const changed = await changedPaths(dependencies, cwd, baseHead, null);
  const expected = expectedPaths(composed.plan, recordPath);
  if (changed === null) return { reason: "changed-paths-unavailable" };
  if (changed.join("\0") !== expected.join("\0")) {
    return {
      reason: "changed-paths",
      locus: firstMismatchingPath(expected, changed),
      evidence: { expected, actual: changed },
    };
  }
  for (const mutation of composed.plan.mutations) {
    const actual = await indexState(dependencies, cwd, mutation.path);
    if (!statesEqual(actual, mutation.after)) {
      return {
        reason: "path-state",
        locus: mutation.path,
        ...(actual === null ? {} : { evidence: { expected: mutation.after, actual } }),
      };
    }
  }
  const record = await indexState(dependencies, cwd, recordPath);
  const expectedRecord = {
    kind: "file" as const,
    mode: "100644" as const,
    contentDigest: digestBytes(recordBytes),
  };
  return statesEqual(record, expectedRecord)
    ? null
    : {
        reason: "transition-record",
        locus: recordPath,
        ...(record === null ? {} : { evidence: { expected: expectedRecord, actual: record } }),
      };
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

async function candidateChain(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  authoredBaseHead: string,
  candidateHead: string,
): Promise<CandidateChainResult> {
  const chain = await firstParentChain(dependencies, authoredBaseHead, candidateHead);
  if (chain === null) {
    return { status: "refused", refusal: refuse("candidate-history-unavailable") };
  }
  const initialCommit = chain[0];
  if (initialCommit === undefined) {
    return { status: "refused", refusal: refuse("candidate-history-unavailable") };
  }
  const initialParents = await commitParents(dependencies, initialCommit);
  if (initialParents?.length !== 1 || initialParents[0] !== authoredBaseHead) {
    return { status: "refused", refusal: refuse("candidate-initial-transition-invalid") };
  }

  const advancements: CandidateAdvancementCommit[] = [];
  let previousCandidateHead = initialCommit;
  let previousBaseHead = authoredBaseHead;
  for (const advancementCommit of chain.slice(1)) {
    const parents = await commitParents(dependencies, advancementCommit);
    if (parents?.length !== 2 || parents[0] !== previousCandidateHead || parents[1] === undefined) {
      return { status: "refused", refusal: refuse("candidate-advancement-chain-invalid") };
    }
    const absorbedBaseHead = parents[1];
    const absorbedBaseAncestry = await observeAncestry(
      dependencies,
      previousBaseHead,
      absorbedBaseHead,
    );
    if (absorbedBaseAncestry.status === "unavailable") {
      return {
        status: "refused",
        refusal: refuse("base-ancestry-unavailable", absorbedBaseAncestry.locus),
      };
    }
    if (absorbedBaseAncestry.status === "not-ancestor") {
      return { status: "refused", refusal: refuse("candidate-advancement-base-invalid") };
    }
    advancements.push({ commit: advancementCommit, absorbedBaseHead });
    previousCandidateHead = advancementCommit;
    previousBaseHead = absorbedBaseHead;
  }
  if (previousCandidateHead !== candidateHead) {
    return { status: "refused", refusal: refuse("candidate-advancement-chain-invalid") };
  }
  return { status: "ready", initialCommit, advancements, previousBaseHead };
}

function dependencyRecipients(composed: ComposedPlan): DependencyRecipient[] {
  const recipients = new Map<string, DependencyRecipient>();
  for (const mutation of composed.plan.mutations) {
    if (mutation.kind !== "composed") continue;
    for (const contributor of mutation.contributors) {
      if (contributor.kind !== "dependency") continue;
      recipients.set(`${contributor.dependent}\0${mutation.path}`, {
        dependent: contributor.dependent,
        path: mutation.path,
      });
    }
  }
  return [...recipients.values()].sort((left, right) =>
    compareUtf8(left.dependent, right.dependent) || compareUtf8(left.path, right.path));
}

async function dependencyRecipientAtPath(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  ref: string,
  path: string,
): Promise<DependencyRecipientObservation> {
  try {
    const bytes = await dependencies.readBlob(ref, path);
    if (bytes === null) return { status: "absent" };
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { status: "present", path, targets: [...parseMetaRecord(content).dependsOn] };
  } catch {
    return { status: "unavailable", locus: path };
  }
}

async function dependencyRecipientAt(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  ref: string,
  recipient: DependencyRecipient,
): Promise<DependencyRecipientObservation> {
  const args = [
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    ref,
    "--",
    ".arc/active",
    ".arc/backlog/planned",
    ".arc/backlog/provisional",
  ];
  let paths: string[];
  try {
    const { stdout } = await dependencies.exec("git", args, { cwd: dependencies.cwd });
    paths = stdout.split("\0").filter(Boolean).filter((path) => {
      const identified = identifyWorkUnitArtifactPath(path);
      return identified?.artifact === "meta"
        && identified.slug === recipient.dependent
        && (identified.placement.kind === "active"
          || identified.placement.kind === "backlog");
    });
  } catch {
    return { status: "unavailable", locus: recipient.path };
  }
  if (paths.length === 0) return { status: "absent" };
  if (paths.length !== 1 || paths[0] === undefined) {
    return { status: "unavailable", locus: recipient.path };
  }
  return await dependencyRecipientAtPath(dependencies, ref, paths[0]);
}

function compareDependencyRecipientObservations(
  dependent: string,
  previous: DependencyRecipientObservation,
  current: DependencyRecipientObservation,
): DependencyRecipientComparison {
  if (previous.status === "unavailable") return previous;
  if (current.status === "unavailable") return current;
  if (previous.status === "absent" && current.status === "absent") return { status: "matched" };
  if (previous.status === "present" && current.status === "present") {
    const targetsMatch = canonicalize(previous.targets) === canonicalize(current.targets);
    if (previous.path === current.path && targetsMatch) return { status: "matched" };
    if (previous.path === current.path) {
      return {
        status: "drift",
        locus: current.path,
        evidence: { expected: previous.targets, actual: current.targets },
      };
    }
  }
  return {
    status: "drift",
    locus: current.status === "present"
      ? current.path
      : previous.status === "present" ? previous.path : dependent,
    evidence: {
      expected: previous.status === "present"
        ? { path: previous.path, targets: previous.targets }
        : { kind: "absent" },
      actual: current.status === "present"
        ? { path: current.path, targets: current.targets }
        : { kind: "absent" },
    },
  };
}

async function compareDependencyRecipientPrestates(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  composed: ComposedPlan,
  previousBaseHead: string,
  currentBaseHead: string,
): Promise<DependencyRecipientComparison> {
  if (previousBaseHead === currentBaseHead) return { status: "matched" };
  for (const recipient of dependencyRecipients(composed)) {
    const [previous, current] = await Promise.all([
      dependencyRecipientAt(dependencies, previousBaseHead, recipient),
      dependencyRecipientAtPath(dependencies, currentBaseHead, recipient.path),
    ]);
    const comparison = compareDependencyRecipientObservations(recipient.dependent, previous, current);
    if (comparison.status !== "matched") return comparison;
  }
  return { status: "matched" };
}

async function compareRefusedDependencyRecipient(
  dependencies: GitDecomposeTransitionBaseAdvancementDependencies,
  recipient: { dependent: string; path: string; targets: string[] },
  previousBaseHead: string,
): Promise<DependencyRecipientComparison> {
  const previous = await dependencyRecipientAt(dependencies, previousBaseHead, recipient);
  const current: DependencyRecipientObservation = {
    status: "present",
    path: recipient.path,
    targets: recipient.targets,
  };
  return compareDependencyRecipientObservations(recipient.dependent, previous, current);
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
  if (map.authoring.shape === "extraction") {
    return { status: "refused", reason: "map:authoring-shape", locus: "authoring.shape" };
  }
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
    return refuse(
      "candidate-registration-mismatch",
      candidateBranch,
      {
        expected: { candidateBranch, registrationCount: 1 },
        actual: { candidateBranch, registrationCount: registrations.length },
      },
    );
  }
  const registration = registrations[0];
  const marker = await (dependencies.readMarker ?? readWorktreeMarker)(registration.path);
  if (!markerMatches(marker, candidateBranch)) {
    const actual = markerEvidence(marker);
    return refuse(
      "candidate-marker-mismatch",
      marker.kind === "malformed" ? marker.path : registration.path,
      actual === null
        ? undefined
        : {
            expected: {
              kind: "present",
              spawnedByArc: true,
              createdFor: { kind: "branch", ref: candidateBranch },
            },
            actual,
          },
    );
  }
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
  const ancestry = await observeAncestry(dependencies, authoredBaseHead, currentBaseHead);
  if (ancestry.status !== "ancestor") {
    return ancestry.status === "not-ancestor"
      ? refuse(
          "base-not-descendant",
          input.baseBranch,
          { expected: authoredBaseHead, actual: currentBaseHead },
        )
      : refuse("base-ancestry-unavailable", ancestry.locus);
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
  const expectedIncomingEdges = sortByCanonicalBytes(map.machine.incomingEdges);
  const actualIncomingEdges = sortByCanonicalBytes(currentIncomingEdges);
  const expectedIncomingDependents = sortByCanonicalBytes(
    expectedIncomingEdges.map(({ dependent }) => dependent),
  );
  const actualIncomingDependents = sortByCanonicalBytes(
    actualIncomingEdges.map(({ dependent }) => dependent),
  );
  if (canonicalize(actualIncomingDependents) !== canonicalize(expectedIncomingDependents)) {
    const length = Math.max(expectedIncomingEdges.length, actualIncomingEdges.length);
    let locus = map.machine.source.origin;
    for (let index = 0; index < length; index += 1) {
      if (canonicalize(expectedIncomingEdges[index] ?? null)
        !== canonicalize(actualIncomingEdges[index] ?? null)) {
        locus = actualIncomingEdges[index]?.dependent
          ?? expectedIncomingEdges[index]?.dependent
          ?? locus;
        break;
      }
    }
    return refuse(
      "base-acquired-incoming-dependency",
      locus,
      { expected: expectedIncomingEdges, actual: actualIncomingEdges },
    );
  }
  const currentMap = restateMap(map, map.machine.resultBase.ref, currentBaseHead);
  const currentPlan = await compose(input.baseBranch, currentMap);
  if (currentPlan.status !== "composed") {
    if (currentPlan.refusal.stage === "conservation"
      && currentPlan.refusal.reason === "dependency-projection:stale-dependent") {
      return refuse(
        "dependency-recipient-drift",
        currentPlan.refusal.locus,
        currentPlan.refusal.evidence,
      );
    }
    const recipient = currentPlan.refusal.stage === "dependency"
      && currentPlan.refusal.reason === "unchanged-dependency-slot"
      ? currentPlan.refusal.dependencyRecipient
      : undefined;
    if (recipient !== undefined) {
      const discoveredChain = await candidateChain(dependencies, authoredBaseHead, candidateHead);
      if (discoveredChain.status === "refused") return discoveredChain.refusal;
      const recipientComparison = await compareRefusedDependencyRecipient(
        dependencies,
        recipient,
        discoveredChain.previousBaseHead,
      );
      if (recipientComparison.status === "unavailable") {
        return refuse("base-dependency-snapshot-unavailable", recipientComparison.locus);
      }
      if (recipientComparison.status === "drift") {
        return refuse(
          "dependency-recipient-drift",
          recipientComparison.locus,
          recipientComparison.evidence,
        );
      }
    }
    return refuse(
      `advancement-plan-refused:${currentPlan.refusal.stage}:${currentPlan.refusal.reason}`,
      currentPlan.refusal.locus,
      currentPlan.refusal.evidence,
    );
  }
  const discoveredChain = await candidateChain(dependencies, authoredBaseHead, candidateHead);
  if (discoveredChain.status === "refused") return discoveredChain.refusal;
  const recipientComparison = await compareDependencyRecipientPrestates(
    dependencies,
    currentPlan,
    discoveredChain.previousBaseHead,
    currentBaseHead,
  );
  if (recipientComparison.status === "unavailable") {
    return refuse("base-dependency-snapshot-unavailable", recipientComparison.locus);
  }
  if (recipientComparison.status === "drift") {
    return refuse(
      "dependency-recipient-drift",
      recipientComparison.locus,
      recipientComparison.evidence,
    );
  }
  const initialMismatch = await exactTransitionTree(
    dependencies,
    authoredBaseHead,
    discoveredChain.initialCommit,
    currentPlan,
    recordPath,
    recordBytes,
    true,
  );
  if (initialMismatch !== null) {
    return refuse(
      `candidate-transform-mismatch:${initialMismatch.reason}`,
      initialMismatch.locus,
      initialMismatch.evidence,
    );
  }

  for (const { commit: advancementCommit, absorbedBaseHead } of discoveredChain.advancements) {
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
      return refuse(
        `candidate-advancement-chain-invalid:${mismatch.reason}`,
        mismatch.locus,
        mismatch.evidence,
      );
    }
  }
  const remainingBaseAncestry = await observeAncestry(
    dependencies,
    discoveredChain.previousBaseHead,
    currentBaseHead,
  );
  if (remainingBaseAncestry.status !== "ancestor") {
    return remainingBaseAncestry.status === "not-ancestor"
      ? refuse(
          "base-not-descendant",
          input.baseBranch,
          { expected: discoveredChain.previousBaseHead, actual: currentBaseHead },
        )
      : refuse("base-ancestry-unavailable", remainingBaseAncestry.locus);
  }
  const preReturnBindingMismatch = await observeBindingMismatch(
    dependencies,
    candidateBranch,
    input.baseBranch,
    candidateHead,
    currentBaseHead,
  );
  if (preReturnBindingMismatch !== null) {
    return refuse(
      preReturnBindingMismatch.reason,
      preReturnBindingMismatch.locus,
      preReturnBindingMismatch.evidence,
    );
  }

  if (currentBaseHead === discoveredChain.previousBaseHead) {
    return { status: "unchanged", candidateBranch, candidateHead, currentBaseHead };
  }
  const preMergeBindingMismatch = await observeBindingMismatch(
    dependencies,
    candidateBranch,
    input.baseBranch,
    candidateHead,
    currentBaseHead,
  );
  if (preMergeBindingMismatch !== null) {
    return refuse(
      preMergeBindingMismatch.reason,
      preMergeBindingMismatch.locus,
      preMergeBindingMismatch.evidence,
    );
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
  const indexMismatch: AdvancementMismatch | null = applicationMismatch === null
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
  const racedBinding = bindingMismatch(
    candidateBranch,
    input.baseBranch,
    candidateHead,
    currentBaseHead,
    candidateAfter,
    baseAfter,
  );
  if (indexMismatch !== null || racedBinding !== null) {
    const restored = await restoreCandidate(dependencies, registration.path, candidateHead);
    if (!restored) return refuse("candidate-restore-failed");
    const mismatch = indexMismatch ?? racedBinding ?? { reason: "binding-raced" };
    return refuse(
      `post-merge-validation-refused:${mismatch.reason}`,
      mismatch.locus,
      mismatch.evidence,
    );
  }
  return {
    status: "advanced",
    candidateBranch,
    candidateHead,
    previousBaseHead: discoveredChain.previousBaseHead,
    currentBaseHead,
  };
}
