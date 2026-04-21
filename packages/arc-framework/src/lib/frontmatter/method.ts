/**
 * Method-file frontmatter schema parser.
 *
 * Validates the required fields (name, description, override-active) and
 * optional `related` (array). Enforces that `name` matches the file basename
 * — the structural contract that ties registration to filesystem location.
 *
 * @module
 */

import { parseFrontmatter } from "./generic.js";

/** Validated method frontmatter. */
export interface MethodFrontmatter {
  name: string;
  description: string;
  "override-active": boolean;
  related?: string[];
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
  const parsed = parseFrontmatter(content);
  if (parsed.parseError !== undefined) {
    return { errors: [`malformed YAML: ${parsed.parseError}`] };
  }
  if (parsed.data === null) {
    return { errors: ["missing frontmatter block"] };
  }
  if (typeof parsed.data !== "object") {
    return { errors: ["frontmatter must be a YAML mapping"] };
  }
  const data = parsed.data as Record<string, unknown>;
  const errors: string[] = [];

  const name = data.name;
  const description = data.description;
  const overrideActive = data["override-active"];
  const related = data.related;

  if (typeof name !== "string") errors.push("missing or invalid `name` (expected string)");
  if (typeof description !== "string") errors.push("missing or invalid `description` (expected string)");
  if (typeof overrideActive !== "boolean") errors.push("missing or invalid `override-active` (expected boolean)");
  if (related !== undefined && !isStringArray(related)) {
    errors.push("invalid `related` (expected array of strings)");
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
  return { frontmatter, errors: [] };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}
