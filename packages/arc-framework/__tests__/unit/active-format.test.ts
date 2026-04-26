/**
 * Unit tests for `arc active status` formatters.
 *
 * Covers Clack summaries (full + session-init: none/single/multiple) and
 * verifies the typed JSON shape round-trips cleanly through JSON.stringify
 * so the harness gets exactly the fields the type declares.
 */

import { describe, it, expect } from "vitest";

import {
  buildActiveSessionInitSummary,
  buildActiveStatusSummary,
} from "../../src/commands/active/format.js";
import type {
  ActiveSessionInitResult,
  ActiveStatusResult,
  StatusFileCandidate,
} from "../../src/commands/active/types.js";

function candidate(overrides: Partial<StatusFileCandidate> = {}): StatusFileCandidate {
  return {
    path: ".arc/active/technical/status-foo.md",
    filename: "status-foo.md",
    branch: "technical/foo",
    state: "In Progress",
    nextTask: "Task 1.1 — do thing (line ~10)",
    taskList: ".arc/active/technical/tasks-foo.md",
    ...overrides,
  };
}

function fullResult(overrides: Partial<ActiveStatusResult> = {}): ActiveStatusResult {
  return {
    mode: "full",
    layout: "full",
    candidates: [],
    warnings: [],
    ...overrides,
  };
}

function sessionInitResult(
  overrides: Partial<ActiveSessionInitResult> = {},
): ActiveSessionInitResult {
  return {
    mode: "session-init",
    layout: "full",
    resolution: "none",
    path: null,
    candidates: [],
    warnings: [],
    ...overrides,
  };
}

describe("buildActiveStatusSummary — counts + layout", () => {
  it("renders the zero-count headline with the full layout marker", () => {
    const summary = buildActiveStatusSummary(fullResult());
    expect(summary.split("\n")[0]).toBe("0 active work units (layout: full):");
    expect(summary).toContain("No active status files found.");
  });

  it("pluralizes correctly for a single candidate", () => {
    const summary = buildActiveStatusSummary(fullResult({ candidates: [candidate()] }));
    expect(summary.split("\n")[0]).toBe("1 active work unit (layout: full):");
  });

  it("pluralizes correctly for multiple candidates", () => {
    const summary = buildActiveStatusSummary(
      fullResult({
        candidates: [
          candidate({ filename: "status-a.md" }),
          candidate({ filename: "status-b.md" }),
        ],
      }),
    );
    expect(summary.split("\n")[0]).toBe("2 active work units (layout: full):");
  });

  it("surfaces the lite layout in the headline", () => {
    const summary = buildActiveStatusSummary(
      fullResult({ layout: "lite", candidates: [candidate({ filename: "status.md" })] }),
    );
    expect(summary.split("\n")[0]).toBe("1 active work unit (layout: lite):");
  });
});

describe("buildActiveStatusSummary — per-candidate fields", () => {
  it("renders every parsed field on indented rows", () => {
    const summary = buildActiveStatusSummary(fullResult({ candidates: [candidate()] }));
    expect(summary).toContain("  status-foo.md");
    expect(summary).toContain("path:       .arc/active/technical/status-foo.md");
    expect(summary).toContain("branch:     technical/foo");
    expect(summary).toContain("state:      In Progress");
    expect(summary).toContain("next task:  Task 1.1 — do thing (line ~10)");
    expect(summary).toContain("task list:  .arc/active/technical/tasks-foo.md");
  });

  it("renders null fields as (unset)", () => {
    const summary = buildActiveStatusSummary(
      fullResult({
        candidates: [candidate({ branch: null, state: null, nextTask: null, taskList: null })],
      }),
    );
    expect(summary).toContain("branch:     (unset)");
    expect(summary).toContain("state:      (unset)");
    expect(summary).toContain("next task:  (unset)");
    expect(summary).toContain("task list:  (unset)");
  });

  it("appends a Warnings section when warnings are present", () => {
    const summary = buildActiveStatusSummary(
      fullResult({ warnings: [".arc/active/ not found — no active work units to enumerate."] }),
    );
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("- .arc/active/ not found");
  });

  it("omits the Warnings section when none are present", () => {
    const summary = buildActiveStatusSummary(fullResult({ candidates: [candidate()] }));
    expect(summary).not.toContain("Warnings:");
  });
});

