/**
 * ROADMAP-only merge-conflict auto-remedy.
 *
 * When a merge-like operation leaves `.arc/backlog/ROADMAP.md` as the only
 * conflicted path (or the only path still carrying conflict markers),
 * regeneration is always the correct resolution — the file is a derived
 * projection. This module assesses eligibility and applies regenerate-and-restage
 * using the existing staged-index renderer (no second projection engine).
 *
 * Wider conflicts (any non-ROADMAP unmerged path or marker-bearing path) stay
 * hard errors for the normal pre-commit checks. The scoped merge driver
 * surfaces this same remedy at conflict time; this module remains the single
 * regenerate-and-restage implementation.
 *
 * @module
 */

import {
  captureGitIndexState,
  type GitExec,
  type GitIndexTransaction,
} from "../git/exec.js";
import { readConfigSettings } from "../config/status-reader.js";
import { materializeArcPath } from "../layout/index.js";
import type { GitMergeTransitionOverlayResult } from "../work-unit/git-merge-transition-overlay.js";
import { transitionOverlayCompositionInput } from "../work-unit/transition-overlay.js";

import {
  ROADMAP_PATH,
  renderRoadmapFromIndexResult,
  type RenderRoadmapFromIndexOptions,
} from "./roadmap-regeneration-assert.js";

/** Git state heads that mark an in-progress merge-like operation. */
const MERGE_LIKE_HEADS = [
  "MERGE_HEAD",
  "REBASE_HEAD",
  "CHERRY_PICK_HEAD",
  "REVERT_HEAD",
] as const;

/** Conflict-marker line pattern (standard 7-character markers). */
const CONFLICT_MARKER_RE = /^(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7}(?: .*)?)$/mu;
const GIT_OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const UNMERGED_ENTRY =
  /^([0-7]{6}) ([0-9a-f]{40}|[0-9a-f]{64}) ([123])\t([\s\S]+)$/u;

/** Why an auto-remedy attempt was declined. */
export type RoadmapConflictAutoRemedySkipReason =
  | "not-merge-like"
  | "wider-conflict"
  | "roadmap-not-involved"
  | "already-clean";

/** Why an eligible auto-remedy was triggered. */
export type RoadmapConflictAutoRemedyTrigger =
  | "unmerged-only-roadmap"
  | "markers-only-roadmap"
  | "merge-staged-roadmap";

/** Eligibility verdict for regenerating ROADMAP during a merge-like conflict. */
export type RoadmapConflictAutoRemedyEligibility =
  | { eligible: true; trigger: RoadmapConflictAutoRemedyTrigger }
  | { eligible: false; reason: RoadmapConflictAutoRemedySkipReason };

/** Snapshot of git conflict state the assessor consumes (pure, no I/O). */
export interface RoadmapConflictAutoRemedyAssessmentInput {
  /** Whether a merge-like head is present (`MERGE_HEAD`, rebase, cherry-pick, revert). */
  mergeLike: boolean;
  /** Paths with unmerged index stages (`git diff --name-only --diff-filter=U`). */
  unmergedPaths: readonly string[];
  /** Staged paths whose blob content still contains conflict markers. */
  stagedMarkerPaths: readonly string[];
  /** Whether ROADMAP is currently staged (ACMR). */
  roadmapStaged: boolean;
}

/** Outcome of an apply attempt. */
export type RoadmapConflictAutoRemedyResult =
  | { status: "skipped"; reason: RoadmapConflictAutoRemedySkipReason }
  | { status: "applied"; trigger: RoadmapConflictAutoRemedyTrigger; indeterminate: boolean }
  | { status: "failed"; message: string };

/** Injected I/O seams for {@link applyRoadmapConflictAutoRemedy}. */
export interface RoadmapConflictAutoRemedyDeps {
  /** Repository root. */
  cwd: string;
  /** Git executor (stdout must preserve bytes for blob reads). */
  exec: GitExec;
  /** Write the regenerated ROADMAP into the worktree. */
  writeFile: (path: string, content: string) => Promise<void>;
  /** Optional fixed base branch; omitted reads arc-config.yml. */
  baseBranch?: string;
  /** Optional fixed render stamp for tests. */
  renderedRef?: RenderRoadmapFromIndexOptions["renderedRef"];
  /** Optional index transaction seam; production captures the repository index. */
  captureIndexState?: () => Promise<GitIndexTransaction>;
  /** Resolve finalized transition authority from one configured-base merge snapshot. */
  resolveTransitionOverlay(
    configuredBaseRef: string,
    exec: GitExec,
  ): Promise<GitMergeTransitionOverlayResult>;
}

/**
 * Pure eligibility check: regenerate only when ROADMAP is the sole conflicted
 * surface under a merge-like operation (or the sole marker-bearing staged path).
 *
 * @param input - Conflict snapshot from git.
 * @returns Eligible with trigger, or a skip reason.
 */
