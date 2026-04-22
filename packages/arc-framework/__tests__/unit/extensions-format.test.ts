/**
 * Unit tests for `arc extensions status` formatters.
 *
 * Covers the Clack summary (default + `--all` + session-init) and verifies
 * the typed JSON shape round-trips cleanly through `JSON.stringify` so the
 * harness gets exactly the fields the type declares.
 */

import { describe, it, expect } from "vitest";

import {
  buildExtensionsStatusSummary,
  buildExtensionsSessionInitSummary,
} from "../../src/commands/extensions/format.js";
import type {
  ExtensionsSessionInitResult,
  ExtensionsStatusResult,
} from "../../src/commands/extensions/types.js";

function fullResult(overrides: Partial<ExtensionsStatusResult> = {}): ExtensionsStatusResult {
  return {
    mode: "full",
    extensions: [
      { name: "pre-merge-review", active: true, description: "Review ceremony" },
      { name: "post-task-quality", active: false, description: "Extra checks" },
    ],
    activeCount: 1,
    inactiveCount: 1,
    orphanCount: 0,
    orphans: [],
    includeOrphanDetails: false,
    warnings: [],
    ...overrides,
  };
}

describe("buildExtensionsStatusSummary — counts line", () => {
  it("renders the `N active · N inactive · N orphaned refs` headline", () => {
    const summary = buildExtensionsStatusSummary(fullResult({ activeCount: 2, inactiveCount: 5, orphanCount: 3 }));
    expect(summary.split("\n")[0]).toBe("2 active · 5 inactive · 3 orphaned refs");
  });

  it("lists active extensions with name and description", () => {
    const summary = buildExtensionsStatusSummary(fullResult());
    expect(summary).toContain("Active:");
    expect(summary).toContain("pre-merge-review — Review ceremony");
  });

  it("lists inactive extensions under a separate heading", () => {
    const summary = buildExtensionsStatusSummary(fullResult());
    expect(summary).toContain("Inactive:");
    expect(summary).toContain("post-task-quality — Extra checks");
  });

  it("omits the `Inactive` section when every extension is active", () => {
    const summary = buildExtensionsStatusSummary(fullResult({
      extensions: [{ name: "pre-merge-review", active: true, description: "x" }],
      activeCount: 1,
      inactiveCount: 0,
    }));
    expect(summary).not.toContain("Inactive:");
  });

  it("omits the `Active` section when every extension is inactive", () => {
    const summary = buildExtensionsStatusSummary(fullResult({
      extensions: [{ name: "post-task-quality", active: false, description: "x" }],
      activeCount: 0,
      inactiveCount: 1,
    }));
    expect(summary).not.toContain("Active:");
  });
});

describe("buildExtensionsStatusSummary — orphan detail visibility", () => {
  it("omits the orphans list when `includeOrphanDetails` is false", () => {
    const summary = buildExtensionsStatusSummary(fullResult({
      orphanCount: 2,
      orphans: [
        { workflowPath: "wf.md", lineNumber: 12, extensionName: "ghost" },
        { workflowPath: "wf.md", lineNumber: 34, extensionName: "ghost" },
      ],
      includeOrphanDetails: false,
    }));
    expect(summary).not.toContain("wf.md:12");
    expect(summary).toContain("2 orphaned refs");
  });

  it("renders each orphaned ref with workflow path and line number when `--all` was passed", () => {
    const summary = buildExtensionsStatusSummary(fullResult({
      orphanCount: 2,
      orphans: [
        { workflowPath: "a.md", lineNumber: 10, extensionName: "ghost-a" },
        { workflowPath: "b.md", lineNumber: 20, extensionName: "ghost-b" },
      ],
      includeOrphanDetails: true,
    }));
    expect(summary).toContain("Orphaned references:");
    expect(summary).toContain("ghost-a · a.md:10");
    expect(summary).toContain("ghost-b · b.md:20");
  });

  it("renders a reassuring note instead of an empty list when orphans are 0 under `--all`", () => {
    const summary = buildExtensionsStatusSummary(fullResult({ includeOrphanDetails: true }));
    expect(summary).toContain("No orphaned references");
  });
});

describe("buildExtensionsStatusSummary — frontmatter warnings", () => {
  it("appends a warnings section when extension frontmatter failed to parse", () => {
    const summary = buildExtensionsStatusSummary(fullResult({
      warnings: ["broken.md: missing `active` field"],
    }));
    expect(summary).toContain("Warnings:");
    expect(summary).toContain("broken.md: missing `active` field");
  });

  it("does not emit a warnings heading when there are no warnings", () => {
    const summary = buildExtensionsStatusSummary(fullResult());
    expect(summary).not.toContain("Warnings:");
  });
});

describe("buildExtensionsSessionInitSummary", () => {
  function sessionInit(active: string[]): ExtensionsSessionInitResult {
    return { mode: "session-init", active };
  }

  it("renders one extension per line with a leading count", () => {
    const summary = buildExtensionsSessionInitSummary(sessionInit(["pre-merge-review", "post-context-load"]));
    expect(summary).toContain("2 active extensions:");
    expect(summary).toContain("- pre-merge-review");
    expect(summary).toContain("- post-context-load");
  });

  it("renders the empty-active-list case with zero count", () => {
    const summary = buildExtensionsSessionInitSummary(sessionInit([]));
    expect(summary).toContain("No active extensions");
  });
});

describe("JSON wire contract", () => {
  it("round-trips a full result through JSON without losing typed fields", () => {
    const result = fullResult({
      orphanCount: 1,
      orphans: [{ workflowPath: "wf.md", lineNumber: 7, extensionName: "ghost" }],
      includeOrphanDetails: true,
      warnings: ["broken.md: bad yaml"],
    });
    const parsed = JSON.parse(JSON.stringify(result)) as ExtensionsStatusResult;
    expect(parsed).toEqual(result);
    expect(parsed.mode).toBe("full");
  });

  it("round-trips a session-init result through JSON", () => {
    const result: ExtensionsSessionInitResult = {
      mode: "session-init",
      active: ["pre-merge-review"],
    };
    const parsed = JSON.parse(JSON.stringify(result)) as ExtensionsSessionInitResult;
    expect(parsed).toEqual(result);
    expect(parsed.mode).toBe("session-init");
  });
});
