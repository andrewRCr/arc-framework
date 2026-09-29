/** Exact Candidate object materialization for review-status composition. */

import { describe, expect, it, vi } from "vitest";

import { GitProcessError } from "../../../../src/lib/git/process-error.js";
import { makeGitProcessError } from "../../../helpers/git-exec-fake.js";
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
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args[2] === "refs/remotes/origin/main") {
        return { stdout: `${currentBaseOid}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse" && args[2] === `${headSha}^{commit}`) {
        return { stdout: `${headSha}\n`, stderr: "" };
      }
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 1 });
      }
      if (args[0] === "merge-base") return { stdout: `${mergeBase}\n`, stderr: "" };
      if (args[0] === "diff") {
        return {
          stdout: args.at(-1)?.endsWith(headSha)
            ? `${projectionPath}\0reviewed.txt\0`
            : `${projectionPath}\0base.txt\0`,
          stderr: "",
        };
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

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
  });

  it("retains overlapping paths for non-contained base movement", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const mergeBase = "c".repeat(40);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args[2] === "refs/remotes/origin/main") {
        return { stdout: `${currentBaseOid}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse") return { stdout: `${headSha}\n`, stderr: "" };
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 1 });
      }
      if (args[0] === "merge-base") return { stdout: `${mergeBase}\n`, stderr: "" };
      if (args[0] === "diff") return { stdout: "src/shared.ts\0", stderr: "" };
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

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
  });

  it("retains precise unavailable overlap evidence", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "fetch") return { stdout: "", stderr: "" };
      if (args[0] === "rev-parse" && args[2] === "refs/remotes/origin/main") {
        return { stdout: `${currentBaseOid}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse") return { stdout: `${headSha}\n`, stderr: "" };
      if (args[0] === "merge-base" && args[1] === "--is-ancestor") {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 1 });
      }
      if (args[0] === "merge-base") {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "private git diagnostic" });
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

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
  });

  it("reports the exact reviewed head when local resolution and fetch fail", async () => {
    const headSha = "a".repeat(40);
    const currentBaseOid = "b".repeat(40);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "fetch" && args[2] === "main") return { stdout: "", stderr: "" };
      if (args[0] === "fetch") {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128 });
      }
      if (args[0] === "rev-parse" && args[2] === "refs/remotes/origin/main") {
        return { stdout: `${currentBaseOid}\n`, stderr: "" };
      }
      if (args[0] === "rev-parse") {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128 });
      }
      throw new Error(`unexpected git args: ${args.join(" ")}`);
    });

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
    expect(exec).not.toHaveBeenCalledWith(
      "git",
      ["merge-base", "--is-ancestor", currentBaseOid, expect.any(String)],
      expect.any(Object),
    );
  });

  it("fetches an absent Candidate head and verifies the exact fetched commit locally", async () => {
    const headSha = "a".repeat(40);
    let available = false;
    const exec = vi.fn(async (
      _command: string,
      args: string[],
      options?: { cwd?: string; objectAccess?: "local-only" },
    ) => {
      if (args[0] === "fetch") {
        expect(args).toEqual(["fetch", "origin", headSha]);
        expect(options).toEqual({ cwd: "/repo" });
        available = true;
        return { stdout: "", stderr: "" };
      }
      expect(args).toEqual(["rev-parse", "--verify", `${headSha}^{commit}`]);
      expect(options).toEqual({ cwd: "/repo", objectAccess: "local-only" });
      if (!available) {
        throw new GitProcessError({
          kind: "nonzero-exit",
          command: "git",
          args,
          exitCode: 128,
        });
      }
      return { stdout: `${headSha}\n`, stderr: "" };
    });

    await expect(ensureCandidateHeadAvailable({
      cwd: "/repo",
      exec,
      headSha,
    })).resolves.toBeUndefined();
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it("uses the selected remote for absent Candidate materialization", async () => {
    const headSha = "a".repeat(40);
    let available = false;
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "fetch") {
        expect(args).toEqual(["fetch", "upstream", headSha]);
        available = true;
        return { stdout: "", stderr: "" };
      }
      if (!available) {
        throw new GitProcessError({ kind: "nonzero-exit", command: "git", args, exitCode: 128 });
      }
      return { stdout: `${headSha}\n`, stderr: "" };
    });

    await expect(ensureCandidateHeadAvailable({
      cwd: "/repo",
      exec,
      headSha,
      remote: "upstream",
    })).resolves.toBeUndefined();
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