export function assessRoadmapConflictAutoRemedy(
  input: RoadmapConflictAutoRemedyAssessmentInput,
): RoadmapConflictAutoRemedyEligibility {
  const unmerged = uniqueSorted(input.unmergedPaths);
  const markers = uniqueSorted(input.stagedMarkerPaths);

  const widerUnmerged = unmerged.filter((path) => path !== ROADMAP_PATH);
  const widerMarkers = markers.filter((path) => path !== ROADMAP_PATH);
  if (widerUnmerged.length > 0 || widerMarkers.length > 0) {
    return { eligible: false, reason: "wider-conflict" };
  }

  const roadmapUnmerged = unmerged.includes(ROADMAP_PATH);
  const roadmapMarkers = markers.includes(ROADMAP_PATH);

  // Marker-only-on-ROADMAP is itself sufficient — regeneration is always correct
  // for this derived file, even if MERGE_HEAD was already cleared.
  if (roadmapMarkers) {
    return { eligible: true, trigger: "markers-only-roadmap" };
  }

  if (roadmapUnmerged) {
    // Unmerged ROADMAP-only: eligible even when pre-commit may not run yet
    // (shared entry point for manual/scripted invocation and future merge-driver).
    return { eligible: true, trigger: "unmerged-only-roadmap" };
  }

  if (!input.mergeLike) {
    return { eligible: false, reason: "not-merge-like" };
  }

  if (!input.roadmapStaged) {
    return { eligible: false, reason: "roadmap-not-involved" };
  }

  // Merge-like with ROADMAP staged and no remaining non-ROADMAP conflicts —
  // covers --ours/--theirs of a stamp-only conflict without leaving markers.
  return { eligible: true, trigger: "merge-staged-roadmap" };
}

/**
 * When eligible, regenerate ROADMAP from the staged-index projection and restage.
 * Idempotent when the staged blob already matches the fresh render.
 *
 * @param deps - Repo root, git executor, and write seam.
 * @param assessment - Optional precomputed eligibility; when omitted, state is probed.
 * @returns Applied / skipped / failed outcome.
 */
