/**
 * Partial-protection materialization of a committed park-at-Planning result.
 *
 * The retiring planning branch proves the direct transition. The base-side arm
 * copies only the complete planned artifact group, using its existing Git blob
 * identities so checkout filters cannot rewrite the staged result.
 */

import { posix, join, resolve } from "node:path";

import { isSafeCohortPath, validateCohortPath } from "../active/cohort-path.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { canonicalDigest, type CanonicalDigest } from "../kernel/canonical/canonical-json.js";
import {
  deleteOperation,
  writeOperation,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import type { GitExec } from "../git/exec.js";
import { scanRegisteredWorktrees } from "../git/worktree-roster.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { retryTransientFileSystemRefusal } from "../fs.js";
import { artifactMatcher } from "./mutators/relocate-artifacts.js";
import { isSlugSafe } from "./slug.js";

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });
const LIFECYCLE_ROOTS = [
  resolveArcPath({ kind: "placement-root", tier: "active" }),
  resolveArcPath({ kind: "placement-root", tier: "planned" }),
  resolveArcPath({ kind: "placement-root", tier: "provisional" }),
  resolveArcPath({ kind: "placement-root", tier: "completed" }),
] as const;

/** Exact tree blob copied into the landing checkout and index. */
export interface ParkLandingFile {
  path: ManagedPath;
  mode: "100644";
  oid: string;
  bytes: Uint8Array;
}

/** Fully validated source transition ready for base materialization. */
export interface ParkLandingTransition {
  commit: string;
  name: string;
  files: readonly ParkLandingFile[];
}

/** Versioned base read used by the landing compare-and-set. */
export interface ParkLandingBaseSnapshot {
  version: CanonicalDigest;
  headRef: string;
  headOid: string;
  indexTree: string;
  stagedPaths: readonly string[];
  conflictingPaths: readonly string[];
}

/** High-level seams used by the landing orchestration. */
export interface ParkPlanningLandingContext {
  readTransition(params: { name: string; commit: string }): Promise<
    | { status: "resolved"; transition: ParkLandingTransition }
    | { status: "rejected"; reason: string }
  >;
  readBase(name: string, files: readonly ParkLandingFile[]): Promise<ParkLandingBaseSnapshot>;
  stage(
    transition: ParkLandingTransition,
    expectedBase: ParkLandingBaseSnapshot,
  ): Promise<{ status: "staged" } | { status: "rejected"; reason: string }>;
}

/** Result of one partial-protection park landing. */
export type ParkPlanningLandingResult =
  | { status: "landed"; commit: string; plannedPaths: readonly ManagedPath[] }
  | { status: "rejected"; reason: string };

/**
 * Committed park validation outcome. A rejection carrying `evidence: "absent"` established that the
 * commit is structurally not a park transition at all — a merge or root commit, or a tree holding
 * nothing of the subject's artifact group under the planned root (the shape of any ordinary in-flight
 * head). A rejection without it is park-shaped but invalid, so the mismatch is worth surfacing.
 */
export type CommittedParkTransitionValidation =
  | { status: "resolved"; transition: ParkLandingTransition }
  | { status: "rejected"; reason: string; evidence?: "absent" };

/** Low-level production boundaries for the in-repository landing adapter. */
export interface ParkPlanningTransitionValidationDeps {
  cwd?: string;
  exec: GitExec;
  readBlob(ref: string | null, path: ManagedPath): Promise<Uint8Array | null>;
}

export interface InRepoParkPlanningLandingDeps extends ParkPlanningTransitionValidationDeps {
  cwd: string;
  prepareRefVerification(ref: string, expectedOid: string): Promise<{ release(): Promise<void> }>;
  fs: {
    lstat(path: string): Promise<{ isDirectory(): boolean; isSymbolicLink(): boolean }>;
    mkdir(path: string): Promise<unknown>;
    readFile(path: string): Promise<Uint8Array>;
    writeFile(path: string, content: Uint8Array, options: { flag: "wx" }): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    rm(path: string, options: { force: true }): Promise<void>;
  };
}

