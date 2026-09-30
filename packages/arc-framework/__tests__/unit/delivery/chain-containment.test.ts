import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { classifyGitDeliveryChainContainment } from "../../../src/lib/delivery/chain-containment.js";
import { makeGitProcessError, scriptRawGitExec } from "../../helpers/git-exec-fake.js";

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
  return scriptRawGitExec([
    { match: { prefix: ["rev-parse", "--verify"] }, responses: [({ args }) => (
      { stdout: bytes(`${args[2]?.replace(/\^\{commit\}$/u, "")}\n`) }
    )] },
    { match: { prefix: ["rev-parse"] }, responses: [({ args }) => {
      const head = args[1]?.replace(/\^\{tree\}$/u, "") ?? "";
      return { stdout: bytes(`${input.coordinates.get(head) ?? ""}\n`) };
    }] },
    { match: { prefix: ["merge-base"] }, responses: [() => input.ancestral !== false
      ? { stdout: bytes("") }
      : { failure: { exitCode: 1, stderr: "not ancestor" } }] },
    { match: { prefix: ["ls-tree"] }, responses: [({ args }) => {
      const observed = input.trees.get(args.at(-1) ?? "");
      if (observed !== undefined) return { stdout: observed };
      throw new Error(`unexpected Git call: ${args.join(" ")}`);
    }] },
  ]).exec;
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
    const unavailable: RawGitExec = async (args) => {
      throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "missing object" });
    };
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
