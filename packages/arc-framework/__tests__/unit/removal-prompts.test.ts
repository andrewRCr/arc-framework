/**
 * Unit tests for reconfigure removal resolution logic.
 *
 * Tests the non-interactive defaults and the resolution function
 * that transforms PlannedRemoval[] into RemovalDecision[].
 * Interactive prompts (clack UI) are tested via integration tests.
 */

import { describe, it, expect } from "vitest";
import {
  resolveRemovalsNonInteractive,
  applyRemovalDecisions,
} from "../../src/prompts/removal-prompts.js";
import type { RemovalDecision } from "../../src/prompts/removal-prompts.js";
import type { PlannedRemoval } from "../../src/lib/manifest/plan.js";

// --- resolveRemovalsNonInteractive ---

describe("resolveRemovalsNonInteractive", () => {
  it("auto-removes Framework files", () => {
    const removals: PlannedRemoval[] = [
      { outputPath: "reference/strategies/arc/strategy-backlog.md", classification: "Framework" },
    ];
    const decisions = resolveRemovalsNonInteractive(removals);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe("remove");
  });

  it("auto-keeps Scaffolded files", () => {
    const removals: PlannedRemoval[] = [
      { outputPath: "backlog/ROADMAP.md", classification: "Scaffolded" },
    ];
    const decisions = resolveRemovalsNonInteractive(removals);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe("keep");
  });

  it("auto-keeps Configurable files", () => {
    const removals: PlannedRemoval[] = [
      { outputPath: "system/arc-methods.md", classification: "Configurable" },
    ];
    const decisions = resolveRemovalsNonInteractive(removals);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.action).toBe("keep");
  });

  it("handles mixed classifications correctly", () => {
    const removals: PlannedRemoval[] = [
      { outputPath: "reference/strategy.md", classification: "Framework" },
      { outputPath: "backlog/ROADMAP.md", classification: "Scaffolded" },
      { outputPath: "system/config.md", classification: "Configurable" },
    ];
    const decisions = resolveRemovalsNonInteractive(removals);

    const byPath = Object.fromEntries(decisions.map((d) => [d.outputPath, d]));
    expect(byPath["reference/strategy.md"]!.action).toBe("remove");
    expect(byPath["backlog/ROADMAP.md"]!.action).toBe("keep");
    expect(byPath["system/config.md"]!.action).toBe("keep");
  });
});

// --- applyRemovalDecisions ---

describe("applyRemovalDecisions", () => {
  const removals: PlannedRemoval[] = [
    { outputPath: "file-a.md", classification: "Framework" },
    { outputPath: "file-b.md", classification: "Scaffolded" },
    { outputPath: "file-c.md", classification: "Configurable" },
  ];

  it("bulk remove-all marks everything for removal", () => {
    const decisions: RemovalDecision[] = removals.map((r) => ({
      ...r, action: "remove",
    }));
    const result = applyRemovalDecisions(removals, decisions);

    // All should be in the remove list with Framework classification
    expect(result.toRemove).toHaveLength(3);
    expect(result.toKeep).toHaveLength(0);
    for (const r of result.toRemove) {
      expect(r.classification).toBe("Framework");
    }
  });

  it("bulk keep-all marks everything for keeping", () => {
    const decisions: RemovalDecision[] = removals.map((r) => ({
      ...r, action: "keep",
    }));
    const result = applyRemovalDecisions(removals, decisions);

    expect(result.toRemove).toHaveLength(0);
    expect(result.toKeep).toHaveLength(3);
  });

  it("individual choices split correctly", () => {
    const decisions: RemovalDecision[] = [
      { outputPath: "file-a.md", classification: "Framework", action: "remove" },
      { outputPath: "file-b.md", classification: "Scaffolded", action: "keep" },
      { outputPath: "file-c.md", classification: "Configurable", action: "remove" },
    ];
    const result = applyRemovalDecisions(removals, decisions);

    expect(result.toRemove).toHaveLength(2);
    expect(result.toKeep).toHaveLength(1);
    expect(result.toKeep[0]!.outputPath).toBe("file-b.md");
  });

  it("kept files are removed from manifest but preserved on disk", () => {
    const decisions: RemovalDecision[] = [
      { outputPath: "file-a.md", classification: "Framework", action: "keep" },
    ];
    const result = applyRemovalDecisions(removals, decisions);

    // Kept files should use Scaffolded classification so applyChangePlan
    // leaves them on disk (no safeUnlink)
    expect(result.toKeep).toHaveLength(1);
    // toRemove will be empty — file is not deleted
    expect(result.toRemove).toHaveLength(0);
  });
});
