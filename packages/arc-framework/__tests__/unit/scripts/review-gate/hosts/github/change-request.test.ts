/** GitHub change-request adapter boundary behavior. */

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import { createGhChangeRequestResolutionPort } from "../../../../../../src/scripts/review-gate/hosts/github/change-request.js";
import { scriptGitExec } from "../../../../../helpers/git-exec-fake.js";

const head = "a".repeat(40);
const candidate = {
  number: 42,
  url: "https://github.com/owner/repo/pull/42",
  state: "OPEN",
  baseRefName: "main",
  headRefName: "feat/example",
  headRefOid: head,
};

describe("GitHub change-request port", () => {
  it.each([
    "https://github.com/owner/repo.git",
    "ssh://git@github.com/owner/repo.git",
    "git@github.com:owner/repo.git",
  ])("resolves supported origin %s", async (origin) => {
    const exec = vi.fn<GitExec>(async () => ({ stdout: `${origin}\n` }));
    const port = createGhChangeRequestResolutionPort(exec, "/repo");

    await expect(port.resolveRepository()).resolves.toBe("owner/repo");
    expect(exec).toHaveBeenCalledWith("git", ["config", "--get", "remote.origin.url"], { cwd: "/repo" });
  });

  it("reads qualified local and remote branch identities with exact argv", async () => {
    const { exec, calls } = scriptGitExec([
      { match: ["check-ref-format", "--branch", "feat/example"], responses: [{ stdout: "" }] },
      { match: ["rev-parse", "--verify", "refs/heads/feat/example^{commit}"],
        responses: [{ stdout: `${head}\n` }] },
      { match: ["ls-remote", "--heads", "origin", "refs/heads/feat/example"],
        responses: [{ stdout: `${head}\trefs/heads/feat/example\n` }] },
    ]);
    const port = createGhChangeRequestResolutionPort(exec, "/repo");

    await expect(port.readHeadRef("feat/example")).resolves.toEqual({ local: head, remote: head });
    expect(calls.map(({ command, args, options }) => [command, args, options])).toEqual([
      ["git", ["check-ref-format", "--branch", "feat/example"], { cwd: "/repo" }],
      ["git", ["rev-parse", "--verify", "refs/heads/feat/example^{commit}"], { cwd: "/repo" }],
      ["git", ["ls-remote", "--heads", "origin", "refs/heads/feat/example"], { cwd: "/repo" }],
    ]);
  });

  it("resolves repository and remote heads through the selected non-origin remote", async () => {
    const { exec, calls } = scriptGitExec([
      { match: ["config", "--get", "remote.upstream.url"],
        responses: [{ stdout: "git@github.com:owner/repo.git\n" }] },
      { match: ["check-ref-format", "--branch", "feat/example"], responses: [{ stdout: "" }] },
      { match: ["rev-parse", "--verify", "refs/heads/feat/example^{commit}"],
        responses: [{ failure: { exitCode: 1, stderr: "missing local branch" } }] },
      { match: ["ls-remote", "--heads", "upstream", "refs/heads/feat/example"],
        responses: [{ stdout: `${head}\trefs/heads/feat/example\n` }] },
    ]);
    const port = createGhChangeRequestResolutionPort(exec, "/repo", "upstream");

    await expect(port.resolveRepository()).resolves.toBe("owner/repo");
    await expect(port.readHeadRef("feat/example")).resolves.toEqual({ local: null, remote: head });
    expect(calls).toContainEqual({ command: "git", args: ["config", "--get", "remote.upstream.url"], options: { cwd: "/repo" } });
    expect(calls).toContainEqual({
      command: "git", args: ["ls-remote", "--heads", "upstream", "refs/heads/feat/example"],
      options: { cwd: "/repo" },
    });
  });

  it("represents an absent local and remote branch without inventing an identity", async () => {
    const { exec, calls } = scriptGitExec([
      { match: ["check-ref-format", "--branch", "feat/example"], responses: [{ stdout: "" }] },
      { match: ["rev-parse", "--verify", "refs/heads/feat/example^{commit}"],
        responses: [{ failure: { exitCode: 1, stderr: "missing local branch" } }] },
      { match: ["ls-remote", "--heads", "origin", "refs/heads/feat/example"],
        responses: [{ stdout: "" }] },
    ]);

    await expect(createGhChangeRequestResolutionPort(exec, "/repo").readHeadRef("feat/example"))
      .resolves.toEqual({ local: null, remote: null });
    expect(calls.map(({ args }) => args[0])).toEqual(["check-ref-format", "rev-parse", "ls-remote"]);
  });

  it("bounds both host searches and validates their payloads", async () => {
    const exec = vi.fn<GitExec>(async () => ({ stdout: JSON.stringify([candidate]) }));
    const port = createGhChangeRequestResolutionPort(exec, "/repo");

    await expect(port.listByHead("owner/repo", "feat/example")).resolves.toEqual([candidate]);
    await expect(port.searchByHeadSha("owner/repo", head)).resolves.toEqual([candidate]);
    expect(exec.mock.calls).toEqual([
      ["gh", [
        "pr", "list", "--repo", "owner/repo", "--state", "all", "--head", "feat/example",
        "--limit", "100", "--json", "number,url,state,baseRefName,headRefName,headRefOid",
      ], { cwd: "/repo" }],
      ["gh", [
        "pr", "list", "--repo", "owner/repo", "--state", "all", "--search", head,
        "--limit", "100", "--json", "number,url,state,baseRefName,headRefName,headRefOid",
      ], { cwd: "/repo" }],
    ]);
  });

  it("rejects malformed and schema-invalid host payloads", async () => {
    const malformed: GitExec = async () => ({ stdout: "not json" });
    const invalid: GitExec = async () => ({ stdout: JSON.stringify([{ ...candidate, number: "42" }]) });

    await expect(createGhChangeRequestResolutionPort(malformed, "/repo").listByHead("owner/repo", "feat/example"))
      .rejects.toBeInstanceOf(SyntaxError);
    await expect(createGhChangeRequestResolutionPort(invalid, "/repo").searchByHeadSha("owner/repo", head))
      .rejects.toThrow();
  });
});
