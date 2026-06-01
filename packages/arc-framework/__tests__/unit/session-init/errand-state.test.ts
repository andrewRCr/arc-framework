/**
 * Unit tests for the session-init errand-state composer — wiring the
 * branch-derived errand signals into one envelope slot.
 */

import { describe, it, expect, vi } from "vitest";

import { runErrandState } from "../../../src/lib/session-init/errand-state.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";

const NOW = "2026-06-01T12:00:00.000Z";
const TODAY = "2026-06-01";
const RECENT = Math.floor(Date.parse("2026-06-01T10:00:00.000Z") / 1000);
const OLD = Math.floor(Date.parse("2026-05-25T10:00:00.000Z") / 1000);

function roster(entries: WorktreeRosterResult["entries"] = []): WorktreeRosterResult {
  return { entries, warnings: [] };
}

function nudge(shouldNudge = true) {
  return {
    shouldNudge,
    markerPath: ".arc/user/andrew/.internal/errand-reminder-last-nudge.txt",
    today: TODAY,
  };
}

function buildExec(options: {
  refs?: string;
  merged?: readonly string[];
} = {}): GitExec {
  const merged = new Set(options.merged ?? []);
  return vi.fn(async (cmd: string, args: string[]) => {
    if (cmd !== "git") throw new Error(`unexpected command: ${cmd}`);
    if (args[0] === "for-each-ref") {
      return { stdout: options.refs ?? "", stderr: "" };
    }
    if (args[0] === "merge-base") {
      const branch = args[2];
      if (branch !== undefined && merged.has(branch)) return { stdout: "", stderr: "" };
      throw new Error("not merged");
    }
    throw new Error(`unexpected git ${args.join(" ")}`);
  });
}

describe("runErrandState", () => {
  it("detects a resumable chore branch without running discovery", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "chore/fix-typo",
      hasBackingMeta: false,
      includeDiscovery: false,
      roster: null,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(false),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: true, slug: "fix-typo" });
    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("classifies local and remote chore branches and selects materializable candidates", async () => {
    const exec = buildExec({
      refs: [
        `refs/heads/chore/local\t${RECENT}`,
        `refs/remotes/origin/chore/materialize-me\t${RECENT}`,
        `refs/remotes/origin/chore/review-me\t${RECENT}`,
        `refs/remotes/origin/chore/merged\t${OLD}`,
        `refs/remotes/origin/feat/not-errand\t${RECENT}`,
      ].join("\n"),
      merged: ["origin/chore/merged"],
    });

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      roster: roster([{ worktreePath: "/repo", branch: "chore/local" }]),
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
      detectOpenPr: async (branch) => branch === "chore/review-me",
    });

    expect(result.inFlight.errands).toEqual([
      { slug: "local", branch: "chore/local", state: "in-progress", ageDays: 0 },
      { slug: "materialize-me", branch: "chore/materialize-me", state: "in-progress", ageDays: 0 },
      { slug: "review-me", branch: "chore/review-me", state: "awaiting-merge", ageDays: 0 },
      { slug: "merged", branch: "chore/merged", state: "merged-cleanup", ageDays: 7 },
    ]);
    expect(result.materializable.candidates).toEqual([
      { slug: "materialize-me", branch: "chore/materialize-me" },
    ]);
    expect(result.nudge).toEqual(nudge());
  });

  it("excludes meta-backed chore branches from errand discovery", async () => {
    const exec = buildExec({
      refs: [
        `refs/heads/chore/promoted\t${RECENT}`,
        `refs/remotes/origin/chore/promoted\t${RECENT}`,
      ].join("\n"),
    });

    const result = await runErrandState({
      exec,
      currentBranch: "chore/promoted",
      hasBackingMeta: true,
      includeDiscovery: true,
      roster: roster([
        {
          worktreePath: "/repo",
          branch: "chore/promoted",
          metaFilePath: "/repo/.arc/active/meta-promoted.md",
        },
      ]),
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.resume).toEqual({ resumable: false, slug: null });
    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
  });

  it("skips discovery with a warning when discovery is requested but the roster is unavailable", async () => {
    const exec = buildExec();

    const result = await runErrandState({
      exec,
      currentBranch: "main",
      hasBackingMeta: false,
      includeDiscovery: true,
      roster: null,
      baseBranch: "main",
      staleThresholdDays: 1,
      nudge: nudge(),
      now: NOW,
    });

    expect(result.inFlight.errands).toEqual([]);
    expect(result.materializable.candidates).toEqual([]);
    expect(result.warnings).toContain("Errand discovery skipped because the worktree roster was unavailable.");
    expect(exec).not.toHaveBeenCalled();
  });
});
