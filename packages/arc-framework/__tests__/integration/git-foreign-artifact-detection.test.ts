/** Real-Git overlap detection while a linked worktree absorbs incoming base changes. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { renderMetaProjectionFile } from "../../src/lib/active/meta-reader.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { detectForeignArtifactOverlap } from "../../src/lib/git/foreign-artifact-detection.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

let root: string;
afterEach(async () => { if (root) await cleanupTempDir(root); });

async function write(cwd: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(cwd, path)), { recursive: true });
  await writeFile(join(cwd, path), content);
}

async function setupFixture() {
  root = await createTempRepo("arc-overlap-base-merge-");
  const exec = makeGitExec(root);
  const foreign = join(root, "foreign-worktree");
  await write(root, "docs/incoming.md", "old base\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "initial base"]);
  await exec("git", ["worktree", "add", "-b", "feat/foreign", foreign]);
  await write(foreign, "docs/own.md", "work unit change\n");
  const metaFilePath = join(foreign, ".arc/active/meta-foreign.md");
  await write(foreign, ".arc/active/meta-foreign.md", renderMetaProjectionFile("foreign", {
    State: "Active", Owner: "andrew", Branch: "feat/foreign", Class: "Light", Priority: "P3",
  }));
  await exec("git", ["add", "."], { cwd: foreign });
  await exec("git", ["commit", "-m", "work unit changes"], { cwd: foreign });
  await write(root, "docs/incoming.md", "new base\n");
  await exec("git", ["add", "docs/incoming.md"]);
  await exec("git", ["commit", "-m", "advance base"]);
  const options = {
    exec, roster: { entries: [{ branch: "feat/foreign", worktreePath: foreign, metaFilePath }], warnings: [] },
    targetPaths: ["docs/incoming.md", "docs/own.md"], baseBranch: "main", originatingWorktreePath: root,
  };
  return { exec, foreign, options };
}

it("keeps a paused base merge indeterminate and resumes accurate overlap after commit", async () => {
  const { exec, foreign, options } = await setupFixture();
  await exec("git", ["merge", "--no-ff", "--no-commit", "main"], { cwd: foreign });
  expect((await exec("git", ["status", "--porcelain", "--", "docs/incoming.md"], { cwd: foreign })).stdout)
    .toContain("M  docs/incoming.md");

  const merging = await detectForeignArtifactOverlap(options);
  expect(merging.overlaps).toEqual([]);
  expect(merging.indeterminate).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"], reason: "merge-in-progress",
  }]);

  await exec("git", ["commit", "-m", "merge base"], { cwd: foreign });
  const settled = await detectForeignArtifactOverlap(options);
  expect(settled.indeterminate).toBeUndefined();
  expect(settled.overlaps).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"],
  }]);
  await write(foreign, "docs/incoming.md", "own uncommitted edit\n");
  const edited = await detectForeignArtifactOverlap(options);
  expect(edited.overlaps).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/incoming.md", "docs/own.md"],
  }]);
});


it("keeps a merge that starts and commits during status reads indeterminate", async () => {
  const { exec, foreign, options } = await setupFixture();
  let statusReads = 0;
  let mergeReads = 0;
  const probingExec: GitExec = async (cmd, args, controls) => {
    if (controls?.cwd === foreign && args[0] === "status") {
      statusReads += 1;
      if (statusReads === 1) {
        await exec("git", ["merge", "--no-ff", "--no-commit", "main"], { cwd: foreign });
      }
    }
    if (controls?.cwd === foreign && args.join(" ") === "rev-parse --verify --quiet MERGE_HEAD") {
      mergeReads += 1;
      if (mergeReads === 2) {
        await exec("git", ["commit", "-m", "complete merge during probe"], { cwd: foreign });
      }
    }
    return exec(cmd, args, controls);
  };

  const moving = await detectForeignArtifactOverlap({ ...options, exec: probingExec });
  expect(moving.overlaps).toEqual([]);
  expect(moving.indeterminate).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"],
    reason: "uncommitted-probe-disagreement",
  }]);
  const settled = await detectForeignArtifactOverlap(options);
  expect(settled.indeterminate).toBeUndefined();
  expect(settled.overlaps).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"],
  }]);
});


it("keeps a merge aborted after both status reads indeterminate and resumes accurate overlap", async () => {
  const { exec, foreign, options } = await setupFixture();
  const headBefore = (await exec("git", ["rev-parse", "HEAD"], { cwd: foreign })).stdout;
  let statusReads = 0;
  const probingExec: GitExec = async (cmd, args, controls) => {
    if (controls?.cwd === foreign && args[0] === "status") {
      statusReads += 1;
      if (statusReads === 1) {
        await exec("git", ["merge", "--no-ff", "--no-commit", "main"], { cwd: foreign });
      }
      const result = await exec(cmd, args, controls);
      if (statusReads === 2) await exec("git", ["merge", "--abort"], { cwd: foreign });
      return result;
    }
    return exec(cmd, args, controls);
  };

  const moving = await detectForeignArtifactOverlap({ ...options, exec: probingExec });
  expect(moving.overlaps).toEqual([]);
  expect(moving.indeterminate).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"], reason: "merge-in-progress",
  }]);
  await exec("git", ["merge", "--abort"], { cwd: foreign });
  expect((await exec("git", ["rev-parse", "HEAD"], { cwd: foreign })).stdout).toBe(headBefore);
  const settled = await detectForeignArtifactOverlap(options);
  expect(settled.indeterminate).toBeUndefined();
  expect(settled.overlaps).toEqual([{
    branch: "feat/foreign", worktreePath: foreign, matchedPaths: ["docs/own.md"],
  }]);
});
