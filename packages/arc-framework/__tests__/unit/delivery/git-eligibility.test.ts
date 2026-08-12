/** Exact Git eligibility fact-reader tests. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
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

  it("checks tracked/index dirt without treating untracked output as dirt", async () => {
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
});
