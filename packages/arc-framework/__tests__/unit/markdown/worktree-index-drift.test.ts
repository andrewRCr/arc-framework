import { describe, expect, it } from "vitest";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

import {
  findStagedMarkdownWorktreeDrift,
  formatStagedMarkdownWorktreeDriftMessage,
} from "../../../src/lib/markdown/worktree-index-drift.js";

describe("staged Markdown worktree/index drift", () => {
  it("returns staged gate paths that also differ in the worktree", async () => {
    const { exec, calls } = scriptGitExec([
      {
        match: { predicate: (args) => args[0] === "diff" && args.includes("--cached") },
        responses: [{
          stdout: ["docs/guide.md", "README.md", "src/only-staged.ts", "package.json"].join("\0") + "\0",
        }],
      },
      {
        match: { predicate: (args) => args[0] === "diff" && !args.includes("--cached") },
        responses: [{ stdout: ["docs/guide.md", "src/only-worktree.ts", "package.json"].join("\0") + "\0" }],
      },
    ]);

    await expect(findStagedMarkdownWorktreeDrift({ root: "/repo", exec })).resolves.toEqual([
      "docs/guide.md",
      "package.json",
    ]);
    expect(calls).toHaveLength(2);
  });

  it("returns an empty list when staged paths match the worktree", async () => {
    const { exec } = scriptGitExec([
      { match: { predicate: (args) => args[0] === "diff" && args.includes("--cached") },
        responses: [{ stdout: "docs/guide.md\0" }] },
      { match: { predicate: (args) => args[0] === "diff" && !args.includes("--cached") },
        responses: [{ stdout: "" }] },
    ]);

    await expect(findStagedMarkdownWorktreeDrift({ root: "/repo", exec })).resolves.toEqual([]);
  });

  it("formats a stable operator message with re-stage guidance", () => {
    expect(formatStagedMarkdownWorktreeDriftMessage(["docs/guide.md", "package.json"])).toBe([
      "Markdown worktree/index drift: 2 staged path(s) differ in the worktree.",
      "`npm run -s lint:md` reads worktree bytes; pre-commit certifies the git index via `lint:md:staged`.",
      "Re-stage the path(s), then run `npm run -s lint:md:staged` before commit:",
      "  - docs/guide.md",
      "  - package.json",
    ].join("\n"));
  });
});
