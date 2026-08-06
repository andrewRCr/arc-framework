/**
 * `reconcile-work-unit-worktree` — the WU worktree-axis encoding mutator, including
 * execution-locus relocation.
 *
 * Three operations:
 *
 * - `spawn` — establish the WU's working tree, in one of two **placement modes**:
 *     - *fresh worktree* (default): the decomposition of the shipped
 *       `spawnWorktree` — `git worktree add` at the `location_template`-resolved
 *       path, then the ownership marker. `createBranch` selects branch birth:
 *       `-b <branch> <base>` to cut a fresh branch (graduate / create-new), or a
 *       bare `git worktree add <path> <branch>` to re-attach an existing preserved
 *       branch (resume). The
 *       fresh-meta write and `runUserOpen` are *not* part of this leg — they are
 *       lifted to `scaffold` and the user-workspace side-effect respectively, so a
 *       graduate (which relocates an existing meta in) is not clobbered by a
 *       fresh-meta scaffold write. Branch creation rides this leg's `-b`.
 *     - *in place* (`--here`): no new worktree — `git checkout [-b] <branch>` in
 *       the **current** worktree (`-b` to cut a fresh branch for graduate /
 *       create-new, plain checkout to re-attach an existing branch for resume). No
 *       ownership marker (ARC did not mint this worktree). This is why branch
 *       creation is `reconcile-work-unit-worktree`'s in both modes, not `reconcile-branch`'s.
 * - `teardown` — `git worktree remove` (never `--force`; that stays the
 *   rollback-only path), gated on a clean worktree (`isWorktreeClean`). When the
 *   transition is tearing down the very worktree it executes from
 *   (self-teardown), the agent's process locus is hopped to the primary
 *   checkout *first* — otherwise `park@Active` / `abandon` of the current WU
 *   would saw off the branch it stands on.
 * - `move` — relocate a registered linked worktree with `git worktree move`,
 *   hopping the process locus after a successful self-move and returning an
 *   actionable follow-up when an occupied-directory platform refusal occurs.
 *
 * Worktree occupancy / identity is read from `git worktree list`
 * (`resolvePrimaryWorktreePath`), never from `git branch` inference. The git seam
 * and the locus-hop are injected (three-layer architecture); the ownership
 * marker is written through the shared `writeWorktreeOwnershipMarker`.
 *
 * @module
 */

import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { createLinkedWorktree } from "../../git/linked-worktree.js";
import { gitFailureText } from "../../git/process-error.js";
import { isWorktreeClean } from "../../git/worktree-cleanup.js";
import {
  ensureWorktreeMarkerIgnored,
  type WorktreeSubject,
  writeWorktreeOwnershipMarker,
} from "../../git/worktree-marker.js";
import {
  resolvePrimaryWorktreePath,
  resolveWorktreePathsByBranchResult,
} from "../../git/worktree-roster.js";
import { setupLinkedWorktree } from "../../git/linked-worktree-setup.js";
import { localPathContains } from "../../local-path-identity.js";
import {
  reconcileLinkedIdentityGlobalUserSurfaces,
  type UserSurfaceMigrationDirent,
} from "../../user-surface-migration.js";
import type { TeardownSelection, TeardownSelectionReader } from "../teardown-selection.js";
import type { TeardownWorktreeTransactionDriver } from "../teardown-worktree-transaction.js";
import { withWorktreeOperationLock } from "../worktree-operation-lock.js";

/** Dependencies for {@link reconcileWorkUnitWorktree}. */
export interface ReconcileWorkUnitWorktreeContext {
  /** Git executor — runs `git worktree add` / `remove` / `list` / `status`. */
  exec: GitExec;
  /** Relocate the agent's process locus on a self-teardown. Production binds `process.chdir`. */
  chdir: (dir: string) => void;
  /** Read the live command locus during final locked revalidation. */
  readCurrentLocus?: () => string;
  /** Filesystem seam for post-create harness-dir provisioning. */
  fs: ReconcileWorkUnitWorktreeFs;
  /** Shared-mutex driver for authorized physical teardown. */
  teardownWorktree?: TeardownWorktreeTransactionDriver;
  /** Exact marker/topology selector for subject-owned physical teardown. */
  readTeardownSelection?: TeardownSelectionReader;
  /** Test/embedding seam for repository-wide physical-operation serialization. */
  serializeWorktreeOperation?: <T>(checkoutPath: string, operation: () => Promise<T>) => Promise<T>;
}

