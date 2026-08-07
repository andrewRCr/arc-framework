/**
 * Unit tests for the session-init work-unit-state composer — the I/O boundary
 * around the pure completion-tail classifier. The presence tier reads branch-tip
 * committer dates, enumerates the operator's owned `Integrating` WUs from the
 * roster, and classifies them from tracked state alone (no network).
 */

import { describe, it, expect, vi } from "vitest";

import {
  analyzeBehindBaseSnapshot,
  runWorkUnitState,
  type WorkUnitPrFacts,
  type WorkUnitPrSource,
} from "../../../src/lib/session-init/work-unit-state.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeRosterEntry } from "../../../src/lib/git/worktree-roster.js";

const prFacts = (over: Partial<WorkUnitPrFacts> = {}): WorkUnitPrFacts => ({
  merged: false,
  hasOpenPr: true,
  approved: false,
  changesRequested: false,
  checksFailed: false,
  ...over,
});

/** A `WorkUnitPrSource` returning the given per-branch facts; unlisted branches resolve absent. */
const sourceOf = (byBranch: Record<string, WorkUnitPrFacts>): WorkUnitPrSource =>
  async (branches) => {
    const map = new Map<string, WorkUnitPrFacts>();
    for (const branch of branches) {
      const facts = byBranch[branch];
      if (facts !== undefined) map.set(branch, facts);
    }
    return map;
  };

const NOW = "2026-06-13T00:00:00.000Z";
const NOW_SEC = Math.floor(Date.parse(NOW) / 1000);
const daysAgo = (n: number): number => NOW_SEC - n * 86400;

const NUDGE = {
  shouldNudge: true,
  markerPath: ".arc/user/andrew/.internal/work-unit-stale-last-nudge.txt",
  today: "2026-06-13",
};

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
 * default); `rev-list` (the behind-base read) returns `0\t<behind>` (default
 * `behind: 0`); every other invocation throws. Pass `failRefs` / `failBase` to
 * simulate a read failure on the respective call.
 */
function buildExec(
  options: { refs?: string; failRefs?: boolean; behind?: number; failBase?: boolean } = {},
): GitExec {
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "for-each-ref") {
      if (options.failRefs === true) throw new Error("for-each-ref boom");
      return { stdout: options.refs ?? "", stderr: "" };
    }
    if (args[0] === "rev-list") {
      if (options.failBase === true) throw new Error("rev-list boom");
      return { stdout: `0\t${options.behind ?? 0}`, stderr: "" };
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
      baseBranch: "main",
      staleThresholdDays: 3,
      nudge: NUDGE,
      now: NOW,
    });

    expect(result.inFlight.workUnits).toEqual([
      {
        name: "widget",
        branch: "feat/widget",
        state: "awaiting-review",
        behindBase: { status: "known", value: false, remoteEvidence: "exact" },
        ageDays: 1,
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("returns an empty sweep for an empty roster", async () => {
    const result = await runWorkUnitState({
      exec: buildExec(),
      roster: [],
      identity: "andrew",
      baseBranch: "main",
      staleThresholdDays: 3,
      nudge: NUDGE,
      now: NOW,
    });

    expect(result.inFlight.workUnits).toEqual([]);
  });

  it("classifies an Integrating WU past the threshold as stale from its branch-tip committer date", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(9)}` }),
      roster: [rosterEntry()],
      identity: "andrew",
      baseBranch: "main",
      staleThresholdDays: 3,
      nudge: NUDGE,
      now: NOW,
    });

    expect(result.inFlight.workUnits[0]).toEqual({
      name: "widget",
      branch: "feat/widget",
      state: "stale",
      behindBase: { status: "known", value: false, remoteEvidence: "exact" },
      ageDays: 9,
    });
  });

  it("threads the resolved nudge state through onto the result", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}` }),
      roster: [rosterEntry()],
      identity: "andrew",
      baseBranch: "main",
      staleThresholdDays: 3,
      nudge: NUDGE,
      now: NOW,
    });

    expect(result.nudge).toEqual(NUDGE);
  });

  it("degrades to age 0 with a soft warning when the committer-date read fails", async () => {
    const result = await runWorkUnitState({
      exec: buildExec({ failRefs: true }),
      roster: [rosterEntry()],
      identity: "andrew",
      baseBranch: "main",
      staleThresholdDays: 3,
      nudge: NUDGE,
      now: NOW,
    });

    expect(result.inFlight.workUnits[0]).toMatchObject({ state: "awaiting-review", ageDays: 0 });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/committer date|for-each-ref|branch/i);
  });
});

