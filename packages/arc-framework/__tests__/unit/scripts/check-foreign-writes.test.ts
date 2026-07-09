/**
 * Unit tests for the foreign-write advisory backstop entry point.
 *
 * Covers the pure pieces — the work-unit-surface candidate filter and the
 * warning formatter — plus the orchestration core over an injected roster and
 * mock git exec. The thin CLI wrapper (identity / config / roster assembly) is
 * exercised through the hook at commit time, not here.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  detectStagedForeignWrites,
  formatForeignWriteAdvisories,
  formatForeignWriteWarnings,
  resolveOriginatingMetaPath,
  selectForeignWriteCandidates,
} from "../../../src/scripts/check-foreign-writes.js";
import type { OverlapRoster } from "../../../src/lib/git/foreign-artifact-detection.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/index.js";

type ResponseFn = (args: string[]) => ExecResult | Promise<ExecResult>;

/** Keyed-arg exec stub: positional tokens, `*` wildcard (mirrors the detection tests). */
function buildExec(responses: Record<string, ExecResult | ResponseFn>): GitExec {
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

  return async (cmd, args) => {
    const direct = lookup(args);
    if (direct !== undefined) {
      const result = typeof direct === "function" ? await direct(args) : direct;
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
          return typeof refResponse === "function" ? refResponse(refArgs) : refResponse;
        }
      }
    }
    throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
  };
}

const throwingExec: GitExec = async (cmd, args) => {
  throw new Error(`exec should not be called: ${cmd} ${args.join(" ")}`);
};

const tempRoots: string[] = [];

