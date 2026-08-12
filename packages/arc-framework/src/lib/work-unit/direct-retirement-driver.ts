/**
 * Git/filesystem binding for direct-transition retirement drivers.
 *
 * The binding captures the committed source artifact group before removal or
 * relocation, limits staging to typed source/result paths plus the generated
 * readiness view, and composes in-repository snapshot/completion operations behind
 * the authority port.
 */

import { join, posix, resolve } from "node:path";

import { canonicalDigest, canonicalize } from "../canonical/canonical-json.js";
import {
  contentDigest,
  deleteOperation,
  writeOperation,
  type ArtifactSetEntry,
  type PatchOperation,
} from "../canonical/content-digest.js";
import { validateManagedPath, type ManagedPath } from "../canonical/managed-path.js";
import { getCurrentBranch, type GitExec } from "../git/exec.js";
import { resolveArcPath } from "../layout/index.js";
import { acquireAdvisoryLock, releaseAdvisoryLock } from "../user-sync/notes-lock.js";
import type { RetirementAuthorityScope } from "./retirement-authority.js";
import { readRetirementAuthoritySnapshot } from "./retirement-authority-snapshot.js";
import {
  artifactMatcher,
  renameArtifactBasename,
  type ArtifactSlugMap,
} from "./mutators/relocate-artifacts.js";
import type { AbandonRetirementContext } from "./verbs/abandon.js";
import type { ParkPlanningRetirementContext } from "./verbs/park-resume.js";

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

/** Typed signal that a committed source artifact has no staged transition result. */
export class DirectTransitionConservationError extends Error {
  readonly path: ManagedPath;

  constructor(label: DirectTransitionConfig["label"], path: ManagedPath) {
    super(`${label} transition omitted result artifact required for conservation: ${path}`);
    this.name = "DirectTransitionConservationError";
    this.path = path;
  }
}

/** Exact Git blob reader; a null ref addresses the current index. */
export type RetirementBlobReader = (
  ref: string | null,
  path: ManagedPath,
) => Promise<Uint8Array | null>;

/** Production boundaries needed by an in-repository direct-transition binding. */
export interface InRepoDirectRetirementDeps {
  cwd: string;
  exec: GitExec;
  readBlob: RetirementBlobReader;
}

export interface DirectTransitionSourceEvidence {
  scope: RetirementAuthorityScope;
  sourceArtifactPaths: readonly ManagedPath[];
  resultArtifactPaths: readonly ManagedPath[];
}

interface CapturedDirectSource extends DirectTransitionSourceEvidence {
  inventory: readonly ArtifactSetEntry[];
  slugMap: ArtifactSlugMap | null;
  additionalPaths: readonly ManagedPath[];
  transitionSourceHead: string;
  transitionSourceArtifactPaths: readonly ManagedPath[];
}

interface SnapshotBinding {
  scope: RetirementAuthorityScope;
  source: CapturedDirectSource;
  authorityVersion: string;
}

interface DirectTransitionConfig {
  transition: "abandon" | "park-planning" | "rename";
  label: "abandon" | "park" | "rename";
}

interface DirectTransitionRetirementContext {
  authority: AbandonRetirementContext["authority"];
  captureSource(params: {
    name: string;
    sourceDir: string;
    resultDir: string | null;
    expectedBranch: string | null;
    retirementSource?: {
      branch: string;
      sourceDir: string;
    };
    slugMap?: ArtifactSlugMap;
    additionalPaths?: readonly string[];
  }): Promise<DirectTransitionSourceEvidence>;
  stageTransition(source: DirectTransitionSourceEvidence): Promise<void>;
  rollbackTransition(source: DirectTransitionSourceEvidence): Promise<void>;
  completeTransition(
    source: DirectTransitionSourceEvidence,
    expectedAuthorityVersion: string,
    additionalStagedPaths?: readonly ManagedPath[],
  ): Promise<DirectTransitionCompletionResult>;
  readTransitionPatch(source: DirectTransitionSourceEvidence): Promise<readonly PatchOperation[]>;
}

