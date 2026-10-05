/**
 * The production binding of the lifecycle executor's injected seams — the first
 * real wiring of an {@link ExecuteTransitionContext}.
 *
 * The executor is pure orchestration over pre-bound mutators, guards, and
 * side-effects (see {@link executeTransition}); this module closes those seams
 * over the real git executor and filesystem so a CLI handler can dispatch a
 * transition. Every mutator receives cwd-relative paths from the executor (the
 * index keys metas by their cwd-relative path), so the bindings resolve them
 * against `cwd` and pin the git executor's working directory to the repository
 * root — a relocation `git mv` and a worktree `add` stay correct regardless of
 * `process.cwd()`.
 *
 * Scope: this binder wires the four encoding mutators, the foot-gun guards, the
 * `user-workspace` side-effect the `start` dispatch's executor-routed arms (graduate /
 * resume) declare, and the `withdraw-pr` side-effect the `reopen` edge fires (a `gh`
 * write — close or draft the open PR, degrading to an advisory when `gh` is
 * unavailable so the applied phase flip is never left mid-transition). It composes
 * two sibling bindings over the same seams: the status-view side-effects
 * (`reconcile-roadmap` / `reconcile-status-user`, {@link buildStatusSideEffects}) and
 * the prepared current-WU reconcile seam used by dependent-owned write ceremonies
 * ({@link buildCurrentWuReconcile}). The destructive `scaffold` / `remove` artifact
 * runner is left to the verbs that build their own runner (`stub` / `abandon`).
 *
 * @module
 */

import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import {
  parseMetaRecord,
  setMetaBulletFields,
  setMetaBranch,
  setMetaClass,
  setMetaCurrentWorkflow,
  setMetaDesign,
  setMetaFinalizeFields,
  reconcileMetaFields,
} from "../active/meta-reader.js";
import { readActiveMetaCandidates } from "../active/meta-reader.js";
import { checkCurrentWorkflowConsistency } from "../active/current-workflow-consistency.js";
import type { GitExec } from "../git/exec.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import type { UserIOContext } from "../../commands/user/types.js";
import type { RawGitExec } from "../git/exec.js";
import { createExecaRawGitExec } from "../git/process-executor.js";
import { runUserOpen } from "../../commands/user/open.js";
import { runUserClose } from "../../commands/user/close.js";
import { buildCurrentWuReconcile } from "./executor-context-current-wu.js";
import { buildStatusSideEffects } from "./executor-context-status.js";
import type { LifecycleIndexFs } from "./lifecycle-index.js";
import type { ExecuteTransitionContext, SideEffectHandler } from "./lifecycle-executor.js";
import { buildFootgunGuards } from "./lifecycle-guards.js";
import { reconcileBranch } from "./mutators/reconcile-branch.js";
import {
  nodeReconcileWorkUnitWorktreeFs,
  provisionSpawnedWorktree,
  reconcileWorkUnitWorktree,
} from "./mutators/reconcile-work-unit-worktree.js";
import { relocateArtifacts } from "./mutators/relocate-artifacts.js";
import { setPhase } from "./mutators/set-phase.js";
import type { CurrentWuReconcileHost } from "./side-effects/discharge-dep-edges.js";
import { withdrawPr } from "./side-effects/withdraw-pr.js";
import { atomicGraduate } from "./atomic-graduation.js";
import { createNodeTeardownSelectionReader } from "./teardown-selection.js";
import { createNodeTeardownWorktreeTransactionDriver } from "./teardown-worktree-transaction.js";

/** Ambient inputs the binder closes the executor seams over. */
export interface ExecutorContextDeps {
  /** Repository root containing `.arc/` — the executor's cwd and the path-resolution base. */
  cwd: string;
  /** I/O context carrying the git executor and filesystem ops. */
  io: UserIOContext;
  /** Resolved identity (`null` skips the identity-scoped side-effects). */
  identity: string | null;
  /** Team mode — gates the `STATUS.USER` in-flight oracle's identity filtering. */
  teamMode: boolean;
  /** Resolved `branch.base` for the in-flight oracle; omitted falls back to the oracle default. */
  baseBranch?: string;
  /** Internal template directory for the user-workspace SESSION-NOTES seed. */
  internalTemplateDir: string;
  /** Optional byte-preserving Git seam for transition history reads. */
  transitionExec?: RawGitExec;
}

