/**
 * Unit tests for errand-resume detection — recognizing when the session's
 * current branch is an execution-only `chore/<slug>` errand with no backing
 * meta, the signal session-init's resolution arm loads run-errand on.
 */

import { describe, it, expect } from "vitest";

import { detectErrandResume } from "../../../src/lib/session-init/errand-resume-detection.js";

describe("detectErrandResume", () => {
  it("flags a chore/ branch with no backing meta as resumable and extracts the slug", () => {
    const result = detectErrandResume({ currentBranch: "chore/fix-typo", hasBackingMeta: false });

    expect(result).toEqual({ resumable: true, slug: "fix-typo" });
  });

  it("does not flag a chore/ branch once a meta backs it (promoted errand → WU)", () => {
    const result = detectErrandResume({ currentBranch: "chore/fix-typo", hasBackingMeta: true });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("does not flag a non-chore work-unit branch", () => {
    const result = detectErrandResume({ currentBranch: "feat/some-feature", hasBackingMeta: false });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("does not flag a detached HEAD (null branch)", () => {
    const result = detectErrandResume({ currentBranch: null, hasBackingMeta: false });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("does not flag a bare `chore/` prefix with an empty slug", () => {
    const result = detectErrandResume({ currentBranch: "chore/", hasBackingMeta: false });

    expect(result).toEqual({ resumable: false, slug: null });
  });

  it("preserves a multi-segment slug after the chore/ prefix", () => {
    const result = detectErrandResume({ currentBranch: "chore/fix/nested-typo", hasBackingMeta: false });

    expect(result).toEqual({ resumable: true, slug: "fix/nested-typo" });
  });
});
