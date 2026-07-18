/**
 * End-to-end tests for the non-TTY `arc view` contract.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  runArcNoTty,
  runArcWithStdin,
} from "./helpers.js";

describe("arc view", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await createTempRepo("arc-view-e2e-");
    await mkdir(join(cwd, ".arc", "active"), { recursive: true });
    await writeFile(join(cwd, ".arc", "active", "meta-feature.md"), [
      "# Metadata: feature",
      "",
      "- **State:** Active",
      "- **Branch:** main",
      "- **Task List:** tasks-feature.md",
      "- **Next Action:** Continue implementation",
      "",
    ].join("\n"));
    await writeFile(join(cwd, ".arc", "active", "tasks-feature.md"), [
      "# Task List: feature",
      "",
      "- [ ] First task",
      "",
    ].join("\n"));
  });

  afterEach(async () => cleanupTempDir(cwd));

  it("writes the plain artifact body with no ANSI decoration", async () => {
    const result = await runArcNoTty(["view"], cwd);

    expect(result).toEqual({
      stdout: "# Task List: feature\n\n- [ ] First task\n",
      stderr: "",
      exitCode: 0,
    });
    expect(result.stdout).not.toContain("\u001b[");
  });

  it("does not hang when stdin is piped", async () => {
    const result = await runArcWithStdin(["view", "tasks"], cwd, "ignored input\n", {
      timeout: 5_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Task List: feature");
  });

  it("teaches valid kinds on an unknown-kind error", async () => {
    const result = await runArcNoTty(["view", "bogus"], cwd);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown view kind \"bogus\"");
    expect(result.stderr).toContain("tasks, spec, draft, meta");
  });
});
