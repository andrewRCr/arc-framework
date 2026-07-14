/**
 * `reconcile-worktree` — the worktree-axis encoding mutator, including
 * execution-locus relocation.
 *
 * Two operations:
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
 *       creation is `reconcile-worktree`'s in both modes, not `reconcile-branch`'s.
 * - `teardown` — `git worktree remove` (never `--force`; that stays the
 *   rollback-only path), gated on a clean worktree (`isWorktreeClean`). When the
 *   transition is tearing down the very worktree it executes from
 *   (self-teardown), the agent's process locus is hopped to the primary
 *   checkout *first* — otherwise `park@Active` / `abandon` of the current WU
 *   would saw off the branch it stands on.
 *
 * Worktree occupancy / identity is read from `git worktree list`
 * (`resolvePrimaryWorktreePath`), never from `git branch` inference. The git seam
 * and the locus-hop are injected (three-layer architecture); the ownership
 * marker is written through the shared `writeWorktreeOwnershipMarker`.
 *
 * @module
 */

import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { GitExec } from "../../git/exec.js";
import { parseRegisteredHarnessDirs } from "../../git/worktree-harness-dirs.js";
import { isWorktreeClean } from "../../git/worktree-cleanup.js";
import {
  ensureWorktreeMarkerIgnored,
  writeWorktreeOwnershipMarker,
} from "../../git/worktree-marker.js";
import { resolveWorktreeLocation } from "../../git/worktree-location.js";
import { resolvePrimaryWorktreePath } from "../../git/worktree-roster.js";
import {
  reconcileLinkedIdentityGlobalUserSurfaces,
  type UserSurfaceMigrationDirent,
} from "../../user-surface-migration.js";

/** Dependencies for {@link reconcileWorktree}. */
export interface ReconcileWorktreeContext {
  /** Git executor — runs `git worktree add` / `remove` / `list` / `status`. */
  exec: GitExec;
  /** Relocate the agent's process locus on a self-teardown. Production binds `process.chdir`. */
  chdir: (dir: string) => void;
  /** Filesystem seam for post-create harness-dir provisioning. */
  fs: ReconcileWorktreeFs;
}

