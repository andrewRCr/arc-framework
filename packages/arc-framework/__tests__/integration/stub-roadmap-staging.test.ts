/** A stub's generated ROADMAP must observe the meta staged by that same transition. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { buildExecutorContext } from "../../src/lib/work-unit/executor-context.js";
import { runStub } from "../../src/lib/work-unit/verbs/stub.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const execFileAsync = promisify(execFile);

describe("stub ROADMAP staging", () => {
  let repo: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-stub-roadmap-");
  });

  afterEach(async () => {
    await cleanupTempDir(repo);
  });

  it("stages the new planned meta and its exact ROADMAP row in one invocation", async () => {
    const io = { ...createUserIOContext(), exec: makeGitExec(repo) };
    const executor = buildExecutorContext({
      cwd: repo,
      io,
      identity: null,
      teamMode: false,
      baseBranch: "main",
      internalTemplateDir: getInternalTemplatePath(),
    });

    const result = await runStub(
      { executor, fs: { mkdir, writeFile } },
      { name: "created-stub", commitment: "planned", priority: "P1", owner: "test-user" },
    );

    expect(result.status).toBe("scaffolded");
    if (result.status !== "scaffolded") return;
    const { stdout: stagedMeta } = await execFileAsync("git", ["show", `:${result.metaPath}`], { cwd: repo });
    const { stdout: stagedRoadmap } = await execFileAsync("git", ["show", ":.arc/backlog/ROADMAP.md"], {
      cwd: repo,
    });

    expect(stagedMeta).toContain("# Metadata: created-stub");
    expect(stagedRoadmap).toMatch(/^\| created-stub\s+\| P1\s+\| test-user\s+\|/m);
    const { stdout: unstaged } = await execFileAsync("git", ["diff", "--name-only"], { cwd: repo });
    expect(unstaged.trim()).toBe("");
  });
});