describe("buildActiveSessionInitSummary — resolution states", () => {
  it("renders the 'no active work unit' message for resolution=none", () => {
    const summary = buildActiveSessionInitSummary(sessionInitResult());
    expect(summary).toContain("No active work unit.");
  });

  it("renders the resolved path for resolution=single", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
      }),
    );
    expect(summary).toContain("Resolved: .arc/active/technical/status-foo.md");
  });

  it("lists candidates for resolution=multiple with branch and state", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "multiple",
        candidates: [
          candidate({ filename: "status-alpha.md", branch: "feature/alpha", state: "In Progress" }),
          candidate({ filename: "status-beta.md", branch: "technical/beta", state: "Paused" }),
        ],
      }),
    );
    expect(summary).toContain("2 candidates — disambiguation required:");
    expect(summary).toContain("- status-alpha.md · feature/alpha · In Progress");
    expect(summary).toContain("- status-beta.md · technical/beta · Paused");
  });

  it("appends Warnings in the session-init shape when present", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({ warnings: ["boom"] }),
    );
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("- boom");
  });
});

describe("buildActiveSessionInitSummary — companion rendering", () => {
  it("renders both companion paths when both are populated", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
        companions: {
          notes: ".arc/active/technical/notes-foo.md",
          atomic: ".arc/active/technical/atomic-foo.md",
        },
      }),
    );
    expect(summary).toContain("notes:  .arc/active/technical/notes-foo.md");
    expect(summary).toContain("atomic: .arc/active/technical/atomic-foo.md");
  });

  it("renders only the notes line when atomic is null", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
        companions: {
          notes: ".arc/active/technical/notes-foo.md",
          atomic: null,
        },
      }),
    );
    expect(summary).toContain("notes:  .arc/active/technical/notes-foo.md");
    expect(summary).not.toContain("atomic:");
  });

  it("renders only the atomic line when notes is null", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
        companions: {
          notes: null,
          atomic: ".arc/active/technical/atomic-foo.md",
        },
      }),
    );
    expect(summary).not.toContain("notes:");
    expect(summary).toContain("atomic: .arc/active/technical/atomic-foo.md");
  });

  it("renders no companion lines when both inner values are null", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
        companions: { notes: null, atomic: null },
      }),
    );
    expect(summary).not.toContain("notes:");
    expect(summary).not.toContain("atomic:");
  });

  it("renders no companion lines when companions field is omitted", () => {
    const summary = buildActiveSessionInitSummary(
      sessionInitResult({
        resolution: "single",
        path: ".arc/active/technical/status-foo.md",
      }),
    );
    expect(summary).not.toContain("notes:");
    expect(summary).not.toContain("atomic:");
  });
});

describe("JSON round-trip — typed result shape is stable", () => {
  it("full-mode result preserves all fields through JSON.stringify/parse", () => {
    const result = fullResult({
      candidates: [candidate()],
      warnings: ["oops"],
    });
    const roundTripped = JSON.parse(JSON.stringify(result)) as ActiveStatusResult;
    expect(roundTripped.mode).toBe("full");
    expect(roundTripped.layout).toBe("full");
    expect(roundTripped.candidates).toHaveLength(1);
    expect(roundTripped.candidates[0]!.filename).toBe("status-foo.md");
    expect(roundTripped.warnings).toEqual(["oops"]);
  });

  it("session-init single result preserves path and null candidates", () => {
    const result = sessionInitResult({
      resolution: "single",
      path: ".arc/active/technical/status-foo.md",
    });
    const roundTripped = JSON.parse(JSON.stringify(result)) as ActiveSessionInitResult;
    expect(roundTripped.mode).toBe("session-init");
    expect(roundTripped.resolution).toBe("single");
    expect(roundTripped.path).toBe(".arc/active/technical/status-foo.md");
    expect(roundTripped.candidates).toEqual([]);
  });

  it("session-init multiple result preserves the candidate list with null path", () => {
    const result = sessionInitResult({
      resolution: "multiple",
      candidates: [candidate({ filename: "status-a.md" }), candidate({ filename: "status-b.md" })],
    });
    const roundTripped = JSON.parse(JSON.stringify(result)) as ActiveSessionInitResult;
    expect(roundTripped.resolution).toBe("multiple");
    expect(roundTripped.path).toBeNull();
    expect(roundTripped.candidates).toHaveLength(2);
  });
});