/**
 * Validate and stage one exact park-at-Planning transition.
 *
 * Two base reads are deliberate: source validation may take time, so landing
 * always discards its first observation and acts only on a fresh non-conflicting
 * version. The production stage seam performs the final compare-and-set.
 */
export async function landParkPlanningTransition(
  ctx: ParkPlanningLandingContext,
  params: { name: string; commit: string },
): Promise<ParkPlanningLandingResult> {
  if (!isSlugSafe(params.name)) {
    return { status: "rejected", reason: "`park --land` requires a slug-safe work-unit name." };
  }
  if (params.commit.trim() === "") {
    return { status: "rejected", reason: "`park --land` requires a transition commit." };
  }

  const source = await ctx.readTransition(params);
  if (source.status === "rejected") return source;

  const initialBase = await ctx.readBase(params.name, source.transition.files);
  const initialRefusal = baseSnapshotRefusal(initialBase);
  if (initialRefusal !== null) return { status: "rejected", reason: initialRefusal };

  const freshBase = await ctx.readBase(params.name, source.transition.files);
  const freshRefusal = baseSnapshotRefusal(freshBase);
  if (freshRefusal !== null) return { status: "rejected", reason: freshRefusal };

  const staged = await ctx.stage(source.transition, freshBase);
  if (staged.status === "rejected") return staged;

  return {
    status: "landed",
    commit: source.transition.commit,
    plannedPaths: source.transition.files.map((file) => file.path),
  };
}

/** Build the Git/filesystem-backed landing context used by the CLI handler. */
export function createInRepoParkPlanningLandingContext(
  deps: InRepoParkPlanningLandingDeps,
): ParkPlanningLandingContext {
  const readBase = (name: string, files: readonly ParkLandingFile[]) => readBaseSnapshot(deps, name, files);
  return {
    readTransition: (params) => readCommittedTransition(deps, params),
    readBase,
    stage: async (transition, expectedBase) => {
      const current = await readBase(transition.name, transition.files);
      if (current.version !== expectedBase.version) {
        return { status: "rejected", reason: "The base changed during park landing; retry from the fresh base." };
      }
      const refusal = baseSnapshotRefusal(current);
      if (refusal !== null) return { status: "rejected", reason: refusal };
      return stageExactFiles(
        deps,
        transition.name,
        transition.commit,
        transition.files,
        expectedBase,
      );
    },
  };
}

function baseSnapshotRefusal(snapshot: ParkLandingBaseSnapshot): string | null {
  if (snapshot.stagedPaths.length > 0) {
    return `The base index already has staged changes: ${snapshot.stagedPaths.join(", ")}.`;
  }
  if (snapshot.conflictingPaths.length > 0) {
    return `The base already contains a conflicting work-unit result: ${snapshot.conflictingPaths.join(", ")}.`;
  }
  return null;
}

async function readCommittedTransition(
  deps: InRepoParkPlanningLandingDeps,
  params: { name: string; commit: string },
): Promise<
  | { status: "resolved"; transition: ParkLandingTransition }
  | { status: "rejected"; reason: string }
> {
  const branch = `plan/${params.name}`;
  try {
    const [commit, tip, topology] = await Promise.all([
      resolveCommit(deps, params.commit),
      resolveCommit(deps, `refs/heads/${branch}`),
      scanRegisteredWorktrees(deps.exec),
    ]);
    if (commit !== tip) {
      return { status: "rejected", reason: `The supplied commit is not the exact local tip of \`${branch}\`.` };
    }
    if (!topology.ok) {
      return { status: "rejected", reason: `Cannot verify planning-worktree ownership: ${topology.message}` };
    }
    const owner = topology.worktrees.find((worktree) => worktree.branch === branch && worktree.head === commit);
    if (owner === undefined) {
      return { status: "rejected", reason: `The exact \`${branch}\` tip is not owned by a registered worktree.` };
    }
    return await validateCommittedParkPlanningTransitionStrict(deps, {
      name: params.name,
      branch,
      commit,
    });
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "The park transition could not be validated.",
    };
  }
}

