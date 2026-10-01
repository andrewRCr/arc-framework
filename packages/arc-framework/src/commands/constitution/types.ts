/**
 * Type contracts for `arc status --session-init --json`'s `domainRules`
 * slot.
 *
 * Session-init-only at launch — no full-mode rendering. Agents consume
 * the `rules` array to know which DEV-RULES domain files are present
 * and loadable on-demand; `warnings` surfaces structural/content defects
 * from frontmatter parsing without blocking the session.
 */

import type { z } from "zod";
import type { DomainRulesSessionInitResultSchema } from "./status.js";

/** One enumerated DEV-RULES domain file. */
export interface DomainRulesEntry {
  /** Repo-root-relative path to the file. */
  path: string;
  /** `domain:` value from parsed frontmatter. */
  domain: string;
  /** `purpose:` value from parsed frontmatter. */
  purpose: string;
}

/** Session-init-scoped result — enumerated domain rules plus warnings. */
export type DomainRulesSessionInitResult = z.infer<typeof DomainRulesSessionInitResultSchema>;

export interface DomainRulesSessionInitOptions {
  cwd: string;
}
