import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/change-facts.js";
import { classifyGitDeliveryChainContainment } from "../../../src/lib/delivery/chain-containment.js";

const oid = (character: string): string => character.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

describe("delivery chain containment", () => {
  it("returns a containment-specific result when reapplication leaves the top tree unchanged", async () => {
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const top = { head: oid("5"), tree: oid("6") };
    const trees = new Map([
      [commonBase.head, commonBase.tree],
      [member.head, member.tree],
      [top.head, top.tree],
    ]);
    const exec: RawGitExec = async (args) => {
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return { stdout: bytes(`${args[2]?.replace(/\^\{commit\}$/u, "")}\n`) };
      }
      if (args[0] === "rev-parse") {
        const head = args[1]?.replace(/\^\{tree\}$/u, "") ?? "";
        return { stdout: bytes(`${trees.get(head) ?? ""}\n`) };
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) {
        return { stdout: bytes(`${oid("7")}\n`) };
      }
      if (args[0] === "merge-tree") return { stdout: bytes(`${top.tree}\0`) };
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };

    await expect(classifyGitDeliveryChainContainment({
      exec, commonBase, highestMember: member, top,
    })).resolves.toEqual({ status: "contained" });
  });

  it("keeps conflict and clean divergence paths in containment vocabulary", async () => {
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const top = { head: oid("5"), tree: oid("6") };
    const coordinateOutput = (args: string[]): Uint8Array | null => {
      const commit = args[1] === "--verify" ? args[2]?.replace(/\^\{commit\}$/u, "") : undefined;
      if (commit !== undefined) return bytes(`${commit}\n`);
      const head = args[1]?.replace(/\^\{tree\}$/u, "");
      const tree = head === commonBase.head ? commonBase.tree : head === member.head ? member.tree : top.tree;
      return head === undefined ? null : bytes(`${tree}\n`);
    };
    const execFor = (outcome: "conflict" | "diverged"): RawGitExec => async (args) => {
      if (args[0] === "rev-parse") {
        const stdout = coordinateOutput(args);
        if (stdout !== null) return { stdout };
      }
      if (args[0] === "merge-tree" && !args.includes("--name-only")) {
        return { stdout: bytes(`${oid("7")}\n`) };
      }
      if (args[0] === "merge-tree" && outcome === "conflict") {
        throw Object.assign(new Error("conflict"), {
          exitCode: 1,
          stdout: `${oid("8")}\0shared.txt\0`,
        });
      }
      if (args[0] === "merge-tree") return { stdout: bytes(`${oid("9")}\0`) };
      if (args[0] === "diff") return { stdout: bytes("feature.txt\0") };
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    };
    const containment = { commonBase, highestMember: member, top };

    await expect(classifyGitDeliveryChainContainment({ exec: execFor("conflict"), ...containment }))
      .resolves.toEqual({ status: "refused", reason: "containment-conflicted", paths: ["shared.txt"] });
    await expect(classifyGitDeliveryChainContainment({ exec: execFor("diverged"), ...containment }))
      .resolves.toEqual({ status: "refused", reason: "containment-diverged", paths: ["feature.txt"] });
  });

  it("returns a typed containment refusal when exact merge evidence is unavailable", async () => {
    const unavailable: RawGitExec = async () => { throw new Error("missing object"); };
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const top = { head: oid("5"), tree: oid("6") };

    await expect(classifyGitDeliveryChainContainment({
      exec: unavailable, commonBase, highestMember: member, top,
    })).resolves.toEqual({ status: "refused", reason: "containment-endpoints-unverified" });
  });
});
