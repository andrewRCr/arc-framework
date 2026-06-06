import { describe, it, expect } from "vitest";

import {
  filterRosterByIdentity,
  resolvePrimaryWorktreePath,
  runWorktreeRoster,
} from "../../../src/lib/git/worktree-roster.js";
import type {
  WorktreeRosterEntry,
  WorktreeRosterFs,
  WorktreeRosterResult,
} from "../../../src/lib/git/worktree-roster.js";
import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../../src/lib/git/index.js";
import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

/** Mirrors the keyed-arg buildExec helper from worktree-sync.test.ts. */
function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args });
    const key = matchKey(args, responses);
    if (key === null) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`matched key '${key}' has no response`);
    }
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

function matchKey(
  args: string[],
  responses: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(responses)) {
    const tokens = key.split(" ");
    if (tokens.every((token, i) => token === "*" || args[i] === token)) {
      return key;
    }
  }
  return null;
}

/**
 * Build a deterministic in-memory fs adapter from a tree of paths → contents.
 * Directories are derived implicitly from the keys; `readdir` lists immediate
 * children, `readFile` returns the stored content or throws ENOENT.
 */
function buildFs(tree: Record<string, string>): WorktreeRosterFs {
  return {
    readdir: async (path) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const seen = new Set<string>();
      for (const key of Object.keys(tree)) {
        if (key.startsWith(prefix)) {
          const remainder = key.slice(prefix.length);
          const next = remainder.split("/")[0];
          if (next !== undefined && next !== "") seen.add(next);
        }
      }
      if (seen.size === 0 && !hasAnyKeyUnder(tree, prefix)) {
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      }
      return [...seen];
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

function hasAnyKeyUnder(tree: Record<string, string>, prefix: string): boolean {
  return Object.keys(tree).some((k) => k.startsWith(prefix));
}

const WORKTREE_LIST = "worktree list --porcelain";

describe("runWorktreeRoster", () => {
  it("returns empty entries when only the main worktree exists with no meta file", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc123\nbranch refs/heads/main\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({});

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns a single tuple with state and cohort populated when one worktree has a meta file", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc123\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-feature-x.md":
        "# Metadata: feature-x\n\n" +
        "- **State:** Active\n" +
        "- **Owner:** alice\n" +
        "- **Branch:** feature/x\n" +
        "- **Class:** Novel\n" +
        "- **Priority:** P1\n" +
        "- **Depends On:** alpha, bravo\n" +
        "- **Cohort:** parallelism-trio\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      worktreePath: "/home/dev/repo",
      branch: "feature/x",
      metaFilePath: "/home/dev/repo/.arc/active/meta-feature-x.md",
      state: "Active",
      cohort: "parallelism-trio",
      class: "Novel",
      priority: "P1",
      dependsOn: ["alpha", "bravo"],
    });
    expect(result.warnings).toEqual([]);
  });

  it("carries a path-valued (nested) cohort through without regression", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc123\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-feature-x.md":
        "# Metadata: feature-x\n\n" +
        "- **State:** Active\n" +
        "- **Branch:** feature/x\n" +
        "- **Cohort:** core/sub\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]?.cohort).toBe("core/sub");
    expect(result.warnings).toEqual([]);
  });

  it("returns one tuple per worktree when several worktrees have meta files", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo-a\nHEAD bbb\nbranch refs/heads/feature/a\n\n" +
          "worktree /home/dev/repo-b\nHEAD ccc\nbranch refs/heads/feature/b\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo-a/.arc/active/meta-a.md":
        "# Metadata: a\n\n- **State:** Active\n- **Branch:** feature/a\n- **Cohort:** [none]\n",
      "/home/dev/repo-b/.arc/active/meta-b.md":
        "# Metadata: b\n\n- **State:** Integrating\n- **Branch:** feature/b\n- **Cohort:** [none]\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(2);
    expect(result.entries.map((e) => e.branch).sort()).toEqual(["feature/a", "feature/b"]);
    const aEntry = result.entries.find((e) => e.branch === "feature/a");
    const bEntry = result.entries.find((e) => e.branch === "feature/b");
    expect(aEntry?.state).toBe("Active");
    expect(bEntry?.state).toBe("Integrating");
    expect(result.warnings).toEqual([]);
  });

  it("resolves identity verbatim from the Owner field", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-x.md":
        "# Metadata: x\n\n- **State:** Active\n- **Owner:** Mixed.Case_Identity\n- **Branch:** feature/x\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]?.identity).toBe("Mixed.Case_Identity");
  });

  it("surfaces unknown State values as 'unknown' rather than throwing", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-x.md":
        "# Metadata: x\n\n- **State:** Bogus\n- **Branch:** feature/x\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]?.state).toBe("unknown");
  });

  it("maps Cohort '[none]' to undefined rather than the literal string", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-x.md":
        "# Metadata: x\n\n- **State:** Active\n- **Branch:** feature/x\n- **Cohort:** [none]\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]?.cohort).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result.entries[0], "cohort")).toBe(false);
  });

  it("includes a degraded tuple for a worktree with no meta when another worktree has one", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD aaa\nbranch refs/heads/main\n\n" +
          "worktree /home/dev/repo-a\nHEAD bbb\nbranch refs/heads/feature/a\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo-a/.arc/active/meta-a.md":
        "# Metadata: a\n\n- **State:** Active\n- **Branch:** feature/a\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(2);
    const mainEntry = result.entries.find((e) => e.branch === "main");
    const aEntry = result.entries.find((e) => e.branch === "feature/a");
    expect(mainEntry).toEqual({
      worktreePath: "/home/dev/repo",
      branch: "main",
    });
    expect(aEntry?.metaFilePath).toBe("/home/dev/repo-a/.arc/active/meta-a.md");
    expect(aEntry?.state).toBe("Active");
  });

  it("surfaces a warning and returns a degraded tuple when a meta file fails to read", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo-a\nHEAD bbb\nbranch refs/heads/feature/a\n\n" +
          "worktree /home/dev/repo-b\nHEAD ccc\nbranch refs/heads/feature/b\n\n",
        stderr: "",
      },
    });
    // repo-b lists meta-b.md via readdir but readFile rejects (e.g., disappeared mid-read).
    const fs: WorktreeRosterFs = {
      readdir: async (path) => {
        if (path === "/home/dev/repo-a/.arc/active") return ["meta-a.md"];
        if (path === "/home/dev/repo-b/.arc/active") return ["meta-b.md"];
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      },
      readFile: async (path) => {
        if (path === "/home/dev/repo-a/.arc/active/meta-a.md") {
          return "# Metadata: a\n\n- **State:** Active\n- **Branch:** feature/a\n";
        }
        throw new Error("EACCES: permission denied");
      },
    };

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(2);
    const bEntry = result.entries.find((e) => e.branch === "feature/b");
    expect(bEntry).toEqual({
      worktreePath: "/home/dev/repo-b",
      branch: "feature/b",
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/meta-b\.md/);
  });

  it("skips detached-HEAD worktrees and does not attempt meta-file resolution for them", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo-a\nHEAD bbb\nbranch refs/heads/feature/a\n\n" +
          "worktree /home/dev/repo-detached\nHEAD zzz\ndetached\n\n",
        stderr: "",
      },
    });
    const readdirCalls: string[] = [];
    const fs: WorktreeRosterFs = {
      readdir: async (path) => {
        readdirCalls.push(path);
        if (path === "/home/dev/repo-a/.arc/active") return ["meta-a.md"];
        const err = new Error(`ENOENT: ${path}`) as Error & { code?: string };
        err.code = "ENOENT";
        throw err;
      },
      readFile: async () =>
        "# Metadata: a\n\n- **State:** Active\n- **Branch:** feature/a\n",
    };

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.branch).toBe("feature/a");
    expect(readdirCalls).not.toContain("/home/dev/repo-detached/.arc/active");
  });

  it("picks the meta whose Branch field matches when multiple meta files exist in one active/", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    // meta-a sorts alphabetically before meta-b but Branch field points elsewhere;
    // branch matching must pick meta-b (the one whose Branch matches the worktree).
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-a.md":
        "# Metadata: a\n\n- **State:** Shipped\n- **Branch:** feature/y\n",
      "/home/dev/repo/.arc/active/meta-b.md":
        "# Metadata: b\n\n- **State:** Active\n- **Branch:** feature/x\n- **Cohort:** [none]\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.metaFilePath).toBe("/home/dev/repo/.arc/active/meta-b.md");
    expect(result.entries[0]?.state).toBe("Active");
    expect(result.warnings).toEqual([]);
  });

  it("surfaces a warning and returns a degraded tuple when multiple meta files exist but none match the worktree's branch", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-y.md":
        "# Metadata: y\n\n- **State:** Active\n- **Branch:** feature/y\n",
      "/home/dev/repo/.arc/active/meta-z.md":
        "# Metadata: z\n\n- **State:** Active\n- **Branch:** feature/z\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toEqual({
      worktreePath: "/home/dev/repo",
      branch: "feature/x",
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/none match branch feature\/x/);
  });

  it("picks alphabetical-first and warns when multiple meta files claim the same branch", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feature/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-a.md":
        "# Metadata: a\n\n- **State:** Active\n- **Branch:** feature/x\n",
      "/home/dev/repo/.arc/active/meta-b.md":
        "# Metadata: b\n\n- **State:** Integrating\n- **Branch:** feature/x\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.metaFilePath).toBe("/home/dev/repo/.arc/active/meta-a.md");
    expect(result.entries[0]?.state).toBe("Active");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/match branch feature\/x/);
    expect(result.warnings[0]).toMatch(/meta-a\.md/);
    expect(result.warnings[0]).toMatch(/meta-b\.md/);
  });
});

