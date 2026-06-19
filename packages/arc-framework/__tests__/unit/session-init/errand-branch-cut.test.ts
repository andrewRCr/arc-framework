/**
 * Unit tests for `cutErrandBranch` — the errand-launch branch-cut mechanic. It
 * cuts `chore/<slug>` off a resolved base, consuming the slug as logical
 * identity (never recovering it by parsing a branch), and no-clobbers an
 * already-existing branch of that name (a force-create would move the ref and
 * drop its commits). The git seam is injected.
 */

import { describe, it, expect } from "vitest";

import { cutErrandBranch } from "../../../src/lib/session-init/errand-branch-cut.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

interface Call {
  cmd: string;
  args: string[];
}

/**
 * Fake git seam: records every call, and resolves `show-ref` only for the
 * branches in `existing` (mirroring `git show-ref --verify --quiet`, which exits
 * non-zero — a rejection here — for an absent ref).
 */
function fakeExec(existing: Set<string>): { exec: GitExec; calls: Call[] } {
  const calls: Call[] = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push({ cmd, args });
    if (args[0] === "show-ref") {
      const ref = args[args.length - 1] ?? "";
      const branch = ref.replace(/^refs\/heads\//, "");
      if (existing.has(branch)) return { stdout: "" };
      throw new Error("show-ref: ref not found");
    }
    return { stdout: "" };
  };
  return { exec, calls };
}

describe("cutErrandBranch", () => {
  it("cuts chore/<slug> off the base when the branch does not exist", async () => {
    const { exec, calls } = fakeExec(new Set());

    const result = await cutErrandBranch({ exec }, { slug: "fix-flaky-test", base: "main" });

    expect(result).toEqual({ branch: "chore/fix-flaky-test", created: true });
    expect(calls).toContainEqual({ cmd: "git", args: ["branch", "chore/fix-flaky-test", "main"] });
  });

  it("is a no-clobber no-op when a branch of that name already exists", async () => {
    const { exec, calls } = fakeExec(new Set(["chore/fix-flaky-test"]));

    const result = await cutErrandBranch({ exec }, { slug: "fix-flaky-test", base: "main" });

    expect(result).toEqual({ branch: "chore/fix-flaky-test", created: false });
    expect(calls.some((call) => call.args[0] === "branch")).toBe(false);
  });

  it("rejects an empty slug rather than cutting a bare `chore/` branch", async () => {
    const { exec } = fakeExec(new Set());

    await expect(cutErrandBranch({ exec }, { slug: "  ", base: "main" })).rejects.toThrow(/slug/);
  });
});