/** Filesystem operations used by the fresh-worktree post-create provisioning leg. */
export interface ReconcileWorkUnitWorktreeFs {
  /** Return true when any filesystem entry occupies `path`. */
  pathExists(path: string): Promise<boolean>;
  /** Return true when `path` exists and is a directory. */
  directoryExists(path: string): Promise<boolean>;
  /** Recursively copy a directory into the destination worktree. */
  copyDirectory(source: string, destination: string): Promise<void>;
  /** Read a UTF-8 text file. */
  readFile(path: string): Promise<string>;
  /** Write a UTF-8 text file. */
  writeFile(path: string, content: string): Promise<void>;
  /** Ensure a directory exists. */
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  /** Read directory entries. */
  readDir(path: string): Promise<UserSurfaceMigrationDirent[]>;
  /** Remove a machine-local user-surface cache. */
  removeFile?(path: string): Promise<void>;
}

/** Production filesystem adapter for {@link reconcileWorkUnitWorktree}. */
export const nodeReconcileWorkUnitWorktreeFs: ReconcileWorkUnitWorktreeFs = {
  pathExists: async (path) => access(path).then(() => true, () => false),
  directoryExists: async (path) => {
    try {
      return (await stat(path)).isDirectory();
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") return false;
      throw err;
    }
  },
  copyDirectory: async (source, destination) => {
    await cp(source, destination, { recursive: true, force: true, verbatimSymlinks: true });
  },
  readFile: (path) => readFile(path, "utf8"),
  writeFile,
  mkdir: async (path, options) => {
    await mkdir(path, options);
  },
  readDir: (path) => readdir(path, { withFileTypes: true }),
  removeFile: (path) => rm(path, { force: true }),
};

/**
 * The worktree operation to perform, as a discriminated union:
 *
 * - `spawn` (fresh worktree) — create the worktree + branch at the templated path
 *   and mark it.
 * - `spawn` (`inPlace`) — place the branch in the current worktree via
 *   `git checkout [-b]`; no new worktree, no marker.
 * - `teardown` — remove `worktreePath`; `currentLocus` is the directory the
 *   transition executes from, used to detect a self-teardown.
 * - `move` — move one registered worktree root and preserve the process locus
 *   when the caller is outside it.
 */