/** Result of binding one staged direct transition without creating a receipt. */
export type DirectTransitionCompletionResult =
  | { status: "completed-no-record"; authorityVersion: string }
  | { status: "refused"; reason: "authority-conflict" | "authority-unavailable"; diagnostic?: string };

function createInRepoDirectRetirementContext(
  deps: InRepoDirectRetirementDeps,
  config: DirectTransitionConfig,
): DirectTransitionRetirementContext {
  let captured: CapturedDirectSource | null = null;
  const snapshots = new Map<string, SnapshotBinding>();

  const captureSource: DirectTransitionRetirementContext["captureSource"] = async ({
    name,
    sourceDir,
    resultDir,
    expectedBranch,
    retirementSource,
    slugMap = null,
    additionalPaths = [],
  }) => {
    const branch = await getCurrentBranch(deps.exec);
    if (branch === null) {
      throw new Error(`${config.label} retirement evidence requires an attached source branch`);
    }
    if (expectedBranch !== null && expectedBranch !== "[none]" && branch !== expectedBranch) {
      throw new Error(`${config.label} must run from the source branch \`${expectedBranch}\`, not \`${branch}\``);
    }
    if (
      retirementSource !== undefined
      && (config.transition !== "abandon" || resultDir !== null || retirementSource.branch === "[none]")
    ) {
      throw new Error("unchanged retirement sources are valid only for a branch-backed abandon");
    }
    const transitionSourceHead = await resolveBranchHead(deps.exec, deps.cwd, branch);
    const retirementBranch = retirementSource?.branch ?? branch;
    const retirementHead = retirementBranch === branch
      ? transitionSourceHead
      : await resolveBranchHead(deps.exec, deps.cwd, retirementBranch);
    const retirementSourceDir = retirementSource?.sourceDir ?? sourceDir;
    const paths = await listArtifactPaths(deps.exec, deps.cwd, retirementHead, retirementSourceDir, name);
    const transitionSourceArtifactPaths = retirementSource === undefined
      ? paths
      : await listArtifactPaths(deps.exec, deps.cwd, transitionSourceHead, sourceDir, name);
    const inventory = await Promise.all(paths.map(async (path): Promise<ArtifactSetEntry> => {
      const bytes = await deps.readBlob(retirementHead, path);
      if (bytes === null) throw new Error(`source artifact disappeared from ${retirementHead}: ${path}`);
      return { path, state: "present", contentDigest: contentDigest(bytes) };
    }));
    const resultArtifactPaths = resultDir === null
      ? []
      : paths.map((path) => validateManagedPath(posix.join(
          resultDir,
          renameArtifactBasename(posix.basename(path), slugMap),
        )));
    const managedAdditionalPaths = additionalPaths.map(validateManagedPath);
    assertAdditionalPaths(managedAdditionalPaths, paths, resultArtifactPaths);
    const evidence: CapturedDirectSource = {
      scope: {
        subject: { kind: "work-unit", name },
        transition: config.transition,
        source: { branch: retirementBranch, head: retirementHead },
        resultProjection: { ref: branch, head: transitionSourceHead },
      },
      sourceArtifactPaths: paths,
      resultArtifactPaths,
      slugMap,
      additionalPaths: managedAdditionalPaths,
      inventory,
      transitionSourceHead,
      transitionSourceArtifactPaths,
    };
    captured = evidence;
    return evidence;
  };

  const readTransitionPatch = async (
    source: DirectTransitionSourceEvidence,
  ): Promise<readonly PatchOperation[]> => {
    const bound = requireCaptured(captured, source);
    const operations: PatchOperation[] = [];
    for (const path of bound.transitionSourceArtifactPaths) {
      if (await deps.readBlob(null, path) !== null) {
        throw new Error(`${config.label} transition left source artifact in the index: ${path}`);
      }
      operations.push(deleteOperation(path));
    }
    for (const path of bound.resultArtifactPaths) {
      const bytes = await deps.readBlob(null, path);
      if (bytes === null) throw new DirectTransitionConservationError(config.label, path);
      operations.push(writeOperation(path, bytes));
    }
    for (const path of bound.additionalPaths) {
      const [before, after] = await Promise.all([
        deps.readBlob(bound.transitionSourceHead, path),
        deps.readBlob(null, path),
      ]);
      if (bytesEqual(before, after)) continue;
      if (after === null) operations.push(deleteOperation(path));
      else operations.push(writeOperation(path, after));
    }

    const [beforeRoadmap, afterRoadmap] = await Promise.all([
      deps.readBlob(bound.transitionSourceHead, ROADMAP_PATH),
      deps.readBlob(null, ROADMAP_PATH),
    ]);
    if (!bytesEqual(beforeRoadmap, afterRoadmap)) {
      if (afterRoadmap === null) operations.push(deleteOperation(ROADMAP_PATH));
      else operations.push(writeOperation(ROADMAP_PATH, afterRoadmap));
    }
    return operations;
  };

  const authority: DirectTransitionRetirementContext["authority"] = {
    readSnapshot: async (scope) => {
      const source = requireCaptured(captured, { scope });
      const staged = await readStagedPaths(deps.exec, deps.cwd);
      if (staged.length > 0) return { status: "refused", reason: "evidence-mismatch" };
      const result = await readRetirementAuthoritySnapshot(
        {
          cwd: deps.cwd,
          exec: deps.exec,
          readInventory: () => Promise.resolve(source.inventory),
        },
        scope,
      );
      if (result.status === "resolved") {
        snapshots.set(result.snapshot.authorityVersion, {
          scope,
          source,
          authorityVersion: result.snapshot.authorityVersion,
        });
      }
      return result;
    },
  };

  return {
    authority,
    captureSource,
    stageTransition: async (source) => {
      const bound = requireCaptured(captured, source);
      const alreadyStaged = new Set(await readStagedPaths(deps.exec, deps.cwd));
      await stagePaths(
        deps.exec,
        deps.cwd,
        [
          ...bound.transitionSourceArtifactPaths.filter((path) => !alreadyStaged.has(path)),
          ...bound.resultArtifactPaths,
          ...bound.additionalPaths,
          ROADMAP_PATH,
        ],
      );
    },
    rollbackTransition: async (source) => {
      const bound = requireCaptured(captured, source);
      await restoreTransition(deps.exec, deps.cwd, bound);
    },
    completeTransition: async (source, expectedAuthorityVersion, additionalStagedPaths = []) => {
      const binding = snapshots.get(expectedAuthorityVersion);
      if (binding === undefined || requireCaptured(captured, source) !== binding.source) {
        return { status: "refused", reason: "authority-conflict" };
      }
      try {
        return await withRetirementTransaction(deps, async () => {
          const [sourceOid, resultOid, branch, patch, stagedPaths] = await Promise.all([
            resolveBranchHead(deps.exec, deps.cwd, binding.scope.source.branch),
            resolveBranchHead(deps.exec, deps.cwd, binding.scope.resultProjection.ref),
            getCurrentBranch(deps.exec),
            readTransitionPatch(binding.source),
            readStagedPaths(deps.exec, deps.cwd),
          ]);
          const expectedPaths = [...new Set([
            ...patch.map((operation) => operation.path),
            ...additionalStagedPaths,
          ])].sort(compareUtf8);
          const actualPaths = [...stagedPaths].sort(compareUtf8);
          if (
            sourceOid !== binding.scope.source.head
            || resultOid !== binding.scope.resultProjection.head
            || branch !== binding.scope.resultProjection.ref
            || canonicalize(actualPaths) !== canonicalize(expectedPaths)
          ) {
            return { status: "refused", reason: "authority-conflict" } as const;
          }
          return {
            status: "completed-no-record",
            authorityVersion: canonicalDigest({
              schemaVersion: 1,
              scope: binding.scope,
              sourceOid,
              resultOid,
              branch,
              stagedPaths: actualPaths,
              patch,
            }),
          } as const;
        });
      } catch (error) {
        return { status: "refused", reason: "authority-unavailable", diagnostic: errorMessage(error) };
      }
    },
    readTransitionPatch,
  };
}

