/**
 * `arc errand` E2E.
 *
 * Exercises the built CLI end-to-end: a single `arc errand` invocation resolves
 * the primary worktree, composes a managed-entry queue entry, and direct-writes
 * it into `user/{identity}/ERRANDS.md` — creating no branch and no commit. This
 * covers the real path resolution that the unit tests stub.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { runArc, createTempRepo, cleanupTempDir } from "./helpers.js";

const execFileAsync = promisify(execFile);

async function git(args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

describe("arc errand", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await createTempRepo();
    const init = await runArc(["init", "--yes", "--name", "test-project"], tmpDir);
    expect(init.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it("queues an entry into the primary worktree's ERRANDS.md without branching or committing", async () => {
    const result = await runArc(
      [
        "errand", "queue",
        "--slug", "drain-inbox",
        "--goal", "Flush the deferred USER-INBOX captures",
        "--pointers", "user/test-user/USER-INBOX.md",
      ],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);

    const errands = await readFile(
      join(tmpDir, ".arc", "user", "test-user", "ERRANDS.md"),
      "utf-8",
    );
    expect(errands).toContain("### `[ ]` **drain-inbox**");
    expect(errands).toContain("- _Goal:_ Flush the deferred USER-INBOX captures");
    expect(errands).toContain("- _Pointers:_ user/test-user/USER-INBOX.md");
    expect(errands).toContain("- _Branch:_ `chore/drain-inbox`");
    expect(errands).toMatch(/- _Created:_ \d{4}-\d{2}-\d{2}/);

    // Zero git mutation: no chore branch was cut, nothing was committed.
    const branches = await git(["branch", "--list", "chore/*"], tmpDir);
    expect(branches).toBe("");
  });

  it("refuses a slug that is not branch-safe", async () => {
    const result = await runArc(
      ["errand", "queue", "--slug", "Not A Slug", "--goal", "g", "--pointers", "p"],
      tmpDir,
    );

    expect(result.exitCode).toBe(1);
  });

  it("reports no overlap as JSON when no other work unit is in flight", async () => {
    const result = await runArc(
      ["errand", "check", "--target", "docs/x.md", "--json"],
      tmpDir,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({ overlaps: [] });
  });
});
