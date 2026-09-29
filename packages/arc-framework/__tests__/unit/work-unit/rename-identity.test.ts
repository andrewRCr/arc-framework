import { describe, expect, it } from "vitest";

import { makeGitProcessError } from "../../helpers/git-exec-fake.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  readRemoteBranchOid,
  reconcileRenameLocalBranch,
  reconcileRenameRemoteBranch,
  withRenameStubBranch,
} from "../../../src/lib/work-unit/rename-identity.js";

const OLD_BRANCH = "feat/old-name";
const NEW_BRANCH = "feat/new-name";
const OLD_OID = "1111111111111111111111111111111111111111";
const MOVED_OID = "2222222222222222222222222222222222222222";

function localBranchExec(refs: readonly string[]): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    exec: async (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "for-each-ref" && args[1] === "--format=%(refname)") {
        return { stdout: refs.map((ref) => `refs/heads/${ref}`).join("\n") };
      }
      if (args[0] === "for-each-ref" && args[1] === "--format=%(upstream)") {
        return { stdout: `refs/remotes/origin/${OLD_BRANCH}\n` };
      }
      return { stdout: "" };
    },
  };
}

describe("reconcileRenameLocalBranch", () => {
  it("renames the old local branch and clears its inherited upstream", async () => {
    const { exec, calls } = localBranchExec([OLD_BRANCH]);

    await expect(reconcileRenameLocalBranch({ exec }, {
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
    })).resolves.toEqual({ status: "renamed" });

    expect(calls).toContainEqual(["git", "branch", "-m", OLD_BRANCH, NEW_BRANCH]);
    expect(calls).toContainEqual(["git", "branch", "--unset-upstream", NEW_BRANCH]);
  });

  it("skips an already-renamed local branch", async () => {
    const { exec, calls } = localBranchExec([NEW_BRANCH]);

    await expect(reconcileRenameLocalBranch({ exec }, {
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
    })).resolves.toEqual({ status: "already-renamed" });

    expect(calls.some((call) => call[1] === "branch")).toBe(false);
  });

  it("refuses when neither local branch exists and names both refs", async () => {
    const { exec } = localBranchExec([]);

    await expect(reconcileRenameLocalBranch({ exec }, {
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
    })).rejects.toThrow(new RegExp(`${OLD_BRANCH}.*${NEW_BRANCH}`));
  });
});

describe("rename remote branch leg", () => {
  it("reads the exact old remote head OID", async () => {
    const exec: GitExec = async () => ({ stdout: `${OLD_OID}\trefs/heads/${OLD_BRANCH}\n` });

    await expect(readRemoteBranchOid(exec, "origin", OLD_BRANCH)).resolves.toBe(OLD_OID);
  });

  it("pushes a previously-published branch under the new name and deletes the old head with a lease", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "" };
    };

    await expect(reconcileRenameRemoteBranch({ exec }, {
      remote: "origin",
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
      oldRemoteOid: OLD_OID,
    })).resolves.toEqual({ status: "renamed", oldOid: OLD_OID });

    expect(calls).toEqual([
      ["git", "push", "-u", "origin", NEW_BRANCH],
      [
        "git",
        "push",
        "origin",
        `--force-with-lease=refs/heads/${OLD_BRANCH}:${OLD_OID}`,
        `:refs/heads/${OLD_BRANCH}`,
      ],
    ]);
  });

  it("does not publish a branch that had no old remote head", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "" };
    };

    await expect(reconcileRenameRemoteBranch({ exec }, {
      remote: "origin",
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
      oldRemoteOid: null,
    })).resolves.toEqual({ status: "unpublished" });
    expect(calls).toEqual([]);
  });

  it("treats an already-absent old remote head as complete", async () => {
    const exec: GitExec = async (command, args) => {
      if (args[0] === "push" && args.includes(`:refs/heads/${OLD_BRANCH}`)) {
        throw makeGitProcessError({
          command, args, exitCode: 1,
          stderr: `error: unable to delete '${OLD_BRANCH}': remote ref does not exist`,
        });
      }
      return { stdout: "" };
    };

    await expect(reconcileRenameRemoteBranch({ exec }, {
      remote: "origin",
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
      oldRemoteOid: OLD_OID,
    })).resolves.toEqual({ status: "renamed", oldOid: OLD_OID });
  });

  it("surfaces both OIDs when the old remote head moves after preflight", async () => {
    const exec: GitExec = async (command, args) => {
      if (args[0] === "push" && args.includes(`:refs/heads/${OLD_BRANCH}`)) {
        throw makeGitProcessError({
          command, args, exitCode: 1,
          stderr: " ! [rejected] (stale info)",
        });
      }
      if (args[0] === "ls-remote") {
        return { stdout: `${MOVED_OID}\trefs/heads/${OLD_BRANCH}\n` };
      }
      return { stdout: "" };
    };

    await expect(reconcileRenameRemoteBranch({ exec }, {
      remote: "origin",
      oldBranch: OLD_BRANCH,
      newBranch: NEW_BRANCH,
      oldRemoteOid: OLD_OID,
    })).resolves.toEqual({ status: "stale", expectedOid: OLD_OID, actualOid: MOVED_OID });
  });
});

describe("withRenameStubBranch", () => {
  it("cuts a short-lived branch from base, runs there, and rests on base", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "" };
    };

    await expect(withRenameStubBranch({ exec }, {
      baseBranch: "main",
      oldSlug: "old-name",
      newSlug: "new-name",
    }, async (branch) => {
      calls.push(["operation", branch]);
      return "done";
    })).resolves.toEqual({
      branch: "chore/rename-old-name-to-new-name",
      created: true,
      pendingIntegration: true,
      value: "done",
    });
    expect(calls).toEqual([
      [
        "git",
        "for-each-ref",
        "--format=%(refname)",
        "refs/heads/chore/rename-old-name-to-new-name",
      ],
      ["git", "switch", "-c", "chore/rename-old-name-to-new-name", "main"],
      ["operation", "chore/rename-old-name-to-new-name"],
      ["git", "switch", "main"],
    ]);
  });

  it("attaches an existing short-lived branch instead of cutting it again", async () => {
    const calls: string[][] = [];
    const branch = "chore/rename-old-name-to-new-name";
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "for-each-ref") return { stdout: `refs/heads/${branch}\n` };
      return { stdout: "" };
    };

    await expect(withRenameStubBranch({ exec }, {
      baseBranch: "main",
      oldSlug: "old-name",
      newSlug: "new-name",
    }, async () => undefined)).resolves.toMatchObject({ created: false, pendingIntegration: true });
    expect(calls).toContainEqual(["git", "switch", branch]);
    expect(calls).not.toContainEqual(["git", "switch", "-c", branch, "main"]);
  });

  it("returns to base when the rename commit is refused", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (command, args) => {
      calls.push([command, ...args]);
      return { stdout: "" };
    };

    await expect(withRenameStubBranch({ exec }, {
      baseBranch: "main",
      oldSlug: "old-name",
      newSlug: "new-name",
    }, async () => {
      throw new Error("commit refused");
    })).rejects.toThrow(/commit refused/iu);
    expect(calls.at(-1)).toEqual(["git", "switch", "main"]);
  });
});
