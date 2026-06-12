/**
 * Unit tests for the foreign-write advisory backstop entry point.
 *
 * Covers the pure pieces — the work-unit-surface candidate filter and the
 * warning formatter — plus the orchestration core over an injected roster and
 * mock git exec. The thin CLI wrapper (identity / config / roster assembly) is
 * exercised through the hook at commit time, not here.
 */

import { describe, it, expect } from "vitest";

import {
  detectStagedForeignWrites,
  formatForeignWriteWarnings,
  selectForeignWriteCandidates,
} from "../../../src/scripts/check-foreign-writes.js";
import type { OverlapRoster } from "../../../src/lib/git/foreign-artifact-detection.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

/** Keyed-arg exec stub: positional tokens, `*` wildcard (mirrors the detection tests). */
function buildExec(responses: Record<string, ExecResult>): GitExec {
  return async (cmd, args) => {
    for (const key of Object.keys(responses)) {
      const tokens = key.split(" ");
      if (tokens.every((token, i) => token === "*" || args[i] === token)) {
        return responses[key] as ExecResult;
      }
    }
    throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
  };
}

const throwingExec: GitExec = async (cmd, args) => {
  throw new Error(`exec should not be called: ${cmd} ${args.join(" ")}`);
};

describe("selectForeignWriteCandidates", () => {
  it("keeps work-unit movable artifacts and drops cohort docs and code", () => {
    const result = selectForeignWriteCandidates([
      ".arc/active/meta-wu-a.md",
      ".arc/backlog/planned/core/wu-b/tasks-wu-b.md",
      ".arc/active/cohort-agile-parallelism.md",
      "packages/arc-framework/src/lib/git/write-context.ts",
      "src/notes-helper.md",
    ]);
    expect(result).toEqual([
      ".arc/active/meta-wu-a.md",
      ".arc/backlog/planned/core/wu-b/tasks-wu-b.md",
    ]);
  });
});

describe("formatForeignWriteWarnings", () => {
  it("words one advisory line per foreign overlap", () => {
    const lines = formatForeignWriteWarnings([
      { branch: "feat/wu-a", worktreePath: "/repo.wu-a", matchedPaths: [".arc/active/meta-wu-a.md"] },
      { branch: "feat/wu-b", matchedPaths: [".arc/active/spec-wu-b.md"] },
    ]);
    expect(lines).toEqual([
      "feat/wu-a also touches .arc/active/meta-wu-a.md (/repo.wu-a)",
      "feat/wu-b also touches .arc/active/spec-wu-b.md (remote-only)",
    ]);
  });

  it("stays silent on no overlaps", () => {
    expect(formatForeignWriteWarnings([])).toEqual([]);
  });
});

/** One in-flight WU overlap-roster entry. */
function rosterOf(...entries: OverlapRoster["entries"]): OverlapRoster {
  return { entries, warnings: [] };
}

describe("detectStagedForeignWrites", () => {
  it("reports a staged work-unit path another in-flight WU touches", async () => {
    const roster = rosterOf({
      branch: "feat/wu-a",
      worktreePath: "/repo.wu-a",
      metaFilePath: "/repo.wu-a/.arc/active/meta-wu-a.md",
      state: "Active",
    });
    const exec = buildExec({
      "diff main...feat/wu-a --name-only -- .arc/active/meta-wu-a.md": {
        stdout: ".arc/active/meta-wu-a.md\n",
      },
      "status --porcelain -- .arc/active/meta-wu-a.md": { stdout: "" },
    });

    const { overlaps } = await detectStagedForeignWrites({
      exec,
      roster,
      paths: [".arc/active/meta-wu-a.md", ".arc/active/cohort-x.md", "src/code.ts"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });

    expect(overlaps).toEqual([
      { branch: "feat/wu-a", worktreePath: "/repo.wu-a", matchedPaths: [".arc/active/meta-wu-a.md"] },
    ]);
  });

  it("short-circuits without touching git when no work-unit surface is staged", async () => {
    const { overlaps } = await detectStagedForeignWrites({
      exec: throwingExec,
      roster: rosterOf(),
      paths: [".arc/active/cohort-x.md", "packages/arc-framework/src/index.ts"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });
    expect(overlaps).toEqual([]);
  });

  it("stays silent on a self-write — the originating worktree is excluded", async () => {
    const roster = rosterOf({
      branch: "feat/self",
      worktreePath: "/repo.self",
      metaFilePath: "/repo.self/.arc/active/meta-self.md",
      state: "Active",
    });

    const { overlaps } = await detectStagedForeignWrites({
      exec: throwingExec, // self-exclusion drops the only candidate before any diff runs
      roster,
      paths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });
    expect(overlaps).toEqual([]);
  });
});
