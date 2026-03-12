/**
 * Init recipe parsing — schema validation and condition evaluation.
 *
 * The init recipe is a declarative JSON mapping from prompts to tokens,
 * config keys, and conditional file sets. This module validates recipe
 * structure and evaluates conditions against config values.
 */

import type { PromptType } from "./types.js";

const VALID_PROMPT_TYPES: readonly PromptType[] = [
  "text",
  "select",
  "multiselect",
  "confirm",
];

/** Matches `config.key == value` condition format. */
const CONDITION_PATTERN = /^([\w.]+)\s*==\s*(\S+)$/;

/** Result of recipe validation. */
export interface RecipeValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a recipe object against the expected schema.
 *
 * @param data - The object to validate
 * @returns Validation result with any errors found
 */
export function validateRecipe(data: unknown): RecipeValidationResult {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null) {
    return { valid: false, errors: ["Recipe must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;

  if (!Array.isArray(obj.prompts)) {
    errors.push("Missing or invalid 'prompts' (expected array)");
  }

  if (typeof obj.conditions !== "object" || obj.conditions === null) {
    errors.push("Missing or invalid 'conditions' (expected object)");
  }

  // Validate prompts
  if (Array.isArray(obj.prompts)) {
    const seenIds = new Set<string>();
    for (const [i, prompt] of (obj.prompts as unknown[]).entries()) {
      if (typeof prompt !== "object" || prompt === null) {
        errors.push(`Prompt ${i}: expected object`);
        continue;
      }
      const p = prompt as Record<string, unknown>;

      if (typeof p.id !== "string") {
        errors.push(`Prompt ${i}: missing or invalid 'id' (expected string)`);
      } else if (seenIds.has(p.id)) {
        errors.push(`Prompt ${i}: duplicate id '${p.id}'`);
      } else {
        seenIds.add(p.id);
      }
      if (
        typeof p.type !== "string" ||
        !VALID_PROMPT_TYPES.includes(p.type as PromptType)
      ) {
        errors.push(
          `Prompt ${i}: invalid 'type' '${String(p.type)}' (expected ${VALID_PROMPT_TYPES.join(", ")})`,
        );
      }
      if (typeof p.message !== "string") {
        errors.push(
          `Prompt ${i}: missing or invalid 'message' (expected string)`,
        );
      }

      // select and multiselect require options
      if (
        (p.type === "select" || p.type === "multiselect") &&
        !Array.isArray(p.options)
      ) {
        errors.push(
          `Prompt ${i} ('${String(p.id)}'): '${String(p.type)}' prompt requires 'options' array`,
        );
      }
    }
  }

  // Validate conditions
  if (typeof obj.conditions === "object" && obj.conditions !== null) {
    const conditions = obj.conditions as Record<string, unknown>;
    for (const [key, value] of Object.entries(conditions)) {
      if (!CONDITION_PATTERN.test(key)) {
        errors.push(
          `Invalid condition key '${key}' (expected 'config.key == value' format)`,
        );
      }
      if (typeof value !== "object" || value === null) {
        errors.push(`Condition '${key}': expected object`);
        continue;
      }
      const cond = value as Record<string, unknown>;
      if (!Array.isArray(cond.include_files)) {
        errors.push(
          `Condition '${key}': missing or invalid 'include_files' (expected array)`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Evaluate a condition string against a config map.
 * Conditions use simple equality: `config.key == value`.
 *
 * @param condition - Condition string (e.g., `pm.mode == arc-in-git`)
 * @param config - Map of dotted config keys to string values
 * @returns Whether the condition matches
 */
export function evaluateCondition(
  condition: string,
  config: Record<string, string>,
): boolean {
  const match = CONDITION_PATTERN.exec(condition);
  if (!match) {
    return false;
  }
  const key = match[1]!;
  const value = match[2]!;
  return config[key] === value;
}