/** Validate one committed park transition without requiring its live branch or worktree. */
export async function validateCommittedParkPlanningTransition(
  deps: ParkPlanningTransitionValidationDeps,
  params: { name: string; branch: string; commit: string },
): Promise<CommittedParkTransitionValidation> {
  try {
    return await validateCommittedParkPlanningTransitionStrict(deps, params);
  } catch (err) {
    return {
      status: "rejected",
      reason: err instanceof Error ? err.message : "The park transition could not be validated.",
    };
  }
}

/** Validate committed park structure while preserving unexpected Git/blob failures. */
export async function validateCommittedParkPlanningTransitionStrict(
  deps: ParkPlanningTransitionValidationDeps,
  params: { name: string; branch: string; commit: string },
): Promise<CommittedParkTransitionValidation> {
  const commit = await resolveCommit(deps, params.commit);
  const parents = await readCommitParents(deps, commit);
  const [parent] = parents;
  if (parents.length !== 1 || parent === undefined) {
    return {
      status: "rejected",
      reason: "The park transition must be a direct single-parent commit.",
      evidence: "absent",
    };
  }
  const plannedRoot = resolveArcPath({ kind: "placement-root", tier: "planned" });
  const sourceDir = resolveArcPath({ kind: "placement-root", tier: "active" });
  const matcher = artifactMatcher(params.name);
  const [plannedRootTree, sourceTree, operations] = await Promise.all([
    readTreeEntries(deps, commit, plannedRoot),
    readTreeEntries(deps, parent, sourceDir),
    readDiffOperations(deps, parent, commit),
  ]);
  const plannedCandidates = plannedRootTree.filter((entry) => matcher.test(posix.basename(entry.path)));
  if (plannedCandidates.length === 0) {
    return {
      status: "rejected",
      reason: "The transition does not contain a complete planning artifact group.",
      evidence: "absent",
    };
  }
  const plannedMetas = plannedCandidates.filter(
    (entry) => posix.basename(entry.path) === `meta-${params.name}.md`,
  );
  const plannedMeta = plannedMetas[0];
  if (plannedMetas.length !== 1 || plannedMeta === undefined) {
    return { status: "rejected", reason: "The transition does not contain a complete planning artifact group." };
  }
  const plannedDir = posix.dirname(plannedMeta.path);
  const plannedMetaBytes = await requireBlob(deps, commit, plannedMeta.path);
  const plannedRecord = parseMetaRecord(decodeUtf8(plannedMetaBytes));
  if (plannedRecord.state !== "Planning" || plannedRecord.branch !== params.branch) {
    return { status: "rejected", reason: "The planned result does not match its planning branch." };
  }
  const cohort = plannedRecord.cohort?.trim() ?? "";
  if (!isSafeCohortPath(cohort) || validateCohortPath(cohort) !== null) {
    return { status: "rejected", reason: "The planned result carries an invalid Cohort path." };
  }
  const cohortSegments = cohort === "" || cohort === "[none]" ? [] : cohort.split("/");
  if (cohortSegments.some((segment) => !SlugSchema.safeParse(segment).success)) {
    return { status: "rejected", reason: "The planned result carries an invalid Cohort path." };
  }
  const expectedPlannedDir = resolveArcPath({
    kind: "work-unit-container",
    placement: {
      kind: "backlog",
      commitment: "planned",
      cohort: cohortSegments.map((segment) => SlugSchema.parse(segment)),
    },
    slug: SlugSchema.parse(params.name),
  });
  if (plannedDir !== expectedPlannedDir) {
    return { status: "rejected", reason: "The planned result does not match its Cohort placement." };
  }
  const plannedTree = plannedRootTree.filter(
    (entry) => entry.path === plannedDir || entry.path.startsWith(`${plannedDir}/`),
  );
  const plannedEntries = selectExactArtifactGroup(plannedTree, plannedDir, matcher);
  const sourceEntries = selectExactArtifactGroup(sourceTree, sourceDir, matcher);
  const metaName = `meta-${params.name}.md`;
  if (
    !plannedEntries.some((entry) => posix.basename(entry.path) === metaName)
    || !sourceEntries.some((entry) => posix.basename(entry.path) === metaName)
  ) {
    return { status: "rejected", reason: "The transition does not contain a complete planning artifact group." };
  }
  if (plannedTree.length !== plannedEntries.length) {
    return { status: "rejected", reason: "The planned result contains a path outside the work-unit artifact group." };
  }
  assertMatchingRelocation(sourceEntries, plannedEntries);
  await assertAllowedTransitionPatch(
    deps,
    parent,
    commit,
    params.name,
    operations,
    sourceEntries,
    plannedEntries,
  );

  const plannedFiles = await Promise.all(plannedEntries.map((entry) => landingFile(deps, commit, entry)));
  return {
    status: "resolved",
    transition: { commit, name: params.name, files: plannedFiles },
  };
}

