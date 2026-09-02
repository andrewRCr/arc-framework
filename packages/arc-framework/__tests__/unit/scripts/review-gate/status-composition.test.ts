/** Exact Candidate object materialization for review-status composition. */

import { describe, expect, it, vi } from "vitest";

import { GitProcessError } from "../../../../src/lib/git/process-error.js";
import { ensureCandidateHeadAvailable } from
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
});