describe("filterRosterByIdentity", () => {
  function entry(overrides: Partial<WorktreeRosterEntry> = {}): WorktreeRosterEntry {
    return { worktreePath: "/wt", branch: "feat/x", ...overrides };
  }

  function roster(
    entries: WorktreeRosterEntry[],
    warnings: string[] = [],
  ): WorktreeRosterResult {
    return { entries, warnings };
  }

  it("in team mode keeps the current identity's entries and unattributed worktrees, dropping others", () => {
    const input = roster([
      entry({ worktreePath: "/main", branch: "main" }), // no Owner — admin/main
      entry({ worktreePath: "/mine", branch: "feat/a", identity: "andrew" }),
      entry({ worktreePath: "/theirs", branch: "feat/b", identity: "bob" }),
    ]);

    const result = filterRosterByIdentity(input, { identity: "andrew", teamMode: true });

    expect(result.entries.map((e) => e.worktreePath)).toEqual(["/main", "/mine"]);
  });

  it("in solo mode returns the roster unchanged (no identity filtering)", () => {
    const input = roster([
      entry({ worktreePath: "/mine", branch: "feat/a", identity: "andrew" }),
      entry({ worktreePath: "/theirs", branch: "feat/b", identity: "bob" }),
    ]);

    const result = filterRosterByIdentity(input, { identity: "andrew", teamMode: false });

    expect(result).toBe(input);
  });

  it("returns the roster unchanged when no identity is configured, even in team mode", () => {
    const input = roster([
      entry({ worktreePath: "/a", branch: "feat/a", identity: "andrew" }),
      entry({ worktreePath: "/b", branch: "feat/b", identity: "bob" }),
    ]);

    const result = filterRosterByIdentity(input, { identity: null, teamMode: true });

    expect(result).toBe(input);
  });

  it("preserves warnings through the team-mode filter", () => {
    const input = roster(
      [entry({ identity: "bob" })],
      ["Multiple meta files in /theirs/.arc/active/"],
    );

    const result = filterRosterByIdentity(input, { identity: "andrew", teamMode: true });

    expect(result.entries).toEqual([]);
    expect(result.warnings).toEqual(["Multiple meta files in /theirs/.arc/active/"]);
  });
});

