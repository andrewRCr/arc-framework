import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { supportsMergeTreeWriteTree } from "../../../src/lib/git/merge-tree-capability.js";

const oid = "1".repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

function supportingExec(): RawGitExec {
  return async (args) => {
    if (args[0] === "rev-parse") return result(`${oid}\n`);
    if (args[0] === "merge-tree" && args.includes("--write-tree")) return result(`${oid}\n`);
    throw new Error(`unexpected Git call: ${args.join(" ")}`);
  };
}

describe("merge-tree capability", () => {
  it("reports support when write-tree and explicit merge-base forms succeed", async () => {
    await expect(supportsMergeTreeWriteTree(supportingExec())).resolves.toBe(true);
  });

  it("reports no support when explicit merge-base is unrecognized", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse") return result(`${oid}\n`);
      if (args.includes("--merge-base")) throw new Error("unknown option: --merge-base");
      if (args[0] === "merge-tree" && args.includes("--write-tree")) return result(`${oid}\n`);
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

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
      if (args[0] === "rev-parse" && !canaryAvailable) throw new Error("unborn HEAD");
      return base(args, options);
    };

    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(false);
    canaryAvailable = true;
    await expect(supportsMergeTreeWriteTree(exec)).resolves.toBe(true);
  });

  it("uses a verified fallback commit when HEAD is unusable", async () => {
    const fallback = "2".repeat(40);
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") throw new Error("unborn HEAD");
      if (args[0] === "rev-parse" && args[2] === `${fallback}^{commit}`) return result(`${fallback}\n`);
      if (args[0] === "merge-tree" && args.includes("--write-tree")) return result(`${oid}\n`);
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };
    const probe = supportsMergeTreeWriteTree as (
      exec: RawGitExec,
      fallbackCanary?: string,
    ) => Promise<boolean>;

    await expect(probe(exec, fallback)).resolves.toBe(true);
  });
});