/**
 * Build a production {@link ExecuteTransitionContext} — the real mutators, guards,
 * and side-effects the `start` dispatch's executor-routed arms need, closed over
 * the git executor and filesystem.
 *
 * @param deps - Repository root, I/O context, identity, and the template directory.
 * @returns The bound executor context, ready to pass to {@link executeTransition}.
 */
export function buildExecutorContext(
  deps: ExecutorContextDeps,
): ExecuteTransitionContext & CurrentWuReconcileHost {
  const { cwd, io, identity, teamMode, baseBranch, internalTemplateDir } = deps;

  /** Resolve a cwd-relative path (the shape the executor passes) to an absolute one. */
  const at = (p: string): string => (isAbsolute(p) ? p : join(cwd, p));

  // Git executor defaulting to the repository root, so cwd-relative `git mv` /
  // worktree ops resolve — but an explicit per-call `cwd` wins (the `worktree-clean`
  // guard checks the *target worktree*, not the base repo). Order matters: `cwd`
  // first as the default, `...opts` last so a supplied `opts.cwd` overrides it.
  const exec: GitExec = (cmd, args, opts) => io.exec(cmd, args, { cwd, ...opts });
  const transitionExec = deps.transitionExec ?? createExecaRawGitExec(cwd);
  const readTeardownSelection = identity === null
    ? undefined
    : createNodeTeardownSelectionReader({ exec, identity });
  const teardownWorktree = identity === null
    ? undefined
    : createNodeTeardownWorktreeTransactionDriver({ exec, identity });

  /** The lifecycle-index scan seam — shared by the executor's entry build and the discharge side-effect. */
  const indexFs: LifecycleIndexFs = {
    readdir: (p) => readdir(at(p), { withFileTypes: true }),
    readFile: (p) => io.readFile(at(p)),
  };

  const userWorkspaceHandler: SideEffectHandler = async ({ slug, to, inputs }) => {
    // No resolved identity ⇒ no user-workspace satellite to open or close. Skip
    // uniformly on both directions — the prior open path fired with an empty
    // identity while the close path was already skipped, an inconsistency.
    if (identity === null) return undefined;
    // Direction rule: a move into an active location opens the workspace; a move
    // out (to backlog / completed / nonexistent) closes it. Start's arms all land
    // in an active location, so they open.
    if (to !== null && to.location === "active") {
      await runUserOpen({
        cwd,
        io,
        identity,
        wuName: slug,
        internalTemplateDir,
        sessionNotesSeed: inputs.sessionNotesSeed,
      });
    } else {
      await runUserClose({ cwd, identity, wuName: slug });
    }
    return undefined;
  };

  // `reopen` withdraws the WU's open PR — close it (default) or convert it back to a
  // draft (`--keep-pr`). A `gh` write: resolve the head branch from the meta, then
  // run the op. The `pr-unmerged` guard already cleared this WU on a positively
  // *unmerged* PR (so `gh` answered at guard time), so a failure here is a fresh /
  // transient `gh` outage — degrade to an advisory rather than throwing, so the
  // already-applied `Integrating → Active` flip isn't left mid-transition (the
  // operator finishes the withdrawal by hand).
  const withdrawPrHandler: SideEffectHandler = async ({ slug, inputs }) => {
    const metaPath = resolveArcPath({
      kind: "work-unit-artifact",
      placement: { kind: "active", scope: { kind: "project" } },
      slug: SlugSchema.parse(slug),
      artifact: "meta",
    });
    const { branch } = parseMetaRecord(await io.readFile(at(metaPath)));
    const mode = inputs.prWithdrawMode ?? "close";
    if (branch === null) {
      return `Could not withdraw the PR for \`${slug}\`: no branch recorded — close or convert it manually.`;
    }
    try {
      await withdrawPr({ exec }, { branch, mode });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const action = mode === "draft" ? "convert the PR to a draft" : "close the PR";
      return `Could not ${action} for \`${branch}\` via \`gh\` (${detail}) — withdraw it manually.`;
    }
    return undefined;
  };

  return {
    cwd,
    withCwd: (nextCwd) => buildExecutorContext({ ...deps, cwd: nextCwd }),
    exec,
    indexFs,

    setPhase: (params) =>
      setPhase(
        { readFile: (p) => io.readFile(at(p)), writeFile: (p, c) => io.writeFile(at(p), c) },
        params,
      ),
    relocateArtifacts: (params) =>
      relocateArtifacts(
        {
          exec,
          fs: {
            readdir: (p) => readdir(at(p)),
            mkdir: (p, o) => io.mkdir(at(p), o),
            rmdir: (p) => rmdir(at(p)),
          },
        },
        params,
      ),
    reconcileBranch: (op) => reconcileBranch({ exec }, op),
    reconcileWorkUnitWorktree: (op) => {
      return reconcileWorkUnitWorktree({
        exec,
        chdir: (dir) => { process.chdir(at(dir)); },
        fs: nodeReconcileWorkUnitWorktreeFs,
        ...(readTeardownSelection === undefined ? {} : { readTeardownSelection }),
        ...(teardownWorktree === undefined ? {} : { teardownWorktree }),
      }, op);
    },
    atomicGraduate: (transaction) => {
      return atomicGraduate(transaction, {
        cwd,
        exec,
        fs: { chmod, mkdir, readFile, rename, rm, rmdir, stat, writeFile },
        provisionSpawnedWorktree: (op) => provisionSpawnedWorktree(
          { exec, chdir: (dir) => { process.chdir(at(dir)); }, fs: nodeReconcileWorkUnitWorktreeFs },
          op,
        ),
      });
    },

    writeSoftFields: async (metaPath, updates) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaBulletFields(content, updates));
    },

    writeBranchField: async (metaPath, branch) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaBranch(content, branch));
    },

    writeClassField: async (metaPath, value) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaClass(content, value));
    },

    writeCurrentWorkflowField: async (metaPath, stage) => {
      const content = await io.readFile(at(metaPath));
      const next = setMetaCurrentWorkflow(content, stage);
      const record = parseMetaRecord(next);
      const diagnostics = checkCurrentWorkflowConsistency(record);
      if (diagnostics.length > 0) throw new Error(diagnostics[0]);
      await io.writeFile(at(metaPath), next);
    },

    writeCurrentWorkflowRecoveryMarker: async (metaPath, stage) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaCurrentWorkflow(content, stage));
    },

    writeDesignField: async (metaPath, value) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaDesign(content, value));
    },

    writeFinalizeFields: async (metaPath, facts) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaFinalizeFields(content, facts));
    },

    // Forward-reconcile the relocated meta against the field model, then stage the
    // rewrite through the same git seam the executor's content legs stage with — a
    // no-op (no write, no stage) when every managed bullet is already present.
    reconcileMeta: async (metaPath, overrides) => {
      const before = await io.readFile(at(metaPath));
      const { content, backfilled } = reconcileMetaFields(before, overrides);
      if (backfilled.length === 0) return [];
      await io.writeFile(at(metaPath), content);
      await exec("git", ["add", at(metaPath)]);
      return backfilled;
    },

    // Stage the content legs' meta rewrite through the same git seam
    // `relocate-artifacts` stages its `git mv` with, so the rewrite rides the
    // same commit instead of lingering unstaged over a git-mv'd (stale) index.
    stageMeta: async (metaPath) => {
      await exec("git", ["add", at(metaPath)]);
    },

    currentWuReconcile: buildCurrentWuReconcile({ cwd, io, exec, transitionExec, indexFs, at }),

    guardValidators: buildFootgunGuards({ cwd, readActiveMetaCandidates, exec }),

    sideEffects: {
      ...buildStatusSideEffects({
        cwd,
        io,
        exec,
        identity,
        teamMode,
        ...(baseBranch !== undefined ? { baseBranch } : {}),
        indexFs,
      }),
      "user-workspace": userWorkspaceHandler,
      "withdraw-pr": withdrawPrHandler,
    },
  };
}
