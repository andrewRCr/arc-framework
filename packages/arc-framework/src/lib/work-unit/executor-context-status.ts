/**
 * The production binding of the lifecycle executor's status-view side-effects.
 *
 * `reconcile-roadmap` writes and stages the project readiness view through the
 * shared status renderer. `reconcile-status-user` composes the per-developer view
 * through the shared `STATUS.USER` assembly (the same one `arc status --user` uses)
 * in local-only mode and writes `STATUS.USER.md`, degrading to an advisory rather
 * than failing the transition if the render or write throws.
 *
 * @module
 */

import type { UserIOContext } from "../../commands/user/types.js";
import { getCurrentBranch, type GitExec } from "../git/exec.js";
import { SlugSchema } from "../kernel/index.js";
import { assembleStatusUserView } from "../status/assemble-user-view.js";
import { renderRoadmapFromIndexViewResult } from "../status/roadmap-regeneration-assert.js";
import { resolveUserSurfaceResolver } from "../user-surfaces.js";
import type { SideEffectHandler } from "./lifecycle-executor.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "./lifecycle-index.js";
import { listParkedSlugs } from "./lifecycle-resolver.js";
import type { SideEffectId } from "./lifecycle-transitions.js";
import { reconcileRoadmap, reconcileStatusUserSideEffect } from "./side-effects/readiness-regen.js";
import { transitionOverlayCompositionInput } from "./transition-overlay.js";

/** Ambient inputs the status-view side-effects close over. */
export interface StatusSideEffectDeps {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** I/O context carrying the filesystem ops. */
  io: UserIOContext;
  /** Git executor pinned to the repository root. */
  exec: GitExec;
  /** Resolved identity (`null` skips the per-developer view). */
  identity: string | null;
  /** Team mode — gates the `STATUS.USER` in-flight oracle's identity filtering. */
  teamMode: boolean;
  /** Resolved `branch.base` for the in-flight oracle; omitted falls back to the oracle default. */
  baseBranch?: string;
  /** The lifecycle-index scan seam the executor's entry build shares. */
  indexFs: LifecycleIndexFs;
}

/** The side-effects that render status views after a transition. */
export type StatusSideEffects = Pick<
  Record<SideEffectId, SideEffectHandler>,
  "reconcile-roadmap" | "reconcile-status-user"
>;

/**
 * Bind the `reconcile-roadmap` and `reconcile-status-user` side-effects.
 *
 * @param deps - Repository root, I/O context, git executor, identity, and the index scan seam.
 * @returns The two status-view side-effect handlers.
 */
export function buildStatusSideEffects(deps: StatusSideEffectDeps): StatusSideEffects {
  const { cwd, io, exec, identity, teamMode, baseBranch, indexFs } = deps;
  return {
    "reconcile-roadmap": ({ slug, from, to, inputs }) =>
      reconcileRoadmap(
        {
          composeView: async () => {
            const currentBranch = await getCurrentBranch(exec);
            const { result } = await renderRoadmapFromIndexViewResult({
              cwd,
              exec,
              ...(baseBranch !== undefined ? { baseBranch } : {}),
              currentBranch,
              ...(inputs.transitionOverlay === undefined
                ? {}
                : {
                    transitionOverlays: [transitionOverlayCompositionInput(inputs.transitionOverlay)],
                  }),
            });
            return {
              content: result.markdown,
              advisories: result.warnings.map((warning) => warning.rendered),
            };
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
            (await resolveUserSurfaceResolver({
              cwd,
              identity: SlugSchema.parse(resolvedIdentity),
              exec,
            })).identityGlobalRoot,
        },
        { cwd, identity, slug, from, to },
      ),
  };
}
