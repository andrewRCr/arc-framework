/** Unit coverage for Git worktree porcelain tokenization and records. */

import { describe, expect, expectTypeOf, it } from "vitest";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";
import { z } from "zod";

import {
  GitWorktreePorcelainRecordSchema,
  parseGitWorktreePorcelain,
  tokenizeGitWorktreePorcelain,
  type GitWorktreePorcelainRecord,
} from "../../../src/lib/git/worktree-porcelain.js";
import { ArcError } from "../../../src/lib/kernel/index.js";

describe("tokenizeGitWorktreePorcelain", () => {
  it("normalizes branched, detached, and bare worktrees in stanza order", () => {
    const stdout = [
      "worktree /repo",
      "HEAD aaa",
      "branch refs/heads/main",
      "bare",
      "",
      "worktree /repo.detached",
      "HEAD bbb",
      "detached",
      "",
      "worktree /repo.bare",
      "bare",
      "",
    ].join("\n");

    expect(tokenizeGitWorktreePorcelain(stdout)).toEqual([
      { index: 0, candidate: { path: "/repo", head: "aaa", branch: "main", detached: false } },
      { index: 1, candidate: { path: "/repo.detached", head: "bbb", branch: null, detached: true } },
      { index: 2, candidate: { path: "/repo.bare", head: null, branch: null, detached: false } },
    ]);
  });

  it("ignores blank output and unknown attributes while retaining recognized fields", () => {
    expect(tokenizeGitWorktreePorcelain("\n\n")).toEqual([]);
    expect(tokenizeGitWorktreePorcelain("worktree /repo\nHEAD abc\nlocked reason\nfuture value\n")).toEqual([
      { index: 0, candidate: { path: "/repo", head: "abc", branch: null, detached: false } },
    ]);
  });

  it("retains a missing or empty anchor for boundary validation", () => {
    expect(tokenizeGitWorktreePorcelain("HEAD abc\n\nworktree \nHEAD def\n")).toEqual([
      { index: 0, candidate: { path: null, head: "abc", branch: null, detached: false } },
      { index: 1, candidate: { path: "", head: "def", branch: null, detached: false } },
    ]);
  });
});

describe("GitWorktreePorcelainRecordSchema", () => {
  it("accepts the strict normalized record and derives its type", () => {
    const value = { path: "/repo", head: null, branch: null, detached: false };
    expect(GitWorktreePorcelainRecordSchema.parse(value)).toEqual(value);
    expectTypeOf<GitWorktreePorcelainRecord>()
      .toEqualTypeOf<z.infer<typeof GitWorktreePorcelainRecordSchema>>();
  });

  it.each([
    { path: "", head: null, branch: null, detached: false },
    { path: "/repo", head: null, branch: null, detached: false, extra: true },
  ])("rejects invalid normalized record %#", (value) => {
    assertSchemaRefuses(GitWorktreePorcelainRecordSchema, value);
  });
});

describe("parseGitWorktreePorcelain", () => {
  it.each([
    ["first", "HEAD aaa\n\nworktree /second\nHEAD bbb\n", "stanzas.0.path"],
    ["middle", "worktree /first\nHEAD aaa\n\nHEAD bbb\n\nworktree /third\nHEAD ccc\n", "stanzas.1.path"],
    ["final", "worktree /first\nHEAD aaa\n\nHEAD ccc\n", "stanzas.1.path"],
  ])("rejects a missing %s anchor with a stable field path", (_position, stdout, path) => {
    let thrown: unknown;
    try {
      parseGitWorktreePorcelain(stdout);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ArcError);
    expect(thrown).toMatchObject({ code: "git.worktree-porcelain.invalid" });
    expect((thrown as Error).message).toContain(path);
    expect((thrown as Error).message).not.toContain("HEAD aaa");
  });
});
