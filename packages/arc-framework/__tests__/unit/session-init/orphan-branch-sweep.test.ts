import { describe, it, expect, vi } from "vitest";

import { runOrphanBranchSweep } from "../../../src/lib/session-init/orphan-branch-sweep.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

const NUL = "\u0000";

/** Per-branch fixture: its `upstream:track` token, landed-in-base verdict, and checkout path. */
interface BranchFixture {
  track: string;
  merged: boolean;
  worktreePath?: string;
}

/**
 * git stub driving the sweep end-to-end: `for-each-ref` lists every fixture
 * branch with its track token and checkout path; `cherry origin/<base> <branch>`
 * reflects each branch's landed-in-base verdict (`+`-prefixed line ⇒ unmerged);
 * `ls-tree` serves the `completed/` archive paths backing the shipped-WU index.
 */
function buildExec(
  branches: Record<string, BranchFixture>,
  shippedWorkUnits: string[] = [],
): GitExec {
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "for-each-ref") {
      const stdout = Object.entries(branches)
        .map(
          ([name, fixture]) => `${name}${NUL}${fixture.track}${NUL}${fixture.worktreePath ?? ""}`,
        )
        .join("\n");
      return { stdout, stderr: "" };
    }
    if (args[0] === "cherry") {
      const branch = args[2];
      const fixture = branch !== undefined ? branches[branch] : undefined;
      return { stdout: fixture?.merged ? "" : "+ deadbeef\n", stderr: "" };
    }
    if (args[0] === "ls-tree") {
      const stdout = shippedWorkUnits
        .map(
          (slug, idx) =>
            `.arc/completed/2026-q2/${String(idx + 1).padStart(2, "0")}_${slug}/meta-${slug}.md`,
        )
        .join("\n");
      return { stdout, stderr: "" };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  }) as GitExec;
}

function runSweep(
  branches: Record<string, BranchFixture>,
  options: { shipped?: string[]; errandBranches?: string[] } = {},
) {
  return runOrphanBranchSweep({
    worktreeIdentity: { kind: "primary" },
    baseBranch: "main",
    errandBranches: new Set(options.errandBranches ?? []),
    exec: buildExec(branches, options.shipped ?? []),
  });
}

describe("runOrphanBranchSweep", () => {
  it("offers a gone-upstream branch that is merged to base, across any type prefix", async () => {
    const result = await runSweep({
      "plan/shipped": { track: "gone", merged: true },
      "feat/landed": { track: "gone", merged: true },
    });

    expect(result.orphans).toEqual([
      { branch: "plan/shipped", merged: true, shippedWorkUnit: null },
      { branch: "feat/landed", merged: true, shippedWorkUnit: null },
    ]);
  });

  it("surfaces a gone-upstream branch that is not merged, but does not offer it", async () => {
    const result = await runSweep({ "fix/unshipped": { track: "gone", merged: false } });

    expect(result.orphans).toEqual([
      { branch: "fix/unshipped", merged: false, shippedWorkUnit: null },
    ]);
  });

  it("names the shipped work unit when the branch slug matches a completed/ record", async () => {
    const result = await runSweep(
      {
        "feat/user-sync": { track: "gone", merged: false },
        "fix/loose-end": { track: "gone", merged: true },
      },
      { shipped: ["user-sync"] },
    );

    expect(result.orphans).toEqual([
      { branch: "feat/user-sync", merged: false, shippedWorkUnit: "user-sync" },
      { branch: "fix/loose-end", merged: true, shippedWorkUnit: null },
    ]);
  });

  it("does not sweep a branch whose upstream is still live", async () => {
    const result = await runSweep({ "feat/active": { track: "ahead 1", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a bare (unprefixed) branch", async () => {
    const result = await runSweep({ trunk: { track: "gone", merged: true } });

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a branch carrying an errand record — the errand surfaces own it", async () => {
    const result = await runSweep(
      { "chore/errand-in-flight": { track: "gone", merged: true } },
      { errandBranches: ["chore/errand-in-flight"] },
    );

    expect(result.orphans).toEqual([]);
  });

  it("does not sweep a branch checked out in a worktree", async () => {
    const result = await runSweep({
      "feat/occupied": { track: "gone", merged: true, worktreePath: "/wt/occupied" },
    });

    expect(result.orphans).toEqual([]);
  });

  it("does not run outside the primary worktree", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("git should not be invoked outside the primary worktree");
    });

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "linked", path: "/wt/feature" },
      baseBranch: "main",
      errandBranches: new Set(),
      exec,
    });

    expect(result.orphans).toEqual([]);
    expect(exec).not.toHaveBeenCalled();
  });

  it("skips the shipped-index read when no orphan survives the scan", async () => {
    const exec = vi.fn(buildExec({ "feat/active": { track: "ahead 1", merged: true } }));

    const result = await runOrphanBranchSweep({
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      errandBranches: new Set(),
      exec: exec as GitExec,
    });

    expect(result.orphans).toEqual([]);
    const invokedSubcommands = exec.mock.calls.map((call) => (call[1] as string[])[0]);
    expect(invokedSubcommands).toEqual(["for-each-ref"]);
  });

  it("partitions a mixed set — only reapable gone branches swept, verdicts attached", async () => {
    const result = await runSweep(
      {
        "plan/groomed": { track: "gone", merged: true },
        "feat/shipped-elsewhere": { track: "gone", merged: false },
        "fix/unmerged": { track: "gone", merged: false },
        "feat/active": { track: "ahead 1", merged: true },
        "chore/errand": { track: "gone", merged: true },
      },
      { shipped: ["shipped-elsewhere"], errandBranches: ["chore/errand"] },
    );

    expect(result.orphans).toEqual([
      { branch: "plan/groomed", merged: true, shippedWorkUnit: null },
      { branch: "feat/shipped-elsewhere", merged: false, shippedWorkUnit: "shipped-elsewhere" },
      { branch: "fix/unmerged", merged: false, shippedWorkUnit: null },
    ]);
  });
});
