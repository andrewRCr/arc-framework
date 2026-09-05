/** Exact Candidate object materialization for review-status composition. */

import { describe, expect, it, vi } from "vitest";

import { GitProcessError } from "../../../../src/lib/git/process-error.js";
import {
  ensureCandidateHeadAvailable,
  selectDeliveryReviewStatusTarget,
} from
  "../../../../src/scripts/review-gate/status-composition.js";

describe("review status composition", () => {
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

  it("carries a validated terminal advance into terminal-first and all-discharged status targets", () => {
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
    });
    expect(selectDeliveryReviewStatusTarget({
      ...common,
      outstanding: false,
    })).toEqual({
      target: { repository: "owner/repo", headRef: "feat/top", headSha: currentHead },
      pullRequest: 42,
    });
  });
});