async function createActiveFixture(metaName?: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-foreign-writes-"));
  tempRoots.push(root);
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  if (metaName !== undefined) {
    await writeFile(
      join(activeDir, `meta-${metaName}.md`),
      [
        `# Metadata: ${metaName}`,
        "",
        "- **State:** Active",
        `- **Branch:** feat/${metaName}`,
        "",
      ].join("\n"),
    );
  }
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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

describe("resolveOriginatingMetaPath", () => {
  it("returns the active WU meta path when exactly one active meta resolves", async () => {
    const root = await createActiveFixture("self");

    await expect(resolveOriginatingMetaPath(root)).resolves.toBe(".arc/active/meta-self.md");
  });

  it("returns undefined when no active WU resolves", async () => {
    const root = await createActiveFixture();

    await expect(resolveOriginatingMetaPath(root)).resolves.toBeUndefined();
  });
});

/** One in-flight WU overlap-roster entry. */
function rosterOf(...entries: OverlapRoster["entries"]): OverlapRoster {
  return { entries, warnings: [] };
}

describe("detectStagedForeignWrites", () => {
  it("skips an indeterminate entry with an advisory note", async () => {
    const result = await detectStagedForeignWrites({
      exec: throwingExec,
      roster: rosterOf(
        {
          branch: "feat/self",
          name: "self",
          worktreePath: "/repo.self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Active",
        },
        {
          branch: "feat/wu-a",
          name: "wu-a",
          worktreePath: "/repo.wu-a",
          metaFilePath: ".arc/active/meta-wu-a.md",
          state: "Active",
          marks: ["indeterminate"],
        },
      ),
      paths: [".arc/active/meta-wu-a.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });

    expect(result.overlaps).toEqual([]);
    expect(result.skipped).toEqual([
      {
        branch: "feat/wu-a",
        worktreePath: "/repo.wu-a",
        marks: ["indeterminate"],
        reason: "entry-marked-indeterminate",
      },
    ]);
    expect(formatForeignWriteAdvisories(result)).toEqual([
      "feat/wu-a skipped: entry marked indeterminate (/repo.wu-a)",
    ]);
  });

  it("skips an indeterminate probe with an advisory note", async () => {
    let statusReads = 0;
    const exec = buildExec({
      "diff main...feat/wu-a --name-only -- .arc/active/meta-wu-a.md": { stdout: "" },
      "status --porcelain -- .arc/active/meta-wu-a.md": () => {
        statusReads += 1;
        return { stdout: statusReads === 1 ? " M .arc/active/meta-wu-a.md\n" : "" };
      },
    });

    const result = await detectStagedForeignWrites({
      exec,
      roster: rosterOf(
        {
          branch: "feat/self",
          name: "self",
          worktreePath: "/repo.self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Active",
        },
        {
          branch: "feat/wu-a",
          name: "wu-a",
          worktreePath: "/repo.wu-a",
          metaFilePath: ".arc/active/meta-wu-a.md",
          state: "Active",
        },
      ),
      paths: [".arc/active/meta-wu-a.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
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
    expect(formatForeignWriteAdvisories(result)).toEqual([
      "feat/wu-a skipped: probe indeterminate (/repo.wu-a)",
    ]);
  });

  it("skips a location-ambiguous entry with an advisory note", async () => {
    const result = await detectStagedForeignWrites({
      exec: throwingExec,
      roster: rosterOf(
        {
          branch: "feat/self",
          name: "self",
          worktreePath: "/repo.self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Active",
        },
        {
          branch: "feat/wu-a",
          name: "wu-a",
          worktreePath: "/repo.wu-a",
          metaFilePath: ".arc/active/meta-wu-a.md",
          state: "Active",
          marks: ["location-ambiguous"],
        },
      ),
      paths: [".arc/active/meta-wu-a.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });

    expect(result.overlaps).toEqual([]);
    expect(result.skipped).toEqual([
      {
        branch: "feat/wu-a",
        worktreePath: "/repo.wu-a",
        marks: ["location-ambiguous"],
        reason: "entry-location-ambiguous",
      },
    ]);
    expect(formatForeignWriteAdvisories(result)).toEqual([
      "feat/wu-a skipped: entry marked location-ambiguous (/repo.wu-a)",
    ]);
  });

  it("ignores parked entries without reporting overlap", async () => {
    const result = await detectStagedForeignWrites({
      exec: throwingExec,
      roster: rosterOf(
        {
          branch: "feat/self",
          name: "self",
          worktreePath: "/repo.self",
          metaFilePath: ".arc/active/meta-self.md",
          state: "Active",
        },
        {
          branch: "feat/shelf",
          name: "shelf",
          worktreePath: "/repo.shelf",
          metaFilePath: ".arc/active/meta-shelf.md",
          state: "Active",
          scheduling: "parked",
        },
      ),
      paths: [".arc/active/meta-shelf.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });

    expect(result.overlaps).toEqual([]);
    expect(result.skipped).toBeUndefined();
    expect(formatForeignWriteAdvisories(result)).toEqual([]);
  });

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

  it("stays silent on a remote-only self-write matching the originating meta path", async () => {
    const roster = rosterOf({
      branch: "origin/plan/self",
      metaFilePath: ".arc/active/meta-self.md",
      state: "Planning",
    });

    const { overlaps } = await detectStagedForeignWrites({
      exec: throwingExec,
      roster,
      paths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
      originatingMetaPath: ".arc/active/meta-self.md",
    });
    expect(overlaps).toEqual([]);
  });

  it("self-excludes by the worktree-matched WU name during active-meta resolution gaps", async () => {
    const roster = rosterOf(
      {
        branch: "feat/self",
        name: "self",
        worktreePath: "/repo.self",
        metaFilePath: ".arc/active/meta-self.md",
        state: "Active",
      },
      {
        branch: "origin/plan/self",
        name: "self",
        metaFilePath: ".arc/active/meta-self.md",
        state: "Planning",
      },
    );

    const { overlaps } = await detectStagedForeignWrites({
      exec: throwingExec,
      roster,
      paths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });
    expect(overlaps).toEqual([]);
  });

  it("still reports a genuinely foreign WU after name-keyed self-exclusion", async () => {
    const roster = rosterOf(
      {
        branch: "feat/self",
        name: "self",
        worktreePath: "/repo.self",
        metaFilePath: ".arc/active/meta-self.md",
        state: "Active",
      },
      {
        branch: "feat/other",
        name: "other",
        worktreePath: "/repo.other",
        metaFilePath: ".arc/active/meta-other.md",
        state: "Active",
      },
    );
    const exec = buildExec({
      "diff main...feat/other --name-only -- .arc/active/meta-self.md": {
        stdout: ".arc/active/meta-self.md\n",
      },
      "status --porcelain -- .arc/active/meta-self.md": { stdout: "" },
    });

    const { overlaps } = await detectStagedForeignWrites({
      exec,
      roster,
      paths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
    });
    expect(overlaps).toEqual([
      { branch: "feat/other", worktreePath: "/repo.other", matchedPaths: [".arc/active/meta-self.md"] },
    ]);
  });

  it("notes when self-exclusion has only the worktree/meta path fallback", async () => {
    const roster = rosterOf({
      branch: "feat/other",
      name: "other",
      worktreePath: "/repo.other",
      metaFilePath: ".arc/active/meta-other.md",
      state: "Active",
    });
    const exec = buildExec({
      "diff main...feat/other --name-only -- .arc/active/meta-self.md": { stdout: "" },
      "status --porcelain -- .arc/active/meta-self.md": { stdout: "" },
    });

    const result = await detectStagedForeignWrites({
      exec,
      roster,
      paths: [".arc/active/meta-self.md"],
      baseBranch: "main",
      originatingWorktreePath: "/repo.self",
      originatingMetaPath: ".arc/active/meta-self.md",
    });
    expect(result.overlaps).toEqual([]);
    expect(result.notes).toEqual([
      "Originating work unit name was unavailable; self-exclusion fell back to worktree/meta path matching.",
    ]);
  });
});
