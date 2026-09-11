/** Unit coverage for how a staged change set classifies into Candidate subject treatment. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
} from "../../../src/lib/work-unit/git-candidate-subject.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const CURRENT_BASE = "d".repeat(40);

/** Collect over a staged change set, giving every present path its own content. */
async function collectTarget(paths: readonly string[], contents: Readonly<Record<string, string>> = {}) {
  const exec: GitExec = async (_cmd, args) => {
    if (args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
    if (args[0] === "for-each-ref") return { stdout: `${BASE}\n` };
    if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
    if (args[0] === "diff") return { stdout: `${paths.join("\0")}\0` };
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  };
  return collectGitCandidateTarget({
    cwd: "/repo",
    name: "example",
    baseBranch: "main",
    exec,
    readBlob: async (_cwd, _ref, path) => {
      const content = contents[path] ?? `content of ${path}`;
      return content === "" ? null : new TextEncoder().encode(content);
    },
  });
}

/** The collected subject indexed by the path each entry is keyed under. */
async function collect(paths: readonly string[], contents: Readonly<Record<string, string>> = {}) {
  const target = await collectTarget(paths, contents);
  return new Map(target.subject.entries.map((entry) => [entry.path, entry]));
}

describe("Candidate subject classification", () => {
  it("collects every changed path through one bulk read", async () => {
    const paths = ["z-last.txt", "a-first.txt", "deleted.txt"];
    const bulkReads: Array<{ ref: string | null; paths: readonly string[] }> = [];
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
      if (args[0] === "for-each-ref") return { stdout: `${BASE}\n` };
      if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
      if (args[0] === "diff") return { stdout: `${paths.join("\0")}\0` };
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    const target = await collectGitCandidateTarget({
      cwd: "/repo",
      name: "example",
      baseBranch: "main",
      exec,
      readEntries: async (_cwd, ref, selectedPaths) => {
        bulkReads.push({ ref, paths: selectedPaths });
        return new Map([
          ["a-first.txt", { mode: "100644", bytes: new TextEncoder().encode("first") }],
          ["z-last.txt", { mode: "100755", bytes: new TextEncoder().encode("last") }],
        ]);
      },
    });

    expect(bulkReads).toEqual([{
      ref: null,
      paths: ["a-first.txt", "deleted.txt", "z-last.txt"],
    }]);
    expect(target.subject.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "a-first.txt", mode: "100644" }),
      expect.objectContaining({ path: "deleted.txt", mode: "absent" }),
      expect.objectContaining({ path: "z-last.txt", mode: "100755" }),
    ]));
  });

  it("collects an exact committed subject without reading the current index", async () => {
    const revision = "c".repeat(40);
    const calls: string[][] = [];
    const refs: Array<string | null> = [];
    const exec: GitExec = async (_cmd, args) => {
      calls.push([...args]);
      if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
      if (args[0] === "diff") return { stdout: "reviewed.txt\0" };
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    const target = await collectGitCandidateTarget({
      cwd: "/repo",
      name: "example",
      baseBranch: "main",
      baseRevision: BASE,
      revision,
      exec,
      readBlob: async (_cwd, ref) => {
        refs.push(ref);
        return new TextEncoder().encode("reviewed content");
      },
    });

    expect(target.revision).toBe(revision);
    expect(calls).toEqual([
      ["merge-base", revision, BASE],
      ["diff", "--name-only", "-z", BASE, revision, "--"],
    ]);
    expect(refs).toEqual([revision]);
  });

  it("collects the subject against an exact authoritative base revision", async () => {
    const calls: string[][] = [];
    const exec: GitExec = async (_cmd, args) => {
      calls.push([...args]);
      if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
      if (args[0] === "diff") return { stdout: "reviewed.txt\0" };
      throw new Error(`unexpected git invocation: ${args.join(" ")}`);
    };

    await collectGitCandidateTarget({
      cwd: "/repo",
      name: "example",
      baseBranch: "main",
      baseRevision: CURRENT_BASE,
      revision: HEAD,
      exec,
      readBlob: async () => new TextEncoder().encode("reviewed content"),
    });

    expect(calls[0]).toEqual(["merge-base", HEAD, CURRENT_BASE]);
  });

  it("separates reviewable content from the lifecycle writes that accompany it", async () => {
    const staged = [
      "packages/arc-framework/src/example.ts",
      ".arc/active/tasks-example.md",
      ".arc/active/meta-example.md",
      ".arc/backlog/ROADMAP.md",
      ".arc/system/.internal/candidates/example.json",
    ];
    const target = await collectTarget(staged);
    const entries = new Map(target.subject.entries.map((entry) => [entry.path, entry]));

    expect(target.revision).toBe(HEAD);
    expect(target.subject.entries).toHaveLength(staged.length);
    expect(entries.get("packages/arc-framework/src/example.ts")?.treatment).toBe("reviewable");
    expect(entries.get(".arc/active/tasks-example.md")?.treatment).toBe("reviewable");
    expect(entries.get(".arc/active/meta-example.md")?.treatment).toBe("operational");
    expect(entries.get(".arc/backlog/ROADMAP.md")?.treatment).toBe("operational");
    expect(entries.get(".arc/system/.internal/candidates/example.json")?.treatment)
      .toBe("candidate-projection");
  });

  it("keys a relocated artifact to the stage it passes through, not the location it now occupies", async () => {
    const relocated = ".arc/completed/2026-q3/01_example/tasks-example.md";
    const settled = await collect([".arc/active/tasks-example.md"], {
      ".arc/active/tasks-example.md": "the verified task list",
    });
    const archived = await collect([relocated], { [relocated]: "the verified task list" });

    expect(archived.get(relocated)?.treatment).toBe("operational");
    expect(archived.get(".arc/active/tasks-example.md")).toEqual(
      settled.get(".arc/active/tasks-example.md"),
    );
  });

  it("carries the relocated content forward so an edit along the way still reads as a change", async () => {
    const relocated = ".arc/completed/2026-q3/01_example/tasks-example.md";
    const settled = await collect([".arc/active/tasks-example.md"], {
      ".arc/active/tasks-example.md": "the verified task list",
    });
    const edited = await collect([relocated], { [relocated]: "the task list, edited after review" });

    expect(edited.get(".arc/active/tasks-example.md")?.digest)
      .not.toBe(settled.get(".arc/active/tasks-example.md")?.digest);
  });

  it("reads a vanished active path through the artifact that moved out of it", async () => {
    const relocated = ".arc/completed/2026-q3/01_example/tasks-example.md";
    const entries = await collect([".arc/active/tasks-example.md", relocated], {
      ".arc/active/tasks-example.md": "",
      [relocated]: "the verified task list",
    });

    expect(entries.get(relocated)?.treatment).toBe("operational");
    expect(entries.get(".arc/active/tasks-example.md")).toMatchObject({ treatment: "reviewable" });
    expect(entries.get(".arc/active/tasks-example.md")?.digest)
      .toBe(entries.get(relocated)?.digest);
  });

  it("keeps a contributor-scoped artifact distinct from the project artifact of the same slug", async () => {
    const contributor = ".arc/user/andrew/active/tasks-example.md";
    const entries = await collect([".arc/active/tasks-example.md", contributor]);

    expect([...entries.keys()]).toEqual(expect.arrayContaining([
      ".arc/active/tasks-example.md",
      contributor,
    ]));
    expect(entries.get(contributor)?.digest).not.toBe(entries.get(".arc/active/tasks-example.md")?.digest);
  });

  it("leaves the subject digest unchanged when the settled publication boundary is staged", async () => {
    const staged = [".arc/active/tasks-example.md", ".arc/system/.internal/candidates/example.json"];
    const boundary = ".arc/system/.internal/candidates/example.boundary.json";

    const before = await collectTarget(staged);
    const after = await collectTarget([...staged, boundary]);

    expect(after.subject.entries).toEqual(expect.arrayContaining([expect.objectContaining({
      path: boundary,
      treatment: "candidate-projection",
    })]));
    expect(after.subject.subjectDigest).toBe(before.subject.subjectDigest);
  });

  it("leaves another work unit's artifacts as ordinary reviewable content", async () => {
    const entries = await collect([".arc/completed/2026-q3/01_sibling/tasks-sibling.md"]);

    expect(entries.get(".arc/completed/2026-q3/01_sibling/tasks-sibling.md")?.treatment)
      .toBe("reviewable");
  });
});