describe("resolvePrimaryWorktreePath", () => {
  it("returns the main worktree (listed first), not a linked worktree", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout:
          "worktree /home/dev/repo\nHEAD aaa\nbranch refs/heads/main\n\n"
          + "worktree /home/dev/repo.wu-a\nHEAD bbb\nbranch refs/heads/feat/wu-a\n\n",
      },
    });

    expect(await resolvePrimaryWorktreePath(exec)).toBe("/home/dev/repo");
  });

  it("returns null when no worktrees resolve", async () => {
    const { exec } = buildExec({ [WORKTREE_LIST]: { stdout: "" } });

    expect(await resolvePrimaryWorktreePath(exec)).toBeNull();
  });
});

describe("runWorktreeRoster — shared-reader field recovery", () => {
  it("recovers backticked, table-rendered fields via the shared meta reader", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout: "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feat/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-x.md": renderMetaFile("x", {
        State: "Active",
        Owner: "alice",
        Branch: "feat/x",
        Cohort: "parallelism-trio",
      }),
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]).toMatchObject({
      branch: "feat/x",
      state: "Active",
      identity: "alice",
      cohort: "parallelism-trio",
    });
    expect(result.warnings).toEqual([]);
  });

  it("matches by Branch in a multi-meta worktree when the field is table-rendered (backticked)", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout: "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feat/b\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-a.md": renderMetaFile("a", {
        State: "Active",
        Owner: "alice",
        Branch: "feat/a",
      }),
      "/home/dev/repo/.arc/active/meta-b.md": renderMetaFile("b", {
        State: "Active",
        Owner: "bob",
        Branch: "feat/b",
      }),
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      branch: "feat/b",
      metaFilePath: "/home/dev/repo/.arc/active/meta-b.md",
      identity: "bob",
    });
  });

  it("degrades to a bare entry with a warning when the core table is malformed", async () => {
    const { exec } = buildExec({
      [WORKTREE_LIST]: {
        stdout: "worktree /home/dev/repo\nHEAD abc\nbranch refs/heads/feat/x\n\n",
        stderr: "",
      },
    });
    const fs = buildFs({
      "/home/dev/repo/.arc/active/meta-x.md":
        "# Metadata: x\n\n| State | Owner |\n| --- | --- |\n| `Active` |\n",
    });

    const result = await runWorktreeRoster({ exec, fs });

    expect(result.entries[0]).toMatchObject({ worktreePath: "/home/dev/repo", branch: "feat/x" });
    expect(result.entries[0]?.state).toBeUndefined();
    expect(result.warnings.some((w) => /Malformed meta/.test(w))).toBe(true);
  });
});
