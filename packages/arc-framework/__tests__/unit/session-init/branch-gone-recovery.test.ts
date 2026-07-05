import { describe, it, expect, vi } from "vitest";

import { runBranchGoneRecovery } from "../../../src/lib/session-init/branch-gone-recovery.js";
import type { ExecResult, GitExec, GitExecOptions } from "../../../src/lib/git/exec.js";
import type {
  WorktreeRosterEntry,
  WorktreeRosterResult,
} from "../../../src/lib/git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";
import type { UserSurfaceMigrationFs } from "../../../src/lib/user-surface-migration.js";

const PRESENT_MARKER: WorktreeMarkerReadResult = {
  kind: "present",
  marker: {
    spawnedByArc: true,
    wuName: "x",
    spawningIdentity: "andrew",
    createdAt: "2026-05-01T00:00:00Z",
  },
};

/**
 * Mock git: `status --porcelain` reports clean unless the worktree cwd is in
 * `dirty`; `cherry <base> <branch>` reports landed (empty output) when `branch`
 * is in `merged`, else lists an unmerged commit (`+ <sha>`).
 */
function buildExec(opts: { dirty?: Set<string>; merged?: Set<string> } = {}): GitExec {
  return vi.fn(async (_cmd: string, args: string[], options?: GitExecOptions): Promise<ExecResult> => {
    if (args[0] === "status") {
      const cwd = options?.cwd ?? "";
      return { stdout: opts.dirty?.has(cwd) ? " M file.ts\n" : "", stderr: "" };
    }
    if (args[0] === "cherry") {
      const branch = args[2];
      if (branch !== undefined && opts.merged?.has(branch)) return { stdout: "", stderr: "" };
      return { stdout: "+ deadbeef\n", stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "list") {
      return {
        stdout: "worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n",
        stderr: "",
      };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  });
}

function readMarkerFrom(
  map: Record<string, WorktreeMarkerReadResult>,
): (worktreePath: string) => Promise<WorktreeMarkerReadResult> {
  return async (worktreePath) => map[worktreePath] ?? { kind: "absent" };
}

function roster(entries: WorktreeRosterEntry[]): WorktreeRosterResult {
  return { entries, warnings: [] };
}

const emptyUserSurfaceFs: UserSurfaceMigrationFs = {
  readDir: async () => [],
  readFile: async () => "",
  writeFile: async () => {},
  mkdir: async () => {},
};

const divergentUnknownUserSurfaceFs: UserSurfaceMigrationFs = {
  readDir: async (path) => {
    if (path === "/wt/a/.arc/user") {
      return [{ name: "andrew", isDirectory: () => true, isFile: () => false }];
    }
    if (path === "/wt/a/.arc/user/andrew") {
      return [{ name: "FUTURE.md", isDirectory: () => false, isFile: () => true }];
    }
    return [];
  },
  readFile: async (path) => path.startsWith("/primary/") ? "primary\n" : "linked\n",
  writeFile: async () => {},
  mkdir: async () => {},
};

describe("runBranchGoneRecovery", () => {
  it("resolves to a lone live WU worktree, deriving its action from per-worktree signals", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec({ merged: new Set() }), // feat/a not merged → live
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
    });
  });

  it("offers removal for a shipped-and-clean WU worktree (merged + present marker)", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec({ merged: new Set(["feat/a"]) }),
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "removable" },
    });
  });

  it("keeps a merged WU worktree as a switch target when ignored user surfaces cannot reconcile", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec({ merged: new Set(["feat/a"]) }),
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: divergentUnknownUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
    });
  });

  it("treats a meta-less (main/admin) worktree as a switch candidate without gathering signals", async () => {
    const readMarker = vi.fn(readMarkerFrom({}));
    const result = await runBranchGoneRecovery({
      roster: roster([{ worktreePath: "/wt/main", branch: "main" }]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec(),
      readMarker,
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "main", worktreePath: "/wt/main", proposedAction: "switch" },
    });
    expect(readMarker).not.toHaveBeenCalled();
  });

  it("excludes the branch-gone branch from candidates", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/gone", branch: "feat/gone", metaFilePath: "/wt/gone/.arc/active/meta-gone.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec(),
      readMarker: readMarkerFrom({}),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({ kind: "main-fallback" });
  });

  it("falls through to recent branches when no worktree candidates remain", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: ["feat/recent"],
      exec: buildExec(),
      readMarker: readMarkerFrom({}),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "feat/recent", proposedAction: "switch" },
    });
  });

  it("drops the base branch and worktree-represented branches from the recent tier", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      // main (base) and feat/a (represented) drop out; only feat/new survives → 2 candidates total.
      recentBranches: ["main", "feat/a", "feat/new"],
      exec: buildExec({ merged: new Set() }),
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    // Worktree tier is non-empty (feat/a), so it wins outright — recent tier not consulted.
    expect(result).toEqual({
      kind: "resolved",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
    });
  });

  it("surfaces multiple worktree candidates rather than guessing", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
        { worktreePath: "/wt/b", branch: "feat/b", metaFilePath: "/wt/b/.arc/active/meta-b.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec({ merged: new Set() }),
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER, "/wt/b": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result.kind).toBe("surface");
    if (result.kind === "surface") {
      expect(result.candidates.map((c) => c.branch)).toEqual(["feat/a", "feat/b"]);
    }
  });
});
