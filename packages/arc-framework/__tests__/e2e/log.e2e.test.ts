/**
 * Log command E2E tests.
 *
 * Exercises `arc log atomic` with matching commits, filter options
 * (--since, --author, --limit, --work-unit), and empty result handling.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

/** Run a git command in a given directory. */
async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/**
 * Create a commit with a conventional commit message and Context footer.
 * Uses `--allow-empty` for simplicity — the log command only inspects messages.
 */
async function commitWithContext(
  cwd: string,
  subject: string,
  context: string,
): Promise<void> {
  await git(
    ["commit", "--allow-empty", "-m", `${subject}\n\n${context}`],
    cwd,
  );
}

describe("log atomic", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    // Need at least one real commit for git log to work
    await writeFile(join(tmpDir, "README.md"), "# Test\n");
    await git(["add", "."], tmpDir);
    await git(["commit", "-m", "initial commit"], tmpDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("shows commits with atomic context footers", async () => {
    // Create commits with atomic context patterns
    await commitWithContext(
      tmpDir,
      "fix(auth): patch session timeout",
      "Context: atomic-cli-implementation.md",
    );
    await commitWithContext(
      tmpDir,
      "docs(arc): update quick reference",
      "Context: maintenance (atomic / no associated task list)",
    );

    const result = await runArc(["log", "atomic"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("patch session timeout");
    expect(output).toContain("update quick reference");
  });

  it("does not show commits without atomic context", async () => {
    // Regular task commit — not atomic
    await commitWithContext(
      tmpDir,
      "feat(init): add init command",
      "Context: tasks-cli-implementation.md (Task 3.1)",
    );
    // Atomic commit
    await commitWithContext(
      tmpDir,
      "fix(config): correct default path",
      "Context: atomic-cli-implementation.md",
    );

    const result = await runArc(["log", "atomic"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("correct default path");
    expect(output).not.toContain("add init command");
  });

  it("--limit restricts number of results", async () => {
    await commitWithContext(tmpDir, "fix(a): first", "Context: atomic-test.md");
    await commitWithContext(tmpDir, "fix(b): second", "Context: atomic-test.md");
    await commitWithContext(tmpDir, "fix(c): third", "Context: atomic-test.md");

    const result = await runArc(["log", "atomic", "--limit", "2"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    // Most recent two (git log is reverse chronological)
    expect(output).toContain("third");
    expect(output).toContain("second");
    expect(output).not.toContain("first");
  });

  it("--work-unit filters by work unit name", async () => {
    await commitWithContext(
      tmpDir,
      "fix(a): from cli work",
      "Context: atomic-cli-implementation.md",
    );
    await commitWithContext(
      tmpDir,
      "fix(b): from docs work",
      "Context: atomic-docs-update.md",
    );

    const result = await runArc(
      ["log", "atomic", "--work-unit", "cli-implementation"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("from cli work");
    expect(output).not.toContain("from docs work");
  });

  it("--author filters by commit author", async () => {
    // Default author is "Test User" from createTempRepo
    await commitWithContext(tmpDir, "fix(a): by test user", "Context: atomic-test.md");

    const result = await runArc(
      ["log", "atomic", "--author", "Test User"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("by test user");

    // Non-matching author returns nothing
    const empty = await runArc(
      ["log", "atomic", "--author", "Nobody"],
      tmpDir,
    );
    expect(empty.exitCode).toBe(0);
    const emptyOutput = empty.stdout + empty.stderr;
    expect(emptyOutput).toContain("No atomic task commits found");
  });

  it("--since filters by date", async () => {
    await commitWithContext(tmpDir, "fix(a): recent fix", "Context: atomic-test.md");

    // Future date should return nothing
    const empty = await runArc(
      ["log", "atomic", "--since", "2099-01-01"],
      tmpDir,
    );
    expect(empty.exitCode).toBe(0);
    const emptyOutput = empty.stdout + empty.stderr;
    expect(emptyOutput).toContain("No atomic task commits found");

    // Past date should include the commit
    const found = await runArc(
      ["log", "atomic", "--since", "2000-01-01"],
      tmpDir,
    );
    expect(found.exitCode).toBe(0);
    const foundOutput = found.stdout + found.stderr;
    expect(foundOutput).toContain("recent fix");
  });

  it("empty result when no matching commits", async () => {
    // No atomic commits exist — only the initial commit
    const result = await runArc(["log", "atomic"], tmpDir);

    expect(result.exitCode).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain("No atomic task commits found");
  });
});
