import { describe, it, expect } from "vitest";

import {
  findStaleWorktreeCandidates,
  runStaleWorktreeSweep,
} from "../../../src/lib/session-init/stale-worktree-sweep.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";
import type { CompletedIndexFs } from "../../../src/lib/work-unit/completed-index.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import type { WorktreeMarkerReadResult } from "../../../src/lib/git/worktree-marker.js";

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

const completed = "/repo/.arc/completed";

/** Completed archive containing the shipped WU `work-organization-reform`. */
function completedFs(): CompletedIndexFs {
  const dirs: Record<string, string[]> = {
    [completed]: ["2026-q2"],
    [`${completed}/2026-q2`]: ["10_work-organization-reform"],
  };
  return {
    readdir: async (path) => {
      const entry = dirs[path.replace(/\/$/u, "")];
      if (entry === undefined) {
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      return entry;
    },
  };
}

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

/** git stub: `status --porcelain` reflects `clean`; `cherry` reflects `merged` (landed-in-base). */
function buildExec(opts: { clean: boolean; merged: boolean }): GitExec {
  return (async (_cmd: string, args: string[]) => {
    if (args[0] === "status") {
      return { stdout: opts.clean ? "" : " M file.ts\n", stderr: "" };
    }
    if (args[0] === "cherry") {
      return { stdout: opts.merged ? "" : "+ deadbeef\n", stderr: "" };
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

function runSweep(opts: {
  clean: boolean;
  merged: boolean;
  marker: WorktreeMarkerReadResult;
  roster?: WorktreeRosterResult;
}) {
  return runStaleWorktreeSweep({
    roster: opts.roster ?? shippedRoster(),
    worktreeIdentity: { kind: "primary" },
    cwd: "/repo",
    baseBranch: "main",
    exec: buildExec({ clean: opts.clean, merged: opts.merged }),
    fs: completedFs(),
    readMarker: async () => opts.marker,
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
      cwd: "/repo",
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      fs: completedFs(),
      readMarker: async () => presentMarker,
    });

    expect(result.worktrees).toEqual([]);
  });
});
