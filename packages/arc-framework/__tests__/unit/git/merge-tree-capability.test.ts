import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { supportsMergeTreeWriteTree } from "../../../src/lib/git/merge-tree-capability.js";
import { makeGitProcessError, scriptRawGitExec } from "../../helpers/git-exec-fake.js";

const oid = "1".repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

function supportingExec(): RawGitExec {
  return scriptRawGitExec([
    { match: { prefix: ["rev-parse"] }, responses: [result(`${oid}\n`)] },
    { match: { prefix: ["merge-tree", "--write-tree"] }, responses: [result(`${oid}\n`)] },
  ]).exec;
}

describe("merge-tree capability", () => {
  it("reports support when write-tree and explicit merge-base forms succeed", async () => {
    await expect(supportsMergeTreeWriteTree(supportingExec())).resolves.toBe(true);
  });

  it("reports no support when explicit merge-base is unrecognized", async () => {
    const { exec } = scriptRawGitExec([
      { match: { prefix: ["rev-parse"] }, responses: [result(`${oid}\n`)] },
      { match: { predicate: (args) => args[0] === "merge-tree" && args.includes("--merge-base") },
        responses: [{ failure: { exitCode: 129, stderr: "unknown option: --merge-base" } }] },
      { match: { prefix: ["merge-tree", "--write-tree"] }, responses: [result(`${oid}\n`)] },
    ]);

    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(false);
  });

  it("establishes one result per Git execution boundary", async () => {
    let available = true;
    const base = supportingExec();
    const exec: RawGitExec = async (args, options) => {
      if (!available) throw new Error("capability probe repeated");
      return base(args, options);
    };

    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(true);
    available = false;
    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(true);
  });

  it("does not cache a negative produced by an unusable canary", async () => {
    let canaryAvailable = false;
    const base = supportingExec();
    const exec: RawGitExec = async (args, options) => {
      if (args[0] === "rev-parse" && !canaryAvailable) {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "unborn HEAD" });
      }
      return base(args, options);
    };

    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(false);
    canaryAvailable = true;
    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(true);
  });

  it("uses a verified fallback commit when HEAD is unusable", async () => {
    const fallback = "2".repeat(40);
    const { exec } = scriptRawGitExec([
      { match: ["rev-parse", "--verify", "HEAD^{commit}"],
        responses: [{ failure: { exitCode: 128, stderr: "unborn HEAD" } }] },
      { match: ["rev-parse", "--verify", `${fallback}^{commit}`],
        responses: [result(`${fallback}\n`)] },
      { match: { prefix: ["merge-tree", "--write-tree"] }, responses: [result(`${oid}\n`)] },
    ]);
    const probe = supportsMergeTreeWriteTree as (
      exec: RawGitExec,
      fallbackCanary?: string,
    ) => Promise<boolean>;

    await expect(probe(exec, fallback)).resolves.toBe(true);
  });
});
