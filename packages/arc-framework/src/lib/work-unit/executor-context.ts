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
 * Scope: this binder wires the four encoding mutators, the foot-gun guards, and the
 * `reconcile-roadmap` / `reconcile-status-user` / `user-workspace` side-effects the
 * `start` dispatch's executor-routed arms (graduate / resume) declare, plus the
 * `discharge-dep-edges` side-effect the `activate` edge fires (the dep-edge
 * lifecycle's write half) and the `withdraw-pr` side-effect the `reopen` edge fires
 * (a `gh` write — close or draft the open PR, degrading to an advisory when `gh` is
 * unavailable so the applied phase flip is never left mid-transition). The
 * destructive `scaffold` / `remove` artifact runner is left to the verbs that build
 * their own runner (`stub` / `abandon`).
 *
 * `reconcile-status-user` renders for real here: it composes the per-developer
 * view through the shared `STATUS.USER` assembly (the same one `arc status --user`
 * uses) in local-only mode and writes `STATUS.USER.md`, degrading to an advisory
 * rather than failing the transition if the render or write throws.
 * `reconcile-roadmap` writes and stages the project readiness view through the
 * shared status renderer.
 *
 * @module
 */

import { readdir, rmdir } from "node:fs/promises";
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
import type { GitExec } from "../git/exec.js";
import { assembleStatusUserView } from "../status/assemble-user-view.js";
import { composeProjectReadinessView, resolveProjectReadinessViewInput } from "../status/project-view.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { runUserOpen } from "../../commands/user/open.js";
import { runUserClose } from "../../commands/user/close.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import { listParkedSlugs } from "./lifecycle-resolver.js";
import type { ExecuteTransitionContext, SideEffectHandler } from "./lifecycle-executor.js";
import { buildFootgunGuards } from "./lifecycle-guards.js";
import { reconcileBranch } from "./mutators/reconcile-branch.js";
import {
  nodeReconcileWorktreeFs,
  reconcileWorktree,
} from "./mutators/reconcile-worktree.js";
import { relocateArtifacts } from "./mutators/relocate-artifacts.js";
import { setPhase } from "./mutators/set-phase.js";
import { dischargeDepEdges } from "./side-effects/discharge-dep-edges.js";
import { reconcileRoadmap, reconcileStatusUserSideEffect } from "./side-effects/readiness-regen.js";
import { withdrawPr } from "./side-effects/withdraw-pr.js";

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
  /** Internal template directory for the user-workspace SESSION-NOTES seed. */
  internalTemplateDir: string;
}

/**
 * Build a production {@link ExecuteTransitionContext} — the real mutators, guards,
 * and side-effects the `start` dispatch's executor-routed arms need, closed over
 * the git executor and filesystem.
 *
 * @param deps - Repository root, I/O context, identity, and the template directory.
 * @returns The bound executor context, ready to pass to {@link executeTransition}.
 */
export function buildExecutorContext(deps: ExecutorContextDeps): ExecuteTransitionContext {
  const { cwd, io, identity, teamMode, internalTemplateDir } = deps;

  /** Resolve a cwd-relative path (the shape the executor passes) to an absolute one. */
  const at = (p: string): string => (isAbsolute(p) ? p : join(cwd, p));

  // Git executor defaulting to the repository root, so cwd-relative `git mv` /
  // worktree ops resolve — but an explicit per-call `cwd` wins (the `worktree-clean`
  // guard checks the *target worktree*, not the base repo). Order matters: `cwd`
  // first as the default, `...opts` last so a supplied `opts.cwd` overrides it.
  const exec: GitExec = (cmd, args, opts) => io.exec(cmd, args, { cwd, ...opts });

  /** Best-effort freshness marker for generated readiness views. */
  const renderedRef = async (): Promise<string> => {
    try {
      const { stdout } = await exec("git", ["rev-parse", "--short", "HEAD"]);
      return stdout.trim() || "working tree";
    } catch {
      return "working tree";
    }
  };

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

  // `activate` discharges satisfied `Depends On` edges — the dep-edge lifecycle's
  // write half. Fires after the encoding legs, so the freshly-built index reflects
  // the just-activated WU; each edge's dependency is read against current state and
  // only the satisfied ones (`shipped` ∨ `integrating`) are dropped from the gate.
  const dischargeDepEdgesHandler: SideEffectHandler = async ({ slug }) => {
    const index = await buildLifecycleIndex({ cwd, fs: indexFs });
    const { discharged } = await dischargeDepEdges(
      { index, readMeta: (p) => io.readFile(at(p)), writeMeta: (p, c) => io.writeFile(at(p), c) },
      { slug, metaPath: `.arc/active/meta-${slug}.md` },
    );
    return discharged.length > 0
      ? `Discharged ${discharged.length} satisfied dependency edge(s): ${discharged.join(", ")}.`
      : undefined;
  };

  // `reopen` withdraws the WU's open PR — close it (default) or convert it back to a
  // draft (`--keep-pr`). A `gh` write: resolve the head branch from the meta, then
  // run the op. The `pr-unmerged` guard already cleared this WU on a positively
  // *unmerged* PR (so `gh` answered at guard time), so a failure here is a fresh /
  // transient `gh` outage — degrade to an advisory rather than throwing, so the
  // already-applied `Integrating → Active` flip isn't left mid-transition (the
  // operator finishes the withdrawal by hand).
  const withdrawPrHandler: SideEffectHandler = async ({ slug, inputs }) => {
    const { Branch: branch } = parseMetaRecord(await io.readFile(at(`.arc/active/meta-${slug}.md`)));
    const mode = inputs.prWithdrawMode ?? "close";
    if (branch === null || branch === "[none]") {
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
    reconcileWorktree: (op) =>
      reconcileWorktree({ exec, chdir: (dir) => { process.chdir(at(dir)); }, fs: nodeReconcileWorktreeFs }, op),

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

    guardValidators: buildFootgunGuards({ cwd, readActiveMetaCandidates, exec }),

    sideEffects: {
      "reconcile-roadmap": ({ slug, from, to }) =>
        reconcileRoadmap(
          {
            composeView: async () => {
              const input = await resolveProjectReadinessViewInput({
                cwd,
                fs: {
                  readFile: (p) => io.readFile(p),
                  readdir: (p) => readdir(p, { withFileTypes: true }),
                },
              });
              return composeProjectReadinessView({
                ...input,
                renderedRef: await renderedRef(),
              });
            },
            mkdir: io.mkdir,
            writeFile: io.writeFile,
            stageFile: async (path) => {
              await exec("git", ["add", path]);
            },
          },
          { cwd, slug, from, to },
        ),
      "reconcile-status-user": ({ slug, from, to }) =>
        reconcileStatusUserSideEffect(
          {
            composeView: async () =>
              (
                await assembleStatusUserView({
                  cwd,
                  exec,
                  identity,
                  teamMode,
                  localOnly: true,
                  parkedSlugs: listParkedSlugs(await buildLifecycleIndex({ cwd, fs: indexFs })),
                  readFile: io.readFile,
                })
              ).output,
            mkdir: io.mkdir,
            writeFile: io.writeFile,
            resolveIdentityGlobalRoot: async (resolvedIdentity) =>
              (await resolveUserSurfaceResolver({ cwd, identity: resolvedIdentity, exec })).identityGlobalRoot,
          },
          { cwd, identity, slug, from, to },
        ),
      "user-workspace": userWorkspaceHandler,
      "discharge-dep-edges": dischargeDepEdgesHandler,
      "withdraw-pr": withdrawPrHandler,
    },
  };
}
