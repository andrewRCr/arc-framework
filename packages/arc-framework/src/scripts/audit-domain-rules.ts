/**
 * CI audit for DEV-RULES.{DOMAIN}.md domain files.
 *
 * Validates per-file frontmatter schema via {@link parseDevRulesFrontmatter}.
 * Reserved filenames (`DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`) carry no
 * frontmatter and are not inspected.
 *
 * Cross-file `domain` uniqueness is structurally guaranteed by the parser's
 * case contract (uppercase filename + lowercase domain with exact match) —
 * two valid files cannot share a `domain` value because their filename
 * fragments would have to be identical, so no explicit uniqueness check is
 * needed here.
 *
 * Non-blocking pass when zero domain files exist — domain rules are an opt-in
 * extension for projects that need project-type-specific constitutional rules.
 *
 * @module
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDevRulesFrontmatter } from "../lib/frontmatter/index.js";

/** Audit outcome — same shape as the method-triggers audit. */
export interface AuditResult {
  pass: boolean;
  diagnostics: string[];
}

const DOMAIN_FILE_RE = /^DEV-RULES\.([^/]+)\.md$/;
const RESERVED_FRAGMENTS = new Set(["ARC", "PROJECT"]);

/**
 * Enumerate `DEV-RULES.{DOMAIN}.md` basenames under `dir`, sorted, excluding
 * reserved filenames (`DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`) and any
 * non-DEV-RULES files. The audit walks the returned list; callers should
 * pass the absolute path of `reference/constitution/`.
 */
export function enumerateDomainFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => {
      const match = DOMAIN_FILE_RE.exec(name);
      if (match === null) return false;
      return !RESERVED_FRAGMENTS.has(match[1] ?? "");
    })
    .sort();
}

/**
 * Audit the domain-rules corpus in `constitutionDir`.
 *
 * Diagnostics accumulate across all files; the audit does not short-circuit
 * on the first error. Zero domain files returns a clean pass — the opt-in
 * extension is a valid project state.
 */
export function audit(constitutionDir: string): AuditResult {
  const diagnostics: string[] = [];
  const filenames = enumerateDomainFiles(constitutionDir);

  for (const filename of filenames) {
    const fullPath = join(constitutionDir, filename);
    const basename = filename.slice(0, -3);
    const content = readFileSync(fullPath, "utf8");
    const parsed = parseDevRulesFrontmatter(content, basename);

    if (parsed.frontmatter === undefined) {
      for (const err of parsed.errors) {
        diagnostics.push(`${filename}: ${err}`);
      }
    }
  }

  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

function resolveRepoRoot(): string {
  // script at: <root>/packages/arc-framework/src/scripts/audit-domain-rules.ts
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  return resolve(scriptDir, "..", "..", "..", "..");
}

function main(): void {
  const root = resolveRepoRoot();
  const constitutionDir = join(
    root,
    "packages/arc-framework/arc/reference/constitution",
  );
  const result = audit(constitutionDir);
  if (!result.pass) {
    for (const d of result.diagnostics) {
      process.stderr.write(`${d}\n`);
    }
    process.exit(1);
  }
  const count = enumerateDomainFiles(constitutionDir).length;
  const summary =
    count === 0
      ? "audit-domain-rules: no domain files present (opt-in extension)"
      : `audit-domain-rules: ${count} domain file(s) validated`;
  process.stdout.write(`${summary}\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
