/**
 * Unit tests for session-type inference — the pure-logic helper consumed
 * by the session-init probe to drive Step 3 items 9–10 loadset selection.
 *
 * Integration coverage exercises the helper through real status-file
 * fixtures (`__tests__/integration/active.test.ts`); these tests pin the
 * rule precedence directly without the filesystem round-trip.
 */

import { describe, it, expect } from "vitest";

import { inferSessionType } from "../../../src/commands/active/status.js";

describe("inferSessionType — State-based primary", () => {
  it("returns planning when State is exactly `Planning` (case-exact)", () => {
    expect(
      inferSessionType("Planning", "tasks-foo.md", "Begin Phase 1", "feature/foo"),
    ).toBe("planning");
  });

  it("does not match Planning case-insensitively (falls through to existing logic)", () => {
    expect(
      inferSessionType("planning", "tasks-foo.md", "Begin Phase 1", "feature/foo"),
    ).toBe("execution");
  });

  it("falls through to Task List logic when State is `In Progress`", () => {
    expect(
      inferSessionType("In Progress", "tasks-foo.md", "Begin Phase 1", "feature/foo"),
    ).toBe("execution");
  });

  it("treats parenthetical-suffix States (`Paused (2026-04-12)`) as non-Planning", () => {
    expect(
      inferSessionType("Paused (2026-04-12)", "tasks-foo.md", "Start Task 4.2", "feature/foo"),
    ).toBe("execution");
  });
});

describe("inferSessionType — branch-pattern fallback when State is empty", () => {
  it("returns planning when State is null and branch matches plan-pattern", () => {
    expect(inferSessionType(null, null, null, "technical/plan-foo")).toBe("planning");
  });

  it("returns planning when State is empty string and branch matches plan-pattern", () => {
    expect(inferSessionType("", null, null, "technical/plan-foo")).toBe("planning");
  });

  it("returns planning when State is whitespace-only and branch matches plan-pattern", () => {
    expect(inferSessionType("   ", null, null, "technical/plan-foo")).toBe("planning");
  });

  it("matches plan-pattern with feature category prefix", () => {
    expect(inferSessionType(null, null, null, "feature/plan-bar")).toBe("planning");
  });

  it("returns null when State is empty and branch does not match plan-pattern", () => {
    expect(inferSessionType(null, null, null, "feature/foo")).toBeNull();
  });

  it("returns null when State is empty and branch is null (detached HEAD)", () => {
    expect(inferSessionType(null, null, null, null)).toBeNull();
  });

  it("does not match plan-name without category prefix", () => {
    expect(inferSessionType(null, null, null, "plan-foo")).toBeNull();
  });

  it("does not match plain `plan` without trailing name segment", () => {
    expect(inferSessionType(null, null, null, "feature/plan-")).toBeNull();
  });
});

describe("inferSessionType — non-Planning State falls through to Task List signals", () => {
  it("returns planning when taskList is null", () => {
    expect(
      inferSessionType("In Progress", null, "Start Task 1.1 — implement", "feature/foo"),
    ).toBe("planning");
  });

  it("returns planning when taskList is `[none]`", () => {
    expect(
      inferSessionType("In Progress", "[none]", "Plan next phase", "feature/foo"),
    ).toBe("planning");
  });

  it("returns planning when taskList is `[none associated]`", () => {
    expect(
      inferSessionType("In Progress", "[none associated]", "Draft PRD", "feature/foo"),
    ).toBe("planning");
  });
});

describe("inferSessionType — non-Planning State falls through to Next Action signals", () => {
  it("returns integration when Next Action begins with `integrate-work-unit`", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "integrate-work-unit Step 7 — push and create PR",
        "feature/foo",
      ),
    ).toBe("integration");
  });

  it("returns integration when Next Action begins with `archive-work-unit`", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "archive-work-unit Step 1 — archive artifacts",
        "feature/foo",
      ),
    ).toBe("integration");
  });

  it("matches the integration prefix case-insensitively", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "Integrate-Work-Unit Step 3 — review",
        "feature/foo",
      ),
    ).toBe("integration");
  });

  it("requires a word boundary after the prefix (avoids `integrate-work-unit-helpers`)", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "integrate-work-unit-internal something else",
        "feature/foo",
      ),
    ).toBe("execution");
  });
});

describe("inferSessionType — execution default", () => {
  it("returns execution for a regular Start-Task Next Action", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "Start Task 4.2 — write unit tests",
        "feature/foo",
      ),
    ).toBe("execution");
  });

  it("returns execution for non-integration lifecycle workflows (clean-work-unit)", () => {
    expect(
      inferSessionType(
        "In Progress",
        "tasks-foo.md",
        "clean-work-unit Step 3 — Mode 1 mid-work cleanup",
        "feature/foo",
      ),
    ).toBe("execution");
  });

  it("returns execution when nextAction is null but taskList is populated", () => {
    expect(
      inferSessionType("In Progress", "tasks-foo.md", null, "feature/foo"),
    ).toBe("execution");
  });
});