export type ReconcileWorkUnitWorktreeOp =
  | {
      mutation: "spawn";
      /** Fresh-worktree placement (the default). */
      inPlace?: false;
      /** Full branch to create or re-attach (e.g. `plan/<name>`). */
      branch: string;
      /**
       * `true`/absent cuts a fresh branch (`-b <branch> <base>`, graduate / create-new); `false`
       * re-attaches an existing preserved branch (bare `git worktree add <path> <branch>`, resume).
       */
      createBranch?: boolean;
      /** Base ref the branch forks from (local ref; no fetch). Ignored on re-attach (`createBranch: false`). */
      base: string;
      /** Resolved `worktree.location_template`. */
      locationTemplate: string;
      /** Main-worktree basename — the `{repo}` expansion. */
      repo: string;
      /** Work-unit name — drives the ownership marker. */
      wuName: string;
      /** Identity creating the worktree — the ownership marker. */
      spawningIdentity: string;
      /** Project-supplied post-create provisioning script, run inside the new worktree when configured. */
      postCreateScript?: string;
      /** Resolved primary checkout path; source for registered harness-dir copy. */
      primaryWorktreePath?: string;
      /** Comma-separated `worktree.harness_dirs` value. */
      registeredHarnessDirs?: string;
      /** Marker timestamp (epoch millis); injectable for tests. */
      now?: number;
    }
  | {
      mutation: "spawn";
      /** In-place placement: check the branch out in the current worktree, no spawn. */
      inPlace: true;
      /** Branch to place in the current worktree. */
      branch: string;
      /** Work-unit whose trusted transition owns this checkout. */
      wuName: string;
      /** `true` cuts a fresh branch (`-b`, graduate / create-new); `false` attaches an existing one (resume). */
      createBranch: boolean;
      /**
       * Skip the physical `git checkout`, returning the branch for the caller to attach later. Resume sets
       * this: its tracked-branch pointer-record removal must be committed *before* switching off that branch
       * (a checkout would discard the staged removal), so the ceremony commits, then re-attaches.
       */
      deferCheckout?: boolean;
    }
  | {
      mutation: "teardown";
      /** The worktree root to remove. */
      worktreePath: string;
      /** The directory the transition runs from — a self-teardown when inside `worktreePath`. */
      currentLocus: string;
      /** Exact logical owner; required for ordinary lifecycle teardown and omitted only by rollback cleanup. */
      subject?: WorktreeSubject;
      /** Complete marker/topology authorization; omission is reserved for caller-owned rollback cleanup. */
      authorization?: {
        /** Exact checkout, subject, and marker generation selected by advisory authorization. */
        expectedSelection: TeardownSelection;
        /** Remaining network-free local predicates to rerun under the operation mutex. */
        revalidateLocal?: () => Promise<void>;
      };
      /** Caller has approved a detached husk; skip the redundant cleanliness probe, but reconcile user surfaces. */
      huskApproved?: boolean;
    }
  | {
      mutation: "move";
      /** Live registered worktree root. */
      from: string;
      /** Destination derived relative to the live registered root. */
      to: string;
      /** Directory the transition currently executes from. */
      currentLocus: string;
    };

/** Outcome of a {@link reconcileWorkUnitWorktree} call. */
export type ReconcileWorkUnitWorktreeResult =
  | {
      mutation: "spawn";
      worktreePath: string;
      branch: string;
      postCreateNotice?: string;
    }
  | { mutation: "teardown"; worktreePath: string; locusHopped: boolean }
  | {
      mutation: "move";
      from: string;
      to: string;
      locusHopped: boolean;
      followUpNotice?: string;
    };

/** Result of deriving a worktree move from live branch registration. */
export type RenameWorktreeMoveResolution =
  | { status: "move"; from: string; to: string }
  | { status: "deferred-self-move"; from: string; to: string }
  | { status: "already-moved"; worktreePath: string; sourceWorktreePath: string }
  | { status: "unmatched"; worktreePath: string }
  | { status: "in-place" };

/**
 * Resolve a rename destination from the branch's live registered worktree.
 * Only the final path segment changes; off-template placement and its parent
 * directory remain authoritative.
 *
 * @param exec - Git executor
 * @param params - Renamed branch plus old/new work-unit slugs
 * @returns A move plan or designed skip
 */
