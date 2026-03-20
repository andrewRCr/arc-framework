/**
 * Integration tests for the log command (arc log atomic).
 *
 * Creates a real git repo with commits containing various context footers,
 * then verifies runLogAtomic correctly searches and parses the history.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeGitExec,
  makeCommit,
} from "../helpers/integration.js";
import { runLogAtomic } from "../../src/commands/log.js";
import type { GitExec } from "../../src/lib/git/git.js";

let tempDir: string;
let exec: GitExec;

describe("arc log atomic integration", () => {
  beforeEach(async () => {
    tempDir = await createTempRepo("arc-log-test-");
    exec = makeGitExec(tempDir);

    // Create commits with various context footers
    await makeCommit(tempDir, [
      "fix(auth): patch token refresh",
      "",
      "- Fixed edge case in refresh flow",
      "",
      "Context: atomic-cli-implementation.md",
    ].join("\n"));

    await makeCommit(tempDir, [
      "chore(deps): bump lodash",
      "",
      "Context: maintenance (atomic / no associated task list)",
    ].join("\n"));

    await makeCommit(tempDir, [
      "feat(api): add user endpoint",
      "",
      "- New REST endpoint for user CRUD",
      "",
      "Context: tasks-api-implementation.md (Task 3.1)",
    ].join("\n"));

    await makeCommit(tempDir, [
      "docs(arc): update session workflow",
      "",
      "Context: atomic-docs-update.md",
    ].join("\n"));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("finds commits with companion file atomic context footers", async () => {
    const result = await runLogAtomic({ exec });

    const companionEntries = result.entries.filter((e) =>
      e.contextLine.startsWith("Context: atomic-"),
    );
    expect(companionEntries.length).toBeGreaterThanOrEqual(2);

    const authFix = companionEntries.find((e) => e.description === "patch token refresh");
    expect(authFix).toBeDefined();
    expect(authFix!.type).toBe("fix");
    expect(authFix!.scope).toBe("auth");
  });

  it("finds commits with standalone atomic context footers", async () => {
    const result = await runLogAtomic({ exec });

    const standalone = result.entries.find((e) =>
      e.contextLine.includes("atomic / no associated task list"),
    );
    expect(standalone).toBeDefined();
    expect(standalone!.type).toBe("chore");
    expect(standalone!.scope).toBe("deps");
    expect(standalone!.description).toBe("bump lodash");
  });

  it("excludes non-atomic commits from results", async () => {
    const result = await runLogAtomic({ exec });

    const taskCommit = result.entries.find((e) =>
      e.description === "add user endpoint",
    );
    expect(taskCommit).toBeUndefined();
  });

  it("filters by --work-unit name", async () => {
    const result = await runLogAtomic({ exec, workUnit: "docs-update" });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.description).toBe("update session workflow");
  });

  it("respects --limit flag", async () => {
    const result = await runLogAtomic({ exec, limit: 1 });

    // git log returns most recent first; limit=1 gives the latest atomic commit
    expect(result.entries).toHaveLength(1);
  });

  it("returns empty results when no atomic commits exist", async () => {
    // Fresh repo with no atomic commits
    const emptyDir = await createTempRepo("arc-log-empty-");
    const emptyExec = makeGitExec(emptyDir);

    await makeCommit(emptyDir, "feat: initial commit\n\nContext: tasks-foo.md (Task 1.1)");

    const result = await runLogAtomic({ exec: emptyExec });
    expect(result.entries).toHaveLength(0);

    await cleanupTempDir(emptyDir);
  });
});
