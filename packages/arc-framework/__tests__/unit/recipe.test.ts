import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateRecipe,
  evaluateCondition,
  getInitTokenNames,
  findResidualInitTokens,
} from "../../src/lib/recipe.js";
import type { Recipe } from "../../src/lib/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function validRecipe(): Recipe {
  return {
    include_files: [
      "reference/QUICK-REFERENCE.template.md",
      "system/agent/AGENTS.template.md",
    ],
    computed_tokens: {
      REPO_ROOT: "Auto-detected from working directory at init time",
    },
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
      {
        id: "arc_dir",
        type: "text",
        message: "Install directory?",
        default: ".arc",
        token: "ARC_DIR",
      },
    ],
    conditions: {
      "pm.mode == arc-in-git": {
        include_files: [
          "backlog/ROADMAP.template.md",
          "reference/PROJECT-STATUS.template.md",
        ],
      },
      "agents includes claude": {
        include_files: ["system/agent/CLAUDE.template.md"],
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

  it("accepts conditions with includes operator", () => {
    const recipe = validRecipe();
    recipe.conditions = {
      "agents includes claude": {
        include_files: ["system/agent/CLAUDE.template.md"],
      },
    };
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(true);
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

  it("accepts recipe without optional include_files and computed_tokens", () => {
    const recipe = validRecipe();
    delete recipe.include_files;
    delete recipe.computed_tokens;
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(true);
  });

  it("rejects non-array include_files", () => {
    const recipe = validRecipe();
    (recipe as Record<string, unknown>).include_files = "not-array";
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("include_files"))).toBe(true);
  });

  it("rejects non-object computed_tokens", () => {
    const recipe = validRecipe();
    (recipe as Record<string, unknown>).computed_tokens = "not-object";
    const result = validateRecipe(recipe);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("computed_tokens"))).toBe(true);
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

  it("returns true when includes matches an item in comma-separated list", () => {
    expect(
      evaluateCondition("agents includes claude", {
        agents: "claude,codex,gemini",
      }),
    ).toBe(true);
  });

  it("returns true when includes matches a single-item list", () => {
    expect(
      evaluateCondition("agents includes claude", { agents: "claude" }),
    ).toBe(true);
  });

  it("returns false when includes does not match any item", () => {
    expect(
      evaluateCondition("agents includes cursor", {
        agents: "claude,codex",
      }),
    ).toBe(false);
  });

  it("includes does not do substring matching", () => {
    expect(
      evaluateCondition("agents includes code", { agents: "claude,codex" }),
    ).toBe(false);
  });

  it("returns false for includes with missing config key", () => {
    expect(evaluateCondition("agents includes claude", {})).toBe(false);
  });
});

describe("getInitTokenNames", () => {
  it("extracts token names from prompts that have them", () => {
    const prompts = [
      { token: "PROJECT_NAME" },
      { config_key: "pm.mode" },
      { token: "PROJECT_DESCRIPTION" },
    ];
    const tokens = getInitTokenNames(prompts);
    expect(tokens).toEqual(new Set(["PROJECT_NAME", "PROJECT_DESCRIPTION"]));
  });

  it("returns empty set when no prompts have tokens", () => {
    const prompts = [{ config_key: "pm.mode" }, {}];
    expect(getInitTokenNames(prompts)).toEqual(new Set());
  });

  it("includes computed token names when provided", () => {
    const prompts = [{ token: "PROJECT_NAME" }];
    const computed = { REPO_ROOT: "description" };
    const tokens = getInitTokenNames(prompts, computed);
    expect(tokens).toEqual(new Set(["PROJECT_NAME", "REPO_ROOT"]));
  });

  it("works with computed tokens and no prompt tokens", () => {
    const prompts = [{ config_key: "pm.mode" }];
    const computed = { REPO_ROOT: "description", ARC_DIR: "description" };
    const tokens = getInitTokenNames(prompts, computed);
    expect(tokens).toEqual(new Set(["REPO_ROOT", "ARC_DIR"]));
  });
});

describe("findResidualInitTokens", () => {
  it("finds init tokens that were not substituted", () => {
    const content = "Hello {{PROJECT_NAME}}, your {{COMPONENT}} is ready";
    const initTokens = new Set(["PROJECT_NAME", "PROJECT_DESCRIPTION"]);
    const residual = findResidualInitTokens(content, initTokens);
    expect(residual).toEqual(["PROJECT_NAME"]);
  });

  it("ignores guide-text placeholders not in the allowlist", () => {
    const content = "Fill in {{COMPONENT}} and {{TEST_COMMAND}}";
    const initTokens = new Set(["PROJECT_NAME"]);
    const residual = findResidualInitTokens(content, initTokens);
    expect(residual).toEqual([]);
  });

  it("returns empty array when all init tokens are substituted", () => {
    const content = "Hello My App, everything is set up";
    const initTokens = new Set(["PROJECT_NAME"]);
    const residual = findResidualInitTokens(content, initTokens);
    expect(residual).toEqual([]);
  });

  it("deduplicates repeated residual tokens", () => {
    const content = "{{PROJECT_NAME}} is {{PROJECT_NAME}}";
    const initTokens = new Set(["PROJECT_NAME"]);
    const residual = findResidualInitTokens(content, initTokens);
    expect(residual).toEqual(["PROJECT_NAME"]);
  });
});

describe("init-recipe.json", () => {
  it("passes schema validation", () => {
    const recipePath = resolve(__dirname, "../../init-recipe.json");
    const data = JSON.parse(readFileSync(recipePath, "utf-8"));
    const result = validateRecipe(data);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("has no duplicate prompt ids", () => {
    const recipePath = resolve(__dirname, "../../init-recipe.json");
    const data = JSON.parse(readFileSync(recipePath, "utf-8")) as Recipe;
    const ids = data.prompts.map((p) => p.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("declares init tokens only for prompts that produce template substitutions", () => {
    const recipePath = resolve(__dirname, "../../init-recipe.json");
    const data = JSON.parse(readFileSync(recipePath, "utf-8")) as Recipe;
    const tokenPrompts = data.prompts.filter((p) => p.token);
    // Every token prompt should be a text prompt (tokens come from user input, not selection)
    for (const p of tokenPrompts) {
      expect(p.type).toBe("text");
    }
  });
});