async function readBaseSnapshot(
  deps: InRepoParkPlanningLandingDeps,
  name: string,
  files: readonly ParkLandingFile[],
  indexFile?: string,
): Promise<ParkLandingBaseSnapshot> {
  const execOptions = { cwd: deps.cwd, indexFile };
  const headOid = await resolveCommit(deps, "HEAD");
  const { stdout: headRefOutput } = await deps.exec("git", ["symbolic-ref", "--quiet", "HEAD"], execOptions);
  const headRef = headRefOutput.trim();
  if (headRef === "") throw new Error("Git did not resolve the attached base ref.");
  const indexTreeResult = await deps.exec("git", ["write-tree"], execOptions);
  const statusResult = await deps.exec(
    "git",
    ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".arc"],
    execOptions,
  );
  const stagedResult = await deps.exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    execOptions,
  );
  const inventoryResult = await deps.exec(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ...LIFECYCLE_ROOTS],
    execOptions,
  );
  const indexTree = indexTreeResult.stdout.trim();
  const stagedPaths = splitNull(stagedResult.stdout);
  const inventory = splitNull(inventoryResult.stdout);
  const targetPaths = new Set(files.map((file) => file.path));
  const matcher = artifactMatcher(name);
  const conflictingPaths = inventory.filter((path) => {
    if (targetPaths.has(path as ManagedPath)) return true;
    return LIFECYCLE_ROOTS.some((root) => path === root || path.startsWith(`${root}/`))
      && matcher.test(posix.basename(path));
  }).sort(compareUtf8);
  return {
    version: canonicalDigest({ headRef, headOid, indexTree, status: statusResult.stdout }),
    headRef,
    headOid,
    indexTree,
    stagedPaths,
    conflictingPaths,
  };
}