/** Build the direct-transition binding used by `runAbandon`. */
export function createInRepoAbandonRetirementContext(
  deps: InRepoDirectRetirementDeps,
): AbandonRetirementContext {
  const direct = createInRepoDirectRetirementContext(deps, {
    transition: "abandon",
    label: "abandon",
  });
  return {
    authority: direct.authority,
    captureSource: (params) => direct.captureSource({ ...params, resultDir: null }),
    stageTransition: (source) => direct.stageTransition(source),
    rollbackTransition: (source) => direct.rollbackTransition(source),
    completeTransition: (source, expectedAuthorityVersion, additionalStagedPaths) =>
      direct.completeTransition(source, expectedAuthorityVersion, additionalStagedPaths),
    rollbackRefusedCommit: (source) => rollbackRefusedDirectCommit(direct, source, "Abandon"),
    readTransitionPatch: (source) => direct.readTransitionPatch(source),
  };
}

/** Build the direct-transition binding used by park-at-Planning. */
export function createInRepoParkPlanningRetirementContext(
  deps: InRepoDirectRetirementDeps,
): ParkPlanningRetirementContext {
  const direct = createInRepoDirectRetirementContext(deps, {
    transition: "park-planning",
    label: "park",
  });
  return {
    authority: direct.authority,
    captureSource: (params) => direct.captureSource(params),
    stageTransition: (source) => direct.stageTransition(source),
    rollbackTransition: (source) => direct.rollbackTransition(source),
    completeTransition: (source, expectedAuthorityVersion) =>
      direct.completeTransition(source, expectedAuthorityVersion),
  };
}

