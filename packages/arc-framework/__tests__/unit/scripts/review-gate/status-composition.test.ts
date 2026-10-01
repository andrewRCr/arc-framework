/** Exact Candidate object materialization for review-status composition. */

import { describe, expect, it } from "vitest";

import { scriptGitExec } from "../../../helpers/git-exec-fake.js";
import {
  ensureCandidateHeadAvailable,
  readBasePosition,
  selectDeliveryReviewStatusTarget,
} from
  "../../../../src/scripts/review-gate/status-composition.js";

describe("review status composition", () => {
  it("classifies non-contained disjoint base movement for the resolved review subject", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const mergeBase = "c".repeat(40);
    const projectionPath = ".arc/system/.internal/candidates/example.json";
    const { exec, calls } = scriptGitExec([
      { match: { prefix: ["fetch"] }, responses: [{ stdout: "", stderr: "" }] },
      { match: ["rev-parse", "--verify", "refs/remotes/origin/main"],
        responses: [{ stdout: `${currentBaseOid}\n`, stderr: "" }] },
      { match: ["rev-parse", "--verify", `${headSha}^{commit}`],
        responses: [{ stdout: `${headSha}\n`, stderr: "" }] },
      { match: { prefix: ["merge-base", "--is-ancestor"] },
        responses: [{ failure: { exitCode: 1 } }] },
      { match: { prefix: ["merge-base"] }, responses: [{ stdout: `${mergeBase}\n`, stderr: "" }] },
      { match: { prefix: ["diff"] }, responses: [({ args }) => ({
        stdout: args.at(-1)?.endsWith(headSha)
          ? `${projectionPath}\0reviewed.txt\0`
          : `${projectionPath}\0base.txt\0`,
        stderr: "",
      })] },
    ]);

    await expect(readBasePosition({
      cwd: "/repo",
      exec,
      headSha,
      repository: "owner/repo",
      changeRequest: 42,
      subject: { status: "resolved", workUnitId: "example", member: null },
    })).resolves.toEqual({
      currentBaseOid,
      baseContained: false,
      baseMovement: {
        coordinates: { repository: "owner/repo", changeRequest: 42, base: currentBaseOid, head: headSha },
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
    expect(calls.some(({ args }) => args[0] === "diff")).toBe(true);
  });

  it("retains overlapping paths for non-contained base movement", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const mergeBase = "c".repeat(40);
    const { exec, calls } = scriptGitExec([
      { match: { prefix: ["fetch"] }, responses: [{ stdout: "", stderr: "" }] },
      { match: ["rev-parse", "--verify", "refs/remotes/origin/main"],
        responses: [{ stdout: `${currentBaseOid}\n`, stderr: "" }] },
      { match: { prefix: ["rev-parse"] }, responses: [{ stdout: `${headSha}\n`, stderr: "" }] },
      { match: { prefix: ["merge-base", "--is-ancestor"] },
        responses: [{ failure: { exitCode: 1 } }] },
      { match: { prefix: ["merge-base"] }, responses: [{ stdout: `${mergeBase}\n`, stderr: "" }] },
      { match: { prefix: ["diff"] }, responses: [{ stdout: "src/shared.ts\0", stderr: "" }] },
    ]);

    await expect(readBasePosition({
      cwd: "/repo",
      exec,
      headSha,
      repository: "owner/repo",
      changeRequest: 42,
      subject: { status: "resolved", workUnitId: "example", member: null },
    })).resolves.toMatchObject({
      currentBaseOid,
      baseContained: false,
      baseMovement: {
        coordinates: { repository: "owner/repo", changeRequest: 42, base: currentBaseOid, head: headSha },
        overlap: { status: "available", substantivePaths: ["src/shared.ts"], regenerablePaths: [] },
      },
    });
    expect(calls.some(({ args }) => args[0] === "diff")).toBe(true);
  });

  it("retains precise unavailable overlap evidence", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const { exec, calls } = scriptGitExec([
      { match: { prefix: ["fetch"] }, responses: [{ stdout: "", stderr: "" }] },
      { match: ["rev-parse", "--verify", "refs/remotes/origin/main"],
        responses: [{ stdout: `${currentBaseOid}\n`, stderr: "" }] },
      { match: { prefix: ["rev-parse"] }, responses: [{ stdout: `${headSha}\n`, stderr: "" }] },
      { match: { prefix: ["merge-base", "--is-ancestor"] },
        responses: [{ failure: { exitCode: 1 } }] },
      { match: { prefix: ["merge-base"] },
        responses: [{ failure: { exitCode: 128, stderr: "private git diagnostic" } }] },
    ]);

    await expect(readBasePosition({
      cwd: "/repo",
      exec,
      headSha,
      repository: "owner/repo",
      changeRequest: 42,
      subject: { status: "unbound" },
    })).resolves.toEqual({
      currentBaseOid,
      baseContained: false,
      baseMovement: {
        coordinates: { repository: "owner/repo", changeRequest: 42, base: currentBaseOid, head: headSha },
        overlap: { status: "unavailable", reason: "merge-base-failed" },
      },
      baseMovementDetail: "The merge base could not be established.",
    });
    expect(calls.map(({ args }) => args[0])).toContain("merge-base");
  });

  it("reports the exact reviewed head when local resolution and fetch fail", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const { exec, calls } = scriptGitExec([
      { match: ["fetch", "origin", "main"], responses: [{ stdout: "", stderr: "" }] },
      { match: { prefix: ["fetch"] }, responses: [{ failure: { exitCode: 128 } }] },
      { match: ["rev-parse", "--verify", "refs/remotes/origin/main"],
        responses: [{ stdout: `${currentBaseOid}\n`, stderr: "" }] },
      { match: { prefix: ["rev-parse"] }, responses: [{ failure: { exitCode: 128 } }] },
    ]);

    await expect(readBasePosition({
      cwd: "/repo",
      exec,
      headSha,
      repository: "owner/repo",
      changeRequest: 42,
      subject: { status: "resolved", workUnitId: "example", member: null },
    })).resolves.toEqual({
      currentBaseOid,
      baseContained: false,
      baseMovement: {
        coordinates: { repository: "owner/repo", changeRequest: 42, base: currentBaseOid, head: headSha },
        overlap: { status: "unavailable", reason: "branch-diff-failed" },
      },
      baseMovementDetail: `The exact reviewed head ${headSha} could not be resolved locally or fetched.`,
    });
    expect(calls.some(({ args }) => args[0] === "merge-base" && args[1] === "--is-ancestor")).toBe(false);
  });

  it("fetches an absent Candidate head and verifies the exact fetched commit locally", async () => {
    const headSha = "a".repeat(40);
    const { exec, calls } = scriptGitExec([
      { match: ["rev-parse", "--verify", `${headSha}^{commit}`], responses: [
        { failure: { exitCode: 128 } }, { stdout: `${headSha}\n`, stderr: "" },
      ] },
      { match: ["fetch", "origin", headSha], responses: [{ stdout: "", stderr: "" }] },
    ]);

    await expect(ensureCandidateHeadAvailable({
      cwd: "/repo",
      exec,
      headSha,
    })).resolves.toBeUndefined();
    expect(calls.map(({ args, options }) => [args, options])).toEqual([
      [["rev-parse", "--verify", `${headSha}^{commit}`], { cwd: "/repo", objectAccess: "local-only" }],
      [["fetch", "origin", headSha], { cwd: "/repo" }],
      [["rev-parse", "--verify", `${headSha}^{commit}`], { cwd: "/repo", objectAccess: "local-only" }],
    ]);
  });

  it("uses the selected remote for absent Candidate materialization", async () => {
    const headSha = "a".repeat(40);
    const { exec, calls } = scriptGitExec([
      { match: ["rev-parse", "--verify", `${headSha}^{commit}`], responses: [
        { failure: { exitCode: 128 } }, { stdout: `${headSha}\n`, stderr: "" },
      ] },
      { match: ["fetch", "upstream", headSha], responses: [{ stdout: "", stderr: "" }] },
    ]);

    await expect(ensureCandidateHeadAvailable({
      cwd: "/repo",
      exec,
      headSha,
      remote: "upstream",
    })).resolves.toBeUndefined();
    expect(calls.map(({ args }) => args)).toEqual([
      ["rev-parse", "--verify", `${headSha}^{commit}`],
      ["fetch", "upstream", headSha],
      ["rev-parse", "--verify", `${headSha}^{commit}`],
    ]);
  });

  it("carries a validated terminal advance without losing the state-backed member lookup", () => {
    const stateHead = "a".repeat(40);
    const currentHead = "b".repeat(40);
    const terminalDeliverableId = "member-terminal";
    const common = {
      anchor: { repository: "owner/repo", headRef: "feat/top", headSha: stateHead },
      terminalPullRequest: 42,
      terminalDeliverableId,
      stateMembers: [{
        deliverableId: terminalDeliverableId,
        ref: "refs/heads/feat/top",
        coordinates: { head: stateHead },
      }],
      terminalAdvance: { stateHead, currentHead },
    } as const;

    expect(selectDeliveryReviewStatusTarget({
      ...common,
      outstanding: true,
      firstOutstanding: {
        vehicle: { deliverableId: terminalDeliverableId },
        target: { repository: "owner/repo", pullRequest: 42, headSha: currentHead },
      },
    })).toEqual({
      target: { repository: "owner/repo", headRef: "feat/top", headSha: currentHead },
      pullRequest: 42,
      deliveryLookupHeadSha: stateHead,
    });
    expect(selectDeliveryReviewStatusTarget({
      ...common,
      outstanding: false,
    })).toEqual({
      target: { repository: "owner/repo", headRef: "feat/top", headSha: currentHead },
      pullRequest: 42,
      deliveryLookupHeadSha: stateHead,
    });
  });
});
