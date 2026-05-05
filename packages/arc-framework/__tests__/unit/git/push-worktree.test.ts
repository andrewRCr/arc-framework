import { describe, expect, it, vi } from "vitest";

import { pushWorktreeBranch } from "../../../src/lib/git/push-worktree.js";
import type { GitExec } from "../../../src/lib/git/index.js";

describe("pushWorktreeBranch", () => {
  it("invokes `git push origin <branch>` and reports success", async () => {
    const exec: GitExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });

    const result = await pushWorktreeBranch({ exec, branch: "feature/x" });

    expect(result).toEqual({ status: "success" });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith("git", ["push", "origin", "feature/x"]);
  });

  it("captures executor errors and reports failed with the original Error preserved", async () => {
    const cause = new Error("error: failed to push some refs to 'origin'");
    const exec: GitExec = vi.fn().mockRejectedValue(cause);

    const result = await pushWorktreeBranch({ exec, branch: "main" });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBe(cause);
    }
  });

  it("normalizes non-Error throws to Error instances", async () => {
    const exec: GitExec = vi.fn().mockRejectedValue("network unreachable");

    const result = await pushWorktreeBranch({ exec, branch: "main" });

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("network unreachable");
    }
  });
});
