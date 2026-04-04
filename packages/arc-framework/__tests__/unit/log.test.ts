/**
 * Unit tests for the log command (arc log --atomic).
 *
 * @module
 */

import { describe, it, expect, vi } from "vitest";
import type { GitExec } from "../../src/lib/git/index.js";
import { runLogAtomic, buildLogAtomicOutput } from "../../src/commands/log.js";

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

describe("runLogAtomic", () => {
  it("returns entries for commits with companion file context footer", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "a1b2c3d",
          date: "2026-03-15 10:00:00 -0500",
          subject: "fix(auth): patch token refresh",
          body: "- Fixed token refresh edge case\n\nContext: atomic-cli-implementation.md",
        }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      shortHash: "a1b2c3d",
      date: "2026-03-15",
      type: "fix",
      scope: "auth",
      description: "patch token refresh",
      contextLine: "Context: atomic-cli-implementation.md",
    });
  });

  it("returns entries for commits with standalone atomic context footer", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "d4e5f6g",
          date: "2026-03-16 14:30:00 -0500",
          subject: "fix(config): correct yaml parsing",
          body: "- One-off fix\n\nContext: maintenance (atomic / no associated task list)",
        }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      shortHash: "d4e5f6g",
      date: "2026-03-16",
      type: "fix",
      scope: "config",
      description: "correct yaml parsing",
      contextLine: "Context: maintenance (atomic / no associated task list)",
    });
  });

  it("includes non-atomic commits if git returns them (filtering is git-level)", async () => {
    // Git's --grep filters for atomic context footers. If a non-atomic commit
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

    const result = await runLogAtomic({ exec: mockExec });

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

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(0);
  });

  it("returns empty entries when no commits match", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(0);
  });

  it("filters by --work-unit name", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({
          hash: "a1b2c3d",
          subject: "fix(auth): patch token refresh",
          body: "Context: atomic-cli-implementation.md",
        }),
        fakeCommit({
          hash: "e5f6g7h",
          subject: "docs(arc): update readme",
          body: "Context: atomic-docs-update.md",
        }),
      ),
    });

    const result = await runLogAtomic({
      exec: mockExec,
      workUnit: "cli-implementation",
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.shortHash).toBe("a1b2c3d");
  });

  it("passes --since, --author, and --limit flags to git", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({
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

    await runLogAtomic({ exec: mockExec });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "50",
    ]));
  });

  it("--all flag bypasses the default limit", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, all: true });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).not.toContain("-n");
  });

  it("explicit --limit overrides the default", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, limit: 5 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "5",
    ]));
  });

  it("clamps --limit 0 to minimum 1", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, limit: 0 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "1",
    ]));
  });

  it("clamps NaN --limit to default", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, limit: NaN });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "50",
    ]));
  });

  it("clamps negative --limit to minimum 1", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, limit: -5 });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "-n", "1",
    ]));
  });

  it("rejects --since with empty/whitespace value", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await expect(
      runLogAtomic({ exec: mockExec, since: "  " }),
    ).rejects.toThrow(/invalid.*--since/i);

    expect(mockExec).not.toHaveBeenCalled();
  });

  it("accepts --since with relative date words", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, since: "yesterday" });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--since=yesterday",
    ]));
  });

  it("skips git-level limit when --work-unit is set", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, workUnit: "cli", limit: 10 });

    const args = (mockExec as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).not.toContain("-n");
  });

  it("applies limit after --work-unit client-side filter", async () => {
    // 5 commits, 3 match work unit, limit is 2 — should return 2
    const mockExec: GitExec = vi.fn().mockResolvedValue({
      stdout: buildGitOutput(
        fakeCommit({ hash: "a1", subject: "fix(a): one", body: "Context: atomic-cli.md" }),
        fakeCommit({ hash: "b2", subject: "fix(b): two", body: "Context: atomic-other.md" }),
        fakeCommit({ hash: "c3", subject: "fix(c): three", body: "Context: atomic-cli.md" }),
        fakeCommit({ hash: "d4", subject: "fix(d): four", body: "Context: atomic-other.md" }),
        fakeCommit({ hash: "e5", subject: "fix(e): five", body: "Context: atomic-cli.md" }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec, workUnit: "cli", limit: 2 });

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
          body: "Changed --ARC-RECORD-- to null byte\n\nContext: atomic-cli.md",
        }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.shortHash).toBe("a1b2c3d");
  });

  it("uses null byte separator in git format string", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec });

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
          body: "Context: atomic-breaking.md",
        }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec });

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
          body: "Context: atomic-breaking.md",
        }),
      ),
    });

    const result = await runLogAtomic({ exec: mockExec });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      type: "feat",
      scope: "api",
      description: "remove v1 endpoints",
    });
  });

  it("accepts --since with relative date containing digits", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec, since: "2 weeks ago" });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--since=2 weeks ago",
    ]));
  });

  it("passes --basic-regexp flag to git", async () => {
    const mockExec: GitExec = vi.fn().mockResolvedValue({ stdout: "" });

    await runLogAtomic({ exec: mockExec });

    expect(mockExec).toHaveBeenCalledWith("git", expect.arrayContaining([
      "--basic-regexp",
    ]));
  });
});

describe("buildLogAtomicOutput", () => {
  it("formats entries with scope and context line", () => {
    const output = buildLogAtomicOutput({
      entries: [
        {
          shortHash: "a1b2c3d",
          date: "2026-03-15",
          type: "fix",
          scope: "auth",
          description: "patch token refresh",
          contextLine: "Context: atomic-cli-implementation.md",
        },
      ],
    });

    expect(output).toContain("a1b2c3d");
    expect(output).toContain("2026-03-15");
    expect(output).toContain("fix(auth): patch token refresh");
    expect(output).toContain("Context: atomic-cli-implementation.md");
  });

  it("formats entries without scope", () => {
    const output = buildLogAtomicOutput({
      entries: [
        {
          shortHash: "x1y2z3a",
          date: "2026-03-16",
          type: "chore",
          scope: "",
          description: "cleanup config",
          contextLine: "Context: maintenance (atomic / no associated task list)",
        },
      ],
    });

    expect(output).toContain("chore: cleanup config");
    expect(output).not.toContain("chore()");
  });

  it("returns empty message when no entries", () => {
    const output = buildLogAtomicOutput({ entries: [] });

    expect(output).toContain("No atomic task commits found");
  });
});
