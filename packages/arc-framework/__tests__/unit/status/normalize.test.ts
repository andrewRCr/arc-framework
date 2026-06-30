/**
 * Unit tests for the composite status handler's git-config normalization.
 *
 * The composite reads `arc.identity` / `arc.role` via two `git config --get`
 * calls at handler entry. `gitConfigGet` returns `undefined` on error or
 * when the key is absent and a trimmed string otherwise — an unset key with
 * an empty value returns `""`. The normalizer collapses both `undefined`
 * and empty string to `null` so the orchestrator's identity-missing
 * short-circuit triggers uniformly.
 */

import { describe, it, expect } from "vitest";

import {
  normalizeGitConfigValue,
  resolveSessionInitDirtyState,
} from "../../../src/handlers/status.js";

describe("normalizeGitConfigValue", () => {
  it("returns null for undefined (git config key absent)", () => {
    expect(normalizeGitConfigValue(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(normalizeGitConfigValue("")).toBeNull();
  });

  it("returns null for a whitespace-only string", () => {
    expect(normalizeGitConfigValue("   ")).toBeNull();
    expect(normalizeGitConfigValue("\n\t")).toBeNull();
  });

  it("returns the trimmed value for a non-empty input", () => {
    expect(normalizeGitConfigValue("andrew")).toBe("andrew");
    expect(normalizeGitConfigValue("  maintainer  ")).toBe("maintainer");
  });

  it("preserves internal whitespace and punctuation", () => {
    expect(normalizeGitConfigValue("team-lead")).toBe("team-lead");
    expect(normalizeGitConfigValue("first last")).toBe("first last");
  });
});

describe("resolveSessionInitDirtyState", () => {
  it("uses the compaction-seed snapshot when it is available", async () => {
    const fallback = async () => ({ state: "clean" as const, fileCount: 0 });

    await expect(resolveSessionInitDirtyState({
      compactionSeedGitSnapshotP: Promise.resolve({
        head: "72d145021bf4166fa70efc5b9fd11916cf0a359a",
        uncommittedFiles: ["src/changed.ts", "README.md"],
      }),
      fallback,
    })).resolves.toEqual({
      state: "dirty",
      fileCount: 2,
    });
  });

  it("falls back to the primary dirty probe when the sidecar snapshot fails", async () => {
    let fallbackCalls = 0;

    await expect(resolveSessionInitDirtyState({
      compactionSeedGitSnapshotP: Promise.reject(new Error("rev-parse failed")),
      fallback: async () => {
        fallbackCalls += 1;
        return { state: "clean", fileCount: 0 };
      },
    })).resolves.toEqual({
      state: "clean",
      fileCount: 0,
    });
    expect(fallbackCalls).toBe(1);
  });
});
