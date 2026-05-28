import { describe, it, expect, vi } from "vitest";

import { runRecentRemoteBranches } from "../../../src/lib/git/recent-remote-branches.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

const NOW = Date.UTC(2026, 4, 25); // 2026-05-25
const DAY = 86_400;
const NOW_S = Math.floor(NOW / 1000);

/** Build an exec stub that returns a fixed for-each-ref payload (or throws). */
function execReturning(stdout: string): GitExec {
  return vi.fn(async (): Promise<ExecResult> => ({ stdout, stderr: "" }));
}

function line(name: string, ageDays: number): string {
  return `${name} ${NOW_S - ageDays * DAY}`;
}

describe("runRecentRemoteBranches", () => {
  it("returns branches within the window, newest first, with the origin/ prefix stripped", async () => {
    const exec = execReturning(
      [line("origin/feat/a", 2), line("origin/feat/b", 10)].join("\n"),
    );

    const result = await runRecentRemoteBranches({ exec, withinDays: 30, now: NOW });

    expect(result).toEqual(["feat/a", "feat/b"]);
  });

  it("excludes branches whose tip is older than the recency window", async () => {
    const exec = execReturning(
      [line("origin/feat/fresh", 5), line("origin/feat/stale", 45)].join("\n"),
    );

    const result = await runRecentRemoteBranches({ exec, withinDays: 30, now: NOW });

    expect(result).toEqual(["feat/fresh"]);
  });

  it("filters out origin/HEAD (and the bare origin symbolic ref)", async () => {
    const exec = execReturning(
      [line("origin", 1), line("origin/HEAD", 1), line("origin/main", 1)].join("\n"),
    );

    const result = await runRecentRemoteBranches({ exec, withinDays: 30, now: NOW });

    expect(result).toEqual(["main"]);
  });

  it("returns an empty list when the read fails (recency is a soft signal)", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("for-each-ref failed");
    });

    const result = await runRecentRemoteBranches({ exec, withinDays: 30, now: NOW });

    expect(result).toEqual([]);
  });

  it("returns an empty list when no branches fall within the window", async () => {
    const exec = execReturning(line("origin/feat/old", 90));

    const result = await runRecentRemoteBranches({ exec, withinDays: 30, now: NOW });

    expect(result).toEqual([]);
  });
});