/** Filesystem operations used by the fresh-worktree post-create provisioning leg. */
export interface ReconcileWorktreeFs {
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

/** Production filesystem adapter for {@link reconcileWorktree}. */
export const nodeReconcileWorktreeFs: ReconcileWorktreeFs = {
  directoryExists: async (path) => {
    try {
      return (await stat(path)).isDirectory();
    } catch (err) {
      if (isErrnoException(err) && err.code === "ENOENT") return false;
      throw err;
    }
  },
  copyDirectory: async (source, destination) => {
    await cp(source, destination, { recursive: true, force: true });
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
 */
export type ReconcileWorktreeOp =
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
      /** Caller has approved a detached husk; skip standard teardown preflight. */
      huskApproved?: boolean;
    };

/** Outcome of a {@link reconcileWorktree} call. */
export type ReconcileWorktreeResult =
  | { mutation: "spawn"; worktreePath: string; branch: string; postCreateNotice?: string }
  | { mutation: "teardown"; worktreePath: string; locusHopped: boolean };

/** Notice surfaced when the project has not configured its worktree provisioning script. */
const POST_CREATE_UNCONFIGURED_NOTICE =
  "No `worktree.post_create` script configured; deps must be provisioned before running ARC commands in this worktree.";

/**
 * Whether `locus` sits inside (or at) `worktreePath` — the self-teardown test.
 * A non-`..`, non-absolute relative path means `locus` is contained.
 */
export function isSelfTeardown(worktreePath: string, locus: string): boolean {
  const rel = relative(resolve(worktreePath), resolve(locus));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Shell invocation for a project-supplied post-create script. */
function postCreateShellCommand(script: string): { cmd: string; args: string[] } {
  return process.platform === "win32"
    ? { cmd: "cmd.exe", args: ["/d", "/s", "/c", script] }
    : { cmd: "sh", args: ["-c", script] };
}

function isErrnoException(err: unknown): err is { code?: string } {
  return typeof err === "object" && err !== null && "code" in err;
}

async function copyRegisteredHarnessDirs(
  ctx: ReconcileWorktreeContext,
  params: {
    primaryWorktreePath: string | undefined;
    worktreePath: string;
    registeredHarnessDirs: string | undefined;
  },
): Promise<void> {
  const dirs = parseRegisteredHarnessDirs(params.registeredHarnessDirs);
  if (dirs.length === 0) return;

  const primaryWorktreePath = params.primaryWorktreePath ?? (await resolvePrimaryWorktreePath(ctx.exec));
  if (primaryWorktreePath === null) {
    throw new Error("could not resolve the primary worktree path to copy registered harness dirs");
  }

  for (const dir of dirs) {
    const source = join(primaryWorktreePath, dir);
    if (!(await ctx.fs.directoryExists(source))) continue;
    await ctx.fs.copyDirectory(source, join(params.worktreePath, dir));
  }
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
export async function reconcileWorktree(
  ctx: ReconcileWorktreeContext,
  op: ReconcileWorktreeOp,
): Promise<ReconcileWorktreeResult> {
  if (op.mutation === "teardown" && op.huskApproved === true) {
    if (isSelfTeardown(op.worktreePath, op.currentLocus)) {
      throw new Error(`refusing to remove the current detached worktree: ${op.worktreePath}`);
    }
    await ctx.exec("git", ["worktree", "remove", op.worktreePath]);
    return { mutation: "teardown", worktreePath: op.worktreePath, locusHopped: false };
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
    return { mutation: "spawn", worktreePath: stdout.trim(), branch: op.branch };
  }

  if (op.mutation === "spawn") {
    // `worktree.location_template` is repo-root-relative (default `../{repo}.{name}`),
    // so its resolved value is relative too. That path becomes the executor's cwd for
    // the ceremony commit; left relative, the staged `git add <path>` would carry a
    // `..` that escapes the spawned worktree (`fatal: … outside repository`). Absolutize
    // a relative template against the repo root once, here, so every downstream consumer
    // gets an absolute path; an already-absolute template needs no root and passes through.
    const templatedPath = resolveWorktreeLocation({
      template: op.locationTemplate,
      repo: op.repo,
      name: op.wuName,
      branch: op.branch,
    });
    let worktreePath = templatedPath;
    if (!isAbsolute(templatedPath)) {
      const primaryRoot = op.primaryWorktreePath ?? (await resolvePrimaryWorktreePath(ctx.exec));
      if (primaryRoot === null) {
        throw new Error("cannot resolve the primary worktree root to absolutize the relative spawn path");
      }
      worktreePath = resolve(primaryRoot, templatedPath);
    }
    // Re-attach (`createBranch: false`) checks out an existing preserved branch — bare `add`, no
    // `-b`/base; the default cuts a fresh branch (`-b <branch> <base>`) for graduate / create-new.
    const add =
      op.createBranch === false
        ? ["worktree", "add", worktreePath, op.branch]
        : ["worktree", "add", worktreePath, "-b", op.branch, op.base];
    await ctx.exec("git", add);
    const postCreateScript = op.postCreateScript?.trim();
    let postCreateNotice: string | undefined;
    if (postCreateScript) {
      const { cmd, args } = postCreateShellCommand(postCreateScript);
      try {
        await ctx.exec(cmd, args, { cwd: worktreePath });
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`worktree.post_create failed: ${detail}`, { cause: err });
      }
    } else {
      postCreateNotice = POST_CREATE_UNCONFIGURED_NOTICE;
    }
    await copyRegisteredHarnessDirs(ctx, {
      primaryWorktreePath: op.primaryWorktreePath,
      worktreePath,
      registeredHarnessDirs: op.registeredHarnessDirs,
    });
    await ensureWorktreeMarkerIgnored(worktreePath, ctx.exec, ctx.fs);
    await writeWorktreeOwnershipMarker(worktreePath, {
      createdByArc: true,
      createdFor: { kind: "work-unit", name: op.wuName },
      spawningIdentity: op.spawningIdentity,
      now: op.now,
    });
    return {
      mutation: "spawn",
      worktreePath,
      branch: op.branch,
      ...(postCreateNotice === undefined ? {} : { postCreateNotice }),
    };
  }

  const { worktreePath, currentLocus } = op;
  if (!(await isWorktreeClean({ exec: ctx.exec, cwd: worktreePath }))) {
    throw new Error(`refusing to tear down a dirty worktree: ${worktreePath}`);
  }

  const primary = await resolvePrimaryWorktreePath(ctx.exec);
  if (primary === null) {
    throw new Error(`cannot resolve the primary worktree before teardown of ${worktreePath}`);
  }
  const userSurfaceReconcile = await reconcileLinkedIdentityGlobalUserSurfaces({
    worktreePath,
    primaryWorktreePath: primary,
    fs: ctx.fs,
  });
  if (userSurfaceReconcile.status === "blocked") {
    throw new Error(userSurfaceReconcile.reason);
  }

  let locusHopped = false;
  if (isSelfTeardown(worktreePath, currentLocus)) {
    ctx.chdir(primary);
    locusHopped = true;
  }

  await ctx.exec("git", ["worktree", "remove", worktreePath]);
  return { mutation: "teardown", worktreePath, locusHopped };
}