/** Read one worktree-versus-index comparison and one untracked listing. */
async function collectUnstaged(unstaged: readonly string[], untracked: readonly string[] = []) {
  const emit = (paths: readonly string[]) => paths.length === 0 ? "" : `${paths.join("\0")}\0`;
  const exec: GitExec = async (_cmd, args) => {
    if (args[0] === "diff") return { stdout: emit(unstaged) };
    if (args[0] === "ls-files") return { stdout: emit(untracked) };
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  };
  return collectUnstagedReviewablePaths({ cwd: "/repo", name: "example", exec });
}

describe("Unstaged reviewable content", () => {
  it("reports working-tree content the index does not carry", async () => {
    expect(await collectUnstaged([
      "packages/arc-framework/src/example.ts",
      ".arc/active/tasks-example.md",
    ])).toEqual([
      ".arc/active/tasks-example.md",
      "packages/arc-framework/src/example.ts",
    ]);
  });

  it("stays silent over the operational and projection writes a lifecycle tree carries", async () => {
    expect(await collectUnstaged([
      ".arc/active/meta-example.md",
      ".arc/backlog/ROADMAP.md",
      ".arc/system/.internal/candidates/example.json",
      ".arc/system/.internal/candidates/example.boundary.json",
    ])).toEqual([]);
  });

  it("reports an untracked reviewable file the subject would otherwise never see", async () => {
    expect(await collectUnstaged([], [
      "packages/arc-framework/src/added.ts",
      ".arc/active/meta-example.md",
    ])).toEqual(["packages/arc-framework/src/added.ts"]);
  });

  it("follows a relocated artifact to the treatment its content receives", async () => {
    expect(await collectUnstaged([".arc/completed/2026-q3/01_example/tasks-example.md"]))
      .toEqual([".arc/completed/2026-q3/01_example/tasks-example.md"]);
    expect(await collectUnstaged([".arc/completed/2026-q3/01_example/meta-example.md"]))
      .toEqual([]);
  });

  it("reports each path once when both readings name it", async () => {
    const path = "packages/arc-framework/src/example.ts";

    expect(await collectUnstaged([path], [path])).toEqual([path]);
  });

  it("reports nothing when the index carries every reviewable edit", async () => {
    expect(await collectUnstaged([])).toEqual([]);
  });
});
