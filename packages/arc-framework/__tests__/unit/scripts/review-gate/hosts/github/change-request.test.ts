/** GitHub change-request adapter boundary behavior. */

import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import { createGhChangeRequestResolutionPort } from "../../../../../../src/scripts/review-gate/hosts/github/change-request.js";

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
    const exec = vi.fn<GitExec>(async (_command, args) => {
      if (args[0] === "check-ref-format") return { stdout: "" };
      if (args[0] === "rev-parse") return { stdout: `${head}\n` };
      if (args[0] === "ls-remote") return { stdout: `${head}\trefs/heads/feat/example\n` };
      throw new Error(`unexpected invocation: ${args.join(" ")}`);
    });
    const port = createGhChangeRequestResolutionPort(exec, "/repo");

    await expect(port.readHeadRef("feat/example")).resolves.toEqual({ local: head, remote: head });
    expect(exec.mock.calls).toEqual([
      ["git", ["check-ref-format", "--branch", "feat/example"], { cwd: "/repo" }],
      ["git", ["rev-parse", "--verify", "refs/heads/feat/example^{commit}"], { cwd: "/repo" }],
      ["git", ["ls-remote", "--heads", "origin", "refs/heads/feat/example"], { cwd: "/repo" }],
    ]);
  });

  it("represents an absent local and remote branch without inventing an identity", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "check-ref-format") return { stdout: "" };
      if (args[0] === "rev-parse") throw new Error("missing local branch");
      if (args[0] === "ls-remote") return { stdout: "" };
      throw new Error(`unexpected invocation: ${args.join(" ")}`);
    };

    await expect(createGhChangeRequestResolutionPort(exec, "/repo").readHeadRef("feat/example"))
      .resolves.toEqual({ local: null, remote: null });
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
