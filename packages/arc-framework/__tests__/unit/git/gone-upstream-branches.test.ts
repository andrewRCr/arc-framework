import { describe, it, expect, vi } from "vitest";

import { listGoneUpstreamBranches } from "../../../src/lib/git/gone-upstream-branches.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

const NUL = "\u0000";

/** Build an exec stub returning a fixed `for-each-ref` payload (NUL-joined fields). */
function execReturning(stdout: string): GitExec {
  return vi.fn(async (): Promise<ExecResult> => ({ stdout, stderr: "" }));
}

/** One `for-each-ref` output line: `<short-name>NUL<upstream:track,nobracket>NUL<worktreepath>`. */
function line(name: string, track: string, worktreePath = ""): string {
  return `${name}${NUL}${track}${NUL}${worktreePath}`;
}

describe("listGoneUpstreamBranches", () => {
  it("returns the short names of branches whose upstream is gone", async () => {
    const exec = execReturning([line("plan/a", "gone"), line("plan/b", "gone")].join("\n"));

    const result = await listGoneUpstreamBranches(exec, "refs/heads/plan/");

    expect(result).toEqual(["plan/a", "plan/b"]);
  });

  it("excludes branches with a live upstream (ahead / behind / up-to-date)", async () => {
    const exec = execReturning(
      [line("plan/gone", "gone"), line("plan/ahead", "ahead 1"), line("plan/current", "")].join(
        "\n",
      ),
    );

    const result = await listGoneUpstreamBranches(exec, "refs/heads/plan/");

    expect(result).toEqual(["plan/gone"]);
  });

  it("excludes branches with no upstream configured (empty track field)", async () => {
    const exec = execReturning([line("plan/local-only", ""), line("plan/gone", "gone")].join("\n"));

    const result = await listGoneUpstreamBranches(exec, "refs/heads/plan/");

    expect(result).toEqual(["plan/gone"]);
  });

  it("excludes a gone branch checked out in a worktree (worktree residue has its own sweep)", async () => {
    const exec = execReturning(
      [line("feat/checked-out", "gone", "/wt/feat-checked-out"), line("feat/gone", "gone")].join("\n"),
    );

    const result = await listGoneUpstreamBranches(exec, "refs/heads/");

    expect(result).toEqual(["feat/gone"]);
  });

  it("returns an empty list when the read fails (hygiene is a soft signal)", async () => {
    const exec: GitExec = vi.fn(async () => {
      throw new Error("for-each-ref failed");
    });

    const result = await listGoneUpstreamBranches(exec, "refs/heads/plan/");

    expect(result).toEqual([]);
  });

  it("scopes the enumeration to the given ref prefix", async () => {
    const exec = vi.fn(async (): Promise<ExecResult> => ({ stdout: "", stderr: "" }));

    await listGoneUpstreamBranches(exec, "refs/heads/plan/");

    expect(exec).toHaveBeenCalledWith("git", [
      "for-each-ref",
      "--format=%(refname:short)%00%(upstream:track,nobracket)%00%(worktreepath)",
      "refs/heads/plan/",
    ]);
  });
});
