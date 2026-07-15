/**
 * Shared renderer for the tracked project readiness file.
 *
 * This is the local-ref counterpart to the live `arc status --project` path:
 * lifecycle ceremonies regenerate the tracked ROADMAP from the tree plus local
 * refs so the commit captures a reproducible project-status snapshot.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import { buildLifecycleIndex, type LifecycleIndexFs } from "../work-unit/lifecycle-index.js";
import { listParkedSlugs } from "../work-unit/lifecycle-resolver.js";

import {
  composeProjectReadinessViewResult,
  resolveProjectReadinessRenderStamp,
  resolveProjectReadinessViewInput,
  type ProjectReadinessViewResult,
} from "./project-view.js";

/** Inputs for rendering the tracked project readiness view. */
export interface RenderTrackedProjectReadinessViewOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Git executor used for local-ref derivation and the render stamp. */
  exec: GitExec;
  /** Filesystem seam for tree-backed records and lifecycle classification. */
  fs: LifecycleIndexFs;
  /** Resolved base branch for the in-flight oracle. */
  baseBranch?: string;
  /** Checked-out branch whose transition-mutated tree record is prospective truth. */
  currentBranch?: string | null;
}

/** Render the tracked ROADMAP view and its separate advisories from tree files plus local refs. */
export async function renderTrackedProjectReadinessViewResult(
  options: RenderTrackedProjectReadinessViewOptions,
): Promise<ProjectReadinessViewResult> {
  const parkedSlugs = listParkedSlugs(await buildLifecycleIndex({ cwd: options.cwd, fs: options.fs }));
  const input = await resolveProjectReadinessViewInput({
    cwd: options.cwd,
    fs: options.fs,
    localRefs: {
      exec: options.exec,
      ...(options.baseBranch !== undefined ? { baseBranch: options.baseBranch } : {}),
      parkedSlugs,
    },
    ...(options.currentBranch === undefined || options.currentBranch === null
      ? {}
      : { prospective: { currentBranch: options.currentBranch } }),
  });
  return composeProjectReadinessViewResult({
    ...input,
    renderedRef: await resolveProjectReadinessRenderStamp({
      exec: options.exec,
      cwd: options.cwd,
      scope: "tree + local refs",
      liveView: "arc status --project",
    }),
  });
}

/** Render only the tracked ROADMAP body from tree files plus local refs. */
export async function renderTrackedProjectReadinessView(
  options: RenderTrackedProjectReadinessViewOptions,
): Promise<string> {
  return (await renderTrackedProjectReadinessViewResult(options)).markdown;
}