/** In-repository retirement binding used by the work-unit rename verb. */
export interface RenameRetirementContext {
  authority: DirectTransitionRetirementContext["authority"];
  captureSource(params: {
    name: string;
    targetSlug: string;
    sourceDir: string;
    resultDir: string;
    expectedBranch: string | null;
    additionalPaths?: readonly string[];
  }): Promise<RenameTransitionSourceEvidence>;
  stageTransition(source: RenameTransitionSourceEvidence): Promise<void>;
  rollbackTransition(source: RenameTransitionSourceEvidence): Promise<void>;
  rollbackRefusedCommit(
    source: RenameTransitionSourceEvidence,
  ): Promise<RenameRollbackResult>;
  completeTransition(
    source: RenameTransitionSourceEvidence,
    expectedAuthorityVersion: string,
    additionalStagedPaths?: readonly ManagedPath[],
  ): Promise<DirectTransitionCompletionResult>;
  readTransitionPatch(source: RenameTransitionSourceEvidence): Promise<readonly PatchOperation[]>;
}

/** Outcome of restoring a refused rename commit to its captured source. */
export type RenameRollbackResult =
  | { status: "rolled-back" }
  | { status: "refused"; reason: "authority-unavailable"; diagnostic: string };

/** Captured rename evidence, including the slug map that derived its result paths. */
export interface RenameTransitionSourceEvidence extends DirectTransitionSourceEvidence {
  slugMap: ArtifactSlugMap;
}

/** Build the direct-transition binding used by a work-unit rename. */
export function createInRepoRenameRetirementContext(
  deps: InRepoDirectRetirementDeps,
): RenameRetirementContext {
  const direct = createInRepoDirectRetirementContext(deps, {
    transition: "rename",
    label: "rename",
  });
  return {
    authority: direct.authority,
    captureSource: async ({ name, targetSlug, sourceDir, resultDir, expectedBranch, additionalPaths }) => {
      const source = await direct.captureSource({
        name,
        sourceDir,
        resultDir,
        expectedBranch,
        slugMap: { sourceSlug: name, targetSlug },
        additionalPaths,
      });
      return { ...source, slugMap: { sourceSlug: name, targetSlug } };
    },
    stageTransition: (source) => direct.stageTransition(source),
    rollbackTransition: (source) => direct.rollbackTransition(source),
    completeTransition: (source, expectedAuthorityVersion, additionalStagedPaths) =>
      direct.completeTransition(source, expectedAuthorityVersion, additionalStagedPaths),
    rollbackRefusedCommit: (source) => rollbackRefusedDirectCommit(direct, source, "Rename"),
    readTransitionPatch: (source) => direct.readTransitionPatch(source),
  };
}

