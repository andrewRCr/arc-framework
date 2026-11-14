/** Compare recorded import coordinates with a fresh, read-only repository observation. */
import type { WindowRecord } from "./hold.js";
import { windowBranchValue } from "./git.js";
import type { WindowFinding } from "./result.js";

/**
 * The checkout and digest observations shared by the pre-merge comparisons. A null review digest or host map could not
 * be read; its own finding reports that, and the comparisons it feeds are skipped.
 */
export type WindowRecomputeCoordinates = Pick<WindowRecord, "worktrees"> & {
  reviewGateDigest: WindowRecord["reviewGateDigest"] | null;
  branches: Pick<WindowRecord["branches"], "local" | "origin"> & { host: WindowRecord["branches"]["host"] | null };
};

/** Name changed coordinates, optionally leaving the recorded flip checkout's head to a stricter caller. */
export function windowRecomputeCoordinateFindings(record: WindowRecord, observed: WindowRecomputeCoordinates,
  exemptFlip = false): WindowFinding[] {
  const findings: WindowFinding[] = [];
  const before = new Map(record.worktrees.map(row => [row.path, row]));
  const after = new Map(observed.worktrees.map(row => [row.path, row]));
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    const held = before.get(path), current = after.get(path);
    if (!held || !current) findings.push(difference(path, "worktree set", held ?? null, current ?? null));
    else {
      if (!(exemptFlip && held.branch === record.flip.branch) && held.head !== current.head)
        findings.push(difference(path, "HEAD", held.head, current.head));
      if (held.personalDigest !== current.personalDigest)
        findings.push(difference(path, "personal digest", held.personalDigest, current.personalDigest));
    }
  }
  if (observed.reviewGateDigest !== null && record.reviewGateDigest !== observed.reviewGateDigest)
    findings.push(difference("review gate", "review gate digest", record.reviewGateDigest, observed.reviewGateDigest));
  findings.push(...branchFindings(record, observed, exemptFlip));
  return findings;
}

function branchFindings(record: WindowRecord, observed: WindowRecomputeCoordinates, exemptFlip: boolean): WindowFinding[] {
  const findings: WindowFinding[] = [];
  for (const side of ["local", "origin", "host"] as const) {
    const before = record.branches[side], after = observed.branches[side];
    if (after === null) continue;
    const names = side === "host" ? Object.keys(before) : new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const branch of names) {
      if (exemptFlip && branch === record.flip.branch) continue;
      const left = windowBranchValue(before, branch) ?? null, right = windowBranchValue(after, branch) ?? null;
      if (left !== right) findings.push(difference(`${side}:${branch}`, "branch tip", left, right));
    }
  }
  return findings;
}

function difference(subject: string, field: string, recorded: unknown, observed: unknown): WindowFinding {
  return { subject, condition: `Changed ${field}: recorded ${JSON.stringify(recorded)}; observed ${JSON.stringify(observed)}.`,
    remedy: "Stop the window and use restore before retrying with a fresh check." };
}
