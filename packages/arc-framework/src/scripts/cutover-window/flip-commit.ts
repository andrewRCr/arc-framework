/** Validate the flip's recorded branch and checkout coordinates before inspecting its final commit. */
import { WINDOW_TRACKED_STATE_ROOTS } from "./tracked-state.js";
import type { WindowGitReadIO } from "./git.js";
import type { WindowRecord } from "./hold.js";
import type { WindowFinding } from "./result.js";
import type { WindowRecomputeCoordinates } from "./recompute-coordinates.js";

interface FlipCoordinate { subject: string; tip: string | null }
/** An agreed next head, or coordinate differences that prevent choosing one. */
export interface WindowFlipCommitBasis { tip: string | null; findings: WindowFinding[] }

/** Require every recorded flip side and checkout to name the same advanced head. */
export function windowFlipCommitBasis(record: WindowRecord, observed: WindowRecomputeCoordinates): WindowFlipCommitBasis {
  const branch = record.flip.branch, findings: WindowFinding[] = [];
  const coordinates: FlipCoordinate[] = [{ subject: `host:${branch}`, tip: observed.branches.host[branch] ?? null }];
  for (const side of ["local", "origin"] as const) {
    if (Object.hasOwn(record.branches[side], branch)) coordinates.push({ subject: `${side}:${branch}`, tip: observed.branches[side][branch] ?? null });
  }
  for (const held of record.worktrees.filter(row => row.branch === branch)) {
    const current = observed.worktrees.find(row => row.path === held.path);
    coordinates.push({ subject: held.path, tip: current?.head ?? null });
    if (current?.branch !== branch) findings.push({ subject: held.path,
      condition: `The flip checkout must remain on ${branch}; recorded HEAD ${held.head}; observed ${JSON.stringify(current ?? null)}.`,
      remedy: "Restore the recorded flip checkout's branch and deletion head before retrying last-read." });
  }
  const tip = coordinates.find(row => row.tip !== null && row.tip !== record.flip.head)?.tip ?? null;
  for (const coordinate of coordinates) {
    if (tip === null || coordinate.tip !== tip) findings.push({ subject: coordinate.subject,
      condition: `The flip must advance from recorded ${record.flip.head} to one common deletion head ${tip ?? "(unavailable)"}; observed ${coordinate.tip ?? "absent"}.`,
      remedy: "Align the recorded branch sides and checkout with the published deletion commit, then retry last-read or use restore." });
  }
  return { tip, findings };
}

/** Require exactly one parent at the admitted head and a nonempty diff of tracked-state deletions. */
export async function readWindowFlipCommitFindings(io: WindowGitReadIO, recordedHead: string, tip: string): Promise<WindowFinding[]> {
  const read = async (args: string[]) => (await io.exec("git", ["--no-replace-objects", ...args],
    { cwd: io.repo, objectAccess: "local-only", preserveOutput: true })).stdout;
  try {
    const parents = (await read(["rev-list", "--parents", "-n", "1", tip])).trim().split(/\s+/u);
    if (parents.length !== 2 || parents[0] !== tip || parents[1] !== recordedHead) return [{ subject: tip,
      condition: `The commit must have only recorded head ${recordedHead} as its parent; observed ${JSON.stringify(parents.slice(1))}.`,
      remedy: "Replace the flip change with one commit directly on the recorded head, then publish it and retry last-read or use restore." }];
    const diff = await read(["diff-tree", "--no-commit-id", "--name-status", "--no-renames", "--no-ext-diff", "--no-textconv",
      "-r", "-z", recordedHead, tip, "--"]);
    if (diff !== "" && !diff.endsWith("\0")) throw new Error("The commit diff is incomplete.");
    const fields = diff === "" ? [] : diff.slice(0, -1).split("\0");
    let deletionsOnly = fields.length > 0 && fields.length % 2 === 0;
    for (let index = 0; index < fields.length; index += 2) {
      const path = fields[index + 1];
      if (fields[index] !== "D" || path === undefined || !WINDOW_TRACKED_STATE_ROOTS.some(root => path === root || path.startsWith(`${root}/`)))
        deletionsOnly = false;
    }
    return deletionsOnly ? [] : [{ subject: tip,
      condition: `The commit must only delete tracked-state files; observed ${JSON.stringify(fields)}.`,
      remedy: "Keep only tracked-state deletions in the flip's one commit, then publish it and retry last-read or use restore." }];
  } catch (error) {
    return [{ subject: tip, condition: `Cannot inspect the flip commit against recorded ${recordedHead}: ${String(error)}`,
      remedy: "Restore readable commit objects and complete Git evidence, then retry last-read or use restore." }];
  }
}
