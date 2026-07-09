/**
 * Foreign-write advisory backstop — pre-commit hook entry point.
 *
 * Given a list of staged file paths, surfaces any that another in-flight work
 * unit also touches — a foreign-owned write about to land on the wrong branch.
 * It reuses {@link detectForeignArtifactOverlap} (the same primitive behind the
 * `arc errand` advisory gate) over the locally-derived in-flight set, so the
 * hook stays fast and offline: no network read at commit time.
 *
 * Two narrowings keep the signal clean. The candidate set is filtered to the
 * **work-unit** path surface — a per-WU movable artifact, the single-owner
 * surface the foreign-write reasoning keys on; cohort docs (the deliberate
 * multi-owner exception) and code fall to the behind-base net, not this gate.
 * The current WU's roster name self-excludes first, with worktree/meta paths as
 * the fallback, so its own artifacts never trip the advisory — including a
 * remote-only stale planning ref during activation.
 *
 * **Advisory throughout.** It warns and always exits 0 — it never refuses a
 * commit, and any failure (degraded git state, missing config) fails open with
 * no output rather than blocking.
 *
 * @module
 */

import { fileURLToPath } from "node:url";

import { runActiveInFlight } from "../commands/active.js";
import { readConfigSettings } from "../lib/config/status-reader.js";
import {
  classifyPathSurface,
  detectForeignArtifactOverlap,
  projectInFlightToOverlapRoster,
  resolveIdentity,
  type ForeignArtifactDetectionResult,
  type ForeignArtifactOverlap,
  type InFlightInputSnapshot,
  type OverlapRoster,
} from "../lib/git/index.js";
import { gitExec } from "../lib/io-context.js";
import { resolveActiveWu } from "../lib/release/wu-resolution.js";

import type { GitExec } from "../lib/git/exec.js";

/**
 * Narrow a staged-path list to the foreign-write candidate set: the `work-unit`
 * path surface (per-WU movable artifacts). Cohort docs and code are excluded —
 * the single-owner gate is ill-defined for them.
 */
export function selectForeignWriteCandidates(paths: string[]): string[] {
  return paths.filter((path) => classifyPathSurface(path) === "work-unit");
}

/** Inputs for {@link detectStagedForeignWrites}. */
export interface StagedForeignWriteOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Identity-filtered in-flight roster (local derivation, projected by the caller). */
  roster: OverlapRoster;
  /** Staged repo-relative paths; narrowed to the work-unit surface internally. */
  paths: string[];
  /** Base branch to diff against — resolved from `branch.base`, never hardcoded. */
  baseBranch: string;
  /** Agreed in-flight input snapshot; candidate ref SHAs are reused from it when present. */
  snapshot?: InFlightInputSnapshot;
  /** The committing worktree's root — self-excluded so its own writes never trip. */
  originatingWorktreePath: string;
  /** The committing WU's meta path — self-excludes remote-only projections of the same WU. */
  originatingMetaPath?: string;
}

/**
 * Detect staged work-unit-surface paths that a foreign in-flight WU also touches.
 * A thin orchestration over {@link detectForeignArtifactOverlap}: narrows the
 * candidates to the work-unit surface, then defers to the shared primitive.
 *
 * @param options - Roster, staged paths, base branch, and the originating worktree.
 * @returns The foreign overlaps; empty when none touch a staged work-unit artifact.
 */
export async function detectStagedForeignWrites(
  options: StagedForeignWriteOptions,
): Promise<ForeignArtifactDetectionResult> {
  const { exec, roster, paths, baseBranch, snapshot, originatingWorktreePath, originatingMetaPath } = options;
  const candidates = selectForeignWriteCandidates(paths);
  if (candidates.length === 0) return { overlaps: [] };
  return detectForeignArtifactOverlap({
    exec,
    roster,
    targetPaths: candidates,
    baseBranch,
    ...(snapshot !== undefined ? { snapshot } : {}),
    originatingWorktreePath,
    ...(originatingMetaPath !== undefined ? { originatingMetaPath } : {}),
  });
}

/**
 * Word the overlaps as advisory warning lines (one per foreign WU). Empty input
 * yields no lines — the hook stays silent on a clean self-write.
 */
export function formatForeignWriteWarnings(overlaps: ForeignArtifactOverlap[]): string[] {
  return overlaps.map(
    (o) => `${o.branch} also touches ${o.matchedPaths.join(", ")} (${o.worktreePath ?? "remote-only"})`,
  );
}

/** Resolve the committing WU's active meta path for remote-only self-exclusion. */
export async function resolveOriginatingMetaPath(cwd: string): Promise<string | undefined> {
  const activeWu = await resolveActiveWu({ cwd });
  return activeWu.status === "resolved" ? activeWu.path : undefined;
}

// --- CLI entry ---

/** The committing worktree's root, in `git worktree list` path form (for self-exclusion). */
async function currentWorktreePath(exec: GitExec, fallback: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--show-toplevel"]);
    const top = stdout.trim();
    return top === "" ? fallback : top;
  } catch {
    return fallback;
  }
}

/**
 * Run the backstop over the staged paths in argv and print advisory warnings to
 * stdout. Always exits 0 — advisory, and fail-open: any error resolves to a
 * silent clean pass rather than blocking the commit.
 */
async function main(): Promise<void> {
  const paths = process.argv.slice(2);
  if (paths.length === 0) return;
  if (selectForeignWriteCandidates(paths).length === 0) return;

  const cwd = process.cwd();
  const { settings } = await readConfigSettings(cwd);
  const baseBranch = settings["branch.base"];
  if (!baseBranch) return;

  const identity = await resolveIdentity({ exec: gitExec });
  const teamMode = settings["team.mode"] === "true";

  // Local-only: derive the in-flight set from local refs — no network read at commit time.
  const { entries, snapshot } = await runActiveInFlight({ exec: gitExec, identity, teamMode, localOnly: true });

  const { overlaps } = await detectStagedForeignWrites({
    exec: gitExec,
    roster: projectInFlightToOverlapRoster(entries),
    paths,
    baseBranch,
    originatingWorktreePath: await currentWorktreePath(gitExec, cwd),
    snapshot,
    originatingMetaPath: await resolveOriginatingMetaPath(cwd),
  });

  for (const line of formatForeignWriteWarnings(overlaps)) {
    process.stdout.write(`${line}\n`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch(() => {
      // Advisory backstop — never block a commit on a detection failure.
    })
    .finally(() => process.exit(0));
}
