/** Exact ordinary-Errand pause proof over a real local branch and bare remote. */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { provePauseHead } from "../../src/lib/errand/index.js";
import {
  addBareRemote,
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
  makeCommit,
  makeGitExec,
} from "../helpers/integration.js";

describe("ordinary Errand pause-head proof", () => {
  let dir: string;
  let remoteDir: string;

  beforeEach(async () => {
    dir = await createTempRepo();
    await makeCommit(dir, "init");
    remoteDir = await addBareRemote(dir);
    await execFileAsync("git", ["checkout", "-b", "chore/fix-output"], { cwd: dir });
  });

  afterEach(async () => {
    await Promise.all([dir, remoteDir].map(cleanupTempDir));
  });

  it("proves the exact terminal head only after the remote branch contains it", async () => {
    const firstHead = await makeCommit(dir, "first errand commit");
    await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd: dir });

    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead: firstHead,
    })).resolves.toMatchObject({
      kind: "proven",
      evidence: { terminalHead: firstHead, remoteBranchTip: firstHead, savedHeadIsAncestor: true },
    });

    const unpushedHead = await makeCommit(dir, "unpushed errand commit");
    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead: unpushedHead,
    })).resolves.toMatchObject({ kind: "refused" });

    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead: firstHead,
    })).resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining("terminal branch head") });

    await execFileAsync("git", ["push", "origin", "HEAD"], { cwd: dir });
    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead: unpushedHead,
    })).resolves.toMatchObject({ kind: "proven" });

    const { stdout: tree } = await execFileAsync("git", ["show", "-s", "--format=%T", unpushedHead], { cwd: dir });
    const { stdout: remoteAhead } = await execFileAsync("git", [
      "-c", "user.name=Remote Test", "-c", "user.email=remote@test.com",
      `--git-dir=${remoteDir}`,
      "commit-tree", tree.trim(), "-p", unpushedHead, "-m", "remote branch ahead",
    ]);
    const remoteAheadHead = remoteAhead.trim();
    await execFileAsync(
      "git",
      [`--git-dir=${remoteDir}`, "update-ref", "refs/heads/chore/fix-output", remoteAheadHead],
    );
    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead: unpushedHead,
    })).resolves.toMatchObject({
      kind: "proven",
      evidence: { terminalHead: unpushedHead, remoteBranchTip: remoteAheadHead },
    });

    const { stdout: temporaryRefs } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/errand-pause"],
      { cwd: dir },
    );
    expect(temporaryRefs).toBe("");
  });

  it("refuses a missing remote branch without leaving proof refs", async () => {
    const savedHead = await makeCommit(dir, "local only errand commit");
    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output",
      savedHead,
    })).resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining("does not exist") });

    const { stdout } = await execFileAsync(
      "git",
      ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/errand-pause"],
      { cwd: dir },
    );
    expect(stdout).toBe("");
  });

  it("refuses a branch value that could alter fetch refspec parsing", async () => {
    const savedHead = await makeCommit(dir, "local errand commit");
    await expect(provePauseHead(makeGitExec(dir), {
      remote: "origin",
      branch: "chore/fix-output:refs/heads/main",
      savedHead,
    })).resolves.toMatchObject({ kind: "refused", reason: expect.stringContaining("valid Git branch") });
  });
});
