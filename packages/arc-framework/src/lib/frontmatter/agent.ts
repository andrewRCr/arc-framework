/**
 * Agent-file frontmatter schema parser.
 *
 * Minimal schema: `active: boolean` only — agent files ({AGENT}.ARC.md) do
 * not carry name, description, or related fields. Consumed by the conditional-
 * load pattern in session-init.
 *
 * @module
 */

import { parseFrontmatter } from "./generic.js";

/** Validated agent-file frontmatter. */
export interface AgentFrontmatter {
  active: boolean;
}

/** Parse result: frontmatter is present when errors is empty. */
export interface AgentParseResult {
  frontmatter?: AgentFrontmatter;
  errors: string[];
}

/**
 * Parse and validate an agent file's frontmatter against the agent schema.
 *
 * @param content - Full file contents
 * @returns `{ frontmatter, errors }` — `frontmatter` is set only when errors is empty.
 */
export function parseAgentFrontmatter(content: string): AgentParseResult {
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
  const active = data.active;

  if (typeof active !== "boolean") {
    return { errors: ["missing or invalid `active` (expected boolean)"] };
  }

  return { frontmatter: { active }, errors: [] };
}
