/**
 * DEV-RULES domain-file frontmatter schema parser.
 *
 * Validates the flat `{domain, purpose}` schema on `DEV-RULES.{DOMAIN}.md`
 * files in `system/rules/`. `purpose` is required non-empty.
 *
 * Case contract — asymmetric by design:
 * - Filename `{DOMAIN}` fragment must be uppercase (e.g., `DEV-RULES.FRONTEND.md`).
 *   Matches the ARC/PROJECT/README all-caps convention for broad/overarching files.
 * - `domain:` value must be lowercase (identifier, not label).
 * - `fragment.toLowerCase()` must equal `domain` exactly.
 *
 * The asymmetry makes each side self-consistent with its role — filename case
 * carries the "broad" signal at directory-listing time; `domain` is the
 * programmatic identifier the session-init probe exposes to agents.
 *
 * Extra unknown keys are accepted for forward-compatibility. The set of
 * files consumed by this parser is discovered via frontmatter presence —
 * `DEV-RULES.ARC.md` and `DEV-RULES.PROJECT.md` carry no frontmatter and
 * are silently rejected with a missing-frontmatter diagnostic, which the
 * enumerating probe treats as "skip without warning."
 *
 * @module
 */

import { validateFrontmatterShape } from "./generic.js";

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
  const shape = validateFrontmatterShape(content);
  if (!shape.ok) return { errors: shape.errors };
  const data = shape.data;
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
    const fragment = match?.[1] ?? basename;
    if (fragment !== fragment.toUpperCase()) {
      errors.push(
        `filename fragment "${fragment}" must be uppercase (e.g., DEV-RULES.FRONTEND.md)`,
      );
    } else if (domain !== domain.toLowerCase()) {
      errors.push(
        `\`domain\` "${domain}" must be lowercase (identifier, not label)`,
      );
    } else if (fragment.toLowerCase() !== domain) {
      errors.push(
        `\`domain\` "${domain}" does not match filename fragment "${fragment}"`,
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
