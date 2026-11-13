/** Observe branch sides and acquire the object evidence needed to retain post-import marks. */
import type { WindowHoldIO, WindowRecord } from "./hold.js";
import { readWindowRefTip } from "./git.js";
import { createWindowHost } from "./native-host.js";
import { acquireWindowHostCommit } from "./merged-flip.js";
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import type { WindowComparisonMark } from "./comparison-marks.js";

/** Read all tracked state paths in a commit's tree without resolving replace objects or lazy fetching. */
export async function readWindowTrackedPaths(io: Pick<WindowHoldIO, "repo" | "exec">, revision: string): Promise<string[]> {
  const { stdout } = await io.exec("git", ["--no-replace-objects", "ls-tree", "-r", "-z", "--name-only", "--full-tree", revision,
    "--", ...WINDOW_TRACKED_STATE_ROOTS], { cwd: io.repo, objectAccess: "local-only" });
  if (stdout && !stdout.endsWith("\0")) throw new Error(`Incomplete tracked-state tree at ${revision}. Restore Git access and retry.`);
  return stdout.split("\0").filter(Boolean);
}

/** Observe recorded sides, or each present side of an unrecorded state-bearing branch. */
export async function readWindowBranchObservations(io: WindowHoldIO, record: WindowRecord, branch: string): Promise<WindowComparisonMark[]> {
  if (branch === "main" || branch === record.flip.branch) return [];
  const local = await readWindowRefTip(io, `refs/heads/${branch}`);
  const origin = (await createWindowHost(io).refs([`refs/heads/${branch}`]))[`refs/heads/${branch}`] ?? null;
  if (origin !== null) await acquireWindowHostCommit(io, branch, origin);
  const recorded = Object.hasOwn(record.branches.live, branch) ? record.branches.live[branch] : undefined;
  if (recorded === undefined && !await stateBearing(io, [local, origin])) return [];
  const marks: WindowComparisonMark[] = [];
  for (const side of ["local", "origin"] as const) {
    const baseline = recorded?.[side] ?? null, current = side === "local" ? local : origin;
    if (baseline === null && (recorded !== undefined || current === null)) continue;
    const tip = current ?? baseline;
    if (tip === null) continue;
    const base = baseline ?? await readWindowUnrecordedBase(io, record, tip);
    marks.push({ branch, side, tip, recorded: baseline, base, kind: current === null ? "gone" : "compared" });
  }
  return marks;
}

async function stateBearing(io: WindowHoldIO, tips: readonly (string | null)[]): Promise<boolean> {
  for (const tip of tips) if (tip !== null && (await readWindowTrackedPaths(io, tip)).length) return true;
  return false;
}

/** Recover an unrecorded range's base from the held main observation and its immutable mark. */
export async function readWindowUnrecordedBase(io: WindowHoldIO, record: WindowRecord, tip: string): Promise<string> {
  const main = record.branches.local.main;
  if (main === undefined) throw new Error("The hold has no recorded main tip. Preserve and repair the hold before retrying.");
  const base = (await io.exec("git", ["--no-replace-objects", "merge-base", main, tip], { cwd: io.repo, objectAccess: "local-only" })).stdout.trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(base)) throw new Error("No complete unrecorded-branch merge base is available. Restore history and retry.");
  return base;
}
