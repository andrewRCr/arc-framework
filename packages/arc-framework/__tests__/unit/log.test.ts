/**
 * Unit tests for the log command (arc log standalone).
 *
 * @module
 */

import { describe, it, expect, vi } from "vitest";
import type { GitExec } from "../../src/lib/git/index.js";
import { runLogStandalone, buildLogStandaloneOutput } from "../../src/commands/log.js";

/** Helper to build a mock git log entry in the --format output. */
function fakeCommit(opts: {
  hash?: string;
  date?: string;
  subject?: string;
  body?: string;
}): string {
  const h = opts.hash ?? "abc1234";
  const d = opts.date ?? "2026-03-15 10:00:00 -0500";
  const s = opts.subject ?? "chore(arc): do something";
  const b = opts.body ?? "";
  return `${h}\n${d}\n${s}\n${b}`;
}

/** Joins multiple commit blocks with the null byte record separator. */
function buildGitOutput(...commits: string[]): string {
  return commits.map((c) => `\0${c}`).join("\n");
}

describe("runLogStandalone", () => {
  it("returns entries for commits with a standalone context footer", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "a1b2c3d",
          date: "2026-03-15 10:00:00 -0500",
          subject: "fix(auth): patch token refresh",
          body: "- Fixed token refresh edge case\n\nContext: standalone (maintenance)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      shortHash: "a1b2c3d",
      date: "2026-03-15",
      type: "fix",
      scope: "auth",
      description: "patch token refresh",
      contextLine: "Context: standalone (maintenance)",
    });
  });

  it("returns entries across the standalone categories", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "d4e5f6g",
          date: "2026-03-16 14:30:00 -0500",
          subject: "docs(arc): note the planning anchor",
          body: "- Queue-shaping edit\n\nContext: standalone (planning)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      shortHash: "d4e5f6g",
      date: "2026-03-16",
      type: "docs",
      scope: "arc",
      description: "note the planning anchor",
      contextLine: "Context: standalone (planning)",
    });
  });

  it("includes any commit git returns with a Context: line (filtering is git-level)", async () => {
    // Git's --grep filters for the standalone footer. If a non-standalone commit
    // somehow appears in the output, parseGitLogOutput still includes it as long
    // as it has a Context: line — the parse layer doesn't re-filter by pattern.
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "x1y2z3a",
          subject: "feat(auth): add login",
          body: "- Added login\n\nContext: tasks-auth.md (Task 2.1)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
  });

  it("excludes commits without a Context: line", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "n0c0ntx",
          subject: "fix(auth): quick patch",
          body: "- Fixed something\n\nNo context footer here",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(0);
  });

  it("returns empty entries when no commits match", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(0);
  });

  it("targets the standalone context footer in the git grep", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).toContain("--grep=Context: standalone (");
    expect(args.some((a) => a.includes("atomic"))).toBe(false);
  });

  it("filters by --category name", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "a1b2c3d",
          subject: "fix(auth): patch token refresh",
          body: "Context: standalone (maintenance)",
        }),
        fakeCommit({
          hash: "e5f6g7h",
          subject: "docs(arc): update readme",
          body: "Context: standalone (documentation)",
        }),
      ),
    });

    const result = await runLogStandalone({
      exec: mockExec,
      category: "maintenance",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.shortHash).toBe("a1b2c3d");
  });

  it("passes --since, --author, and --limit flags to git", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({
      exec: mockExec,
      since: "2026-03-01",
      author: "andrew",
      limit: 10,
    });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--since=2026-03-01",
      "--author=andrew",
      "-n", "10",
    ]));
  });

  it("applies default limit of 50 when no limit or all flag specified", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "50",
    ]));
  });

  it("--all flag bypasses the default limit", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, all: true });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).not.toContain("-n");
  });

  it("explicit --limit overrides the default", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, limit: 5 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "5",
    ]));
  });

  it("clamps --limit 0 to minimum 1", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, limit: 0 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "1",
    ]));
  });

  it("clamps NaN --limit to default", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, limit: NaN });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "50",
    ]));
  });

  it("clamps negative --limit to minimum 1", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, limit: -5 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "1",
    ]));
  });

  it("rejects --since with empty/whitespace value", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await expect(
      runLogStandalone({ exec: mockExec, since: "  " }),
    ).rejects.toThrow(/invalid.*--since/i);

    expect(mockExec).not.toHaveBeenCalled();
  });

  it("accepts --since with relative date words", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, since: "yesterday" });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--since=yesterday",
    ]));
  });

  it("skips git-level limit when --category is set", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, category: "maintenance", limit: 10 });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).not.toContain("-n");
  });

  it("applies limit after --category client-side filter", async () => {
    // 5 commits, 3 match the category, limit is 2 — should return 2
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({ hash: "a1", subject: "fix(a): one", body: "Context: standalone (maintenance)" }),
        fakeCommit({ hash: "b2", subject: "fix(b): two", body: "Context: standalone (documentation)" }),
        fakeCommit({ hash: "c3", subject: "fix(c): three", body: "Context: standalone (maintenance)" }),
        fakeCommit({ hash: "d4", subject: "fix(d): four", body: "Context: standalone (documentation)" }),
        fakeCommit({ hash: "e5", subject: "fix(e): five", body: "Context: standalone (maintenance)" }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec, category: "maintenance", limit: 2 });

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.shortHash).toBe("a1");
    expect(result.entries[1]?.shortHash).toBe("c3");
  });

  it("handles commit body containing literal --ARC-RECORD-- text", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "a1b2c3d",
          subject: "fix(log): update separator",
          body: "Changed --ARC-RECORD-- to null byte\n\nContext: standalone (refactor)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.shortHash).toBe("a1b2c3d");
  });

  it("uses null byte separator in git format string", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    const formatArg = args.find((a) => a.startsWith("--format="));
    expect(formatArg).toContain("%x00");
    expect(formatArg).not.toContain("ARC-RECORD");
  });

  it("parses breaking change ! subject without scope", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "b1c2d3e",
          subject: "feat!: drop legacy API",
          body: "Context: standalone (refactor)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: "feat",
      scope: "",
      description: "drop legacy API",
    });
  });

  it("parses breaking change ! subject with scope", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "c2d3e4f",
          subject: "feat(api)!: remove v1 endpoints",
          body: "Context: standalone (refactor)",
        }),
      ),
    });

    const result = await runLogStandalone({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: "feat",
      scope: "api",
      description: "remove v1 endpoints",
    });
  });

  it("accepts --since with relative date containing digits", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec, since: "2 weeks ago" });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--since=2 weeks ago",
    ]));
  });

  it("passes --basic-regexp flag to git", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogStandalone({ exec: mockExec });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--basic-regexp",
    ]));
  });
});

describe("buildLogStandaloneOutput", () => {
  it("formats entries with scope and context line", () => {
    const output = buildLogStandaloneOutput({
      entries: [
        {
          shortHash: "a1b2c3d",
          date: "2026-03-15",
          type: "fix",
          scope: "auth",
          description: "patch token refresh",
          contextLine: "Context: standalone (maintenance)",
        },
      ],
    });

    expect(output).toContain("a1b2c3d");
    expect(output).toContain("2026-03-15");
    expect(output).toContain("fix(auth): patch token refresh");
    expect(output).toContain("Context: standalone (maintenance)");
  });

  it("formats entries without scope", () => {
    const output = buildLogStandaloneOutput({
      entries: [
        {
          shortHash: "x1y2z3a",
          date: "2026-03-16",
          type: "chore",
          scope: "",
          description: "cleanup config",
          contextLine: "Context: standalone (maintenance)",
        },
      ],
    });

    expect(output).toContain("chore: cleanup config");
    expect(output).not.toContain("chore()");
  });

  it("returns empty message when no entries", () => {
    const output = buildLogStandaloneOutput({ entries: [] });

    expect(output).toContain("No standalone commits found");
  });
});
