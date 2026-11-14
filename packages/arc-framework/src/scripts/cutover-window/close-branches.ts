/** Discover state-bearing sides of branches the record holds no tip of, without refreshing recorded comparison marks. */
import type { WindowHoldIO, WindowRecord } from "./hold.js";
import type { WindowHostPort } from "./host.js";
import type { WindowHeldComparisons } from "./held-comparisons.js";
import { listWindowRefs } from "./git.js";
import { acquireWindowHostCommit } from "./merged-flip.js";
import { isWindowRecordedBranch, windowTipsTrackState } from "./branch-observations.js";
import type { WindowFinding } from "./result.js";

/** Require present sides of an unrecorded state-bearing branch to have retained comparison marks. */
export async function readWindowCloseBranchFindings(io: WindowHoldIO, record: WindowRecord, state: WindowHeldComparisons,
  host: Pick<WindowHostPort, "refs">): Promise<WindowFinding[]> {
  const local = new Map([...await listWindowRefs(io, ["refs/heads/"])].map(([ref, tip]) => [ref.slice("refs/heads/".length), tip]));
  const origin = new Map(Object.entries(await host.refs(["refs/heads/*"]))
    .filter(([ref]) => ref.startsWith("refs/heads/")).map(([ref, tip]) => [ref.slice("refs/heads/".length), tip]));
  const findings: WindowFinding[] = [];
  for (const branch of new Set([...local.keys(), ...origin.keys()])) {
    if (branch === "main" || branch === record.flip.branch || isWindowRecordedBranch(record, branch)) continue;
    findings.push(...await unrecordedFindings(io, state, branch, { local: local.get(branch) ?? null, origin: origin.get(branch) ?? null }));
  }
  return findings;
}

async function unrecordedFindings(io: WindowHoldIO, state: WindowHeldComparisons, branch: string,
  tips: { local: string | null; origin: string | null }): Promise<WindowFinding[]> {
  const missing = (["local", "origin"] as const).filter(side => tips[side] !== null
    && !state.marks.some(mark => mark.branch === branch && mark.side === side));
  if (!missing.length) return [];
  if (tips.origin !== null) await acquireWindowHostCommit(io, branch, tips.origin);
  if (!await windowTipsTrackState(io, [tips.local, tips.origin])) return [];
  return missing.map(side => ({ subject: `${side}/${branch}`, condition: `Unrecorded state-bearing tip ${tips[side]} has no comparison mark.`,
    remedy: `Run compare --branch ${branch}, reapply and confirm every range it reports, then retry close.` }));
}
