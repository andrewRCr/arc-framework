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
 * Scope: this binder wires what the `start` dispatch's executor-routed arms
 * (graduate / resume) need — the four encoding mutators, the foot-gun guards, and
 * the `reconcile-roadmap` / `reconcile-status-user` / `user-workspace`
 * side-effects start's edges declare. The destructive `scaffold` / `remove`
 * artifact runner and the `withdraw-pr` / `discharge-dep-edges` side-effects
 * (used only by other verbs) are left for the phase that wires those verbs.
 *
 * `reconcile-status-user` is wired here as a precise **interim advisory**,
 * symmetric with `reconcile-roadmap`: start's arms are agent-invoked and
 * `STATUS.USER` regenerates on demand via `arc status --user`, so the real
 * local render is completed as its own task before the executor backs real,
 * status-changing ceremonies.
 *
 * @module
 */

import { readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { setMetaBulletFields } from "../active/meta-reader.js";
import { readActiveMetaCandidates } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import type { UserIOContext } from "../../commands/user/types.js";
import { runUserOpen } from "../../commands/user/open.js";
import { runUserClose } from "../../commands/user/close.js";
import type { ExecuteTransitionContext, SideEffectHandler } from "./lifecycle-executor.js";
import { buildFootgunGuards } from "./lifecycle-guards.js";
import type { LifecyclePosition } from "./lifecycle-state.js";
import { reconcileBranch } from "./mutators/reconcile-branch.js";
import { reconcileWorktree } from "./mutators/reconcile-worktree.js";
import { relocateArtifacts } from "./mutators/relocate-artifacts.js";
import { setPhase } from "./mutators/set-phase.js";
import { reconcileRoadmap } from "./side-effects/readiness-regen.js";

/** Ambient inputs the binder closes the executor seams over. */
export interface ExecutorContextDeps {
  /** Repository root containing `.arc/` — the executor's cwd and the path-resolution base. */
  cwd: string;
  /** I/O context carrying the git executor and filesystem ops. */
  io: UserIOContext;
  /** Resolved identity (`null` skips the identity-scoped side-effects). */
  identity: string | null;
  /** Internal template directory for the user-workspace SESSION-NOTES seed. */
  internalTemplateDir: string;
}

/** Render a position as `phase/location`, or `nonexistent` for an absent endpoint. */
function positionLabel(position: LifecyclePosition | null): string {
  return position === null ? "nonexistent" : `${position.phase}/${position.location}`;
}

/**
 * The interim `reconcile-status-user` advisory — a precise line naming the WU and
 * its `from → to` move, pointing at the on-demand refresh. Replaced by the real
 * local render in its own task before the executor backs status-changing
 * ceremonies.
 */
function statusUserAdvisory(slug: string, from: LifecyclePosition | null, to: LifecyclePosition | null): string {
  return (
    `STATUS.USER regen pending (interim): \`${slug}\` ${positionLabel(from)} → ${positionLabel(to)}` +
    " — run `arc status --user` to refresh."
  );
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
  const { cwd, io, identity, internalTemplateDir } = deps;

  /** Resolve a cwd-relative path (the shape the executor passes) to an absolute one. */
  const at = (p: string): string => (isAbsolute(p) ? p : join(cwd, p));

  /** Git executor pinned to the repository root, so cwd-relative `git mv` / worktree ops resolve. */
  const exec: GitExec = (cmd, args, opts) => io.exec(cmd, args, { cwd, ...opts });

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

  return {
    cwd,
    exec,
    indexFs: {
      readdir: (p) => readdir(at(p), { withFileTypes: true }),
      readFile: (p) => io.readFile(at(p)),
    },

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
      "reconcile-status-user": ({ slug, from, to }) => statusUserAdvisory(slug, from, to),
      "user-workspace": userWorkspaceHandler,
    },
  };
}
