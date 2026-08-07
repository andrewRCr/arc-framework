import { describe, it, expect, vi } from "vitest";

import { runBranchGoneRecovery } from "../../../src/lib/session-init/branch-gone-recovery.js";
import type { CleanupBaseEvidence } from "../../../src/lib/session-init/cleanup-remote-evidence.js";
import type { ExecResult, GitExec, GitExecOptions } from "../../../src/lib/git/exec.js";
import type {
  WorktreeRosterEntry,
  WorktreeRosterResult,
} from "../../../src/lib/git/worktree-roster.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";
import type { UserSurfaceMigrationFs } from "../../../src/lib/user-surface-migration.js";
import { worktreePorcelainZ } from "../../helpers/worktree-porcelain.js";

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
      return { stdout: `+ ${"d".repeat(40)}\n`, stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "list") {
      return {
        stdout: worktreePorcelainZ(
          "worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n",
        ),
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
    const baseOid = "b".repeat(40);
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
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    });

    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
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
      remoteEvidence: "exact",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "removable" },
    });
  });

  it("derives removability from the exact advertised base instead of a stale tracking ref", async () => {
    const baseOid = "b".repeat(40);
    const exec: GitExec = async (_command, args, options) => {
      if (args[0] === "worktree") {
        return {
          stdout: worktreePorcelainZ(
            "worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n",
          ),
          stderr: "",
        };
      }
      if (args[0] === "status") return { stdout: "", stderr: "" };
      if (args[0] === "cherry" && args[1] === baseOid && args[2] === "feat/a") {
        if (options?.objectAccess !== "local-only") throw new Error("object access was not local-only");
        return { stdout: "", stderr: "" };
      }
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec,
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    });

    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "removable" },
    });
  });

  it("retains a worktree without removability authority when the advertised base object is missing", async () => {
    const baseOid = "b".repeat(40);
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
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: false } },
        history: { kind: "complete" },
      },
    });

    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
    });
  });

  it.each([
    {
      name: "disabled remote inspection",
      evidence: {
        remoteSyncEnabled: false,
        snapshot: { kind: "unreachable", failureReason: "network" },
        objectAvailability: { kind: "unavailable", reason: "execution" },
        history: { kind: "unavailable", reason: "execution" },
      },
    },
    {
      name: "unreachable remote",
      evidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "unreachable", failureReason: "network" },
        objectAvailability: { kind: "unavailable", reason: "execution" },
        history: { kind: "unavailable", reason: "execution" },
      },
    },
    {
      name: "absent advertised base",
      evidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: {} },
        objectAvailability: { kind: "complete", commits: {} },
        history: { kind: "complete" },
      },
    },
  ] satisfies Array<{ name: string; evidence: CleanupBaseEvidence }>)(
    "retains a non-removable worktree with $name",
    async ({ evidence }) => {
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
        baseEvidence: evidence,
      });

      expect(result).toEqual({
        kind: "resolved",
        remoteEvidence: "exact",
        candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
      });
    },
  );

  it("preserves external handling with exact evidence when the ownership marker is absent", async () => {
    const baseOid = "b".repeat(40);
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec: buildExec({ merged: new Set(["feat/a"]) }),
      readMarker: readMarkerFrom({}),
      userSurfaceFs: emptyUserSurfaceFs,
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    });

    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "external" },
    });
  });

  it("refuses removability authority when shallow history prevents the exact merge proof", async () => {
    const baseOid = "b".repeat(40);
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
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "shallow" },
      },
    });

    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
      candidate: { branch: "feat/a", worktreePath: "/wt/a", proposedAction: "switch" },
    });
  });

  it("propagates an unexpected local graph failure from exact recovery evidence", async () => {
    const baseOid = "b".repeat(40);
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "worktree") {
        return {
          stdout: worktreePorcelainZ(
            "worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n",
          ),
          stderr: "",
        };
      }
      if (args[0] === "status") return { stdout: "", stderr: "" };
      if (args[0] === "cherry") throw new Error("graph failed");
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    await expect(runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: [],
      exec,
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
      baseEvidence: {
        remoteSyncEnabled: true,
        snapshot: { kind: "available", scope: "all-heads", tips: { main: baseOid } },
        objectAvailability: { kind: "complete", commits: { [baseOid]: true } },
        history: { kind: "complete" },
      },
    })).rejects.toThrow("graph failed");
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
      remoteEvidence: "exact",
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
      remoteEvidence: "exact",
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

    expect(result).toEqual({ kind: "main-fallback", remoteEvidence: "exact" });
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
      remoteEvidence: "exact",
      candidate: { branch: "feat/recent", proposedAction: "switch" },
    });
  });

  it("does not auto-select a verified recent singleton while eligible branch objects remain pending", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      recentBranches: ["feat/recent"],
      recentPendingBranchCount: 1,
      exec: buildExec(),
      readMarker: readMarkerFrom({}),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result).toEqual({
      kind: "pending",
      remoteEvidence: "pending-fetch",
      candidates: [{ branch: "feat/recent", proposedAction: "switch" }],
      pendingBranchCount: 1,
      refreshRemedy: {
        argv: ["arc", "active", "in-flight", "--json"],
        text: "Refresh live in-flight branch evidence.",
      },
    });
  });

  it("drops the base branch and worktree-represented branches from the recent tier", async () => {
    const result = await runBranchGoneRecovery({
      roster: roster([
        { worktreePath: "/wt/a", branch: "feat/a", metaFilePath: "/wt/a/.arc/active/meta-a.md" },
      ]),
      currentBranch: "feat/gone",
      baseBranch: "main",
      // Main and the represented branch drop; the remaining verified and pending lower tier cannot outrank feat/a.
      recentBranches: ["main", "feat/a", "feat/new"],
      recentPendingBranchCount: 2,
      exec: buildExec({ merged: new Set() }),
      readMarker: readMarkerFrom({ "/wt/a": PRESENT_MARKER }),
      userSurfaceFs: emptyUserSurfaceFs,
    });

    // Worktree tier is non-empty (feat/a), so it wins outright — recent tier not consulted.
    expect(result).toEqual({
      kind: "resolved",
      remoteEvidence: "exact",
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
