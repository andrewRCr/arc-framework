import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { classifyGitDeliveryChainContainment } from "../../../src/lib/delivery/chain-containment.js";

const oid = (character: string): string => character.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const tree = (entries: Readonly<Record<string, string>>): Uint8Array => bytes(
  Object.entries(entries).map(([path, entryOid]) => `100644 blob ${entryOid}\t${path}\0`).join(""),
);

function exactExec(input: {
  readonly coordinates: ReadonlyMap<string, string>;
  readonly trees: ReadonlyMap<string, Uint8Array>;
  readonly ancestral?: boolean;
}): RawGitExec {
  return async (args) => {
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      return { stdout: bytes(`${args[2]?.replace(/\^\{commit\}$/u, "")}\n`) };
    }
    if (args[0] === "rev-parse") {
      const head = args[1]?.replace(/\^\{tree\}$/u, "") ?? "";
      return { stdout: bytes(`${input.coordinates.get(head) ?? ""}\n`) };
    }
    if (args[0] === "merge-base") {
      if (input.ancestral !== false) return { stdout: bytes("") };
      throw Object.assign(new Error("not ancestor"), { exitCode: 1 });
    }
    if (args[0] === "ls-tree") {
      const observed = input.trees.get(args.at(-1) ?? "");
      if (observed !== undefined) return { stdout: observed };
    }
    throw new Error(`unexpected Git call: ${args.join(" ")}`);
  };
}

describe("delivery chain containment", () => {
  it("accepts exact normalized completeness across lifecycle paths", async () => {
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const finalCandidate = { head: oid("5"), tree: oid("6") };
    const top = { head: oid("7"), tree: oid("8") };
    const coordinates = new Map([
      [commonBase.head, commonBase.tree],
      [member.head, member.tree],
      [finalCandidate.head, finalCandidate.tree],
      [top.head, top.tree],
    ]);
    const trees = new Map([
      [commonBase.tree, tree({ "feature.txt": oid("a"), "meta.md": oid("b") })],
      [finalCandidate.tree, tree({ "feature.txt": oid("c"), "meta.md": oid("b") })],
      [top.tree, tree({ "feature.txt": oid("c"), "meta.md": oid("d") })],
    ]);

    await expect(classifyGitDeliveryChainContainment({
      exec: exactExec({ coordinates, trees }),
      commonBase,
      highestMember: member,
      finalCandidate,
      lifecyclePaths: ["meta.md"],
      top,
    })).resolves.toEqual({ status: "contained" });
  });

  it("returns exact normalized divergence paths", async () => {
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const finalCandidate = { head: oid("5"), tree: oid("6") };
    const top = { head: oid("7"), tree: oid("8") };
    const coordinates = new Map([
      [commonBase.head, commonBase.tree],
      [member.head, member.tree],
      [finalCandidate.head, finalCandidate.tree],
      [top.head, top.tree],
    ]);
    const trees = new Map([
      [commonBase.tree, tree({})],
      [finalCandidate.tree, tree({ "feature.txt": oid("a") })],
      [top.tree, tree({ "feature.txt": oid("b") })],
    ]);

    await expect(classifyGitDeliveryChainContainment({
      exec: exactExec({ coordinates, trees }),
      commonBase,
      highestMember: member,
      finalCandidate,
      lifecyclePaths: [],
      top,
    })).resolves.toEqual({ status: "refused", reason: "containment-diverged", paths: ["feature.txt"] });
  });

  it("refuses a final candidate outside the highest-member ancestry", async () => {
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const finalCandidate = { head: oid("5"), tree: oid("6") };
    const top = { head: oid("7"), tree: oid("8") };
    const coordinates = new Map([
      [commonBase.head, commonBase.tree],
      [member.head, member.tree],
      [finalCandidate.head, finalCandidate.tree],
      [top.head, top.tree],
    ]);

    await expect(classifyGitDeliveryChainContainment({
      exec: exactExec({ coordinates, trees: new Map(), ancestral: false }),
      commonBase,
      highestMember: member,
      finalCandidate,
      lifecyclePaths: [],
      top,
    })).resolves.toEqual({ status: "refused", reason: "containment-not-ancestral" });
  });

  it("returns a typed containment refusal when exact coordinate evidence is unavailable", async () => {
    const unavailable: RawGitExec = async () => { throw new Error("missing object"); };
    const commonBase = { head: oid("1"), tree: oid("2") };
    const member = { head: oid("3"), tree: oid("4") };
    const finalCandidate = { head: oid("5"), tree: oid("6") };
    const top = { head: oid("7"), tree: oid("8") };

    await expect(classifyGitDeliveryChainContainment({
      exec: unavailable,
      commonBase,
      highestMember: member,
      finalCandidate,
      lifecyclePaths: [],
      top,
    })).resolves.toEqual({ status: "refused", reason: "containment-endpoints-unverified" });
  });
});
