import { describe, it, expect, vi } from "vitest";

import {
  analyzeRecentRemoteBranchesSnapshot,
  runRecentRemoteBranches,
} from "../../../src/lib/git/recent-remote-branches.js";
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

describe("analyzeRecentRemoteBranchesSnapshot", () => {
  it("sorts locally available advertised tips by their commit dates", async () => {
    const newerOid = "a".repeat(40);
    const olderOid = "b".repeat(40);
    const exec: GitExec = vi.fn(async (_command, args, options): Promise<ExecResult> => {
      if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
      if (args[0] !== "show") throw new Error(`unexpected git invocation: ${args.join(" ")}`);
      if (args.at(-1) === newerOid) return { stdout: String(NOW_S - DAY), stderr: "" };
      if (args.at(-1) === olderOid) return { stdout: String(NOW_S - 2 * DAY), stderr: "" };
      throw new Error(`unexpected oid: ${String(args.at(-1))}`);
    });

    const result = await analyzeRecentRemoteBranchesSnapshot({
      exec,
      tips: { "feat/older": olderOid, "feat/newer": newerOid },
      objectAvailability: { kind: "complete", commits: { [olderOid]: true, [newerOid]: true } },
      history: { kind: "complete" },
      excludeBranches: new Set(),
      withinDays: 30,
      now: NOW,
    });

    expect(result).toEqual({ branches: ["feat/newer", "feat/older"], pendingBranchCount: 0 });
  });

  it("applies exclusions before availability inspection and counts only eligible missing objects", async () => {
    const localOid = "a".repeat(40);
    const pendingOid = "b".repeat(40);
    const excludedOid = "c".repeat(40);
    const exec: GitExec = vi.fn(async (_command, args): Promise<ExecResult> => {
      if (args[0] !== "show" || args.at(-1) !== localOid) {
        throw new Error(`unexpected git invocation: ${args.join(" ")}`);
      }
      return { stdout: String(NOW_S - DAY), stderr: "" };
    });

    const result = await analyzeRecentRemoteBranchesSnapshot({
      exec,
      tips: { "feat/local": localOid, "feat/pending": pendingOid, main: excludedOid },
      objectAvailability: { kind: "complete", commits: { [localOid]: true, [pendingOid]: false } },
      history: { kind: "complete" },
      excludeBranches: new Set(["main"]),
      withinDays: 30,
      now: NOW,
    });

    expect(result).toEqual({ branches: ["feat/local"], pendingBranchCount: 1 });
  });

  it("refuses an exact recent tier when local classification has shallow history", async () => {
    const oid = "a".repeat(40);
    await expect(analyzeRecentRemoteBranchesSnapshot({
      exec: execReturning(String(NOW_S)),
      tips: { "feat/local": oid },
      objectAvailability: { kind: "complete", commits: { [oid]: true } },
      history: { kind: "shallow" },
      excludeBranches: new Set(),
      withinDays: 30,
      now: NOW,
    })).rejects.toThrow("Complete local history is required");
  });

  it.each([
    {
      name: "malformed date output",
      exec: execReturning("not-a-date"),
      message: "Malformed commit date",
    },
    {
      name: "local execution failure",
      exec: vi.fn(async (): Promise<ExecResult> => { throw new Error("date read failed"); }) as GitExec,
      message: "date read failed",
    },
  ])("propagates $name", async ({ exec, message }) => {
    const oid = "a".repeat(40);
    await expect(analyzeRecentRemoteBranchesSnapshot({
      exec,
      tips: { "feat/local": oid },
      objectAvailability: { kind: "complete", commits: { [oid]: true } },
      history: { kind: "complete" },
      excludeBranches: new Set(),
      withinDays: 30,
      now: NOW,
    })).rejects.toThrow(message);
  });
});