export async function resolveRenameWorktreeMove(
  exec: GitExec,
  params: { branch: string; oldSlug: string; newSlug: string; currentLocus: string },
): Promise<RenameWorktreeMoveResolution> {
  const registry = await resolveWorktreePathsByBranchResult(exec);
  if (!registry.ok) throw new Error("could not read the registered worktree paths");
  const from = registry.paths.get(params.branch);
  if (from === undefined) return { status: "in-place" };

  const leaf = basename(from);
  const slugOffset = leaf.lastIndexOf(params.oldSlug);
  const targetOffset = leaf.lastIndexOf(params.newSlug);
  if (
    targetOffset !== -1
    && (
      slugOffset === -1
      || (
        params.newSlug.includes(params.oldSlug)
        && slugOffset >= targetOffset
        && slugOffset + params.oldSlug.length <= targetOffset + params.newSlug.length
      )
    )
  ) {
    // The destination is registered, so the physical move already landed. Reconstruct the path it
    // came from — the inverse of the rewrite below — because a move interrupted before the locus
    // rekey leaves the record keyed under that source path, and nothing else can still name it.
    const sourceLeaf = `${leaf.slice(0, targetOffset)}${params.oldSlug}${leaf.slice(targetOffset + params.newSlug.length)}`;
    return { status: "already-moved", worktreePath: from, sourceWorktreePath: join(dirname(from), sourceLeaf) };
  }
  if (slugOffset === -1) return { status: "unmatched", worktreePath: from };
  const renamedLeaf = `${leaf.slice(0, slugOffset)}${params.newSlug}${leaf.slice(slugOffset + params.oldSlug.length)}`;
  const to = join(dirname(from), renamedLeaf);
  return await localPathContains(from, params.currentLocus)
    ? { status: "deferred-self-move", from, to }
    : { status: "move", from, to };
}

/**
 * Whether `locus` sits inside (or at) `worktreePath` — the self-teardown test.
 * A non-`..`, non-absolute relative path means `locus` is contained.
 */
export function isSelfTeardown(worktreePath: string, locus: string): Promise<boolean> {
  return localPathContains(worktreePath, locus);
}