async function rollbackRefusedDirectCommit(
  direct: DirectTransitionRetirementContext,
  source: DirectTransitionSourceEvidence,
  label: "Abandon" | "Rename",
): Promise<RenameRollbackResult> {
  try {
    await direct.rollbackTransition(source);
  } catch (error) {
    return {
      status: "refused",
      reason: "authority-unavailable",
      diagnostic: `${label} rollback was incomplete: tree restore failed: ${errorMessage(error)}.`,
    };
  }
  return { status: "rolled-back" };
}

function requireCaptured(
  captured: CapturedDirectSource | null,
  source: Pick<DirectTransitionSourceEvidence, "scope">,
): CapturedDirectSource {
  if (captured === null || canonicalScope(captured.scope) !== canonicalScope(source.scope)) {
    throw new Error("retirement source does not match the captured projection");
  }
  return captured;
}

function canonicalScope(scope: RetirementAuthorityScope): string {
  return canonicalize(scope);
}

async function resolveBranchHead(exec: GitExec, cwd: string, branch: string): Promise<string> {
  const ref = `refs/heads/${branch}`;
  const { stdout } = await exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], { cwd });
  const oid = stdout.trim();
  if (oid === "") throw new Error(`could not resolve commit: ${ref}`);
  return oid;
}

async function listArtifactPaths(
  exec: GitExec,
  cwd: string,
  ref: string,
  sourceDir: string,
  name: string,
): Promise<ManagedPath[]> {
  const { stdout } = await exec(
    "git",
    ["ls-tree", "--full-tree", "-r", "-z", "--name-only", ref, "--", sourceDir],
    { cwd },
  );
  const matcher = artifactMatcher(name);
  return stdout
    .split("\0")
    .filter((path) => path !== "" && posix.dirname(path) === sourceDir && matcher.test(posix.basename(path)))
    .map(validateManagedPath)
    .sort((left, right) => Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")));
}

async function readStagedPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--cached", "--name-only", "--no-renames", "-z"],
    { cwd },
  );
  return stdout.split("\0").filter((path) => path !== "");
}

async function stagePaths(exec: GitExec, cwd: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  await exec("git", ["add", "-A", "--", ...paths], { cwd });
}

async function restoreTransition(
  exec: GitExec,
  cwd: string,
  source: CapturedDirectSource,
): Promise<void> {
  const paths = [
    ...source.transitionSourceArtifactPaths,
    ...source.resultArtifactPaths,
    ...source.additionalPaths,
    ROADMAP_PATH,
  ];
  await exec(
    "git",
    ["restore", `--source=${source.transitionSourceHead}`, "--staged", "--worktree", "--", ...paths],
    { cwd },
  );
}

function assertAdditionalPaths(
  additionalPaths: readonly ManagedPath[],
  sourcePaths: readonly ManagedPath[],
  resultPaths: readonly ManagedPath[],
): void {
  const reserved = new Set<string>([...sourcePaths, ...resultPaths, ROADMAP_PATH]);
  const seen = new Set<string>();
  for (const path of additionalPaths) {
    if (reserved.has(path)) throw new Error(`additional transition path overlaps a derived path: ${path}`);
    if (seen.has(path)) throw new Error(`duplicate additional transition path: ${path}`);
    seen.add(path);
  }
}

async function withRetirementTransaction<T>(
  deps: InRepoDirectRetirementDeps,
  operation: () => Promise<T>,
): Promise<T> {
  const { stdout } = await deps.exec("git", ["rev-parse", "--git-common-dir"], { cwd: deps.cwd });
  const gitCommonDir = stdout.trim();
  if (gitCommonDir === "") throw new Error("Git did not resolve its common directory.");
  const handle = await acquireAdvisoryLock(
    join(resolve(deps.cwd, gitCommonDir), "arc-direct-transition.lock"),
  );
  try {
    return await operation();
  } finally {
    await releaseAdvisoryLock(handle);
  }
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  if (left === null || right === null) return left === right;
  return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}
