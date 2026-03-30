/**
 * Unit tests for reconfigure prompt utilities.
 *
 * Tests the pure functions that build config from prompt results and CLI
 * flags. Interactive prompt rendering is tested at integration/e2e level.
 */

import { describe, it, expect } from "vitest";
import {
  buildReconfigureConfig,
  buildNonInteractiveReconfigurePrompts,
  isNoChange,
} from "../../src/prompts/reconfigure-prompts.js";
import type { InstallConfig } from "../../src/lib/types.js";

// --- Helpers ---

function makeConfig(overrides?: Partial<InstallConfig>): InstallConfig {
  return {
    project_name: "My Project",
    pm_mode: "none",
    tools: ["claude"],
    team_mode: false,
    ...overrides,
  };
}

// --- buildNonInteractiveReconfigurePrompts ---

describe("buildNonInteractiveReconfigurePrompts", () => {
  it("uses current config values as defaults when no flags provided", () => {
    const current = makeConfig();
    const result = buildNonInteractiveReconfigurePrompts(current, {});

    expect(result.project_name).toBe("My Project");
    expect(result.pm_mode).toBe("none");
    expect(result.team_mode).toBe(false);
  });

  it("overrides only the fields specified by CLI flags", () => {
    const current = makeConfig();
    const result = buildNonInteractiveReconfigurePrompts(current, {
      pmMode: "arc-in-git",
    });

    expect(result.project_name).toBe("My Project"); // Unchanged
    expect(result.pm_mode).toBe("arc-in-git"); // Overridden
    expect(result.team_mode).toBe(false); // Unchanged
  });

  it("handles missing team_mode in old manifests by defaulting to false", () => {
    const current = makeConfig({ team_mode: undefined });
    const result = buildNonInteractiveReconfigurePrompts(current, {});

    expect(result.team_mode).toBe(false);
  });

  it("overrides team_mode via --team flag", () => {
    const current = makeConfig({ team_mode: false });
    const result = buildNonInteractiveReconfigurePrompts(current, {
      team: true,
    });

    expect(result.team_mode).toBe(true);
  });

  it("overrides project_name via --name flag", () => {
    const current = makeConfig();
    const result = buildNonInteractiveReconfigurePrompts(current, {
      name: "New Name",
    });

    expect(result.project_name).toBe("New Name");
  });
});

// --- buildReconfigureConfig ---

describe("buildReconfigureConfig", () => {
  it("merges prompt results with carried-forward tools", () => {
    const current = makeConfig({ tools: ["claude", "cursor"] });
    const result = buildReconfigureConfig(
      { project_name: "New Name", pm_mode: "arc-in-git", team_mode: true },
      current,
    );

    expect(result.project_name).toBe("New Name");
    expect(result.pm_mode).toBe("arc-in-git");
    expect(result.team_mode).toBe(true);
    expect(result.tools).toEqual(["claude", "cursor"]); // Carried forward
  });

  it("preserves empty tools array", () => {
    const current = makeConfig({ tools: [] });
    const result = buildReconfigureConfig(
      { project_name: "P", pm_mode: "none", team_mode: false },
      current,
    );

    expect(result.tools).toEqual([]);
  });
});

// --- isNoChange ---

describe("isNoChange", () => {
  it("returns true when all values match current config", () => {
    const current = makeConfig();
    const result = isNoChange(
      { project_name: "My Project", pm_mode: "none", team_mode: false },
      current,
    );

    expect(result).toBe(true);
  });

  it("returns false when project_name differs", () => {
    const current = makeConfig();
    const result = isNoChange(
      { project_name: "Different", pm_mode: "none", team_mode: false },
      current,
    );

    expect(result).toBe(false);
  });

  it("returns false when pm_mode differs", () => {
    const current = makeConfig();
    const result = isNoChange(
      { project_name: "My Project", pm_mode: "arc-in-git", team_mode: false },
      current,
    );

    expect(result).toBe(false);
  });

  it("returns false when team_mode differs", () => {
    const current = makeConfig();
    const result = isNoChange(
      { project_name: "My Project", pm_mode: "none", team_mode: true },
      current,
    );

    expect(result).toBe(false);
  });

  it("treats missing team_mode as false for comparison", () => {
    const current = makeConfig({ team_mode: undefined });
    const result = isNoChange(
      { project_name: "My Project", pm_mode: "none", team_mode: false },
      current,
    );

    expect(result).toBe(true);
  });

  it("detects change from undefined team_mode to true", () => {
    const current = makeConfig({ team_mode: undefined });
    const result = isNoChange(
      { project_name: "My Project", pm_mode: "none", team_mode: true },
      current,
    );

    expect(result).toBe(false);
  });
});
