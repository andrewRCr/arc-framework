/**
 * Unit tests for runActiveRoster — the cross-worktree in-flight WU roster
 * behind `arc active roster`. Composes the shared worktree roster with the
 * identity filter and narrows to actual work units (meta-bearing worktrees);
 * the underlying list-parse / identity-filter behavior is covered by
 * worktree-roster.test.ts.
 */

import { describe, it, expect } from "vitest";

import { runActiveRoster } from "../../../../src/commands/active/roster.js";
import type { WorktreeRosterFs } from "../../../../src/lib/git/worktree-roster.js";
import type { GitExec } from "../../../../src/lib/git/index.js";

/** A three-worktree layout: main (no meta) + two WU worktrees. */
const THREE_WORKTREES = [
  "worktree /repo",
  "branch refs/heads/main",
  "",
  "worktree /repo.wu-a",
  "branch refs/heads/feat/wu-a",
  "",
  "worktree /repo.wu-b",
  "branch refs/heads/feat/wu-b",
  "",
].join("\n");

const META_TREE: Record<string, string> = {
  "/repo.wu-a/.arc/active/meta-wu-a.md":
    "# A\n\n- **State:** Active\n- **Owner:** andrew\n- **Branch:** feat/wu-a\n",
  "/repo.wu-b/.arc/active/meta-wu-b.md":
    "# B\n\n- **State:** Active\n- **Owner:** dana\n- **Branch:** feat/wu-b\n",
};

function execReturning(stdout: string): GitExec {
  return (async () => ({ stdout })) as GitExec;
}

/** In-memory fs adapter from a path → content tree (mirrors worktree-roster.test.ts). */
function buildFs(tree: Record<string, string>): WorktreeRosterFs {
  return {
    readdir: async (path) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const names = new Set<string>();
      let dirExists = false;
      for (const key of Object.keys(tree)) {
        if (key.startsWith(prefix)) {
          dirExists = true;
          const next = key.slice(prefix.length).split("/")[0];
          if (next !== undefined && next !== "") names.add(next);
        }
      }
      if (!dirExists) {
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      return [...names];
    },
    readFile: async (path) => {
      const content = tree[path];
      if (content === undefined) {
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      return content;
    },
  };
}

describe("runActiveRoster", () => {
  it("narrows to work units, dropping meta-less checkouts (main)", async () => {
    const result = await runActiveRoster({
      exec: execReturning(THREE_WORKTREES),
      fs: buildFs(META_TREE),
      identity: "andrew",
      teamMode: false,
    });

    const branches = result.entries.map((e) => e.branch).sort();
    expect(branches).toEqual(["feat/wu-a", "feat/wu-b"]);
    expect(result.entries.every((e) => e.metaFilePath !== undefined)).toBe(true);
  });

  it("identity-filters in team mode (drops another developer's WU)", async () => {
    const result = await runActiveRoster({
      exec: execReturning(THREE_WORKTREES),
      fs: buildFs(META_TREE),
      identity: "andrew",
      teamMode: true,
    });

    expect(result.entries.map((e) => e.branch)).toEqual(["feat/wu-a"]);
  });

  it("returns empty when nothing is in flight (no metas anywhere)", async () => {
    const result = await runActiveRoster({
      exec: execReturning("worktree /repo\nbranch refs/heads/main\n"),
      fs: buildFs({}),
      identity: "andrew",
      teamMode: false,
    });

    expect(result.entries).toEqual([]);
  });
});
