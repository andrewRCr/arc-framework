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
 * lifecycle's write half). The destructive `scaffold` / `remove` artifact runner and
 * the `withdraw-pr` side-effect (the verbs that build their own runner / carry a `gh`
 * write) are left for the phase that wires those verbs.
 *
 * `reconcile-status-user` renders for real here: it composes the per-developer
 * view through the shared `STATUS.USER` assembly (the same one `arc status --user`
 * uses) in local-only mode and writes `STATUS.USER.md`, degrading to an advisory
 * rather than failing the transition if the render or write throws.
 * `reconcile-roadmap` stays a forward-compat advisory — `roadmap-tooling` owns the
 * real ROADMAP renderer.
 *
 * @module
 */

import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { setMetaBulletFields } from "../active/meta-reader.js";
import { readActiveMetaCandidates } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import { assembleStatusUserView } from "../status/assemble-user-view.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { runUserOpen } from "../../commands/user/open.js";
import { runUserClose } from "../../commands/user/close.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import type { ExecuteTransitionContext, SideEffectHandler } from "./lifecycle-executor.js";
import { buildFootgunGuards } from "./lifecycle-guards.js";
import { reconcileBranch } from "./mutators/reconcile-branch.js";
import { reconcileWorktree } from "./mutators/reconcile-worktree.js";
import { relocateArtifacts } from "./mutators/relocate-artifacts.js";
import { setPhase } from "./mutators/set-phase.js";
import { dischargeDepEdges } from "./side-effects/discharge-dep-edges.js";
import { reconcileRoadmap, reconcileStatusUserSideEffect } from "./side-effects/readiness-regen.js";

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

  /** Git executor pinned to the repository root, so cwd-relative `git mv` / worktree ops resolve. */
  const exec: GitExec = (cmd, args, opts) => io.exec(cmd, args, { cwd, ...opts });

  /** The lifecycle-index scan seam — shared by the executor's entry build and the discharge side-effect. */
  const indexFs: LifecycleIndexFs = {
    readdir: (p) => readdir(at(p), { withFileTypes: true }),
    readFile: (p) => io.readFile(at(p)),
  };

  const userWorkspaceHandler: SideEffectHandler = async ({ slug, to }) => {
    // Direction rule: a move into an active location opens the workspace; a move
    // out (to backlog / completed / nonexistent) closes it. Start's arms all land
    // in an active location, so they open.
    if (to !== null && to.location === "active") {
      await runUserOpen({ cwd, io, identity: identity ?? "", wuName: slug, internalTemplateDir });
    } else if (identity !== null) {
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

  return {
    cwd,
    exec,
    indexFs,

    setPhase: (params) =>
      setPhase(
        { readFile: (p) => io.readFile(at(p)), writeFile: (p, c) => io.writeFile(at(p), c) },
        params,
      ),
    relocateArtifacts: (params) =>
      relocateArtifacts(
        { exec, fs: { readdir: (p) => readdir(at(p)), mkdir: (p, o) => io.mkdir(at(p), o) } },
        params,
      ),
    reconcileBranch: (op) => reconcileBranch({ exec }, op),
    reconcileWorktree: (op) => reconcileWorktree({ exec, chdir: (dir) => { process.chdir(dir); } }, op),

    writeSoftFields: async (metaPath, updates) => {
      const content = await io.readFile(at(metaPath));
      await io.writeFile(at(metaPath), setMetaBulletFields(content, updates));
    },

    guardValidators: buildFootgunGuards({ cwd, readActiveMetaCandidates }),

    sideEffects: {
      "reconcile-roadmap": ({ slug, from, to }) => reconcileRoadmap({ slug, from, to }),
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
                  readFile: io.readFile,
                  readdir: (p) => readdir(p),
                })
              ).output,
            mkdir: io.mkdir,
            writeFile: io.writeFile,
          },
          { cwd, identity, slug, from, to },
        ),
      "user-workspace": userWorkspaceHandler,
      "discharge-dep-edges": dischargeDepEdgesHandler,
    },
  };
}