async function stageExactFiles(
  deps: InRepoParkPlanningLandingDeps,
  name: string,
  transitionCommit: string,
  files: readonly ParkLandingFile[],
  expectedBase: ParkLandingBaseSnapshot,
): Promise<{ status: "staged" } | { status: "rejected"; reason: string }> {
  const ordered = [...files].sort((left, right) => compareUtf8(left.path, right.path));
  const created: string[] = [];
  let installed = false;
  let indexLock = "";
  let baseLease: { release(): Promise<void> } | null = null;
  let sourceLease: { release(): Promise<void> } | null = null;
  try {
    const { stdout } = await deps.exec(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-path", "index"],
      { cwd: deps.cwd },
    );
    const indexPath = resolve(deps.cwd, stdout.trim());
    if (stdout.trim() === "") throw new Error("Git did not resolve the worktree index path.");
    indexLock = `${indexPath}.lock`;
    const beforeLock = await deps.fs.readFile(indexPath);
    const sourceRefusal = await currentParkSourceRefusal(deps, name, transitionCommit);
    if (sourceRefusal !== null) return { status: "rejected", reason: sourceRefusal };
    await deps.fs.writeFile(indexLock, beforeLock, { flag: "wx" });
    const afterLock = await deps.fs.readFile(indexPath);
    if (!Buffer.from(beforeLock).equals(Buffer.from(afterLock))) {
      return { status: "rejected", reason: "The base changed during park landing; retry from the fresh base." };
    }

    const lockedBase = await readBaseSnapshot(deps, name, ordered, indexLock);
    if (lockedBase.version !== expectedBase.version) {
      return { status: "rejected", reason: "The base changed during park landing; retry from the fresh base." };
    }
    const refusal = baseSnapshotRefusal(lockedBase);
    if (refusal !== null) return { status: "rejected", reason: refusal };

    for (const file of ordered) {
      await ensureSafeLandingParent(deps, file.path);
      await deps.fs.writeFile(join(deps.cwd, file.path), file.bytes, { flag: "wx" });
      created.push(join(deps.cwd, file.path));
    }
    await deps.exec(
      "git",
      [
        "update-index",
        "--add",
        ...ordered.flatMap((file) => ["--cacheinfo", `${file.mode},${file.oid},${file.path}`]),
      ],
      { cwd: deps.cwd, indexFile: indexLock },
    );
    baseLease = await deps.prepareRefVerification(lockedBase.headRef, lockedBase.headOid);
    sourceLease = await deps.prepareRefVerification(`refs/heads/plan/${name}`, transitionCommit);
    const finalSourceRefusal = await currentParkSourceRefusal(deps, name, transitionCommit);
    if (finalSourceRefusal !== null) return { status: "rejected", reason: finalSourceRefusal };
    await retryTransientFileSystemRefusal(async () => {
      const currentIndex = await deps.fs.readFile(indexPath);
      if (!Buffer.from(currentIndex).equals(Buffer.from(beforeLock))) {
        throw new Error("The base changed during park landing; retry from the fresh base.");
      }
      await deps.fs.rename(indexLock, indexPath);
    });
    installed = true;
    return { status: "staged" };
  } catch (err) {
    return {
      status: "rejected",
      reason: `Park landing could not stage its exact result: ${err instanceof Error ? err.message : "write failed"}`,
    };
  } finally {
    await sourceLease?.release().catch(() => undefined);
    await baseLease?.release().catch(() => undefined);
    if (!installed) {
      await Promise.all(created.map((path) => deps.fs.rm(path, { force: true }).catch(() => undefined)));
      if (indexLock !== "") await deps.fs.rm(indexLock, { force: true }).catch(() => undefined);
    }
    if (indexLock !== "") await deps.fs.rm(`${indexLock}.lock`, { force: true }).catch(() => undefined);
  }
}

async function currentParkSourceRefusal(
  deps: InRepoParkPlanningLandingDeps,
  name: string,
  expectedTip: string,
): Promise<string | null> {
  const branch = `plan/${name}`;
  let tip: string;
  let topology: Awaited<ReturnType<typeof scanRegisteredWorktrees>>;
  try {
    [tip, topology] = await Promise.all([
      resolveCommit(deps, `refs/heads/${branch}`),
      scanRegisteredWorktrees(deps.exec),
    ]);
  } catch (error) {
    return `Cannot revalidate the planning transition: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (tip !== expectedTip) {
    return `The supplied commit is no longer the exact local tip of \`${branch}\`.`;
  }
  if (!topology.ok) {
    return `Cannot verify planning-worktree ownership: ${topology.message}`;
  }
  const owner = topology.worktrees.find((worktree) => worktree.branch === branch && worktree.head === expectedTip);
  return owner === undefined
    ? `The exact \`${branch}\` tip is no longer owned by a registered worktree.`
    : null;
}

