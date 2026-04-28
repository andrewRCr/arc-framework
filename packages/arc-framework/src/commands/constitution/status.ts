/**
 * DEV-RULES domain-rules probe implementation.
 *
 * {@link runDomainRulesSessionInitStatus} enumerates `DEV-RULES.*.md`
 * files in `.arc/reference/constitution/`, filters by frontmatter
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

import { parseDevRulesFrontmatter } from "../../lib/frontmatter/index.js";
import type {
  DomainRulesEntry,
  DomainRulesSessionInitOptions,
  DomainRulesSessionInitResult,
} from "./types.js";

const DEV_RULES_FILENAME_RE = /^DEV-RULES\..+\.md$/;
const MISSING_BLOCK_ERROR = "missing frontmatter block";

/** Locate the constitution directory inside an ARC install. */
function constitutionDir(cwd: string): string {
  return join(cwd, ".arc", "reference", "constitution");
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
