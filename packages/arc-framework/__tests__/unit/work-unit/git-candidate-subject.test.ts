/** Unit coverage for Git-backed Candidate subject collection. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { collectGitCandidateTarget } from "../../../src/lib/work-unit/git-candidate-subject.js";

const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

describe("collectGitCandidateTarget", () => {
  it("attests staged WU content while classifying only managed projections outside the digest", async () => {
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
      if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
      if (args[0] === "diff" && args[1] === "--cached" && args[4] === BASE) {
        return {
          stdout: [
            ".arc/active/meta-example.md",
            ".arc/active/tasks-example.md",
            ".arc/system/.internal/candidates/example.json",
            "packages/arc-framework/src/example.ts",
            "",
          ].join("\0"),
        };
      }
      throw new Error(`Unexpected Git operation: ${args.join(" ")}`);
    };
    const bytes = new Map([
      [".arc/active/meta-example.md", new TextEncoder().encode("meta")],
      [".arc/active/tasks-example.md", new TextEncoder().encode("tasks")],
      [".arc/system/.internal/candidates/example.json", new TextEncoder().encode("candidate")],
      ["packages/arc-framework/src/example.ts", new TextEncoder().encode("source")],
    ]);

    const target = await collectGitCandidateTarget({
      cwd: "/repo",
      name: "example",
      baseBranch: "main",
      exec,
      readBlob: async (_cwd, _ref, path) => bytes.get(path) ?? null,
    });

    expect(target.revision).toBe(HEAD);
    expect(target.subject.entries).toHaveLength(4);
    expect(target.subject.entries).toEqual(expect.arrayContaining([
      { path: ".arc/active/meta-example.md", treatment: "operational" },
      { path: ".arc/active/tasks-example.md", treatment: "reviewable" },
      { path: ".arc/system/.internal/candidates/example.json", treatment: "candidate-projection" },
      { path: "packages/arc-framework/src/example.ts", treatment: "reviewable" },
    ].map((entry) => expect.objectContaining(entry))));
  });

  it("leaves the subject digest unchanged when the settled publication boundary is staged", async () => {
    const staged = [
      ".arc/active/tasks-example.md",
      ".arc/system/.internal/candidates/example.json",
    ];
    const bytes = new Map([
      [".arc/active/tasks-example.md", new TextEncoder().encode("tasks")],
      [".arc/system/.internal/candidates/example.json", new TextEncoder().encode("candidate")],
      [".arc/system/.internal/candidates/example.boundary.json", new TextEncoder().encode("boundary")],
    ]);
    const collect = (paths: readonly string[]) => collectGitCandidateTarget({
      cwd: "/repo",
      name: "example",
      baseBranch: "main",
      readBlob: async (_cwd, _ref, path) => bytes.get(path) ?? null,
      exec: async (_command, args) => {
        if (args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
        if (args[0] === "merge-base") return { stdout: `${BASE}\n` };
        if (args[0] === "diff") return { stdout: [...paths, ""].join("\0") };
        throw new Error(`Unexpected Git operation: ${args.join(" ")}`);
      },
    });

    const before = await collect(staged);
    const after = await collect([...staged, ".arc/system/.internal/candidates/example.boundary.json"]);

    expect(after.subject.entries).toEqual(expect.arrayContaining([expect.objectContaining({
      path: ".arc/system/.internal/candidates/example.boundary.json",
      treatment: "candidate-projection",
    })]));
    expect(after.subject.subjectDigest).toBe(before.subject.subjectDigest);
  });
});
