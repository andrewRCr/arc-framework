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

import { normalizeGitConfigValue } from "../../../src/handlers/status.js";

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
