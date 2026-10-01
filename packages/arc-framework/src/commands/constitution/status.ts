/**
 * DEV-RULES domain-rules probe implementation.
 *
 * {@link runDomainRulesSessionInitStatus} enumerates `DEV-RULES.*.md`
 * files in `.arc/system/rules/`, filters by frontmatter
 * presence, and returns `{path, domain, purpose}` tuples. Files without
 * a frontmatter block are silently skipped — that's the enumeration
 * discriminator, so `DEV-RULES.ARC.md` and `DEV-RULES.PROJECT.md` (and
 * any draft file without an opt-in block) drop out without noise.
 * Structural or validation defects surface in `warnings`.
 *
 * Reads directly from `fs/promises`; integration tests exercise the fs
 * side against fixture trees.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { z } from "zod";

import { parseDevRulesFrontmatter } from "../../lib/frontmatter/index.js";
import { materializeArcPath, resolveArcPath } from "../../lib/layout/index.js";
import type {
  DomainRulesEntry,
  DomainRulesSessionInitOptions,
  DomainRulesSessionInitResult,
} from "./types.js";

/** Strict session-init domain-rule probe contract. */
export const DomainRulesSessionInitResultSchema = z.strictObject({
  mode: z.literal("session-init"),
  rules: z.array(z.strictObject({ path: z.string(), domain: z.string(), purpose: z.string() })),
  warnings: z.array(z.string()),
});

const DEV_RULES_FILENAME_RE = /^DEV-RULES\..+\.md$/;
const MISSING_BLOCK_ERROR = "missing frontmatter block";

/** Locate the domain-rules directory inside an ARC install. */
function constitutionDir(cwd: string): string {
  return join(materializeArcPath(cwd, resolveArcPath({ kind: "arc-root" })), "system", "rules");
}

/**
 * Produce the session-init-scoped result — enumerated domain rules plus
 * warnings for any structurally-malformed files.
 */
export async function runDomainRulesSessionInitStatus(
  options: DomainRulesSessionInitOptions,
): Promise<DomainRulesSessionInitResult> {
  const dir = constitutionDir(options.cwd);
  const entries = await readdir(dir);
  const domainFiles = entries.filter((f) => DEV_RULES_FILENAME_RE.test(f)).sort();

  const rules: DomainRulesEntry[] = [];
  const warnings: string[] = [];

  for (const filename of domainFiles) {
    const basename = filename.slice(0, -3);
    const fullPath = join(dir, filename);
    const content = await readFile(fullPath, "utf8");
    const parsed = parseDevRulesFrontmatter(content, basename);

    if (parsed.frontmatter) {
      rules.push({
        path: relative(options.cwd, fullPath),
        domain: parsed.frontmatter.domain,
        purpose: parsed.frontmatter.purpose,
      });
      continue;
    }

    const onlyMissingBlock =
      parsed.errors.length === 1 && parsed.errors[0] === MISSING_BLOCK_ERROR;
    if (!onlyMissingBlock) {
      warnings.push(`${filename}: ${parsed.errors.join("; ")}`);
    }
  }

  return { mode: "session-init", rules, warnings };
}