async function ensureSafeLandingParent(
  deps: InRepoParkPlanningLandingDeps,
  path: ManagedPath,
): Promise<void> {
  const parentSegments = posix.dirname(path).split("/");
  let current = deps.cwd;
  for (const segment of parentSegments) {
    current = join(current, segment);
    let stat: Awaited<ReturnType<InRepoParkPlanningLandingDeps["fs"]["lstat"]>>;
    try {
      stat = await deps.fs.lstat(current);
    } catch (err) {
      if (!isMissingPathError(err)) throw err;
      await deps.fs.mkdir(current);
      stat = await deps.fs.lstat(current);
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Park landing parent is not a real directory: ${current}`);
    }
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}

async function resolveCommit(deps: ParkPlanningTransitionValidationDeps, ref: string): Promise<string> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], gitCwd(deps));
  const oid = stdout.trim();
  if (oid === "") throw new Error(`Cannot resolve commit: ${ref}`);
  return oid;
}

async function readCommitParents(deps: ParkPlanningTransitionValidationDeps, commit: string): Promise<string[]> {
  const { stdout } = await deps.exec("git", ["rev-list", "--parents", "-n", "1", commit], gitCwd(deps));
  const fields = stdout.trim().split(/\s+/u);
  if (fields.shift() !== commit) throw new Error(`Cannot read commit relation: ${commit}`);
  return fields;
}

interface TreeEntry {
  mode: string;
  type: string;
  oid: string;
  path: ManagedPath;
}

async function readTreeEntries(
  deps: ParkPlanningTransitionValidationDeps,
  ref: string,
  path: string,
): Promise<TreeEntry[]> {
  const { stdout } = await deps.exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", ref, "--", path],
    gitCwd(deps),
  );
  return splitNull(stdout).map((record) => {
    const match = /^(\d+) ([^ ]+) ([0-9a-f]+)\t(.+)$/u.exec(record);
    if (match === null) throw new Error(`Malformed Git tree entry: ${JSON.stringify(record)}`);
    return {
      mode: match[1] ?? "",
      type: match[2] ?? "",
      oid: match[3] ?? "",
      path: validateManagedPath(match[4] ?? ""),
    };
  });
}

function selectExactArtifactGroup(entries: readonly TreeEntry[], dir: string, matcher: RegExp): TreeEntry[] {
  return entries.filter((entry) => posix.dirname(entry.path) === dir && matcher.test(posix.basename(entry.path)));
}

function assertMatchingRelocation(source: readonly TreeEntry[], planned: readonly TreeEntry[]): void {
  const sourceByName = new Map(source.map((entry) => [posix.basename(entry.path), entry]));
  const plannedByName = new Map(planned.map((entry) => [posix.basename(entry.path), entry]));
  if (sourceByName.size !== plannedByName.size) {
    throw new Error("The park transition does not relocate the complete source artifact group.");
  }
  for (const [name, sourceEntry] of sourceByName) {
    const plannedEntry = plannedByName.get(name);
    if (
      plannedEntry === undefined
      || sourceEntry.mode !== plannedEntry.mode
      || sourceEntry.type !== plannedEntry.type
      || sourceEntry.oid !== plannedEntry.oid
    ) throw new Error("The park transition does not relocate the complete source artifact group.");
  }
}

async function assertAllowedTransitionPatch(
  deps: ParkPlanningTransitionValidationDeps,
  parent: string,
  commit: string,
  name: string,
  operations: readonly PatchOperation[],
  source: readonly TreeEntry[],
  planned: readonly TreeEntry[],
): Promise<void> {
  const expectedDeletes = new Set(source.map((entry) => entry.path));
  const expectedWrites = new Set(planned.map((entry) => entry.path));
  for (const operation of operations) {
    if (operation.path === ROADMAP_PATH) {
      const [before, after] = await Promise.all([
        requireBlob(deps, parent, ROADMAP_PATH),
        requireBlob(deps, commit, ROADMAP_PATH),
      ]);
      const beforeText = decodeUtf8(before);
      const afterText = decodeUtf8(after);
      const beforeState = roadmapState(beforeText, name);
      const afterState = roadmapState(afterText, name);
      const rowTransitionValid = beforeState === "Active" && afterState === "Planning";
      const absentProjectionValid = beforeState === null && afterState === null
        && isRoadmapDocument(afterText);
      if (!rowTransitionValid && !absentProjectionValid) {
        throw new Error(
          `The park transition carries an invalid ROADMAP lifecycle change: ${beforeState ?? "absent"}`
          + ` -> ${afterState ?? "absent"}.`,
        );
      }
      continue;
    }
    if (operation.operation === "delete" && expectedDeletes.delete(operation.path)) continue;
    if (operation.operation === "write" && expectedWrites.delete(operation.path)) continue;
    throw new Error(`The park transition touches a path outside its result: ${operation.path}`);
  }
  if (expectedDeletes.size > 0 || expectedWrites.size > 0) {
    throw new Error("The park transition patch does not cover the complete relocation.");
  }
}

function isRoadmapDocument(content: string): boolean {
  return content.startsWith("# Roadmap: Project Status\n")
    && !content.includes("<<<<<<<")
    && !content.includes("=======")
    && !content.includes(">>>>>>>");
}

function roadmapState(content: string, name: string): string | null {
  for (const line of content.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim().replaceAll("`", ""));
    if (cells[1] === name) return cells[0] ?? null;
  }
  return null;
}

async function landingFile(
  deps: ParkPlanningTransitionValidationDeps,
  ref: string,
  entry: TreeEntry,
): Promise<ParkLandingFile> {
  if (entry.mode !== "100644" || entry.type !== "blob") {
    throw new Error(`Park landing supports regular non-executable files only: ${entry.path}`);
  }
  return { path: entry.path, mode: "100644", oid: entry.oid, bytes: await requireBlob(deps, ref, entry.path) };
}

async function requireBlob(
  deps: ParkPlanningTransitionValidationDeps,
  ref: string,
  path: ManagedPath,
): Promise<Uint8Array> {
  const bytes = await deps.readBlob(ref, path);
  if (bytes === null) throw new Error(`Git tree blob disappeared: ${ref}:${path}`);
  return bytes;
}

async function readDiffOperations(
  deps: ParkPlanningTransitionValidationDeps,
  parent: string,
  commit: string,
): Promise<PatchOperation[]> {
  const { stdout } = await deps.exec(
    "git",
    ["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "-r", "-z", parent, commit],
    gitCwd(deps),
  );
  const fields = splitNull(stdout);
  if (fields.length % 2 !== 0) throw new Error("Malformed Git name-status output.");
  const operations: PatchOperation[] = [];
  for (let index = 0; index < fields.length; index += 2) {
    const status = fields[index];
    const pathText = fields[index + 1];
    if (status === undefined || pathText === undefined) throw new Error("Malformed Git name-status output.");
    const path = validateManagedPath(pathText);
    if (status === "D") {
      operations.push(deleteOperation(path));
      continue;
    }
    if (status === "A" || status === "M") {
      operations.push(writeOperation(path, await requireBlob(deps, commit, path)));
      continue;
    }
    throw new Error(`Unsupported park transition operation ${status}: ${path}`);
  }
  return operations;
}

function gitCwd(deps: ParkPlanningTransitionValidationDeps): { cwd: string } | undefined {
  return deps.cwd === undefined ? undefined : { cwd: deps.cwd };
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function splitNull(value: string): string[] {
  return value.split("\0").filter((field) => field !== "");
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
