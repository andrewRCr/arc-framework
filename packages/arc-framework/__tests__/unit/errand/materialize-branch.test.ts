/** Exact-head branch preparation for transient re-entry. */

import { describe, expect, it } from "vitest";

import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";
import { prepareMaterializedBranch } from "../../../src/lib/errand/materialize-branch.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const RECORDED_HEAD = "a".repeat(40);
const RECORDED_HEAD_SHA256 = "a".repeat(64);
const REMOTE_HEAD = "b".repeat(40);

function execFor(remoteHead: string): {
  exec: GitExec;
  createdBranch: () => { ref: string; head: string } | null;
} {
  const branchName = "chore/fix-output";
  const localRef = `refs/heads/${branchName}`;
  let snapshotRef: string | null = null;
  let branch: { ref: string; head: string } | null = null;
  const exec: GitExec = async (command, args) => {
    if (args[0] === "show-ref") {
      if (args.join(" ") !== `show-ref --verify --quiet ${localRef}`) {
        throw new Error(`unexpected local branch probe: ${args.join(" ")}`);
      }
      throw makeGitProcessError({ command, args, exitCode: 1, stderr: "missing" });
    }
    if (args[0] === "fetch") {
      const refspec = args[3];
      const prefix = `+refs/heads/${branchName}:`;
      if (args.length !== 4 || args[1] !== "--" || args[2] !== "origin" || refspec?.startsWith(prefix) !== true) {
        throw new Error(`unexpected fetch boundary: ${args.join(" ")}`);
      }
      snapshotRef = refspec.slice(prefix.length);
      if (!snapshotRef.startsWith("refs/arc/tmp/transient-materialize/")) {
        throw new Error(`unexpected snapshot ref: ${snapshotRef}`);
      }
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "update-ref") {
      if (args[1] === "-d" && args[2] === snapshotRef) return { stdout: "", stderr: "" };
      if (args[1] === localRef && args[2] !== "-d") {
        if (args[3] !== "0".repeat(remoteHead.length)) {
          throw new Error(`unexpected zero oid: ${args[3] ?? "[missing]"}`);
        }
        branch = { ref: args[1], head: args[2] ?? "" };
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected update-ref boundary: ${args.join(" ")}`);
    }
    if (args[0] === "rev-parse") {
      if (snapshotRef === null || args.join(" ") !== `rev-parse --verify ${snapshotRef}^{commit}`) {
        throw new Error(`unexpected snapshot probe: ${args.join(" ")}`);
      }
      return { stdout: `${remoteHead}\n`, stderr: "" };
    }
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
  return { exec, createdBranch: () => branch };
}

describe("prepareMaterializedBranch", () => {
  it("accepts an existing local branch only when it is the exact retained head", async () => {
    const { exec } = scriptGitExec([
      { match: ["show-ref", "--verify", "--quiet", "refs/heads/chore/fix-output"],
        responses: [{ stdout: "", stderr: "" }] },
      { match: ["rev-parse", "--verify", "refs/heads/chore/fix-output^{commit}"],
        responses: [{ stdout: `${RECORDED_HEAD}\n`, stderr: "" }] },
    ]);
    await expect(prepareMaterializedBranch({
      exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
      existingLocal: "accept-exact",
    })).resolves.toMatchObject({ kind: "prepared", created: false, expectedHead: RECORDED_HEAD });
  });

  it("refuses when the open remote branch moved from the recorded head", async () => {
    const boundary = execFor(REMOTE_HEAD);
    const result = await prepareMaterializedBranch({
      exec: boundary.exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
    });

    expect(result).toMatchObject({
      kind: "refused",
      code: "remote-head-mismatch",
      reason: expect.stringMatching(/exact recorded head/iu),
    });
    expect(boundary.createdBranch()).toBeNull();
  });

  it("preserves a remote-head refusal when temporary-ref cleanup also fails", async () => {
    const { exec } = scriptGitExec([
      { match: ["show-ref", "--verify", "--quiet", "refs/heads/chore/fix-output"],
        responses: [{ failure: { exitCode: 1, stderr: "missing" } }] },
      { match: { predicate: (args) => args[0] === "fetch" && args[1] === "--" && args[2] === "origin"
        && args[3]?.startsWith("+refs/heads/chore/fix-output:refs/arc/tmp/transient-materialize/") === true },
      responses: [{ stdout: "", stderr: "" }] },
      { match: { predicate: (args) => args[0] === "rev-parse" && args[1] === "--verify"
        && args[2]?.startsWith("refs/arc/tmp/transient-materialize/") === true },
      responses: [{ stdout: `${REMOTE_HEAD}\n`, stderr: "" }] },
      { match: { predicate: (args) => args[0] === "update-ref" && args[1] === "-d"
        && args[2]?.startsWith("refs/arc/tmp/transient-materialize/") === true },
      responses: [{ failure: { exitCode: 128, stderr: "cleanup unavailable" } }] },
    ]);

    await expect(prepareMaterializedBranch({
      exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
    })).resolves.toMatchObject({
      kind: "refused",
      code: "remote-head-mismatch",
      reason: expect.stringMatching(/exact recorded head/iu),
    });
  });

  it("prepares the branch when the remote is the exact recorded head", async () => {
    const boundary = execFor(RECORDED_HEAD);
    await expect(prepareMaterializedBranch({
      exec: boundary.exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
    })).resolves.toMatchObject({ kind: "prepared", created: true, remoteHead: RECORDED_HEAD });
  });

  it("uses the repository object format width when creating the local branch", async () => {
    const boundary = execFor(RECORDED_HEAD_SHA256);
    await expect(prepareMaterializedBranch({
      exec: boundary.exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD_SHA256,
    })).resolves.toMatchObject({ kind: "prepared", created: true, remoteHead: RECORDED_HEAD_SHA256 });
  });
});
