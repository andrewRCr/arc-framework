/**
 * Unit tests for detectForeignArtifactOverlap — the deterministic foreign-artifact
 * detection behind the `arc-errand` advisory gate. Given an errand's target path(s)
 * and the originating WU, it reports which *other* in-flight WUs touch the target,
 * over the identity-filtered roster + per-worktree git state. Advisory only: it
 * returns facts and never blocks.
 */

import { describe, it, expect } from "vitest";

import {
  detectForeignArtifactOverlap,
  projectInFlightToOverlapRoster,
  type OverlapRoster,
} from "../../../src/lib/git/foreign-artifact-detection.js";
import type { InFlightEntry, InFlightWorkUnit } from "../../../src/lib/git/in-flight-derivation.js";
import type { WorktreeRosterResult } from "../../../src/lib/git/worktree-roster.js";
import type { ExecResult, GitExec, GitExecOptions } from "../../../src/lib/git/index.js";

type ResponseFn = (args: string[], options?: GitExecOptions) => ExecResult | Promise<ExecResult>;

/** Keyed-arg exec stub (mirrors worktree-roster.test.ts): positional tokens, `*` wildcard. */
function buildExec(responses: Record<string, ExecResult | ResponseFn>): {
  exec: GitExec;
  calls: Array<{ cmd: string; args: string[]; cwd?: string }>;
} {
  const calls: Array<{ cmd: string; args: string[]; cwd?: string }> = [];
  const shaByRef = new Map<string, string>();
  const refBySha = new Map<string, string>();

  function fakeShaFor(ref: string): string {
    const existing = shaByRef.get(ref);
    if (existing !== undefined) return existing;
    const hex = ((shaByRef.size + 1) % 15 + 1).toString(16);
    const sha = hex.repeat(40);
    shaByRef.set(ref, sha);
    refBySha.set(sha, ref);
    return sha;
  }

  function lookup(args: string[]): ExecResult | ResponseFn | undefined {
    for (const key of Object.keys(responses)) {
      const tokens = key.split(" ");
      if (tokens.every((token, i) => token === "*" || args[i] === token)) {
        return responses[key];
      }
    }
    return undefined;
  }

  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args, cwd: options?.cwd });
    const direct = lookup(args);
    if (direct !== undefined) {
      const result = typeof direct === "function" ? await direct(args, options) : direct;
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        const ref = args[2] ?? "";
        const sha = result.stdout.trim().split(/\s+/u)[0] ?? "";
        if (ref !== "" && sha !== "") {
          shaByRef.set(ref, sha);
          refBySha.set(sha, ref);
        }
      }
      return result;
    }
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      return { stdout: `${fakeShaFor(args[2] ?? "")}\n`, stderr: "" };
    }
    if (args[0] === "diff" && args[1]?.includes("...")) {
      const [leftSha, rightSha] = args[1].split("...");
      const leftRef = leftSha === undefined ? undefined : refBySha.get(leftSha);
      const rightRef = rightSha === undefined ? undefined : refBySha.get(rightSha);
      if (leftRef !== undefined && rightRef !== undefined) {
        const refArgs = [...args];
        refArgs[1] = `${leftRef}...${rightRef}`;
        const refResponse = lookup(refArgs);
        if (refResponse !== undefined) {
          return typeof refResponse === "function" ? refResponse(refArgs, options) : refResponse;
        }
      }
    }
    throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
  };
  return { exec, calls };
}

/** One in-flight WU worktree roster entry. */
function rosterOf(...entries: WorktreeRosterResult["entries"]): WorktreeRosterResult {
  return { entries, warnings: [] };
}

