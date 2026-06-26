import { describe, it, expect, vi } from "vitest";

import { runPlanOrphanSweep } from "../../../src/lib/session-init/plan-orphan-sweep.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const NUL = "\u0000";

/** Per-branch fixture: its `upstream:track` token and whether it landed in base. */
interface BranchFixture {
  track: string;
  merged: boolean;
}

/**
 * git stub driving the sweep end-to-end: `for-each-ref` lists every fixture
 * branch with its track token; `cherry origin/<base> <branch>` reflects each
 * branch's landed-in-base verdict (`+`-prefixed line ⇒ unmerged).
 */
function buildExec(branches: Record<string, BranchFixture>): GitExec {
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "for-each-ref") {
      const stdout = Object.entries(branches)
        .map(([name, fixture]) => `${name}${NUL}${fixture.track}`)
        .join("\n");
      return { stdout, stderr: "" };
    }
    if (args[0] === "cherry") {
      const branch = args[2];
      const fixture = branch !== undefined ? branches[branch] : undefined;
      return { stdout: fixture?.merged ? "" : "+ deadbeef\n", stderr: "" };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  }) as GitExec;
}

function runSweep(branches: Record<string, BranchFixture>) {
  return runPlanOrphanSweep({
    worktreeIdentity: { kind: "primary" },
    baseBranch: "main",
    exec: buildExec(branches),
  });
}

describe("runPlanOrphanSweep", () => {
  it("offers a gone-upstream `plan/` branch that is merged to base", async () => {
    const result = await runSweep({ "plan/shipped": { track: "gone", merged: true } });

    expect(result.orphans).toEqual([{ branch: "plan/shipped", merged: true }]);
  });

  it("surfaces a gone-upstream `plan/` branch that is not merged, but does not offer it", async () => {
    const result = await runSweep({ "plan/unshipped": { track: "gone", merged: false } });

    expect(result.orphans).toEqual([{ branch: "plan/unshipped", merged: false }]);
  });

  it("does not sweep a `plan/` branch whose upstream is still live", async () => {
    const result = await runSweep({ "plan/active": { track: "ahead 1", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not run outside the primary worktree", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("git should not be invoked outside the primary worktree");
    });

    const result = await runPlanOrphanSweep({
      worktreeIdentity: { kind: "linked", path: "/wt/feature" },
      baseBranch: "main",
      exec,
    });

    expect(result.orphans).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("partitions a mixed set — only gone branches swept, merged ones flagged", async () => {
    const result = await runSweep({
      "plan/shipped": { track: "gone", merged: true },
      "plan/unshipped": { track: "gone", merged: false },
      "plan/active": { track: "ahead 1", merged: true },
    });

    expect(result.orphans).toEqual([
      { branch: "plan/shipped", merged: true },
      { branch: "plan/unshipped", merged: false },
    ]);
  });
});