export async function applyRoadmapConflictAutoRemedy(
  deps: RoadmapConflictAutoRemedyDeps,
  assessment?: RoadmapConflictAutoRemedyEligibility,
): Promise<RoadmapConflictAutoRemedyResult> {
  const eligibility = assessment ?? await probeEligibility(deps);
  if (!eligibility.eligible) {
    return { status: "skipped", reason: eligibility.reason };
  }

  let indexTransaction: GitIndexTransaction | undefined;
  try {
    const baseBranch = deps.baseBranch ?? await readBaseBranch(deps.cwd);
    const baseRef = configuredBaseRef(baseBranch);
    let exec = deps.exec;
    if (eligibility.trigger === "unmerged-only-roadmap") {
      indexTransaction = deps.captureIndexState === undefined
        ? await captureGitIndexState(deps.exec, deps.cwd)
        : await deps.captureIndexState();
      exec = againstIndex(deps.exec, indexTransaction.indexFile);
      await stageCandidateRoadmap({ ...deps, exec }, baseRef);
    }
    const transition = await deps.resolveTransitionOverlay(baseRef, exec);
    const transitionOverlay = transitionOverlayForRoadmap(transition);
    const rendered = await renderRoadmapFromIndexResult({
      cwd: deps.cwd,
      exec,
      baseBranch,
      ...(deps.renderedRef !== undefined ? { renderedRef: deps.renderedRef } : {}),
      ...(transitionOverlay === undefined ? {} : { transitionOverlay }),
    });

    const absolutePath = materializeArcPath(deps.cwd, ROADMAP_PATH);
    await deps.writeFile(absolutePath, rendered.content);
    await exec("git", ["add", "--", ROADMAP_PATH], { cwd: deps.cwd });
    await indexTransaction?.commit();

    return {
      status: "applied",
      trigger: eligibility.trigger,
      indeterminate: rendered.indeterminate,
    };
  } catch (err) {
    try {
      await indexTransaction?.rollback();
    } catch (rollbackError) {
      return {
        status: "failed",
        message: [
          err instanceof Error ? err.message : String(err),
          "The alternate Git index could not be discarded:",
          rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        ].join(" "),
      };
    }
    return {
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stageCandidateRoadmap(
  deps: RoadmapConflictAutoRemedyDeps,
  baseRef: string,
): Promise<void> {
  const [{ stdout: head }, { stdout: base }, { stdout: unmerged }] = await Promise.all([
    deps.exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: deps.cwd }),
    deps.exec("git", ["rev-parse", "--verify", `${baseRef}^{commit}`], { cwd: deps.cwd }),
    deps.exec("git", ["ls-files", "--unmerged", "-z", "--", ROADMAP_PATH], { cwd: deps.cwd }),
  ]);
  const headOid = head.trim();
  const baseOid = base.trim();
  if (!GIT_OBJECT_ID.test(headOid) || !GIT_OBJECT_ID.test(baseOid)) {
    throw new Error("Git returned an invalid merge parent while resolving ROADMAP");
  }
  const candidateStage = headOid === baseOid ? "3" : "2";
  const entries = unmerged.split("\0").filter(Boolean).flatMap((record) => {
    const match = UNMERGED_ENTRY.exec(record);
    return match?.[1] === undefined
      || match[2] === undefined
      || match[3] === undefined
      || match[4] !== ROADMAP_PATH
      ? []
      : [{ mode: match[1], oid: match[2], stage: match[3] }];
  });
  const candidate = entries.find(({ stage }) => stage === candidateStage);
  if (candidate === undefined) {
    throw new Error("ROADMAP conflict does not expose the candidate-side merge stage");
  }
  await deps.exec(
    "git",
    ["update-index", "--add", "--cacheinfo", `${candidate.mode},${candidate.oid},${ROADMAP_PATH}`],
    { cwd: deps.cwd },
  );
}

function againstIndex(exec: GitExec, indexFile: string): GitExec {
  return async (cmd, args, options) =>
    await exec(cmd, args, { ...options, indexFile });
}

function configuredBaseRef(baseBranch: string): string {
  return baseBranch.startsWith("refs/") ? baseBranch : `refs/heads/${baseBranch}`;
}

function transitionOverlayForRoadmap(
  result: GitMergeTransitionOverlayResult,
): RenderRoadmapFromIndexOptions["transitionOverlay"] | undefined {
  switch (result.status) {
    case "selected":
      return transitionOverlayCompositionInput(result.overlay);
    case "absent":
      return undefined;
    case "ambiguous":
      throw new Error("Merge transition authority is ambiguous");
    case "stale":
      throw new Error(`Merge transition authority is stale: ${result.reason}`);
    case "refused":
      throw new Error(`Merge transition authority was refused: ${result.reason}`);
  }
}

/**
 * Probe live git state into an assessment input, then assess eligibility.
 *
 * @param deps - Repo root and git executor.
 * @returns Eligibility verdict.
 */
export async function probeEligibility(
  deps: Pick<RoadmapConflictAutoRemedyDeps, "cwd" | "exec">,
): Promise<RoadmapConflictAutoRemedyEligibility> {
  const input = await collectAssessmentInput(deps);
  return assessRoadmapConflictAutoRemedy(input);
}

/**
 * Collect the conflict snapshot the pure assessor needs.
 *
 * @param deps - Repo root and git executor.
 * @returns Assessment input.
 */
export async function collectAssessmentInput(
  deps: Pick<RoadmapConflictAutoRemedyDeps, "cwd" | "exec">,
): Promise<RoadmapConflictAutoRemedyAssessmentInput> {
  const [mergeLike, unmergedPaths, stagedPaths] = await Promise.all([
    isMergeLike(deps.exec, deps.cwd),
    listUnmergedPaths(deps.exec, deps.cwd),
    listStagedPaths(deps.exec, deps.cwd),
  ]);

  const stagedMarkerPaths: string[] = [];
  for (const path of stagedPaths) {
    if (await stagedPathHasConflictMarkers(deps.exec, deps.cwd, path)) {
      stagedMarkerPaths.push(path);
    }
  }

  return {
    mergeLike,
    unmergedPaths,
    stagedMarkerPaths,
    roadmapStaged: stagedPaths.includes(ROADMAP_PATH),
  };
}

/**
 * Human-readable one-line summary for hook stdout.
 *
 * @param result - Apply outcome.
 * @returns Message to print, or empty when silent skip.
 */
export function formatRoadmapConflictAutoRemedyMessage(
  result: RoadmapConflictAutoRemedyResult,
): string {
  switch (result.status) {
    case "skipped":
      return "";
    case "applied": {
      const note = result.indeterminate
        ? " (render observed changing in-flight inputs — re-check if refs settle)"
        : "";
      return `Auto-remedied ROADMAP-only conflict: regenerated and restaged ${ROADMAP_PATH}${note}`;
    }
    case "failed":
      return `ROADMAP conflict auto-remedy failed: ${result.message}`;
  }
}

async function isMergeLike(exec: GitExec, cwd: string): Promise<boolean> {
  // `git rev-parse --verify --quiet <head>` exits 0 iff the in-progress head
  // exists; GitExec surfaces a missing ref as a thrown error.
  for (const head of MERGE_LIKE_HEADS) {
    try {
      await exec("git", ["rev-parse", "--verify", "--quiet", head], { cwd });
      return true;
    } catch {
      // ref missing — try next
    }
  }
  return false;
}

async function listUnmergedPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    { cwd },
  );
  return splitPaths(stdout);
}

async function listStagedPaths(exec: GitExec, cwd: string): Promise<string[]> {
  const { stdout } = await exec(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd },
  );
  return splitPaths(stdout);
}

async function stagedPathHasConflictMarkers(
  exec: GitExec,
  cwd: string,
  path: string,
): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["show", `:${path}`], { cwd });
    return CONFLICT_MARKER_RE.test(stdout);
  } catch {
    return false;
  }
}

async function readBaseBranch(cwd: string): Promise<string> {
  return (await readConfigSettings(cwd)).settings["branch.base"];
}

function splitPaths(stdout: string): string[] {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function uniqueSorted(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}
