/** Pre-commit active-meta Current Workflow validation over the staged Git blob. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

const execFileAsync = promisify(execFile);
const tsxLoader = import.meta.resolve("tsx");
const validatorPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/scripts/validate-meta-spec.ts",
);
const metaPath = ".arc/active/meta-example.md";

function meta(currentWorkflow: string): string {
  return makeMetaFixture("Example", {
    design: ["spec-example.md"],
    taskList: "tasks-example.md",
    currentWorkflow: currentWorkflow === "[none]" ? null : currentWorkflow.replaceAll("`", ""),
  });
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

describe("pre-commit Current Workflow validation", () => {
  const fixtures: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((root) => cleanupTempDir(root)));
  });

  it("rejects an inconsistent staged meta even when the worktree was corrected afterward", async () => {
    const root = await createTempRepo("arc-current-workflow-staged-");
    fixtures.push(root);
    const fullPath = join(root, metaPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, meta("`generate-tasks`"));
    await git(root, ["add", metaPath]);
    await writeFile(fullPath, meta("[none]"));

    await expect(execFileAsync(
      process.execPath,
      ["--import", tsxLoader, validatorPath, metaPath],
      { cwd: root },
    )).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Current Workflow"),
    });
  });
});
