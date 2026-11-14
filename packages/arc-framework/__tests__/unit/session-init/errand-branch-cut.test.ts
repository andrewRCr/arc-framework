/**
 * Unit tests for `cutErrandBranch` — the errand-launch branch-cut mechanic. It cuts the branch an errand's record names
 * off a resolved base, never rebuilding the name, and no-clobbers an already-existing branch of that name (a
 * force-create would move the ref and drop its commits). The git seam is injected.
 */

import { describe, it, expect } from "vitest";

import { cutErrandBranch } from "../../../src/lib/session-init/errand-branch-cut.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

/**
 * Fake git seam: records every call, and resolves `show-ref` only for the
 * branches in `existing` (mirroring `git show-ref --verify --quiet`, which exits
 * non-zero — a rejection here — for an absent ref).
 */
function fakeExec(existing: Set<string>): ReturnType<typeof scriptGitExec> {
  return scriptGitExec([
    { match: { prefix: ["show-ref"] }, responses: [(call) => {
      const ref = call.args.at(-1) ?? "";
      const branch = ref.replace(/^refs\/heads\//u, "");
      return existing.has(branch)
        ? { stdout: "" }
        : { failure: { exitCode: 1, stderr: "show-ref: ref not found" } };
    }] },
    { match: { prefix: ["branch"] }, responses: [{ stdout: "" }] },
  ]);
}

describe("cutErrandBranch", () => {
  it.each(["chore/fix-flaky-test", "fix/flaky-login", "chore/fix-flaky-test-0a1b2c3d"])(
    "cuts %s off the base when the branch does not exist", async (branch) => {
      const { exec, calls } = fakeExec(new Set());

      expect(await cutErrandBranch({ exec }, { branch, base: "main" })).toEqual({ branch, created: true });
      expect(calls).toContainEqual(expect.objectContaining({ command: "git", args: ["branch", branch, "main"] }));
    });

  it("is a no-clobber no-op when a branch of that name already exists", async () => {
    const { exec, calls } = fakeExec(new Set(["refactor/extract-io-0a1b2c3d"]));

    const result = await cutErrandBranch({ exec }, { branch: "refactor/extract-io-0a1b2c3d", base: "main" });

    expect(result).toEqual({ branch: "refactor/extract-io-0a1b2c3d", created: false });
    expect(calls.some((call) => call.args[0] === "branch")).toBe(false);
  });

  it("rejects an empty branch rather than cutting one", async () => {
    const { exec } = fakeExec(new Set());

    await expect(cutErrandBranch({ exec }, { branch: "  ", base: "main" })).rejects.toThrow(/branch/);
  });
});
