/** Git-backed review contribution applicability fact production. */

import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../../../src/lib/change-facts.js";
import { projectGitReviewContributionApplicability } from
  "../../../../../src/scripts/review-gate/policy/git-review-contribution-applicability.js";

const oid = (character: string): string => character.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

function selector() {
  return {
    schemaVersion: 1 as const,
    repositoryId: "repository-1",
    repository: "owner/repository",
    pullRequest: 42,
    lane: "standard" as const,
    sourceId: "codex-pr",
    priorAttemptId: "attempt-prior",
    priorHead: oid("a"),
    currentHead: oid("c"),
    priorBase: oid("1"),
    currentBase: oid("b"),
  };
}

function mechanicalExec(): RawGitExec {
  const trees = new Map([
    [oid("1"), oid("2")],
    [oid("a"), oid("3")],
    [oid("b"), oid("4")],
    [oid("c"), oid("5")],
  ]);
  return async (args) => {
    if (args.join(" ") === `merge-base --all ${oid("a")} ${oid("b")}`) return result(`${oid("1")}\n`);
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const head = args[2]?.match(/^([0-9a-f]+)\^\{commit\}$/u)?.[1];
      if (head !== undefined && trees.has(head)) return result(`${head}\n`);
    }
    if (args[0] === "rev-parse") {
      const head = args[1]?.match(/^([0-9a-f]+)\^\{tree\}$/u)?.[1];
      const tree = head === undefined ? undefined : trees.get(head);
      if (tree !== undefined) return result(`${tree}\n`);
    }
    if (args[0] === "merge-tree" && args.includes("--name-only")) return result(`${oid("5")}\0`);
    if (args[0] === "merge-tree") return result(`${oid("9")}\n`);
    throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
  };
}

describe("Git review contribution applicability", () => {
  it("delegates the exact rewrite coordinates to D4 and preserves the prior review", async () => {
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: mechanicalExec(),
      observeEndpoints: async () => ({ head: oid("c"), base: oid("b") }),
    })).resolves.toMatchObject({
      state: "applicable",
      proof: "mechanical-reapply",
      projection: {
        before: {
          predecessor: { head: oid("1"), tree: oid("2") },
          member: { head: oid("a"), tree: oid("3") },
        },
        after: {
          predecessor: { head: oid("b"), tree: oid("4") },
          member: { head: oid("c"), tree: oid("5") },
        },
      },
    });
  });

  it("recognizes an unmoved retarget without spending Git proof capacity", async () => {
    const input = { ...selector(), currentHead: oid("a") };
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run for an unmoved head: ${args.join(" ")}`);
    };
    await expect(projectGitReviewContributionApplicability({
      selector: input,
      exec,
      observeEndpoints: async () => ({ head: oid("a"), base: oid("b") }),
    })).resolves.toMatchObject({ state: "applicable", proof: "head-unchanged" });
  });

  it("reruns when either observed endpoint moves before classification", async () => {
    const exec: RawGitExec = async (args) => {
      throw new Error(`Git must not run after endpoint movement: ${args.join(" ")}`);
    };
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec,
      observeEndpoints: async () => ({ head: oid("d"), base: oid("b") }),
    })).resolves.toMatchObject({ state: "rerun-checkpoint", reason: "head-moved" });
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec,
      observeEndpoints: async () => ({ head: oid("c"), base: oid("d") }),
    })).resolves.toMatchObject({ state: "rerun-checkpoint", reason: "base-moved" });
  });

  it("reruns when an endpoint moves while D4 facts are being derived", async () => {
    let observation = 0;
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: mechanicalExec(),
      observeEndpoints: async () => {
        observation += 1;
        return observation === 1
          ? { head: oid("c"), base: oid("b") }
          : { head: oid("d"), base: oid("b") };
      },
    })).resolves.toMatchObject({ state: "rerun-checkpoint", reason: "head-moved" });
  });

  it("keeps missing, ambiguous, malformed, and failed Git evidence distinct", async () => {
    const observeEndpoints = async () => ({ head: oid("c"), base: oid("b") });
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: async (args) => {
        if (args[0] === "merge-base") throw { exitCode: 1, stdout: bytes(""), stderr: bytes("") };
        throw new Error("unexpected Git invocation");
      },
      observeEndpoints,
    })).resolves.toMatchObject({ state: "classification-unavailable", reason: "merge-base-missing" });
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: async (args) => {
        if (args[0] === "merge-base") return result(`${oid("1")}\n${oid("2")}\n`);
        throw new Error("unexpected Git invocation");
      },
      observeEndpoints,
    })).resolves.toMatchObject({ state: "classification-unavailable", reason: "merge-base-ambiguous" });
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: async (args) => {
        if (args[0] === "merge-base") return result("not-an-object\n");
        throw new Error("unexpected Git invocation");
      },
      observeEndpoints,
    })).resolves.toMatchObject({ state: "classification-failed", reason: "malformed-evidence" });
    await expect(projectGitReviewContributionApplicability({
      selector: selector(),
      exec: async () => { throw new Error("Git unavailable"); },
      observeEndpoints,
    })).resolves.toMatchObject({ state: "classification-failed", reason: "git-failure" });
  });
});
