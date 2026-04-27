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

describe("inferSessionType — Task List planning signals", () => {
  it("returns planning when taskList is null", () => {
    expect(inferSessionType(null, "Start Task 1.1 — implement")).toBe("planning");
  });

  it("returns planning when taskList is `[none]`", () => {
    expect(inferSessionType("[none]", "Plan next phase")).toBe("planning");
  });

  it("returns planning when taskList is `[none associated]`", () => {
    expect(inferSessionType("[none associated]", "Draft PRD")).toBe("planning");
  });
});

describe("inferSessionType — Next Action integration signal", () => {
  it("returns integration when Next Action begins with `integrate-work-unit`", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "integrate-work-unit Step 7 — push and create PR",
      ),
    ).toBe("integration");
  });

  it("returns integration when Next Action begins with `archive-work-unit`", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "archive-work-unit Step 1 — archive artifacts",
      ),
    ).toBe("integration");
  });

  it("matches the integration prefix case-insensitively", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "Integrate-Work-Unit Step 3 — review",
      ),
    ).toBe("integration");
  });

  it("requires a word boundary after the prefix (avoids false matches like `integrate-work-unit-helpers`)", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "integrate-work-unit-internal something else",
      ),
    ).toBe("execution");
  });
});

describe("inferSessionType — execution default", () => {
  it("returns execution for a regular Start-Task Next Action", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "Start Task 4.2 — write unit tests",
      ),
    ).toBe("execution");
  });

  it("returns execution for non-integration lifecycle workflows (rotate-branch)", () => {
    expect(
      inferSessionType(
        ".arc/active/technical/tasks-foo.md",
        "rotate-branch Step 2 — open intermediate PR",
      ),
    ).toBe("execution");
  });

  it("returns execution when nextAction is null but taskList is populated", () => {
    expect(inferSessionType(".arc/active/technical/tasks-foo.md", null)).toBe(
      "execution",
    );
  });
});
