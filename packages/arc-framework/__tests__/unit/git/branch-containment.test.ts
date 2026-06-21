import { describe, it, expect } from "vitest";

import {
  assessReapSafety,
  isContainedIn,
  isLandedInBase,
} from "../../../src/lib/git/branch-containment.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

/**
 * Build a recording {@link GitExec}. `stdoutFor` maps an invocation's args to its
 * stdout (default empty); `failOn` names invocations that should reject (matched
 * on the joined args), modeling a non-zero git exit — e.g. `rev-parse --verify`
 * on an absent ref.
 */
function makeExec(opts?: {
  stdoutFor?: (args: string[]) => string;
  failOn?: (args: string[]) => boolean;
}): { exec: GitExec; calls: string[][] } {
  const calls: string[][] = [];
  const exec: GitExec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (opts?.failOn?.(args) === true) throw new Error(`git ${args.join(" ")} failed`);
    return { stdout: opts?.stdoutFor?.(args) ?? "" };
  };
  return { exec, calls };
}

describe("isContainedIn", () => {
  it("is true when the ahead-set is empty", async () => {
    const { exec, calls } = makeExec();
    expect(await isContainedIn(exec, "feat/x", "origin/feat/x")).toBe(true);
    expect(calls).toEqual([["git", "rev-list", "feat/x", "^origin/feat/x"]]);
  });

  it("is false when the branch carries commits the container lacks", async () => {
    const { exec } = makeExec({ stdoutFor: () => "abc123\ndef456\n" });
    expect(await isContainedIn(exec, "feat/x", "origin/feat/x")).toBe(false);
  });

  it("reads an exec failure as not-contained (safe default)", async () => {
    const { exec } = makeExec({ failOn: () => true });
    expect(await isContainedIn(exec, "feat/x", "origin/feat/x")).toBe(false);
  });
});

describe("isLandedInBase", () => {
  it("is true for empty cherry output (nothing ahead of base)", async () => {
    const { exec, calls } = makeExec();
    expect(await isLandedInBase(exec, "feat/x", "main")).toBe(true);
    expect(calls).toEqual([["git", "cherry", "main", "feat/x"]]);
  });

  it("is true when every commit has a patch-equivalent in base (rebase / single-commit squash → all '-')", async () => {
    const { exec } = makeExec({ stdoutFor: () => "- 1111111\n- 2222222\n" });
    expect(await isLandedInBase(exec, "feat/x", "main")).toBe(true);
  });

  it("is false when any commit has no patch-equivalent in base ('+')", async () => {
    const { exec } = makeExec({ stdoutFor: () => "- 1111111\n+ 3333333\n" });
    expect(await isLandedInBase(exec, "feat/x", "main")).toBe(false);
  });

  it("reads an exec failure as not-landed (safe default)", async () => {
    const { exec } = makeExec({ failOn: () => true });
    expect(await isLandedInBase(exec, "feat/x", "main")).toBe(false);
  });
});

describe("assessReapSafety", () => {
  it("is safe when contained in its upstream (pushed) — base check not consulted", async () => {
    // rev-parse verifies upstream exists; rev-list empty → contained. No cherry.
    const { exec, calls } = makeExec();
    expect(await assessReapSafety(exec, { branch: "feat/x", base: "main" })).toEqual({
      safe: true,
      reason: "",
    });
    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/feat/x"],
      ["git", "rev-list", "feat/x", "^origin/feat/x"],
    ]);
  });

  it("falls back to the base patch-check when the upstream is gone (auto-delete-on-merge / pruning pull)", async () => {
    // rev-parse rejects (no remote-tracking ref); cherry shows all '-' → landed.
    const { exec, calls } = makeExec({
      failOn: (args) => args[0] === "rev-parse",
      stdoutFor: (args) => (args[0] === "cherry" ? "- 1111111\n" : ""),
    });
    expect(await assessReapSafety(exec, { branch: "feat/x", base: "main" })).toEqual({
      safe: true,
      reason: "",
    });
    expect(calls).toEqual([
      ["git", "rev-parse", "--verify", "--quiet", "origin/feat/x"],
      ["git", "cherry", "main", "feat/x"],
    ]);
  });

  it("is safe via the base check when pushed-but-ahead yet merged (upstream stale, landed in base)", async () => {
    // upstream exists but branch is ahead of it (rev-list non-empty); cherry → landed.
    const { exec } = makeExec({
      stdoutFor: (args) => {
        if (args[0] === "rev-list") return "aaaa\n"; // ahead of upstream
        return ""; // cherry empty → landed
      },
    });
    expect(await assessReapSafety(exec, { branch: "feat/x", base: "main" })).toEqual({
      safe: true,
      reason: "",
    });
  });

  it("is unsafe (unpushed message) when no upstream and not landed in base", async () => {
    const { exec } = makeExec({
      failOn: (args) => args[0] === "rev-parse",
      stdoutFor: (args) => (args[0] === "cherry" ? "+ 3333333\n" : ""),
    });
    const result = await assessReapSafety(exec, { branch: "fix/wip", base: "main" });
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/unmerged.*unpushed/u);
  });

  it("is unsafe (upstream message) when ahead of upstream and not landed in base", async () => {
    const { exec } = makeExec({
      stdoutFor: (args) => {
        if (args[0] === "rev-list") return "aaaa\n"; // ahead of upstream
        if (args[0] === "cherry") return "+ 3333333\n"; // not landed
        return "";
      },
    });
    const result = await assessReapSafety(exec, { branch: "feat/x", base: "main" });
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/not on its upstream or landed/u);
  });

  it("honors an explicit remote for the upstream", async () => {
    const { exec, calls } = makeExec();
    await assessReapSafety(exec, { branch: "feat/x", base: "main", remote: "upstream" });
    expect(calls[0]).toEqual(["git", "rev-parse", "--verify", "--quiet", "upstream/feat/x"]);
  });
});
