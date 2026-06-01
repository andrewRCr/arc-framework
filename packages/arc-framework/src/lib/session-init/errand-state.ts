/**
 * Errand-state composer for session-init.
 *
 * This is the I/O boundary around the pure errand helpers: it detects a
 * resumable current `chore/` branch, optionally enumerates discoverable local
 * and remote errand branches, classifies their state, and selects remote-only
 * branches that can be materialized for cross-machine resume.
 *
 * @module
 */

import type { WorktreeRosterResult } from "../git/worktree-roster.js";
import type { GitExec } from "../git/exec.js";
import { isBranchMerged } from "../git/worktree-cleanup.js";

import { detectErrandResume, type ErrandResumeResult } from "./errand-resume-detection.js";
import { errandSlugOf } from "./errand-branch.js";
import {
  classifyInFlightErrands,
  type InFlightErrandSweepResult,
} from "./in-flight-errand-sweep.js";
import {
  findMaterializableErrands,
  type MaterializableErrandsResult,
} from "./materializable-errands.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Marker state for the rate-limited reminder / stale-errand nudge. */
export interface ErrandNudgeState {
  /** Whether a batched nudge may surface today. */
  shouldNudge: boolean;
  /** Repo-relative marker path the workflow updates after surfacing the nudge. */
  markerPath: string | null;
  /** Today's calendar day (`YYYY-MM-DD`). */
  today: string;
}

/** Composite errand state exposed by the session-init envelope. */
export interface ErrandStateResult {
  /** Current-branch resume signal — cheap and always computed. */
  resume: ErrandResumeResult;
  /** Orient-only advisory over local/remote `chore/` branches. */
  inFlight: InFlightErrandSweepResult;
  /** Remote-only `chore/` branches that can be materialized locally. */
  materializable: MaterializableErrandsResult;
  /** Rate-limit state shared by reminder and stale-errand surfaces. */
  nudge: ErrandNudgeState;
  /** Soft diagnostics; discovery failures should not block session-init. */
  warnings: string[];
}

export interface RunErrandStateOptions {
  exec: GitExec;
  currentBranch: string | null;
  hasBackingMeta: boolean;
  /** Discovery is an Orient-arm concern; false leaves in-flight/materialize empty. */
  includeDiscovery: boolean;
  /** Resolved worktree roster; required for safe discovery, optional for resume. */
  roster: WorktreeRosterResult | null;
  /** Integration base branch short-name, e.g. `main`. */
  baseBranch: string;
  /** Whole-day threshold for classifying in-progress branches as stale. */
  staleThresholdDays: number;
  /** Pre-computed nudge rate-limit state. */
  nudge: ErrandNudgeState;
  /** ISO-8601 reference time for deterministic age calculations. */
  now?: string;
  /** Forge adapter for open-PR detection. Defaults to a best-effort GitHub CLI probe. */
  detectOpenPr?: (branch: string) => Promise<boolean>;
}

interface BranchRefFacts {
  branch: string;
  hasLocalRef: boolean;
  hasRemoteRef: boolean;
  /** Ref used for merge checks (`branch` for local refs, `origin/branch` for remote-only). */
  mergeRef: string;
  /** Unix timestamp for the ref tip, when available. */
  timestamp: number | null;
}

/**
 * Compose the session-init errand state.
 *
 * @param options - Git adapter, current branch context, roster, config, and nudge state.
 * @returns Composite errand state for the session-init envelope.
 */
export async function runErrandState(options: RunErrandStateOptions): Promise<ErrandStateResult> {
  const resume = detectErrandResume({
    currentBranch: options.currentBranch,
    hasBackingMeta: options.hasBackingMeta,
  });

  if (!options.includeDiscovery) {
    return emptyDiscovery(resume, options.nudge, []);
  }
  if (options.roster === null) {
    return emptyDiscovery(
      resume,
      options.nudge,
      ["Errand discovery skipped because the worktree roster was unavailable."],
    );
  }

  const refRead = await readBranchRefs(options.exec);
  const warnings = [...options.roster.warnings, ...refRead.warnings];
  const factsByBranch = new Map(refRead.branches.map((branch) => [branch.branch, branch]));
  for (const entry of options.roster.entries) {
    if (!factsByBranch.has(entry.branch)) {
      factsByBranch.set(entry.branch, {
        branch: entry.branch,
        hasLocalRef: true,
        hasRemoteRef: false,
        mergeRef: entry.branch,
        timestamp: null,
      });
    }
  }

  const metaBacked = new Set(
    options.roster.entries
      .filter((entry) => entry.metaFilePath !== undefined)
      .map((entry) => entry.branch),
  );
  if (options.hasBackingMeta && options.currentBranch !== null) {
    metaBacked.add(options.currentBranch);
  }
  const localWorktrees = new Set(options.roster.entries.map((entry) => entry.branch));
  const detectOpenPr = options.detectOpenPr ?? ((branch) => detectOpenPrWithGh(options.exec, branch));

  const errandFacts = [...factsByBranch.values()].filter((facts) => errandSlugOf(facts.branch) !== null);
  const mergedByBranch = new Map<string, boolean>();
  const openPrByBranch = new Map<string, boolean>();
  for (const facts of errandFacts) {
    const [merged, hasOpenPr] = await Promise.all([
      isBranchMerged({
        exec: options.exec,
        branch: facts.mergeRef,
        target: `origin/${options.baseBranch}`,
      }),
      detectOpenPr(facts.branch),
    ]);
    mergedByBranch.set(facts.branch, merged);
    openPrByBranch.set(facts.branch, hasOpenPr);
  }

  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const inFlight = classifyInFlightErrands({
    staleThresholdDays: options.staleThresholdDays,
    branches: errandFacts.map((facts) => ({
      branch: facts.branch,
      hasMeta: metaBacked.has(facts.branch),
      hasOpenPr: openPrByBranch.get(facts.branch) ?? false,
      merged: mergedByBranch.get(facts.branch) ?? false,
      ageDays: ageDays(facts.timestamp, nowMs),
    })),
  });

  const materializable = findMaterializableErrands({
    branches: errandFacts
      .filter(
        (facts) =>
          facts.hasRemoteRef &&
          !facts.hasLocalRef &&
          !(mergedByBranch.get(facts.branch) ?? false) &&
          !(openPrByBranch.get(facts.branch) ?? false),
      )
      .map((facts) => ({
        branch: facts.branch,
        hasLocalWorktree: localWorktrees.has(facts.branch),
        hasMeta: metaBacked.has(facts.branch),
      })),
  });

  return { resume, inFlight, materializable, nudge: options.nudge, warnings };
}

