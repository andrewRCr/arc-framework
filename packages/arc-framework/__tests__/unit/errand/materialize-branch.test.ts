/** Exact-head branch preparation for transient re-entry. */

import { describe, expect, it } from "vitest";

import { prepareMaterializedBranch } from "../../../src/lib/errand/materialize-branch.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const RECORDED_HEAD = "a".repeat(40);
const REMOTE_HEAD = "b".repeat(40);

function execFor(remoteHead: string, recordedIsAncestor = true): {
  exec: GitExec;
  createdBranch: () => { ref: string; head: string } | null;
} {
  let branch: { ref: string; head: string } | null = null;
  const exec: GitExec = async (_command, args) => {
    if (args[0] === "show-ref") throw Object.assign(new Error("missing"), { code: 1 });
    if (args[0] === "fetch") return { stdout: "", stderr: "" };
    if (args[0] === "update-ref") {
      if (args[1]?.startsWith("refs/heads/") === true && args[2] !== "-d") {
        branch = { ref: args[1], head: args[2] ?? "" };
      }
      return { stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse") return { stdout: `${remoteHead}\n`, stderr: "" };
    if (args[0] === "merge-base" && recordedIsAncestor) return { stdout: "", stderr: "" };
    if (args[0] === "merge-base") throw Object.assign(new Error("not ancestor"), { code: 1 });
    throw new Error(`unexpected git args: ${args.join(" ")}`);
  };
  return { exec, createdBranch: () => branch };
}

describe("prepareMaterializedBranch", () => {
  it("accepts an existing local branch only when it is the exact retained head", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "show-ref") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse") return { stdout: `${RECORDED_HEAD}\n`, stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    };
    await expect(prepareMaterializedBranch({
      exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
      existingLocal: "accept-exact",
    })).resolves.toMatchObject({ kind: "prepared", created: false, expectedHead: RECORDED_HEAD });
  });

  it("prepares the exact recorded head when the open remote branch moved forward", async () => {
    const boundary = execFor(REMOTE_HEAD);
    const result = await prepareMaterializedBranch({
      exec: boundary.exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
    });

    expect(result).toMatchObject({
      kind: "prepared",
      localRef: "refs/heads/chore/fix-output",
      expectedHead: RECORDED_HEAD,
      remoteHead: REMOTE_HEAD,
      created: true,
      advisory: expect.stringMatching(/head moved/iu),
    });
    expect(boundary.createdBranch()).toEqual({
      ref: "refs/heads/chore/fix-output",
      head: RECORDED_HEAD,
    });
  });

  it("refuses when the remote branch no longer preserves the recorded head", async () => {
    const boundary = execFor(REMOTE_HEAD, false);
    await expect(prepareMaterializedBranch({
      exec: boundary.exec,
      remote: "origin",
      branch: "chore/fix-output",
      expectedHead: RECORDED_HEAD,
    })).resolves.toMatchObject({ kind: "refused", reason: expect.stringMatching(/no longer preserves/iu) });
  });
});
