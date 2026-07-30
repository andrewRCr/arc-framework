/** Exact NUL-delimited worktree-roster parsing coverage. */

import { describe, expect, it } from "vitest";

import { parseGitWorktreePorcelainZ } from "../../../src/lib/git/worktree-porcelain.js";

function stanza(path: string, ...fields: string[]): string {
  return `${[`worktree ${path}`, ...fields].join("\0")}\0\0`;
}

describe("worktree porcelain -z parser", () => {
  it("preserves Git-reported path bytes across presentation-sensitive spellings", () => {
    const paths = [
      "/repo/space path",
      "/repo/quote\"path",
      "/repo/back\\slash",
      "/repo/new\nline",
      "/repo/🚀",
      "C:\\Repo\\worktree",
      "\\\\server\\share\\repo",
    ];
    const parsed = parseGitWorktreePorcelainZ(paths.map((path, index) =>
      stanza(path, `HEAD ${String(index).padStart(40, "a")}`, "branch refs/heads/main")).join(""));
    expect(parsed.map((entry) => entry.path)).toEqual(paths);
  });

  it("retains first-stanza primary order and detached state", () => {
    expect(parseGitWorktreePorcelainZ(
      stanza("/primary", `HEAD ${"a".repeat(40)}`, "branch refs/heads/main")
      + stanza("/linked", `HEAD ${"b".repeat(40)}`, "detached"),
    )).toEqual([
      { path: "/primary", head: "a".repeat(40), branch: "main", detached: false },
      { path: "/linked", head: "b".repeat(40), branch: null, detached: true },
    ]);
  });

  it("rejects missing, duplicate, conflicting, and truncated fields", () => {
    const fixtures = [
      stanza("/repo", "branch refs/heads/main"),
      stanza("/repo", `HEAD ${"a".repeat(40)}`, `HEAD ${"b".repeat(40)}`),
      stanza("/repo", `HEAD ${"a".repeat(40)}`, "branch refs/heads/main", "detached"),
      `worktree /repo\0HEAD ${"a".repeat(40)}\0branch refs/heads/main\0`,
    ];
    for (const fixture of fixtures) expect(() => parseGitWorktreePorcelainZ(fixture)).toThrow();
  });
});
