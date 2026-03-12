import { describe, it, expect } from "vitest";
import { validateRecipe, evaluateCondition } from "../../src/lib/recipe.js";
import type { Recipe } from "../../src/lib/types.js";

function validRecipe(): Recipe {
  return {
    prompts: [
      {
        id: "project_name",
        type: "text",
        message: "Project name?",
        token: "PROJECT_NAME",
      },
      {
        id: "pm_mode",
        type: "select",
        message: "Where does your project management live?",
        options: ["none", "arc-in-git", "external"],
        default: "none",
        config_key: "pm.mode",
      },
      {
        id: "agents",
        type: "multiselect",
        message: "Which AI agents?",
        options: ["claude", "codex", "gemini", "copilot", "cursor", "windsurf"],
      },
      {
        id: "team_mode",
        type: "confirm",
        message: "Enable team mode?",
        default: false,
        config_key: "team.mode",
      },
    ],
    conditions: {
      "pm.mode == arc-in-git": {
        include_files: [
          "backlog/ROADMAP.template.md",
          "reference/PROJECT-STATUS.template.md",
        ],
      },
    },
  };
}

describe("validateRecipe", () => {
  it("accepts a valid recipe with all prompt types", () => {
    const result = validateRecipe(validRecipe());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects prompt with invalid type", () => {
    const recipe = validRecipe();
    recipe.prompts = [
      { id: "test", type: "invalid" as "text", message: "Test?" },
    ];
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("rejects select prompt without options", () => {
    const recipe = validRecipe();
    recipe.prompts = [
      { id: "test", type: "select", message: "Pick one" },
    ];
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("options"))).toBe(true);
  });

  it("rejects multiselect prompt without options", () => {
    const recipe = validRecipe();
    recipe.prompts = [
      { id: "test", type: "multiselect", message: "Pick many" },
    ];
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("options"))).toBe(true);
  });

  it("rejects non-object input with clear error", () => {
    const result = validateRecipe("not an object");
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/non-null object/);
  });

  it("rejects recipe with missing required sections", () => {
    const result = validateRecipe({});
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("prompts"))).toBe(true);
    expect(result.errors.some((e) => e.includes("conditions"))).toBe(true);
  });

  it("rejects prompt with missing required fields and reports all errors", () => {
    const recipe = validRecipe();
    recipe.prompts = [{ id: "test" } as Recipe["prompts"][number]];
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
    expect(result.errors.some((e) => e.includes("message"))).toBe(true);
  });

  it("rejects malformed condition key", () => {
    const recipe = validRecipe();
    recipe.conditions = { "bad condition format": { include_files: [] } };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("condition key"))).toBe(true);
  });

  it("rejects condition with non-array include_files", () => {
    const recipe = validRecipe();
    recipe.conditions = {
      "pm.mode == arc-in-git": {
        include_files: "not-array" as unknown as string[],
      },
    };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("include_files"))).toBe(true);
  });

  it("collects multiple errors across prompts and conditions", () => {
    const result = validateRecipe({
      prompts: [{ id: "bad" }],
      conditions: { "no-good": { include_files: 42 } },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(2);
  });

  it("rejects duplicate prompt ids", () => {
    const recipe = validRecipe();
    recipe.prompts = [
      { id: "dupe", type: "text", message: "First?" },
      { id: "dupe", type: "text", message: "Second?" },
    ];
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate"))).toBe(true);
  });
});

describe("evaluateCondition", () => {
  it("returns true for matching string equality", () => {
    expect(
      evaluateCondition("pm.mode == arc-in-git", { "pm.mode": "arc-in-git" }),
    ).toBe(true);
  });

  it("returns false for non-matching string equality", () => {
    expect(
      evaluateCondition("pm.mode == arc-in-git", { "pm.mode": "none" }),
    ).toBe(false);
  });

  it("returns false for missing config key", () => {
    expect(evaluateCondition("pm.mode == arc-in-git", {})).toBe(false);
  });

  it("handles boolean-like values as strings", () => {
    expect(
      evaluateCondition("team.mode == true", { "team.mode": "true" }),
    ).toBe(true);
    expect(
      evaluateCondition("team.mode == true", { "team.mode": "false" }),
    ).toBe(false);
  });
});
