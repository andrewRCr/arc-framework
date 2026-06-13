/**
 * Unit tests for the session-init work-unit-state composer — the I/O boundary
 * around the pure completion-tail classifier. The presence tier reads branch-tip
 * committer dates, enumerates the operator's owned `Integrating` WUs from the
 * roster, and classifies them from tracked state alone (no network).
 */

import { describe, it, expect, vi } from "vitest";

import { runWorkUnitState } from "../../../src/lib/session-init/work-unit-state.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeRosterEntry } from "../../../src/lib/git/worktree-roster.js";

const NOW = "2026-06-13T00:00:00.000Z";
const NOW_SEC = Math.floor(Date.parse(NOW) / 1000);
const daysAgo = (n: number): number => NOW_SEC - n * 86400;

const rosterEntry = (over: Partial<WorktreeRosterEntry> = {}): WorktreeRosterEntry => ({
  worktreePath: "/repo",
  branch: "feat/widget",
  identity: "andrew",
  metaFilePath: "/repo/.arc/active/meta-widget.md",
  state: "Integrating",
  ...over,
});

/**
 * Git mock: `for-each-ref` returns the supplied committer-date lines (or a
 * default), every other invocation throws. Pass `failRefs` to simulate a
 * `for-each-ref` read failure.
 */
function buildExec(options: { refs?: string; failRefs?: boolean } = {}): GitExec {
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "for-each-ref") {
      if (options.failRefs === true) throw new Error("for-each-ref boom");
      return { stdout: options.refs ?? "", stderr: "" };
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("runWorkUnitState (presence tier)", () => {
  it("classifies only owned Integrating WUs from a mixed-state roster", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}` }),
      roster: [
        rosterEntry({ branch: "feat/widget", metaFilePath: "/repo/.arc/active/meta-widget.md" }),
        rosterEntry({ branch: "feat/active", metaFilePath: "/repo/.arc/active/meta-active.md", state: "Active" }),
        rosterEntry({ branch: "feat/theirs", metaFilePath: "/repo/.arc/active/meta-theirs.md", identity: "blair" }),
      ],
      identity: "andrew",
      staleThresholdDays: 3,
      now: NOW,
    });

    expect(result.inFlight.workUnits).toEqual([
      { name: "widget", branch: "feat/widget", state: "awaiting-review", ageDays: 1 },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty sweep for an empty roster", async () => {
    const result = await runWorkUnitState({
      exec: buildExec(),
      roster: [],
      identity: "andrew",
      staleThresholdDays: 3,
      now: NOW,
    });

    expect(result.inFlight.workUnits).toEqual([]);
  });

  it("classifies an Integrating WU past the threshold as stale from its branch-tip committer date", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(9)}` }),
      roster: [rosterEntry()],
      identity: "andrew",
      staleThresholdDays: 3,
      now: NOW,
    });

    expect(result.inFlight.workUnits[0]).toEqual({
      name: "widget",
      branch: "feat/widget",
      state: "stale",
      ageDays: 9,
    });
  });

  it("degrades to age 0 with a soft warning when the committer-date read fails", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ failRefs: true }),
      roster: [rosterEntry()],
      identity: "andrew",
      staleThresholdDays: 3,
      now: NOW,
    });

    expect(result.inFlight.workUnits[0]).toMatchObject({ state: "awaiting-review", ageDays: 0 });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/committer date|for-each-ref|branch/i);
  });
});
