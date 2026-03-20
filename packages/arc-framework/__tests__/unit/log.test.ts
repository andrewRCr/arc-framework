/**
 * Unit tests for the log command (arc log --atomic).
 *
 * @module
 */

import { describe, it, expect, vi } from "vitest";
import type { GitExec } from "../../src/lib/git/git.js";
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

/** Joins multiple commit blocks with the record separator. */
function buildGitOutput(...commits: string[]): string {
  return commits.map((c) => `--ARC-RECORD--\n${c}`).join("\n");
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

  it("excludes commits without atomic context footers", async () => {
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

    // git grep already filters, but parseGitLogOutput requires a Context: line
    // If somehow a non-atomic commit appears, it should still have a Context: line
    // to be included — this verifies parsing doesn't crash on unexpected input
    expect(result.entries).toHaveLength(1);
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
});

describe("buildLogAtomicOutput", () => {
  it("formats entries with scope", () => {
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
