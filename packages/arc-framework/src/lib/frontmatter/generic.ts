/**
 * Generic triple-dash YAML frontmatter extractor and shared shape validator.
 *
 * Schema-neutral: returns the raw parsed YAML for schema-specific parsers
 * (method, extension, dev-rules) to validate. Files without a triple-dash
 * block return `data: null` with no error; malformed YAML surfaces via
 * `parseError`.
 *
 * @module
 */

import yaml from "js-yaml";

/** Result of attempting to extract and parse a frontmatter block. */
export interface ParsedFrontmatter {
  /** Parsed YAML value; `null` when no triple-dash block was found. */
  data: unknown;
  /** YAML parse error message; set only on failure. */
  parseError?: string;
}

/** Discriminated result of {@link validateFrontmatterShape}. */
export type FrontmatterShape =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: string[] };

/**
 * Extract and parse a leading triple-dash YAML frontmatter block.
 *
 * @param content - Full file contents
 * @returns `{ data }` with parsed YAML, or `{ data: null }` when absent,
 *   or `{ data: null, parseError }` on malformed YAML.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---/.exec(normalized);
  if (!match?.[1]) return { data: null };
  try {
    return { data: yaml.load(match[1]) };
  } catch (err) {
    return {
      data: null,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Validate the four shape preconditions every schema parser shares: parse
 * success, presence of a frontmatter block, mapping (not scalar/array) root.
 * On success returns the unknown-keyed mapping for per-schema field checks.
 *
 * @param content - Full file contents
 * @returns Discriminated result — `ok: true` with `data` mapping, or `ok: false`
 *   with one of the four shape diagnostics.
 */
export function validateFrontmatterShape(content: string): FrontmatterShape {
  const parsed = parseFrontmatter(content);
  if (parsed.parseError !== undefined) {
    return { ok: false, errors: [`malformed YAML: ${parsed.parseError}`] };
  }
  if (parsed.data === null) {
    return { ok: false, errors: ["missing frontmatter block"] };
  }
  if (typeof parsed.data !== "object" || Array.isArray(parsed.data)) {
    return { ok: false, errors: ["frontmatter must be a YAML mapping"] };
  }
  return { ok: true, data: parsed.data as Record<string, unknown> };
}

/** Type guard for `string[]` values inside parsed YAML. */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}
