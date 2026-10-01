/** Immutable Git-tree filesystem boundary behavior. */

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import { createGitTreeReadFs } from "../../../../../../src/scripts/review-gate/hosts/local/git-tree-fs.js";
import { evaluateReviewReadiness } from "../../../../../../src/scripts/review-gate/readiness.js";
import { makeGitProcessError } from "../../../../../helpers/git-exec-fake.js";

const revision = "a".repeat(40);
const tree = "b".repeat(40);

const errandRequest = {
  schemaVersion: 1,
  treeRoot: "/repo",
  target: { repository: "owner/repo", pullRequest: 42, headSha: revision },
  pullRequest: {
    repository: "owner/repo",
    number: 42,
    state: "open",
    headBranch: "chore/example",
    headSha: revision,
  },
  vehicle: { kind: "errand", slug: "example" },
} as const;

describe("Git-tree filesystem", () => {
  it("resolves the exact root tree before reporting a directory", async () => {
    const exec = vi.fn<GitExec>(async () => ({ stdout: `${tree}\n` }));
    const fs = createGitTreeReadFs({ cwd: "/repo", revision, exec });

    await expect(fs.stat("/repo")).resolves.toMatchObject({});
    expect((await fs.stat("/repo")).isDirectory()).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--verify", `${revision}^{tree}`],
      { cwd: "/repo", objectAccess: "local-only" },
    );
  });

  it("maps an absent or malformed root tree to ENOENT", async () => {
    const absent: GitExec = async () => { throw makeGitProcessError({ command: "git", args: ["rev-parse", "--verify", `${revision}^{tree}`],
      exitCode: 128, stderr: "bad object" }); };
    const malformed: GitExec = async () => ({ stdout: "HEAD\n" });

    await expect(createGitTreeReadFs({ cwd: "/repo", revision, exec: absent }).stat("/repo"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(createGitTreeReadFs({ cwd: "/repo", revision, exec: malformed }).stat("/repo"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["HEAD", "abc1234", "A".repeat(40)])("rejects mutable or non-canonical revision %s", (value) => {
    const exec: GitExec = async () => ({ stdout: tree });
    expect(() => createGitTreeReadFs({ cwd: "/repo", revision: value, exec }))
      .toThrow("full immutable object ID");
  });

  it("rejects paths outside the projected repository", async () => {
    const exec: GitExec = async () => ({ stdout: tree });
    const fs = createGitTreeReadFs({ cwd: "/repo", revision, exec });

    await expect(fs.stat("/other/file")).rejects.toThrow("escaped the repository root");
    await expect(fs.readFile("/other/file")).rejects.toThrow("escaped the repository root");
    await expect(fs.readdir("/other")).rejects.toThrow("escaped the repository root");
  });

  it("makes root-only readiness depend on the exact revision", async () => {
    const validExec = vi.fn<GitExec>(async () => ({ stdout: tree }));
    const missingExec: GitExec = async (command, args) => {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "unknown revision" });
    };

    await expect(evaluateReviewReadiness(errandRequest, {
      fs: createGitTreeReadFs({ cwd: "/repo", revision, exec: validExec }),
    })).resolves.toMatchObject({ state: "ready" });
    await expect(evaluateReviewReadiness(errandRequest, {
      fs: createGitTreeReadFs({ cwd: "/repo", revision, exec: missingExec }),
    })).resolves.toMatchObject({ state: "invalid", diagnostics: [{ code: "missing-root" }] });
    expect(validExec).toHaveBeenCalledTimes(1);
  });
});
