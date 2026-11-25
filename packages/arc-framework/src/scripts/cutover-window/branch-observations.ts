/** Observe branch sides and acquire the object evidence needed to retain post-import marks. */
import type { WindowHoldIO, WindowRecord } from "./hold.js";
import { readWindowRefTip, windowBranchValue } from "./git.js";
import { createWindowHost } from "./native-host.js";
import { acquireWindowHostCommit } from "./merged-flip.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import type { WindowComparisonMark } from "./comparison-marks.js";
import { WindowRefusal } from "./result.js";
import { isCompletedGitFailure, isGitProcessError } from "../../lib/git/process-error.js";
import { isGitObjectId } from "../../lib/git/object-id.js";

/** Read all tracked state paths in a commit's tree without resolving replace objects or lazy fetching. */
export async function readWindowTrackedPaths(io: Pick<WindowHoldIO, "repo" | "exec">, revision: string): Promise<string[]> {
  const { stdout } = await io.exec("git", ["--no-replace-objects", "ls-tree", "-r", "-z", "--name-only", "--full-tree", revision,
    "--", ...WINDOW_TRACKED_STATE_ROOTS], { cwd: io.repo, objectAccess: "local-only" });
  if (stdout && !stdout.endsWith("\0")) throw new Error(`Incomplete tracked-state tree at ${revision}. Restore Git access and retry.`);
  return stdout.split("\0").filter(Boolean);
}

/** Whether the record holds the branch's local or fetched tip; only a branch it holds neither of is unrecorded. */
export function isWindowRecordedBranch(record: WindowRecord, branch: string): boolean {
  return Object.hasOwn(record.branches.local, branch) || Object.hasOwn(record.branches.origin, branch);
}

/** Observe recorded live sides, or each present side of an unrecorded state-bearing branch. */
export async function readWindowBranchObservations(io: WindowHoldIO, record: WindowRecord, branch: string): Promise<WindowComparisonMark[]> {
  if (branch === "main" || branch === record.flip.branch) return [];
  const recorded = windowBranchValue(record.branches.live, branch);
  if (recorded === undefined && isWindowRecordedBranch(record, branch)) return [];
  const local = await readWindowRefTip(io, `refs/heads/${branch}`);
  const origin = (await createWindowHost(io).refs([`refs/heads/${branch}`]))[`refs/heads/${branch}`] ?? null;
  if (origin !== null) await acquireWindowHostCommit(io, branch, origin);
  if (recorded === undefined && !await windowTipsTrackState(io, [local, origin])) return [];
  return sideMarks(io, record, branch, recorded, { local, origin });
}

type BranchSides = { local: string | null; origin: string | null };

async function sideMarks(io: WindowHoldIO, record: WindowRecord, branch: string, recorded: BranchSides | undefined,
  tips: BranchSides): Promise<WindowComparisonMark[]> {
  const marks: WindowComparisonMark[] = [];
  for (const side of ["local", "origin"] as const) {
    const baseline = recorded?.[side] ?? null, current = tips[side];
    if (baseline === null && (recorded !== undefined || current === null)) continue;
    const tip = current ?? baseline;
    if (tip === null) continue;
    const base = baseline ?? await readWindowUnrecordedBase(io, record, branch, tip);
    marks.push({ branch, side, tip, recorded: baseline, base, kind: current === null ? "gone" : "compared" });
  }
  return marks;
}

/** Whether any present tip holds tracked state: compare marks such a branch, and close refuses one left unmarked. */
export async function windowTipsTrackState(io: Pick<WindowHoldIO, "repo" | "exec">, tips: readonly (string | null)[]): Promise<boolean> {
  for (const tip of tips) if (tip !== null && (await readWindowTrackedPaths(io, tip)).length) return true;
  return false;
}

/** Recover an unrecorded range's base from the held main observation and its immutable mark. */
export async function readWindowUnrecordedBase(io: WindowHoldIO, record: WindowRecord, branch: string, tip: string): Promise<string> {
  const main = record.branches.local.main;
  if (main === undefined) throw new Error("The hold has no recorded main tip. Preserve and repair the hold before retrying.");
  let base: string;
  try {
    base = (await io.exec("git", ["--no-replace-objects", "merge-base", main, tip], { cwd: io.repo, objectAccess: "local-only" })).stdout.trim();
  } catch (error) {
    if (!isGitProcessError(error) || !isCompletedGitFailure(error) || error.exitCode !== 1 || error.stdout.trim() !== "") throw error;
    throw new WindowRefusal([{ subject: branch,
      condition: `Unrecorded branch tip ${tip} shares no history with main's recorded tip ${main}, so its range has no base.`,
      remedy: `Delete ${branch} locally and on origin if it is not wanted, or merge main into it with git merge --allow-unrelated-histories main and push it, then run compare --branch ${branch} again.` }]);
  }
  if (!isGitObjectId(base)) throw new Error("No complete unrecorded-branch merge base is available. Restore history and retry.");
  return base;
}