describe("runWorkUnitState (behind-base overlay)", () => {
  const baseOptions = {
    roster: [rosterEntry()],
    identity: "andrew" as const,
    baseBranch: "main",
    staleThresholdDays: 3,
    nudge: NUDGE,
    now: NOW,
  };

  it("flags behindBase when the local base ref is ahead of the branch", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}`, behind: 4 }),
      prSource: sourceOf({ "feat/widget": prFacts({ approved: true }) }),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("mergeable");
    expect(result.inFlight.workUnits[0]?.behindBase).toEqual({
      status: "known",
      value: true,
      remoteEvidence: "exact",
    });
  });

  it("leaves behindBase false when the branch is current with its base", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}`, behind: 0 }),
    });

    expect(result.inFlight.workUnits[0]?.behindBase).toEqual({
      status: "known",
      value: false,
      remoteEvidence: "exact",
    });
    expect(result.warnings).toEqual([]);
  });

  it("propagates a failed local behind-base graph read", async () => {
    await expect(runWorkUnitState({
      ...baseOptions,
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}`, failBase: true }),
    })).rejects.toThrow("rev-list boom");
  });
});

describe("analyzeBehindBaseSnapshot", () => {
  it("reports a known behind-base relation against the advertised base commit", async () => {
    const baseOid = "1111111111111111111111111111111111111111";
    const exec: GitExec = async (_cmd, args, options) => {
      if (args[0] !== "rev-list" || args[3] !== `feat/widget...${baseOid}`) {
        throw new Error("unexpected graph read");
      }
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      return { stdout: "0\t4", stderr: "" };
    };

    const relations = await analyzeBehindBaseSnapshot({
      exec,
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "known",
      value: true,
      remoteEvidence: "exact",
    });
  });

  it("reports a known current relation when the advertised base adds no commits", async () => {
    const baseOid = "1111111111111111111111111111111111111111";
    const exec: GitExec = async () => ({ stdout: "3\t0", stderr: "" });

    const relations = await analyzeBehindBaseSnapshot({
      exec,
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "known",
      value: false,
      remoteEvidence: "exact",
    });
  });

  it("reports pending-fetch when the advertised base commit is absent locally", async () => {
    const baseOid = "1111111111111111111111111111111111111111";

    const relations = await analyzeBehindBaseSnapshot({
      exec: buildExec(),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: false } },
      history: { kind: "complete" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "unavailable",
      remoteEvidence: "pending-fetch",
      reason: "base-object-pending-fetch",
    });
  });

  it("reports unreachable evidence with its remote failure reason", async () => {
    const relations = await analyzeBehindBaseSnapshot({
      exec: buildExec(),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "unreachable", failureReason: "auth" },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "complete" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "unavailable",
      remoteEvidence: "unreachable",
      failureReason: "auth",
    });
  });

  it("reports exact remote-base absence from a complete snapshot", async () => {
    const relations = await analyzeBehindBaseSnapshot({
      exec: buildExec(),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: {} },
      objectAvailability: { kind: "complete", commits: {} },
      history: { kind: "shallow" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "unavailable",
      remoteEvidence: "exact",
      reason: "remote-base-absent",
    });
  });

  it("reports not-applicable when remote comparison is disabled", async () => {
    const relations = await analyzeBehindBaseSnapshot({
      exec: buildExec(),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: false,
      snapshot: { kind: "unreachable", failureReason: "network" },
      objectAvailability: { kind: "unavailable", reason: "execution" },
      history: { kind: "unavailable", reason: "execution" },
    });

    expect(relations.get("feat/widget")).toEqual({
      status: "not-applicable",
      remoteEvidence: "not-applicable",
    });
  });

  it("refuses a known relation when local history is shallow", async () => {
    const baseOid = "1111111111111111111111111111111111111111";

    await expect(analyzeBehindBaseSnapshot({
      exec: buildExec(),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "shallow" },
    })).rejects.toThrow("Complete local history is required for behind-base analysis.");
  });

  it("propagates malformed local distance output", async () => {
    const baseOid = "1111111111111111111111111111111111111111";

    await expect(analyzeBehindBaseSnapshot({
      exec: async () => ({ stdout: "not-a-distance", stderr: "" }),
      branches: ["feat/widget"],
      baseBranch: "main",
      remoteSyncEnabled: true,
      snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
      objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
      history: { kind: "complete" },
    })).rejects.toThrow("Malformed git rev-list --count output.");
  });
});

describe("runWorkUnitState (mergeable-sharpening tier)", () => {
  const baseOptions = {
    exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(1)}` }),
    roster: [rosterEntry()],
    identity: "andrew",
    baseBranch: "main",
    staleThresholdDays: 3,
    nudge: NUDGE,
    now: NOW,
  };

  it("upgrades an awaiting-review leaf to mergeable from live PR state", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      prSource: sourceOf({ "feat/widget": prFacts({ approved: true }) }),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("mergeable");
  });

  it("upgrades to blocked when the PR has changes requested", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      prSource: sourceOf({ "feat/widget": prFacts({ changesRequested: true }) }),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("blocked");
  });

  it("upgrades to merged-needs-archival when the PR is merged", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      prSource: sourceOf({ "feat/widget": prFacts({ merged: true, hasOpenPr: false }) }),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("merged-needs-archival");
  });

  it("upgrades a stale leaf when its PR is now mergeable (event-driven bypasses the threshold)", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      exec: buildExec({ refs: `refs/heads/feat/widget\t${daysAgo(9)}` }),
      prSource: sourceOf({ "feat/widget": prFacts({ approved: true }) }),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("mergeable");
  });

  it("keeps the presence classification for a branch the source has no PR for", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      prSource: sourceOf({}),
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("awaiting-review");
  });

  it("degrades to presence with a soft warning when the PR source throws", async () => {
    const result = await runWorkUnitState({
      ...baseOptions,
      prSource: async () => {
        throw new Error("gh unreachable");
      },
    });

    expect(result.inFlight.workUnits[0]?.state).toBe("awaiting-review");
    expect(result.warnings.some((w) => /sharpen|gh|pr/i.test(w))).toBe(true);
  });
});
