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
import { listErrandRecordsResult, type ListErrandRecordsResult } from "../errand/record.js";
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

  // Errand records feed the local-ref oracle so recorded `chore/`/`fix/` errand
  // branches are not mis-emitted as `no-record-or-meta` residue advisories —
  // resolved here, not per caller, so every tracked-ROADMAP regen (stub, start,
  // lifecycle ceremonies) inherits the read. No identity ⇒ no errand-record ref
  // to read; empty+complete is authoritative (not degraded). A failed identity
  // read is NOT authoritative: it degrades completeness so record-less branches
  // soften to `classification-unavailable` instead of asserting residue.
  let identity: string | undefined;
  let identityReadFailed = false;
  try {
    const { stdout } = await options.exec("git", ["config", "--get", "arc.identity"]);
    identity = stdout.trim();
  } catch (err) {
    // `git config --get` exits 1 for an unset key — authoritative absence.
    // Any other failure (usage error, spawn failure) is a degraded read.
    if ((err as { code?: number | string }).code === 1) {
      identity = undefined;
    } else {
      identityReadFailed = true;
    }
  }
  const recordResult: ListErrandRecordsResult = identityReadFailed
    ? { records: [], complete: false, warnings: ["arc.identity read failed; errand records unavailable"] }
    : identity === undefined || identity === ""
      ? { records: [], complete: true, warnings: [] }
      : await listErrandRecordsResult({ exec: options.exec, identity });
  const errandSlugByBranch = new Map(
    recordResult.records.map((record) => [record.branch, record.slug]),
  );

  const input = await resolveProjectReadinessViewInput({
    cwd: options.cwd,
    fs: options.fs,
    localRefs: {
      exec: options.exec,
      ...(options.baseBranch !== undefined ? { baseBranch: options.baseBranch } : {}),
      parkedSlugs,
      errandSlugByBranch,
      errandRecordsComplete: recordResult.complete,
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
