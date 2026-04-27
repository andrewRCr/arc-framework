/**
 * Generic triple-dash YAML frontmatter extractor.
 *
 * Schema-neutral: returns the raw parsed YAML for schema-specific parsers
 * (method, extension) to validate. Files without a triple-dash block return
 * `data: null` with no error; malformed YAML surfaces via `parseError`.
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
