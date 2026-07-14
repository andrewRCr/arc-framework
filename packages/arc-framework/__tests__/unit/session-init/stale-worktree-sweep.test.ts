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

function stampedMarker(
  subject: { kind: "work-unit"; name: string } | { kind: "errand"; slug: string } | { kind: "branch"; ref: string },
  options: { identity?: string; sha?: string; branch?: string } = {},
): WorktreeMarkerReadResult {
  const branch = options.branch
    ?? (subject.kind === "branch" ? subject.ref : `feat/${subject.kind === "work-unit" ? subject.name : subject.slug}`);
  return {
    kind: "present",
    marker: {
      spawnedByArc: true,
      createdFor: subject,
      spawningIdentity: options.identity ?? "andrew",
      createdAt: "2026-05-01T00:00:00.000Z",
      husk: {
        sha: options.sha ?? "stamped",
        at: "2026-07-14T20:00:00.000Z",
        subject,
        branch,
      },
    },
  };
}

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

  it("reports detached stamped husks through exact-HEAD cleanup decisions", async () => {
    const huskMarker = stampedMarker({ kind: "work-unit", name: "work-organization-reform" });
    const result = await runStaleWorktreeSweep({
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async () => huskMarker,
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [
          { path: "/wt/husk", head: "stamped", branch: null, detached: true, primary: false },
          { path: "/wt/moved", head: "moved", branch: null, detached: true, primary: false },
        ],
      }),
    });

    expect(result.worktrees).toEqual([
      {
        kind: "husk",
        worktreePath: "/wt/husk",
        branch: null,
        subject: { kind: "work-unit", name: "work-organization-reform" },
        completedWorkUnit: "work-organization-reform",
        decision: { action: "removable" },
      },
      {
        kind: "husk",
        worktreePath: "/wt/moved",
        branch: null,
        subject: { kind: "work-unit", name: "work-organization-reform" },
        completedWorkUnit: "work-organization-reform",
        decision: { action: "blocked", reason: "head-moved" },
      },
    ]);
  });

  it("blocks a dirty stamped husk", async () => {
    const result = await runStaleWorktreeSweep({
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: false, merged: true }),
      readMarker: async () => stampedMarker({ kind: "work-unit", name: "work-organization-reform" }),
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [{ path: "/wt/dirty", head: "stamped", branch: null, detached: true, primary: false }],
      }),
    });

    expect(result.worktrees[0]?.decision).toEqual({ action: "blocked", reason: "uncommitted" });
  });

  it("reports recordless and errand husks without claiming WU completion", async () => {
    const markers = new Map<string, WorktreeMarkerReadResult>([
      ["/wt/recordless", stampedMarker({ kind: "branch", ref: "review/orphan" }, { branch: "review/orphan" })],
      ["/wt/errand", stampedMarker({ kind: "errand", slug: "tidy-hooks" }, { branch: "chore/tidy-hooks" })],
    ]);
    const result = await runStaleWorktreeSweep({
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async (path) => markers.get(path) ?? { kind: "absent" },
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [
          { path: "/wt/recordless", head: "stamped", branch: null, detached: true, primary: false },
          { path: "/wt/errand", head: "stamped", branch: null, detached: true, primary: false },
        ],
      }),
    });

    expect(result.worktrees).toEqual([
      {
        kind: "husk",
        worktreePath: "/wt/recordless",
        branch: null,
        subject: { kind: "branch", ref: "review/orphan" },
        completedWorkUnit: null,
        decision: { action: "removable" },
      },
      {
        kind: "husk",
        worktreePath: "/wt/errand",
        branch: null,
        subject: { kind: "errand", slug: "tidy-hooks" },
        completedWorkUnit: null,
        decision: { action: "removable" },
      },
    ]);
  });

  it("filters another identity's husk only in team mode", async () => {
    const options = {
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" } as const,
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      identity: "andrew",
      readMarker: async () => stampedMarker(
        { kind: "work-unit", name: "work-organization-reform" },
        { identity: "someone-else" },
      ),
      scanWorktrees: async () => ({
        ok: true as const,
        worktrees: [{ path: "/wt/other", head: "stamped", branch: null, detached: true, primary: false }],
      }),
    };

    const teamResult = await runStaleWorktreeSweep({ ...options, teamMode: true });
    const soloResult = await runStaleWorktreeSweep({ ...options, teamMode: false });

    expect(teamResult.worktrees).toEqual([]);
    expect(soloResult.worktrees).toHaveLength(1);
  });

  it("excludes absent and malformed detached markers", async () => {
    const markers = new Map<string, WorktreeMarkerReadResult>([
      ["/wt/absent", { kind: "absent" }],
      ["/wt/malformed", { kind: "malformed", path: "/wt/malformed/.arc/marker", message: "invalid JSON" }],
    ]);
    const result = await runStaleWorktreeSweep({
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async (path) => markers.get(path) ?? { kind: "absent" },
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [
          { path: "/wt/absent", head: "one", branch: null, detached: true, primary: false },
          { path: "/wt/malformed", head: "two", branch: null, detached: true, primary: false },
        ],
      }),
    });

    expect(result.worktrees).toEqual([]);
  });

  it("warns and continues when one detached marker cannot be read", async () => {
    const result = await runStaleWorktreeSweep({
      roster: { entries: [], warnings: [] },
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async (path) => {
        if (path === "/wt/unreadable") throw new Error("permission denied");
        return stampedMarker({ kind: "work-unit", name: "work-organization-reform" });
      },
      scanWorktrees: async () => ({
        ok: true,
        worktrees: [
          { path: "/wt/unreadable", head: "stamped", branch: null, detached: true, primary: false },
          { path: "/wt/readable", head: "stamped", branch: null, detached: true, primary: false },
        ],
      }),
    });

    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0]?.worktreePath).toBe("/wt/readable");
    expect(result.warnings).toEqual([
      "Could not read detached worktree marker at /wt/unreadable: permission denied",
    ]);
  });

  it("preserves branched reports and appends a warning when the detached scan fails", async () => {
    const result = await runStaleWorktreeSweep({
      roster: shippedRoster(),
      worktreeIdentity: { kind: "primary" },
      baseBranch: "main",
      exec: buildExec({ clean: true, merged: true }),
      readMarker: async () => presentMarker,
      userSurfaceFs: emptyUserSurfaceFs,
      scanWorktrees: async () => ({ ok: false, message: "topology unavailable" }),
    });

    expect(result.worktrees).toHaveLength(1);
    expect(result.worktrees[0]?.kind).toBe("branched");
    expect(result.warnings).toEqual(["Could not scan detached worktrees: topology unavailable"]);
  });
});
