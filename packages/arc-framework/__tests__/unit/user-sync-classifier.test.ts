/**
 * Unit tests for `classifyUserSyncPath` — pure sync-class inference over
 * manifest-relative user-directory paths (per-WU / cross-WU / never-synced).
 */

import { describe, it, expect } from "vitest";

import { classifyUserSyncPath, wuNameOfPath } from "../../src/lib/user-sync/index.js";

describe("classifyUserSyncPath", () => {
  it("classifies a wu-name subdir path as per-wu", () => {
    expect(classifyUserSyncPath("worktree-foundation/SESSION-NOTES.md")).toBe("per-wu");
  });

  it("classifies a nested wu-name subdir path as per-wu", () => {
    expect(classifyUserSyncPath("worktree-foundation/drafts/idea.md")).toBe("per-wu");
  });

  it("classifies a flat identity-root path as cross-wu", () => {
    expect(classifyUserSyncPath("WORKING-MEMORY.md")).toBe("cross-wu");
  });

  it("classifies any flat identity-root file as cross-wu, not just the known shapes", () => {
    expect(classifyUserSyncPath("SOME-FUTURE-CROSS-WU-FILE.md")).toBe("cross-wu");
  });

  it("classifies an .internal subdir path as never-synced", () => {
    expect(classifyUserSyncPath(".internal/release-setup.json")).toBe("never-synced");
  });

  it("classifies the compaction seed sidecar as never-synced", () => {
    expect(classifyUserSyncPath(".internal/compaction-seed.json")).toBe("never-synced");
  });

  it("classifies a root-level dotfile as never-synced", () => {
    expect(classifyUserSyncPath(".sync-state.json")).toBe("never-synced");
  });
});

describe("wuNameOfPath", () => {
  it("returns the work-unit name for a per-WU subdir path", () => {
    expect(wuNameOfPath("worktree-foundation/SESSION-NOTES.md")).toBe("worktree-foundation");
  });

  it("returns the leading subdir for a nested per-WU path", () => {
    expect(wuNameOfPath("worktree-foundation/drafts/idea.md")).toBe("worktree-foundation");
  });

  it("returns null for a cross-WU flat path", () => {
    expect(wuNameOfPath("WORKING-MEMORY.md")).toBeNull();
  });

  it("returns null for a never-synced path", () => {
    expect(wuNameOfPath(".internal/release-setup.json")).toBeNull();
  });
});
