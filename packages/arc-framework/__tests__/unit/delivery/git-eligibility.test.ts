/** Exact Git eligibility fact-reader tests. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  inspectDeliveryAuthoringCheckout,
  inspectDeliveryCandidateCheckout,
  readDeliveryEligibilityTree,
} from "../../../src/lib/delivery/git-eligibility.js";
import { makeGitProcessError, scriptGitExec } from "../../helpers/git-exec-fake.js";

function checkoutExec(status: string, untrackedFiles: "no" | "all") {
  const head = "a".repeat(40);
  const tree = "b".repeat(40);
  return scriptGitExec([
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: `${head}\n` }] },
    { match: ["rev-list", "--parents", "-n", "1", head], responses: [{ stdout: `${head}\n` }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: `${tree}\n` }] },
    { match: ["status", "--porcelain=v1", "-z", `--untracked-files=${untrackedFiles}`],
      responses: [{ stdout: status }] },
  ]);
}

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
    const exec: GitExec = async (command, args) => {
      throw makeGitProcessError({ command, args, exitCode: 128, stderr: "tree unavailable" });
    };
    await expect(readDeliveryEligibilityTree(exec, "tree")).resolves.toBeNull();
  });

  it("checks tracked/index dirt while requesting no untracked output", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const { exec, calls } = checkoutExec("", "no");

    await expect(inspectDeliveryCandidateCheckout(exec, "/tmp/candidate")).resolves.toEqual({
      head, tree, trackedDirty: false,
    });
    expect(calls.map((call) => call.args)).toContainEqual(
      ["status", "--porcelain=v1", "-z", "--untracked-files=no"]);
  });

  it("reports non-empty tracked/index status as dirty", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const { exec } = checkoutExec(" M tracked.ts\0", "no");

    await expect(inspectDeliveryCandidateCheckout(exec, "/tmp/candidate")).resolves.toEqual({
      head, tree, trackedDirty: true,
    });
  });

  it("includes untracked residue when inspecting a mutable authoring checkout", async () => {
    const head = "a".repeat(40);
    const tree = "b".repeat(40);
    const { exec, calls } = checkoutExec("?? residue.txt\0", "all");

    await expect(inspectDeliveryAuthoringCheckout(exec, "/tmp/authoring")).resolves.toEqual({
      head, tree, trackedDirty: true,
    });
    expect(calls.map((call) => call.args)).toContainEqual(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  });
});
