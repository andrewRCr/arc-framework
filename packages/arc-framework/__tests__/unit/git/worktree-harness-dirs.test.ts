/**
 * Unit tests for registered-harness-dir parsing — order-preserving dedup and
 * the validation that rejects unsafe or repo-critical top-level names before
 * they can be copied into a linked worktree.
 */

import { describe, it, expect } from "vitest";

import { parseRegisteredHarnessDirs } from "../../../src/lib/git/worktree-harness-dirs.js";

describe("parseRegisteredHarnessDirs", () => {
  it("parses a comma-separated list, trimming and deduplicating in order", () => {
    expect(parseRegisteredHarnessDirs(".claude, .codex ,.claude,.gemini")).toEqual([
      ".claude",
      ".codex",
      ".gemini",
    ]);
  });

  it("returns an empty list for undefined or all-empty input", () => {
    expect(parseRegisteredHarnessDirs(undefined)).toEqual([]);
    expect(parseRegisteredHarnessDirs("  ,  ")).toEqual([]);
  });

  it("rejects nested, absolute, or traversal entries", () => {
    for (const bad of ["a/b", "..", "/abs", "a\\b"]) {
      expect(() => parseRegisteredHarnessDirs(bad)).toThrow(/invalid top-level directory/);
    }
  });

  it("rejects reserved repo-critical directories (`.git` / `.arc`)", () => {
    expect(() => parseRegisteredHarnessDirs(".git")).toThrow(/reserved directory/);
    expect(() => parseRegisteredHarnessDirs(".arc")).toThrow(/reserved directory/);
    expect(() => parseRegisteredHarnessDirs(".claude,.git")).toThrow(/reserved directory/);
  });

  it("rejects reserved directories case-insensitively (case-insensitive filesystems)", () => {
    for (const variant of [".Git", ".GIT", ".Arc", ".ARC"]) {
      expect(() => parseRegisteredHarnessDirs(variant)).toThrow(/reserved directory/);
    }
  });
});
