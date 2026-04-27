/**
 * Extension-file frontmatter schema parser.
 *
 * Mirrors {@link parseMethodFrontmatter} but validates `active` in place of
 * `override-active` — the extension-side counterpart marker for "is this
 * turned on?".
 *
 * @module
 */

import { parseFrontmatter } from "./generic.js";

/** Validated extension frontmatter. */
export interface ExtensionFrontmatter {
  name: string;
  description: string;
  active: boolean;
  related?: string[];
}

/** Parse result: frontmatter is present when errors is empty. */
export interface ExtensionParseResult {
  frontmatter?: ExtensionFrontmatter;
  errors: string[];
}

/**
 * Parse and validate an extension file's frontmatter against the extension schema.
 *
 * @param content - Full file contents
 * @param basename - File basename without `.md` (e.g., `post-task-quality`)
 * @returns `{ frontmatter, errors }` — `frontmatter` is set only when errors is empty.
 */
export function parseExtensionFrontmatter(
  content: string,
  basename: string,
): ExtensionParseResult {
  const parsed = parseFrontmatter(content);
  if (parsed.parseError !== undefined) {
    return { errors: [`malformed YAML: ${parsed.parseError}`] };
  }
  if (parsed.data === null) {
    return { errors: ["missing frontmatter block"] };
  }
  if (typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    return { errors: ["frontmatter must be a YAML mapping"] };
  }
  const data = parsed.data as Record<string, unknown>;
  const errors: string[] = [];

  const name = data.name;
  const description = data.description;
  const active = data.active;
  const related = data.related;

  if (typeof name !== "string") errors.push("missing or invalid `name` (expected string)");
  if (typeof description !== "string") errors.push("missing or invalid `description` (expected string)");
  if (typeof active !== "boolean") errors.push("missing or invalid `active` (expected boolean)");
  if (related !== undefined && !isStringArray(related)) {
    errors.push("invalid `related` (expected array of strings)");
  }
  if (typeof name === "string" && name !== basename) {
    errors.push(`\`name\` "${name}" does not match file basename "${basename}"`);
  }

  if (errors.length > 0) return { errors };

  const frontmatter: ExtensionFrontmatter = {
    name: name as string,
    description: description as string,
    active: active as boolean,
  };
  if (related !== undefined) frontmatter.related = related as string[];
  return { frontmatter, errors: [] };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}
