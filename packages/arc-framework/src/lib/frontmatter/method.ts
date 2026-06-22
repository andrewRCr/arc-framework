/**
 * Method-file frontmatter schema parser.
 *
 * Validates the required fields (name, description, override-active) and
 * optional `related` (array) and `override-mode` (`replace` | `extend`).
 * Enforces that `name` matches the file basename — the structural contract
 * that ties registration to filesystem location.
 *
 * @module
 */

import { isStringArray, validateFrontmatterShape } from "./generic.js";

/** Validated method frontmatter. */
export interface MethodFrontmatter {
  name: string;
  description: string;
  "override-active": boolean;
  related?: string[];
  "override-mode"?: "replace" | "extend";
}

/** Parse result: frontmatter is present when errors is empty. */
export interface MethodParseResult {
  frontmatter?: MethodFrontmatter;
  errors: string[];
}

/**
 * Parse and validate a method file's frontmatter against the method schema.
 *
 * @param content - Full file contents
 * @param basename - File basename without `.md` (e.g., `commit-format`)
 * @returns `{ frontmatter, errors }` — `frontmatter` is set only when errors is empty.
 */
export function parseMethodFrontmatter(
  content: string,
  basename: string,
): MethodParseResult {
  const shape = validateFrontmatterShape(content);
  if (!shape.ok) return { errors: shape.errors };
  const data = shape.data;
  const errors: string[] = [];

  const name = data.name;
  const description = data.description;
  const overrideActive = data["override-active"];
  const related = data.related;
  const overrideMode = data["override-mode"];

  if (typeof name !== "string") errors.push("missing or invalid `name` (expected string)");
  if (typeof description !== "string") errors.push("missing or invalid `description` (expected string)");
  if (typeof overrideActive !== "boolean") errors.push("missing or invalid `override-active` (expected boolean)");
  if (related !== undefined && !isStringArray(related)) {
    errors.push("invalid `related` (expected array of strings)");
  }
  if (overrideMode !== undefined && overrideMode !== "replace" && overrideMode !== "extend") {
    errors.push('invalid `override-mode` (expected "replace" or "extend")');
  }
  if (typeof name === "string" && name !== basename) {
    errors.push(`\`name\` "${name}" does not match file basename "${basename}"`);
  }

  if (errors.length > 0) return { errors };

  const frontmatter: MethodFrontmatter = {
    name: name as string,
    description: description as string,
    "override-active": overrideActive as boolean,
  };
  if (related !== undefined) frontmatter.related = related as string[];
  if (overrideMode !== undefined) frontmatter["override-mode"] = overrideMode as "replace" | "extend";
  return { frontmatter, errors: [] };
}
