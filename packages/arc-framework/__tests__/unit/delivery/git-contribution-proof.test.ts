import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import {
  proveGitDeliveryContribution,
  proveGitDeliveryProviderRefreshContribution,
} from "../../../src/lib/delivery/git-contribution-proof.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

const oid = (digit: string): string => digit.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

const coordinates = {
  before: {
    predecessor: { head: oid("1"), tree: oid("2") },
    member: { head: oid("3"), tree: oid("4") },
  },
  after: {
    predecessor: { head: oid("5"), tree: oid("6") },
    member: { head: oid("7"), tree: oid("8") },
  },
};

function verifiedCoordinateOutput(args: string[]): string | null {
  const commit = args[1] === "--verify" ? args[2]?.match(/^([0-9a-f]+)\^\{commit\}$/u)?.[1] : undefined;
  if (commit !== undefined) return commit;
  const treeHead = args[1]?.match(/^([0-9a-f]+)\^\{tree\}$/u)?.[1];
  if (treeHead === undefined) return null;
  for (const side of [coordinates.before, coordinates.after]) {
    if (side.predecessor.head === treeHead) return side.predecessor.tree;
    if (side.member.head === treeHead) return side.member.tree;
  }
  return null;
}

describe("Git delivery contribution proof", () => {
  it("preserves a conflicted path that is shaped like an object ID", async () => {
    const conflictedPath = "0123456789abcdef0123456789abcdef01234567";
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") {
        throw makeGitProcessError({ command: "git", args,
          exitCode: 1,
          stdout: `${oid("b")}\0${conflictedPath}\0`,
          stderr: "conflict",
        });
      }
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: [conflictedPath],
    });
  });

  it("refuses an unparseable conflict without path evidence", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") {
        throw makeGitProcessError({ command: "git", args, exitCode: 1,
          stdout: "not-nul-framed", stderr: "conflict" });
      }
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "git-failure",
    });
  });

  it("distinguishes a hard Git failure from a merge conflict", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") {
        throw makeGitProcessError({ command: "git", args, exitCode: 2, stderr: "fatal error" });
      }
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "git-failure",
    });
  });

  it("reuses the shared unsupported merge-tree refusal", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && args.includes("--merge-base")) {
        throw makeGitProcessError({ command: "git", args, exitCode: 129,
          stderr: "unknown option: --merge-base" });
      }
      if (args[0] === "merge-tree") return result(`${oid("a")}\n`);
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "merge-tree-write-tree-unsupported",
    });
  });

  it("reapplies verified endpoints when the checkout HEAD is unusable", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "unborn HEAD" });
      }
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") return result(`${coordinates.after.member.tree}\0`);
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it("refuses when any pinned endpoint cannot be verified", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") return result(`${oid("f")}\n`);
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-endpoints-unverified",
    });
  });

  it("supplies the old predecessor as the explicit merge base", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") {
        const baseIndex = args.indexOf("--merge-base");
        return baseIndex >= 0 && args[baseIndex + 1] === coordinates.before.predecessor.head
          ? result(`${coordinates.after.member.tree}\0`)
          : result(`${oid("b")}\0`);
      }
      if (args[0] === "diff") return result("unexpected.txt\0");
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it("retains a contained provider-refresh predecessor as the explicit merge base", async () => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return result(`${oid("9")}\n`);
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") return result("");
      if (args[0] === "merge-tree" && !args.includes("--name-only")) return result(`${oid("a")}\n`);
      if (args[0] === "merge-tree") {
        const baseIndex = args.indexOf("--merge-base");
        return baseIndex >= 0 && args[baseIndex + 1] === coordinates.before.predecessor.head
          ? result(`${coordinates.after.member.tree}\0`)
          : result(`${oid("b")}\0`);
      }
      if (args[0] === "diff") return result("unexpected.txt\0");
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryProviderRefreshContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it.each([
    ["missing", null],
    ["ambiguous", `${oid("a")}\n${oid("b")}\n`],
  ])("refuses a %s provider-refresh fork boundary", async (_label, boundaryOutput) => {
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse") {
        const value = verifiedCoordinateOutput(args);
        if (value !== null) return result(`${value}\n`);
      }
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "not ancestor" });
      }
      if (args[0] === "merge-base" && args[1] === "--all") {
        if (boundaryOutput !== null) return result(boundaryOutput);
        throw makeGitProcessError({ command: "git", args, exitCode: 1, stderr: "no merge base" });
      }
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(proveGitDeliveryProviderRefreshContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-endpoints-unverified",
    });
  });
});
