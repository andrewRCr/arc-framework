/**
 * Integration tests for the log command (arc log standalone).
 *
 * Creates a real git repo with commits containing various context footers,
 * then verifies runLogStandalone correctly searches and parses the history.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createTempRepo,
  cleanupTempDir,
  makeGitExec,
  makeCommit,
} from "../helpers/integration.js";
import { runLogStandalone } from "../../src/commands/log.js";
import type { GitExec } from "../../src/lib/git/index.js";

let tempDir: string;
let exec: GitExec;

describe("arc log standalone integration", () => {
  beforeEach(async () => {
    tempDir = await createTempRepo("arc-log-test-");
    exec = makeGitExec(tempDir);

    // Create commits with various context footers
    await makeCommit(tempDir, [
      "fix(auth): patch token refresh",
      "",
      "- Fixed edge case in refresh flow",
      "",
      "Context: standalone (maintenance)",
    ].join("\n"));

    await makeCommit(tempDir, [
      "chore(deps): bump lodash",
      "",
      "Context: standalone (maintenance)",
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
      "Context: standalone (documentation)",
    ].join("\n"));
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("finds commits with standalone context footers", async () => {
    const result = await runLogStandalone({ exec });

    const standaloneEntries = result.entries.filter((e) =>
      e.contextLine.startsWith("Context: standalone ("),
    );
    expect(standaloneEntries.length).toBeGreaterThanOrEqual(3);

    const authFix = standaloneEntries.find((e) => e.description === "patch token refresh");
    expect(authFix).toBeDefined();
    expect(authFix!.type).toBe("fix");
    expect(authFix!.scope).toBe("auth");
  });

  it("excludes work-unit task commits from results", async () => {
    const result = await runLogStandalone({ exec });

    const taskCommit = result.entries.find((e) =>
      e.description === "add user endpoint",
    );
    expect(taskCommit).toBeUndefined();
  });

  it("filters by --category name", async () => {
    const result = await runLogStandalone({ exec, category: "documentation" });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.description).toBe("update session workflow");
  });

  it("respects --limit flag", async () => {
    const result = await runLogStandalone({ exec, limit: 1 });

    // git log returns most recent first; limit=1 gives the latest standalone commit
    expect(result.entries).toHaveLength(1);
  });

  it("returns empty results when no standalone commits exist", async () => {
    // Fresh repo with no standalone commits
    const emptyDir = await createTempRepo("arc-log-empty-");
    try {
      const emptyExec = makeGitExec(emptyDir);

      await makeCommit(emptyDir, "feat: initial commit\n\nContext: tasks-foo.md (Task 1.1)");

      const result = await runLogStandalone({ exec: emptyExec });
      expect(result.entries).toHaveLength(0);
    } finally {
      await cleanupTempDir(emptyDir);
    }
  });
});
