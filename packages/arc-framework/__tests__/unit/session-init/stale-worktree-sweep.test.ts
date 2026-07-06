import { describe, it, expect } from "vitest";

import {
  findStaleWorktreeCandidates,
  runStaleWorktreeSweep,
} from "../../../src/lib/session-init/stale-worktree-sweep.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";
import type { UserSurfaceMigrationFs } from "../../../src/lib/user-surface-migration.js";

const shipped = new Set(["work-organization-reform"]);

/** Roster with one shipped-WU worktree and one still-active worktree. */
function roster(): WorktreeRosterResult {
  return {
    entries: [
      {
        worktreePath: "/wt/wor",
        branch: "feat/work-organization-reform",
        metaFilePath: "/wt/wor/.arc/active/meta-work-organization-reform.md",
      },
      {
        worktreePath: "/wt/foundation",
        branch: "feat/worktree-foundation",
        metaFilePath: "/wt/foundation/.arc/active/meta-worktree-foundation.md",
      },
    ],
    warnings: [],
  };
}

describe("findStaleWorktreeCandidates", () => {
  it("surfaces a lingering worktree whose WU has shipped", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "primary" },
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.branch).toBe("feat/work-organization-reform");
  });

  it("does not surface a worktree whose WU is still active", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "primary" },
    });

    const branches = result.candidates.map((c) => c.branch);
    expect(branches).not.toContain("feat/worktree-foundation");
  });

  it("scans no siblings outside the primary worktree (the resume path)", () => {
    const result = findStaleWorktreeCandidates({
      roster: roster(),
      shipped,
      worktreeIdentity: { kind: "linked", path: "/wt/foundation" },
    });

    expect(result.candidates).toEqual([]);
  });
});

/** Roster with a single shipped-WU worktree. */
function shippedRoster(): WorktreeRosterResult {
  return {
    entries: [
      {
        worktreePath: "/wt/wor",
        branch: "feat/work-organization-reform",
        metaFilePath: "/wt/wor/.arc/active/meta-work-organization-reform.md",
      },
    ],
    warnings: [],
  };
}

/**
 * git stub: `ls-tree` reflects the base-ref shipped set, `status --porcelain`
 * reflects `clean`, and `cherry` reflects `merged` (landed-in-base).
 */
function buildExec(opts: { clean: boolean; merged: boolean; shippedFromRef?: boolean }): GitExec {
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "ls-tree") {
      return {
        stdout: opts.shippedFromRef === false
          ? ""
          : ".arc/completed/2026-q2/10_work-organization-reform/meta-work-organization-reform.md\n",
        stderr: "",
      };
    }
    if (args[0] === "status") {
      return { stdout: opts.clean ? "" : " M file.ts\n", stderr: "" };
    }
    if (args[0] === "cherry") {
      return { stdout: opts.merged ? "" : "+ deadbeef\n", stderr: "" };
    }
    if (args[0] === "worktree" && args[1] === "list") {
      return {
        stdout: "worktree /primary\nHEAD 1111111111111111111111111111111111111111\nbranch refs/heads/main\n",
        stderr: "",
      };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  }) as GitExec;
}

const presentMarker: WorktreeMarkerReadResult = {
  kind: "present",
  marker: {
    spawnedByArc: true,
    wuName: "work-organization-reform",
    spawningIdentity: "andrew",
    createdAt: "2026-05-01T00:00:00.000Z",
  },
};

const emptyUserSurfaceFs: UserSurfaceMigrationFs = {
  readDir: async () => [],
  readFile: async () => "",
  writeFile: async () => {},
  mkdir: async () => {},
};

const divergentUnknownUserSurfaceFs: UserSurfaceMigrationFs = {
  readDir: async (path) => {
    if (path === "/wt/wor/.arc/user") {
      return [{ name: "andrew", isDirectory: () => true, isFile: () => false }];
    }
    if (path === "/wt/wor/.arc/user/andrew") {
      return [{ name: "FUTURE.md", isDirectory: () => false, isFile: () => true }];
    }
    return [];
  },
  readFile: async (path) => path.startsWith("/primary/") ? "primary\n" : "linked\n",
  writeFile: async () => {},
  mkdir: async () => {},
};

function runSweep(opts: {
  clean: boolean;
  merged: boolean;
  marker: WorktreeMarkerReadResult;
  roster?: WorktreeRosterResult;
  userSurfaceFs?: UserSurfaceMigrationFs;
}) {
  return runStaleWorktreeSweep({
    roster: opts.roster ?? shippedRoster(),
    worktreeIdentity: { kind: "primary" },
    baseBranch: "main",
    exec: buildExec({ clean: opts.clean, merged: opts.merged }),
    readMarker: async () => opts.marker,
    userSurfaceFs: opts.userSurfaceFs ?? emptyUserSurfaceFs,
  });
}

describe("runStaleWorktreeSweep", () => {
  it("is removable for a shipped worktree that is clean, merged, and ARC-marked", async () => {
    const result = await runSweep({ clean: true, merged: true, marker: presentMarker });

    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0]?.branch).toBe("feat/work-organization-reform");
    expect(result.worktrees[0]?.decision).toEqual({ action: "removable" });
  });

  it("is external when the worktree carries no ARC marker", async () => {
    const result = await runSweep({ clean: true, merged: true, marker: { kind: "absent" } });

    expect(result.worktrees[0]?.decision).toEqual({ action: "external" });
  });

  it("blocks (never offers) a shipped worktree with uncommitted changes", async () => {
    const result = await runSweep({ clean: false, merged: true, marker: presentMarker });

    expect(result.worktrees[0]?.decision).toEqual({ action: "blocked", reason: "uncommitted" });
  });

  it("blocks (never offers) a shipped worktree whose branch is not merged", async () => {
    const result = await runSweep({ clean: true, merged: false, marker: presentMarker });

    expect(result.worktrees[0]?.decision).toEqual({ action: "blocked", reason: "unmerged" });
  });

  it("blocks a clean shipped worktree with unreconciled ignored identity-global files", async () => {
    const result = await runSweep({
      clean: true,
      merged: true,
      marker: presentMarker,
      userSurfaceFs: divergentUnknownUserSurfaceFs,
    });

    expect(result.worktrees[0]?.decision).toEqual({ action: "blocked", reason: "user-surfaces" });
  });

  it("reports no worktrees when none of the roster's WUs have shipped", async () => {
    const roster: WorktreeRosterResult = {
      entries: [{ worktreePath: "/wt/foundation", branch: "feat/worktree-foundation" }],
      warnings: [],
    };
    const result = await runSweep({ clean: true, merged: true, marker: presentMarker, roster });

    expect(result.worktrees).toEqual([]);
  });

  it("reports no worktrees outside the primary worktree", async () => {
    const result = await runStaleWorktreeSweep({
      roster: shippedRoster(),
      worktreeIdentity: { kind: "linked", path: "/wt/wor" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async () => presentMarker,
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result.worktrees).toEqual([]);
  });

  it("reads shipped WUs from the base ref instead of the working tree", async () => {
    const result = await runStaleWorktreeSweep({
      roster: shippedRoster(),
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true, shippedFromRef: true }),
      readMarker: async () => presentMarker,
      userSurfaceFs: emptyUserSurfaceFs,
    });

    expect(result.worktrees).toHaveLength(1);
  });
});
