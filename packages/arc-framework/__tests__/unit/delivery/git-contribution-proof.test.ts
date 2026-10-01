import { describe, expect, it } from "vitest";

import {
  proveGitDeliveryContribution,
  proveGitDeliveryProviderRefreshContribution,
} from "../../../src/lib/delivery/git-contribution-proof.js";
import { scriptRawGitExec, type RawGitExecScriptEntry } from "../../helpers/git-exec-fake.js";

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

function proofExec(entries: readonly RawGitExecScriptEntry[]) {
  return scriptRawGitExec([
    ...entries,
    { match: ["rev-parse", "--verify", "HEAD^{commit}"],
      responses: [result(`${oid("9")}\n`)] },
    { match: { predicate: (args) => args[0] === "rev-parse"
      && verifiedCoordinateOutput([...args]) !== null },
      responses: [({ args }) => result(`${verifiedCoordinateOutput(args)}\n`)] },
  ]).exec;
}

describe("Git delivery contribution proof", () => {
  it("preserves a conflicted path that is shaped like an object ID", async () => {
    const conflictedPath = "0123456789abcdef0123456789abcdef01234567";
    const exec = proofExec([
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] }, responses: [{ failure: {
        exitCode: 1, stdout: `${oid("b")}\0${conflictedPath}\0`, stderr: "conflict",
      } }] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-conflicted",
      paths: [conflictedPath],
    });
  });

  it("refuses an unparseable conflict without path evidence", async () => {
    const exec = proofExec([
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] },
        responses: [{ failure: { exitCode: 1, stdout: "not-nul-framed", stderr: "conflict" } }] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "git-failure",
    });
  });

  it("distinguishes a hard Git failure from a merge conflict", async () => {
    const exec = proofExec([
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] },
        responses: [{ failure: { exitCode: 2, stderr: "fatal error" } }] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "git-failure",
    });
  });

  it("reuses the shared unsupported merge-tree refusal", async () => {
    const exec = proofExec([
      { match: { predicate: (args) => args[0] === "merge-tree" && args.includes("--merge-base") },
        responses: [{ failure: { exitCode: 129, stderr: "unknown option: --merge-base" } }] },
      { match: { prefix: ["merge-tree"] }, responses: [result(`${oid("a")}\n`)] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "merge-tree-write-tree-unsupported",
    });
  });

  it("reapplies verified endpoints when the checkout HEAD is unusable", async () => {
    const exec = proofExec([
      { match: ["rev-parse", "--verify", "HEAD^{commit}"],
        responses: [{ failure: { exitCode: 128, stderr: "unborn HEAD" } }] },
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] }, responses: [result(`${coordinates.after.member.tree}\0`)] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it("refuses when any pinned endpoint cannot be verified", async () => {
    const exec = proofExec([
      { match: { prefix: ["rev-parse", "--verify"] }, responses: [result(`${oid("f")}\n`)] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-endpoints-unverified",
    });
  });

  it("supplies the old predecessor as the explicit merge base", async () => {
    const exec = proofExec([
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] }, responses: [({ args }) => {
        const baseIndex = args.indexOf("--merge-base");
        return baseIndex >= 0 && args[baseIndex + 1] === coordinates.before.predecessor.head
          ? result(`${coordinates.after.member.tree}\0`)
          : result(`${oid("b")}\0`);
      }] },
      { match: { prefix: ["diff"] }, responses: [result("unexpected.txt\0")] },
    ]);

    await expect(proveGitDeliveryContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it("retains a contained provider-refresh predecessor as the explicit merge base", async () => {
    const exec = proofExec([
      { match: { prefix: ["merge-base", "--is-ancestor"] }, responses: [result("")] },
      { match: { predicate: (args) => args[0] === "merge-tree" && !args.includes("--name-only") },
        responses: [result(`${oid("a")}\n`)] },
      { match: { prefix: ["merge-tree"] }, responses: [({ args }) => {
        const baseIndex = args.indexOf("--merge-base");
        return baseIndex >= 0 && args[baseIndex + 1] === coordinates.before.predecessor.head
          ? result(`${coordinates.after.member.tree}\0`)
          : result(`${oid("b")}\0`);
      }] },
      { match: { prefix: ["diff"] }, responses: [result("unexpected.txt\0")] },
    ]);

    await expect(proveGitDeliveryProviderRefreshContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "accepted",
      proof: "mechanical-reapply",
    });
  });

  it.each([
    ["missing", null],
    ["ambiguous", `${oid("a")}\n${oid("b")}\n`],
  ])("refuses a %s provider-refresh fork boundary", async (_label, boundaryOutput) => {
    const exec = proofExec([
      { match: { prefix: ["merge-base", "--is-ancestor"] },
        responses: [{ failure: { exitCode: 1, stderr: "not ancestor" } }] },
      { match: { prefix: ["merge-base", "--all"] }, responses: [boundaryOutput === null
        ? { failure: { exitCode: 1, stderr: "no merge base" } }
        : result(boundaryOutput)] },
    ]);

    await expect(proveGitDeliveryProviderRefreshContribution({ exec, ...coordinates })).resolves.toEqual({
      status: "refused",
      reason: "contribution-endpoints-unverified",
    });
  });
});