function emptyDiscovery(
  resume: ErrandResumeResult,
  nudge: ErrandNudgeState,
  warnings: string[],
): ErrandStateResult {
  return {
    resume,
    inFlight: { errands: [] },
    materializable: { candidates: [] },
    nudge,
    warnings,
  };
}

function ageDays(timestamp: number | null, nowMs: number): number {
  if (timestamp === null || Number.isNaN(nowMs)) return 0;
  return Math.max(0, Math.floor((nowMs - timestamp * 1000) / MS_PER_DAY));
}

async function readBranchRefs(exec: GitExec): Promise<{ branches: BranchRefFacts[]; warnings: string[] }> {
  let stdout: string;
  try {
    ({ stdout } = await exec("git", [
      "for-each-ref",
      "--format=%(refname)\t%(committerdate:unix)",
      "refs/heads",
      "refs/remotes/origin",
    ]));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { branches: [], warnings: [`Errand branch enumeration failed: ${message}`] };
  }

  const byBranch = new Map<string, BranchRefFacts>();
  for (const line of stdout.split("\n")) {
    const parsed = parseRefLine(line);
    if (parsed === null) continue;
    const existing = byBranch.get(parsed.branch);
    if (existing === undefined) {
      byBranch.set(parsed.branch, parsed);
      continue;
    }
    byBranch.set(parsed.branch, mergeRefFacts(existing, parsed));
  }
  return { branches: [...byBranch.values()], warnings: [] };
}

function parseRefLine(line: string): BranchRefFacts | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  const [refName, timestampRaw] = trimmed.split("\t");
  if (refName === undefined || timestampRaw === undefined) return null;
  const timestamp = Number.parseInt(timestampRaw, 10);
  const normalizedTimestamp = Number.isNaN(timestamp) ? null : timestamp;

  if (refName.startsWith("refs/heads/")) {
    const branch = refName.slice("refs/heads/".length);
    if (branch === "") return null;
    return {
      branch,
      hasLocalRef: true,
      hasRemoteRef: false,
      mergeRef: branch,
      timestamp: normalizedTimestamp,
    };
  }
  if (refName.startsWith("refs/remotes/origin/")) {
    const branch = refName.slice("refs/remotes/origin/".length);
    if (branch === "" || branch === "HEAD") return null;
    return {
      branch,
      hasLocalRef: false,
      hasRemoteRef: true,
      mergeRef: `origin/${branch}`,
      timestamp: normalizedTimestamp,
    };
  }
  return null;
}

function mergeRefFacts(left: BranchRefFacts, right: BranchRefFacts): BranchRefFacts {
  const hasLocalRef = left.hasLocalRef || right.hasLocalRef;
  const hasRemoteRef = left.hasRemoteRef || right.hasRemoteRef;
  const timestamp = hasLocalRef
    ? (left.hasLocalRef ? left.timestamp : right.timestamp)
    : maxTimestamp(left.timestamp, right.timestamp);
  return {
    branch: left.branch,
    hasLocalRef,
    hasRemoteRef,
    mergeRef: hasLocalRef ? left.branch : `origin/${left.branch}`,
    timestamp,
  };
}

function maxTimestamp(left: number | null, right: number | null): number | null {
  if (left === null) return right;
  if (right === null) return left;
  return Math.max(left, right);
}

async function detectOpenPrWithGh(exec: GitExec, branch: string): Promise<boolean> {
  try {
    const { stdout } = await exec("gh", [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "open",
      "--json",
      "number",
      "--limit",
      "1",
    ]);
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}
