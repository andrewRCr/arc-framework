/**
 * Unit tests for non-interactive init mode.
 *
 * Tests that --yes flag produces valid InitPromptResult with correct defaults,
 * and that optional value flags override specific defaults.
 */

import { describe, it, expect } from "vitest";
import { buildNonInteractivePrompts } from "../../src/prompts/non-interactive.js";

describe("buildNonInteractivePrompts", () => {
  it("produces valid defaults with --yes only", () => {
    const result = buildNonInteractivePrompts({
      cwd: "/home/user/my-project",
    });

    expect(result.project_name).toBe("my-project");
    expect(result.tools).toEqual([]);
    expect(result.pm_mode).toBe("none");
    expect(result.team_mode).toBe(false);
  });

  it("overrides project name with --name", () => {
    const result = buildNonInteractivePrompts({
      cwd: "/home/user/my-project",
      name: "custom-name",
    });

    expect(result.project_name).toBe("custom-name");
    expect(result.tools).toEqual([]);
    expect(result.pm_mode).toBe("none");
  });

  it("overrides PM mode with --pm-mode", () => {
    const result = buildNonInteractivePrompts({
      cwd: "/home/user/my-project",
      pmMode: "arc-in-git",
    });

    expect(result.project_name).toBe("my-project");
    expect(result.pm_mode).toBe("arc-in-git");
  });

  it("overrides tools with --tools (csv)", () => {
    const result = buildNonInteractivePrompts({
      cwd: "/home/user/my-project",
      tools: "claude,cursor",
    });

    expect(result.tools).toEqual(["claude", "cursor"]);
  });

  it("handles all overrides together", () => {
    const result = buildNonInteractivePrompts({
      cwd: "/home/user/my-project",
      name: "foo",
      pmMode: "external",
      tools: "claude",
      team: true,
    });

    expect(result.project_name).toBe("foo");
    expect(result.pm_mode).toBe("external");
    expect(result.tools).toEqual(["claude"]);
    expect(result.team_mode).toBe(true);
  });
});
