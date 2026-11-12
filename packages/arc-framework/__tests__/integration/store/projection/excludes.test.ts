/** The projection's exclude list, written to a real clone, keeps its roots out of a check's worktree capture. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import { ensureGitExcludePatterns } from "../../../../src/lib/git/exclude.js";
import { nodeWorktreeMarkerIgnoreFs } from "../../../../src/lib/git/worktree-marker.js";
import { createWorktreeSnapshot } from "../../../../src/lib/checks/tree.js";
import { projectionExcludePatterns } from "../../../../src/lib/store/projection/excludes.js";

const git = createExecaGitExec();
const repositories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(repositories.splice(0)); });

const projected = [
  ".arc/active/meta-a.md",
  ".arc/backlog/planned/b/meta-b.md",
  ".arc/completed/2026-Q4/001_c/meta-c.md",
  ".arc/system/.local/projection/aside",
];

async function capturedPaths(cwd: string): Promise<string[]> {
  const snapshot = await createWorktreeSnapshot(git, cwd);
  try {
    const { stdout } = await git("git", ["ls-tree", "-r", "--name-only", snapshot.tree], { cwd });
    return stdout.split("\n").filter((line) => line.length > 0).sort();
  } finally {
    await snapshot.remove();
  }
}

it("stages nothing under a shared root or the machine-local folder once the exclude list is written", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-projection-excludes-" });
  repositories.push(cwd);
  await writeFile(join(cwd, "README.md"), "base\n");
  await git("git", ["add", "-A"], { cwd });
  await git("git", ["commit", "-m", "base"], { cwd });
  for (const path of [...projected, ".arc/system/workflows/w.md"]) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), "untracked\n");
  }
  expect(await capturedPaths(cwd)).toEqual([...projected, ".arc/system/workflows/w.md", "README.md"].sort());

  expect(await ensureGitExcludePatterns(cwd, projectionExcludePatterns(), git, nodeWorktreeMarkerIgnoreFs))
    .toMatchObject({ ok: true });
  expect(await capturedPaths(cwd)).toEqual([".arc/system/workflows/w.md", "README.md"]);
});
