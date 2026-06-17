/**
 * Readiness-view regeneration side-effects — the two declared effects a location
 * move fires so the project- and per-developer readiness views never drift from
 * the lifecycle state.
 *
 * - `reconcile-status-user` builds for real: it composes the per-developer view
 *   through the shipped status renderer (wired by the executor as `composeView`)
 *   and writes `STATUS.USER.md` under the identity workspace. Identity-scoped —
 *   a null identity skips.
 * - `reconcile-roadmap` is declared forward-compat: `roadmap-tooling` owns the
 *   real ROADMAP renderer, so this emits a precise advisory naming the work unit
 *   and its `from → to` move for a hand-render, committing to no ROADMAP format,
 *   bucket, or derived-state label.
 *
 * Both keep their I/O behind injected seams (three-layer architecture); the
 * executor supplies the composer + filesystem and surfaces the roadmap advisory.
 *
 * @module
 */

import { join } from "node:path";

import { ensureDir, type MkdirFn, type WriteFileFn } from "../../template/files.js";
import type { LifecyclePosition } from "../lifecycle-state.js";

/** Dependencies for {@link reconcileStatusUser}. */
export interface ReconcileStatusUserContext {
  /**
   * Compose the rendered `STATUS.USER` body. Production binds the shipped
   * renderer (`runStatusUserView` in local-only mode); kept a seam so the
   * side-effect owns only the write, not the status subsystem's git surface.
   */
  composeView: () => Promise<string>;
  /** Create the identity workspace directory if absent. */
  mkdir: MkdirFn;
  /** Write `STATUS.USER.md`. */
  writeFile: WriteFileFn;
}

/** Parameters for {@link reconcileStatusUser}. */
export interface ReconcileStatusUserParams {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Resolved identity; `null` skips (the view is identity-scoped). */
  identity: string | null;
}

/** Outcome of a {@link reconcileStatusUser} call. */
export interface ReconcileStatusUserResult {
  /** Whether `STATUS.USER.md` was written. */
  written: boolean;
  /** The written path, or `null` when skipped. */
  path: string | null;
}

/**
 * Regenerate `STATUS.USER.md` for the current developer after a transition.
 *
 * Skips entirely when no identity is resolved. Otherwise composes the view
 * (through the injected renderer), ensures the identity workspace directory, and
 * writes the body with a single trailing newline.
 *
 * @param ctx - Injected composer + filesystem seams.
 * @param params - Repository root and resolved identity.
 * @returns Whether the file was written, and its path.
 */
export async function reconcileStatusUser(
  ctx: ReconcileStatusUserContext,
  params: ReconcileStatusUserParams,
): Promise<ReconcileStatusUserResult> {
  if (params.identity === null) return { written: false, path: null };

  const dir = join(params.cwd, ".arc", "user", params.identity);
  const path = join(dir, "STATUS.USER.md");
  const view = await ctx.composeView();
  const body = view.endsWith("\n") ? view : `${view}\n`;

  await ensureDir(dir, ctx.mkdir);
  await ctx.writeFile(path, body);
  return { written: true, path };
}

/** Parameters for {@link reconcileStatusUserSideEffect} — the reconcile params plus the move being reported. */
export interface ReconcileStatusUserSideEffectParams extends ReconcileStatusUserParams {
  /** The work unit's slug. */
  slug: string;
  /** Source position, or `null` for a creation edge. */
  from: LifecyclePosition | null;
  /** Target position, or `null` for a deletion edge. */
  to: LifecyclePosition | null;
}

/**
 * Fire the real `STATUS.USER` reconcile as a transition side-effect, degrading to
 * an advisory instead of throwing when the render or write fails. A readiness-view
 * regen must never fail the transition that triggered it — the view is recoverable
 * on demand via `arc status --user`, so a failed regen surfaces as an advisory the
 * executor reports, not an `encoding-failed` outcome.
 *
 * @param ctx - Injected composer + filesystem seams (same as {@link reconcileStatusUser}).
 * @param params - Repository root, identity, and the slug / from / to for the degrade advisory.
 * @returns `undefined` on a successful (or identity-skipped) write; an advisory string on degrade.
 */
export async function reconcileStatusUserSideEffect(
  ctx: ReconcileStatusUserContext,
  params: ReconcileStatusUserSideEffectParams,
): Promise<string | undefined> {
  try {
    await reconcileStatusUser(ctx, { cwd: params.cwd, identity: params.identity });
    return undefined;
  } catch {
    const move = `${positionLabel(params.from)} → ${positionLabel(params.to)}`;
    return (
      `STATUS.USER regen failed: \`${params.slug}\` ${move}` +
      " — run `arc status --user` to refresh."
    );
  }
}

/** Parameters for {@link reconcileRoadmap}. */
export interface ReconcileRoadmapParams {
  /** The work unit's slug. */
  slug: string;
  /** Source position, or `null` for a creation edge. */
  from: LifecyclePosition | null;
  /** Target position, or `null` for a deletion edge. */
  to: LifecyclePosition | null;
}

/** Render a position as `phase/location`, or `nonexistent` for an absent endpoint. */
function positionLabel(position: LifecyclePosition | null): string {
  return position === null ? "nonexistent" : `${position.phase}/${position.location}`;
}

/**
 * Emit the interim ROADMAP-regen advisory for a transition — a precise,
 * actionable line naming the work unit and its `from → to` move, flagging that
 * the readiness view needs a hand-render until `roadmap-tooling` ships the
 * renderer. It commits to no ROADMAP format, bucket, or derived-state label
 * (those are downstream); the executor surfaces the returned string.
 *
 * @param params - Slug and the from / to positions.
 * @returns The advisory line.
 */
export function reconcileRoadmap(params: ReconcileRoadmapParams): string {
  const move = `${positionLabel(params.from)} → ${positionLabel(params.to)}`;
  return `ROADMAP regen pending (no renderer yet): \`${params.slug}\` ${move} — hand-render the readiness view.`;
}