function isErrnoException(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

/** Operands for provisioning an already-created linked worktree. */
export interface ProvisionSpawnedWorktreeOp {
  worktreePath: string;
  wuName: string;
  spawningIdentity: string;
  postCreateScript?: string;
  primaryWorktreePath?: string;
  registeredHarnessDirs?: string;
  now?: number;
}

/**
 * Apply project setup, registered harness copies, the ignore rule, and ownership marker.
 *
 * @param ctx - Git and filesystem boundaries
 * @param op - Exact spawned-worktree provisioning operands
 * @returns The existing no-script notice, or `null`
 */
export async function provisionSpawnedWorktree(
  ctx: ReconcileWorkUnitWorktreeContext,
  op: ProvisionSpawnedWorktreeOp,
): Promise<string | null> {
  const setup = await setupLinkedWorktree(ctx, {
    worktreePath: op.worktreePath,
    primaryWorktreePath: op.primaryWorktreePath,
    postCreateScript: op.postCreateScript,
    registeredHarnessDirs: op.registeredHarnessDirs,
  });
  await ensureWorktreeMarkerIgnored(op.worktreePath, ctx.exec, ctx.fs);
  await writeWorktreeOwnershipMarker(op.worktreePath, {
    createdByArc: true,
    createdFor: { kind: "work-unit", name: op.wuName },
    spawningIdentity: op.spawningIdentity,
    now: op.now,
  });
  return setup.postCreateNotice ?? null;
}

/**
 * Spawn or tear down a work unit's worktree per `op`.
 *
 * Spawn (fresh) creates the worktree + branch and writes the ownership marker;
 * spawn (`inPlace`) checks the branch out in the current worktree, no marker;
 * teardown refuses a dirty worktree, hops the locus to the primary checkout when
 * removing the worktree it runs from, and removes without `--force`.
 *
 * @param ctx - Injected git seam + locus-hop.
 * @param op - The worktree mutation and its operands.
 * @returns The spawn path/branch, or the teardown path and whether the locus hopped.
 * @throws When a teardown targets a dirty worktree.
 */
export async function reconcileWorkUnitWorktree(
  ctx: ReconcileWorkUnitWorktreeContext,
  op: ReconcileWorkUnitWorktreeOp,
): Promise<ReconcileWorkUnitWorktreeResult> {
  if (op.mutation === "move") {
    const selfMove = await isSelfTeardown(op.from, op.currentLocus);
    try {
      await ctx.exec("git", ["worktree", "move", op.from, op.to]);
    } catch (error) {
      if (!selfMove || !isOccupiedWorktreeMoveFailure(error)) throw error;
      return {
        mutation: "move",
        from: op.from,
        to: op.to,
        locusHopped: false,
        followUpNotice:
          `Move the worktree from outside the worktree: git worktree move ${op.from} ${op.to}`,
      };
    }
    if (selfMove) ctx.chdir(op.to);
    return {
      mutation: "move",
      from: op.from,
      to: op.to,
      locusHopped: selfMove,
    };
  }
  if (op.mutation === "spawn" && op.inPlace) {
    // In place: cut/attach the branch in the current worktree — no `worktree add`,
    // no ownership marker (ARC did not mint this checkout). `deferCheckout` skips
    // the physical checkout — the caller (resume) re-attaches after committing the
    // pointer-record removal, since switching branches first would discard it.
    if (!op.deferCheckout) {
      const checkout = op.createBranch ? ["checkout", "-b", op.branch] : ["checkout", op.branch];
      await ctx.exec("git", checkout);
    }
    const { stdout } = await ctx.exec("git", ["rev-parse", "--show-toplevel"]);
    const worktreePath = stdout.trim();
    return {
      mutation: "spawn",
      worktreePath,
      branch: op.branch,
    };
  }

  if (op.mutation === "spawn") {
    // `worktree.location_template` is repo-root-relative (default `../{repo}.{name}`),
    // so its resolved value is relative too. That path becomes the executor's cwd for
    // the ceremony commit; left relative, the staged `git add <path>` would carry a
    // `..` that escapes the spawned worktree (`fatal: … outside repository`). Absolutize
    // a relative template against the repo root once, here, so every downstream consumer
    // gets an absolute path; an already-absolute template needs no root and passes through.
    const creation = await createLinkedWorktree({
      exec: ctx.exec,
      pathExists: (path) => ctx.fs.pathExists(path),
    }, {
      locationTemplate: op.locationTemplate,
      primaryWorktreePath: op.primaryWorktreePath,
      repo: op.repo,
      placementName: op.wuName,
      branch: op.branch,
      createBranch: op.createBranch !== false,
      base: op.base,
    });
    if (creation.kind === "refused") {
      throw new Error(`refusing linked worktree path collision: ${creation.worktreePath}`);
    }
    if (creation.kind === "error") throw creation.error;
    const { worktreePath } = creation.receipt;
    try {
      const postCreateNotice = await provisionSpawnedWorktree(ctx, { ...op, worktreePath });
      return {
        mutation: "spawn",
        worktreePath,
        branch: op.branch,
        ...(postCreateNotice === null ? {} : { postCreateNotice }),
      };
    } catch (error) {
      const cleanupFailures = await rollbackFreshSpawn(ctx, creation.receipt);
      if (cleanupFailures.length === 0) throw error;
      throw new AggregateError(
        [error, ...cleanupFailures],
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }

  const { worktreePath, currentLocus } = op;
  if (op.huskApproved !== true && !(await isWorktreeClean({ exec: ctx.exec, cwd: worktreePath }))) {
    throw new Error(`refusing to tear down a dirty worktree: ${worktreePath}`);
  }
  if (op.huskApproved === true && await isSelfTeardown(worktreePath, currentLocus)) {
    throw new Error(`refusing to remove the current detached worktree: ${worktreePath}`);
  }

  let authorization = op.authorization;
  if (authorization === undefined && op.subject !== undefined) {
    if (ctx.readTeardownSelection === undefined) {
      throw new Error("subject-owned worktree teardown requires exact marker/topology selection");
    }
    const selected = await ctx.readTeardownSelection({ checkoutPath: worktreePath, subject: op.subject });
    if (selected.kind !== "clear") throw new Error(selected.message);
    authorization = { expectedSelection: selected };
  }
  if (authorization !== undefined && ctx.teardownWorktree === undefined) {
    throw new Error("authorized worktree teardown requires the marker/topology transaction driver");
  }
  const lockedRetirement = ctx.teardownWorktree !== undefined && authorization !== undefined
    ? {
        driver: ctx.teardownWorktree,
        ...authorization,
      }
    : null;
  let primary: string;
  if (lockedRetirement === null) {
    primary = await reconcileUserSurfacesForRemoval(ctx, worktreePath);
  } else {
    primary = await resolvePrimaryWorktreePath(ctx.exec) ?? "";
    if (primary === "") throw new Error(`cannot resolve the primary worktree before teardown of ${worktreePath}`);
  }

  let locusHopped = false;
  let finalLocus = currentLocus;
  if (await isSelfTeardown(worktreePath, currentLocus)) {
    ctx.chdir(primary);
    locusHopped = true;
    finalLocus = primary;
  }

  const removeCheckout = () => ctx.exec("git", ["worktree", "remove", worktreePath]).then(() => undefined);
  try {
    if (lockedRetirement !== null) {
      await lockedRetirement.driver.retire({
        expectedSelection: lockedRetirement.expectedSelection,
        revalidateLocal: async () => {
          if (!(await isWorktreeClean({ exec: ctx.exec, cwd: worktreePath }))) {
            throw new Error(`refusing to tear down a dirty worktree: ${worktreePath}`);
          }
          if (await isSelfTeardown(worktreePath, ctx.readCurrentLocus?.() ?? finalLocus)) {
            throw new Error(`refusing to remove the current worktree: ${worktreePath}`);
          }
          await lockedRetirement.revalidateLocal?.();
          await reconcileUserSurfacesForRemoval(ctx, worktreePath);
        },
        retireProjection: removeCheckout,
      });
    } else {
      const serialize = ctx.serializeWorktreeOperation
        ?? (<T>(checkoutPath: string, operation: () => Promise<T>) => withWorktreeOperationLock({
          exec: ctx.exec,
          cwd: checkoutPath,
          operation: async () => operation(),
        }));
      await serialize(worktreePath, removeCheckout);
    }
  } catch (error) {
    if (!locusHopped) throw error;
    let targetStillExists: boolean;
    try {
      targetStillExists = await ctx.fs.pathExists(worktreePath);
    } catch (probeError) {
      throw new AggregateError(
        [error, probeError],
        `${error instanceof Error ? error.message : String(error)}; process locus remains at ${primary}`,
        { cause: probeError },
      );
    }
    if (!targetStillExists) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; process locus remains at ${primary} because the target worktree was removed`,
        { cause: error },
      );
    }
    try {
      ctx.chdir(currentLocus);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `${error instanceof Error ? error.message : String(error)}; process locus could not be restored from ${primary}`,
        { cause: restoreError },
      );
    }
    throw error;
  }
  return { mutation: "teardown", worktreePath, locusHopped };
}

async function rollbackFreshSpawn(
  ctx: ReconcileWorkUnitWorktreeContext,
  receipt: { readonly worktreePath: string; readonly branch: string; readonly branchCreated: boolean },
): Promise<unknown[]> {
  const failures: unknown[] = [];
  try {
    await ctx.exec("git", ["worktree", "remove", "--force", receipt.worktreePath]);
  } catch (error) {
    failures.push(error);
  }
  if (receipt.branchCreated) {
    try {
      await ctx.exec("git", ["branch", "-D", receipt.branch]);
    } catch (error) {
      failures.push(error);
    }
  }
  return failures;
}

function isOccupiedWorktreeMoveFailure(error: unknown): boolean {
  return /permission denied|access is denied|being used by another process|device or resource busy|invalid argument/iu
    .test(gitFailureText(error));
}

async function reconcileUserSurfacesForRemoval(
  ctx: ReconcileWorkUnitWorktreeContext,
  worktreePath: string,
): Promise<string> {
  const primary = await resolvePrimaryWorktreePath(ctx.exec);
  if (primary === null) {
    throw new Error(`cannot resolve the primary worktree before teardown of ${worktreePath}`);
  }
  const result = await reconcileLinkedIdentityGlobalUserSurfaces({
    worktreePath,
    primaryWorktreePath: primary,
    fs: ctx.fs,
  });
  if (result.status === "blocked") throw new Error(result.reason);
  return primary;
}
