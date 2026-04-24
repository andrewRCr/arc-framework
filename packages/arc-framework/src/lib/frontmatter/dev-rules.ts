/**
 * DEV-RULES domain-file frontmatter schema parser.
 *
 * Validates the flat `{domain, purpose}` schema on `DEV-RULES.{DOMAIN}.md`
 * files in `reference/constitution/`. `purpose` is required non-empty;
 * `domain` must match the filename `{DOMAIN}` fragment case-insensitively,
 * mirroring the method `name`-matches-basename contract.
 *
 * Extra unknown keys are accepted for forward-compatibility. The set of
 * files consumed by this parser is discovered via frontmatter presence —
 * `DEV-RULES.ARC.md` and `DEV-RULES.PROJECT.md` carry no frontmatter and
 * are silently rejected with a missing-frontmatter diagnostic, which the
 * enumerating probe treats as "skip without warning."
 *
 * @module
 */

import { parseFrontmatter } from "./generic.js";

/** Validated DEV-RULES domain-file frontmatter. */
export interface DevRulesFrontmatter {
  domain: string;
  purpose: string;
}

/** Parse result: frontmatter is present when errors is empty. */
export interface DevRulesParseResult {
  frontmatter?: DevRulesFrontmatter;
  errors: string[];
}

const BASENAME_DOMAIN_RE = /^DEV-RULES\.(.+)$/;

/**
 * Parse and validate a DEV-RULES domain file's frontmatter.
 *
 * @param content - Full file contents
 * @param basename - File basename without `.md` (e.g., `DEV-RULES.FRONTEND`)
 * @returns `{ frontmatter, errors }` — `frontmatter` is set only when errors is empty.
 */
export function parseDevRulesFrontmatter(
  content: string,
  basename: string,
): DevRulesParseResult {
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

  const domain = data.domain;
  const purpose = data.purpose;

  if (typeof domain !== "string") {
    errors.push("missing or invalid `domain` (expected string)");
  }
  if (typeof purpose !== "string") {
    errors.push("missing or invalid `purpose` (expected string)");
  } else if (purpose.length === 0) {
    errors.push("`purpose` must be non-empty");
  }

  if (typeof domain === "string") {
    const match = BASENAME_DOMAIN_RE.exec(basename);
    const expected = match?.[1] ?? basename;
    if (domain.toLowerCase() !== expected.toLowerCase()) {
      errors.push(
        `\`domain\` "${domain}" does not match filename fragment "${expected}"`,
      );
    }
  }

  if (errors.length > 0) return { errors };

  return {
    frontmatter: {
      domain: domain as string,
      purpose: purpose as string,
    },
    errors: [],
  };
}