describe("detectForeignArtifactOverlap", () => {
  it("reports a target committed on another in-flight WU's branch (vs. base)", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    const { exec } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
      "status --porcelain -- docs/x.md": { stdout: "" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([
      { branch: "feat/wu-a", worktreePath: "/repo.wu-a", matchedPaths: ["docs/x.md"] },
    ]);
  });

  it("reports a target with only uncommitted edits in another in-flight WU's worktree", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    const { exec, calls } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "" },
      "status --porcelain -- docs/x.md": { stdout: " M docs/x.md\n" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([
      { branch: "feat/wu-a", worktreePath: "/repo.wu-a", matchedPaths: ["docs/x.md"] },
    ]);
    // The uncommitted probe runs in the foreign worktree, not the originating one.
    const statusCalls = calls.filter((c) => c.args[0] === "status");
    expect(statusCalls).toHaveLength(2);
    expect(statusCalls.every((c) => c.cwd === "/repo.wu-a")).toBe(true);
  });

  it("marks a changing uncommitted probe indeterminate without reporting overlap", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    let statusReads = 0;
    const { exec, calls } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "" },
      "status --porcelain -- docs/x.md": () => {
        statusReads += 1;
        return { stdout: statusReads === 1 ? " M docs/x.md\n" : "" };
      },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([]);
    expect(result.indeterminate).toEqual([
      {
        branch: "feat/wu-a",
        worktreePath: "/repo.wu-a",
        matchedPaths: [],
        reason: "uncommitted-probe-disagreement",
      },
    ]);
    expect(calls.filter((c) => c.args[0] === "status")).toHaveLength(2);
  });

  it("detects a target renamed into place in another WU's worktree (porcelain `old -> new`)", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    // Porcelain renders a rename as `R  <old> -> <new>`; the destination is the live path.
    const { exec } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "" },
      "status --porcelain -- docs/x.md": { stdout: "R  docs/old.md -> docs/x.md\n" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([
      { branch: "feat/wu-a", worktreePath: "/repo.wu-a", matchedPaths: ["docs/x.md"] },
    ]);
  });

  it("excludes the originating WU's own overlap (self is never reported)", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-self",
      branch: "feat/self",
      metaFilePath: "/repo.wu-self/.arc/active/meta-self.md",
      state: "Active",
      identity: "andrew",
    });
    // No exec responses configured: detection must skip the originating WU before
    // probing git — any git call here would throw "unmatched git invocation".
    const { exec, calls } = buildExec({});

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("excludes a remote-only candidate matching the originating meta path", async () => {
    const roster: OverlapRoster = {
      entries: [{
        branch: "origin/plan/self",
        metaFilePath: ".arc/active/meta-self.md",
        state: "Planning",
      }],
      warnings: [],
    };
    // No exec responses configured: the originating meta entry must be skipped
    // before probing git, even though it has no worktree path to self-exclude.
    const { exec, calls } = buildExec({});

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
      originatingMetaPath: ".arc/active/meta-self.md",
    });

    expect(result.overlaps).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("excludes the originating WU's stale remote-only duplicate by name", async () => {
    const roster: OverlapRoster = {
      entries: [
        {
          branch: "feat/self",
          worktreePath: "/repo.wu-self",
          name: "self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Active",
        },
        {
          branch: "origin/plan/self",
          name: "self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Planning",
        },
      ],
      warnings: [],
    };
    // No originatingMetaPath: this mirrors a ceremony window where the active
    // meta resolver is unavailable and the roster identity must carry self-exclusion.
    const { exec, calls } = buildExec({
      "diff main...origin/plan/self --name-only -- .arc/active/meta-self.md": {
        stdout: ".arc/active/meta-self.md\n",
      },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it("reports no overlap when no other in-flight WU touches the target", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    const { exec } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "" },
      "status --porcelain -- docs/x.md": { stdout: "" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([]);
  });

  it("reports a genuine foreign meta overlap when originatingMetaPath differs", async () => {
    const roster: OverlapRoster = {
      entries: [{
        branch: "origin/plan/other",
        metaFilePath: ".arc/active/meta-other.md",
        state: "Planning",
      }],
      warnings: [],
    };
    const { exec } = buildExec({
      "diff main...origin/plan/other --name-only -- .arc/active/meta-other.md": {
        stdout: ".arc/active/meta-other.md\n",
      },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: [".arc/active/meta-other.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
      originatingMetaPath: ".arc/active/meta-self.md",
    });

    expect(result.overlaps).toEqual([
      { branch: "origin/plan/other", matchedPaths: [".arc/active/meta-other.md"] },
    ]);
  });

  it("treats only non-shipped meta-bearing worktrees as in-flight", async () => {
    const roster = rosterOf(
      { worktreePath: "/repo", branch: "main" }, // meta-less admin/main checkout
      {
        worktreePath: "/repo.shipped",
        branch: "feat/shipped",
        metaFilePath: "/repo.shipped/.arc/active/meta-shipped.md",
        state: "Shipped",
        identity: "andrew",
      },
      {
        worktreePath: "/repo.plan",
        branch: "plan/thing",
        metaFilePath: "/repo.plan/.arc/active/meta-thing.md",
        state: "Planning",
        identity: "andrew",
      },
    );
    // Only the Planning WU should be probed; meta-less + Shipped entries are skipped
    // before any git call (an unexpected probe would throw on the unmatched key).
    const { exec } = buildExec({
      "diff main...plan/thing --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
      "status --porcelain -- docs/x.md": { stdout: "" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([
      { branch: "plan/thing", worktreePath: "/repo.plan", matchedPaths: ["docs/x.md"] },
    ]);
  });

  it("reports a worktree-less (remote-only) entry from its committed diff alone, skipping the status probe", async () => {
    // A remote-only in-flight WU has no local worktree; its uncommitted edits
    // live elsewhere and can't collide here, so committed overlap is the whole
    // signal and no `git status` runs.
    const roster: OverlapRoster = {
      entries: [{
        branch: "origin/feat/remote",
        metaFilePath: ".arc/active/meta-remote.md",
        state: "Active",
      }],
      warnings: [],
    };
    const { exec, calls } = buildExec({
      "diff main...origin/feat/remote --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([
      { branch: "origin/feat/remote", matchedPaths: ["docs/x.md"] },
    ]);
    expect(calls.some((c) => c.args[0] === "status")).toBe(false);
  });

  it("pins committed probes to base and candidate SHAs", async () => {
    const baseSha = "a".repeat(40);
    const branchSha = "b".repeat(40);
    const roster: OverlapRoster = {
      entries: [{
        branch: "origin/feat/remote",
        name: "remote",
        metaFilePath: ".arc/active/meta-remote.md",
        state: "Active",
      }],
      warnings: [],
    };
    const { exec, calls } = buildExec({
      [`rev-parse --verify main`]: { stdout: `${baseSha}\n` },
      [`diff ${baseSha}...${branchSha} --name-only -- docs/x.md`]: { stdout: "docs/x.md\n" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
      snapshot: { refs: { "origin/feat/remote": branchSha }, worktrees: {} },
    });

    expect(result.overlaps).toEqual([
      { branch: "origin/feat/remote", matchedPaths: ["docs/x.md"] },
    ]);
    expect(calls.some((c) => c.args.includes("main...origin/feat/remote"))).toBe(false);
    expect(calls.some((c) => c.args[0] === "rev-parse" && c.args.includes("origin/feat/remote"))).toBe(false);
  });

  it("diffs against the configured base branch, not a hardcoded main", async () => {
    const roster = rosterOf({
      worktreePath: "/repo.wu-a",
      branch: "feat/wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
      identity: "andrew",
    });
    const { exec, calls } = buildExec({
      "diff develop...feat/wu-a --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
      "status --porcelain -- docs/x.md": { stdout: "" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "develop",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toHaveLength(1);
    expect(calls.some((c) => c.args[0] === "rev-parse" && c.args[2] === "develop")).toBe(true);
    expect(calls.some((c) => c.args[0] === "rev-parse" && c.args[2] === "main")).toBe(false);
  });

  it("returns all overlaps as facts without blocking (advisory, no short-circuit)", async () => {
    const roster = rosterOf(
      {
        worktreePath: "/repo.wu-a",
        branch: "feat/wu-a",
        metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
        state: "Active",
        identity: "andrew",
      },
      {
        worktreePath: "/repo.wu-b",
        branch: "feat/wu-b",
        metaFilePath: "/repo.wu-b/.arc/active/meta-wu-b.md",
        state: "Integrating",
        identity: "andrew",
      },
    );
    const { exec } = buildExec({
      "diff main...feat/wu-a --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
      "diff main...feat/wu-b --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
      "status --porcelain -- docs/x.md": { stdout: "" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps.map((o) => o.branch)).toEqual(["feat/wu-a", "feat/wu-b"]);
  });
});

/** Oracle work-unit entry (refs-only — no PR enrichment), locally checked out unless `remoteOnly`. */
function oracleWu(branch: string, name: string, worktreePath?: string): InFlightEntry {
  return {
    kind: "work-unit",
    branch,
    name,
    state: "Active",
    remoteOnly: worktreePath === undefined,
    dependsOn: [],
    ...(worktreePath !== undefined ? { worktreePath } : {}),
  };
}

describe("projectInFlightToOverlapRoster", () => {
  it("projects a locally-checked-out WU with its branch and worktree", async () => {
    const roster = projectInFlightToOverlapRoster([oracleWu("feat/x", "x", "/repo.x")]);

    expect(roster.entries).toEqual([
      {
        branch: "feat/x",
        name: "x",
        worktreePath: "/repo.x",
        metaFilePath: ".arc/active/meta-x.md",
        state: "Active",
      },
    ]);
  });

  it("projects a remote-only WU as origin/<branch> with no worktree", async () => {
    const roster = projectInFlightToOverlapRoster([oracleWu("feat/y", "y")]);

    expect(roster.entries).toEqual([
      { branch: "origin/feat/y", name: "y", metaFilePath: ".arc/active/meta-y.md", state: "Active" },
    ]);
    expect(roster.entries[0]).not.toHaveProperty("worktreePath");
  });

  it("projects an unoccupied local WU through its local branch", async () => {
    const entry: InFlightWorkUnit = {
      kind: "work-unit",
      branch: "feat/local-unoccupied",
      name: "local-unoccupied",
      state: "Active",
      remoteOnly: false,
      dependsOn: [],
    };

    const roster = projectInFlightToOverlapRoster([entry]);

    expect(roster.entries).toEqual([
      {
        branch: "feat/local-unoccupied",
        name: "local-unoccupied",
        remoteOnly: false,
        metaFilePath: ".arc/active/meta-local-unoccupied.md",
        state: "Active",
      },
    ]);
    expect(roster.entries[0]).not.toHaveProperty("worktreePath");
  });

  it("projects roster marks and parked scheduling for advisory filtering", async () => {
    const entry: InFlightWorkUnit = {
      kind: "work-unit",
      branch: "feat/shelf",
      name: "shelf",
      state: "Active",
      remoteOnly: false,
      dependsOn: [],
      worktreePath: "/repo.shelf",
      marks: ["location-ambiguous"],
      scheduling: "parked",
    };

    const roster = projectInFlightToOverlapRoster([entry]);

    expect(roster.entries[0]).toMatchObject({
      branch: "feat/shelf",
      name: "shelf",
      marks: ["location-ambiguous"],
      scheduling: "parked",
    });
  });

  it("drops errands — they carry no meta and aren't WU-overlap candidates", async () => {
    const roster = projectInFlightToOverlapRoster([
      oracleWu("feat/x", "x", "/repo.x"),
      { kind: "errand", branch: "chore/fix", slug: "fix", remoteOnly: true },
    ]);

    expect(roster.entries.map((e) => e.branch)).toEqual(["feat/x"]);
  });

  it("surfaces an overlap from oracle data (refs-only) for a remote-only WU touching the target", async () => {
    const roster = projectInFlightToOverlapRoster([oracleWu("feat/remote", "remote")]);
    const { exec, calls } = buildExec({
      "diff main...origin/feat/remote --name-only -- docs/x.md": { stdout: "docs/x.md\n" },
    });

    const result = await detectForeignArtifactOverlap({
      exec,
      roster,
      targetPaths: ["docs/x.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.wu-self",
    });

    expect(result.overlaps).toEqual([{ branch: "origin/feat/remote", matchedPaths: ["docs/x.md"] }]);
    expect(calls.some((c) => c.args[0] === "status")).toBe(false);
  });
});
