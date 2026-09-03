/** Exact Git eligibility fact-reader tests. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  inspectDeliveryAuthoringCheckout,
  inspectDeliveryCandidateCheckout,
  readDeliveryEligibilityTree,
} from "../../../src/lib/delivery/git-eligibility.js";

describe("delivery eligibility Git facts", () => {
  it("preserves exact mode, type, and object identity for every tree leaf", async () => {
    const exec: GitExec = async () => ({ stdout: [
      `100755 blob ${"a".repeat(40)}\tscript.sh`,
      `120000 blob ${"b".repeat(40)}\tlink`,
      `160000 commit ${"c".repeat(40)}\tsubmodule`,
      "",
    ].join("\0") });

    await expect(readDeliveryEligibilityTree(exec, "tree")).resolves.toEqual(new Map([
      ["script.sh", { mode: "100755", type: "blob", oid: "a".repeat(40) }],
      ["link", { mode: "120000", type: "blob", oid: "b".repeat(40) }],
      ["submodule", { mode: "160000", type: "commit", oid: "c".repeat(40) }],
    ]));
  });

  it.each([
    ["a malformed record", "not-a-tree-record\0"],
    ["a duplicate path", [
      `100644 blob ${"a".repeat(40)}\tduplicate.md`,
      `100644 blob ${"b".repeat(40)}\tduplicate.md`,
      "",
    ].join("\0")],
  ])("fails closed for %s", async (_case, stdout) => {
    const exec: GitExec = async () => ({ stdout });
    await expect(readDeliveryEligibilityTree(exec, "tree")).resolves.toBeNull();
  });

  it("fails closed when the tree read throws", async () => {
    const exec: GitExec = async () => {
      throw new Error("tree unavailable");
    };
    await expect(readDeliveryEligibilityTree(exec, "tree")).resolves.toBeNull();
  });

  it("checks tracked/index dirt while requesting no untracked output", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const calls: string[][] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return { stdout: `${head}\n` };
      if (args[0] === "rev-list") return { stdout: `${head}\n` };
      if (args[0] === "rev-parse" && args[1] === `${head}^{tree}`) return { stdout: `${tree}\n` };
      if (args[0] === "status") return { stdout: "" };
      throw new Error(`unexpected ${args.join(" ")}`);
    };

    await expect(inspectDeliveryCandidateCheckout(exec, "/tmp/candidate")).resolves.toEqual({
      head, tree, trackedDirty: false,
    });
    expect(calls).toContainEqual(["status", "--porcelain=v1", "-z", "--untracked-files=no"]);
  });

  it("reports non-empty tracked/index status as dirty", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return { stdout: `${head}\n` };
      if (args[0] === "rev-list") return { stdout: `${head}\n` };
      if (args[0] === "rev-parse" && args[1] === `${head}^{tree}`) return { stdout: `${tree}\n` };
      if (args[0] === "status") return { stdout: " M tracked.ts\0" };
      throw new Error(`unexpected ${args.join(" ")}`);
    };

    await expect(inspectDeliveryCandidateCheckout(exec, "/tmp/candidate")).resolves.toEqual({
      head, tree, trackedDirty: true,
    });
  });

  it("includes untracked residue when inspecting a mutable authoring checkout", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const calls: string[][] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[2] === "HEAD^{commit}") return { stdout: `${head}\n` };
      if (args[0] === "rev-list") return { stdout: `${head}\n` };
      if (args[0] === "rev-parse" && args[1] === `${head}^{tree}`) return { stdout: `${tree}\n` };
      if (args[0] === "status") return { stdout: "?? residue.txt\0" };
      throw new Error(`unexpected ${args.join(" ")}`);
    };

    await expect(inspectDeliveryAuthoringCheckout(exec, "/tmp/authoring")).resolves.toEqual({
      head, tree, trackedDirty: true,
    });
    expect(calls).toContainEqual(["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  });
});
