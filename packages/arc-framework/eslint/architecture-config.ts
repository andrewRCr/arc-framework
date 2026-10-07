/** Compose module-local bans into disjoint native ESLint scopes. */

import { matchesGlob } from "node:path";
import type { Linter } from "eslint";
import type { ArchitecturePredicate } from "./architecture-imports.ts";

export const TYPESCRIPT_SCOPE = "**/*.{ts,tsx,cts,mts}";

export interface ArchitectureBanRow {
  files: string[];
  ignores?: string[];
  paths?: (string | { name: string; allowTypeImports?: boolean })[];
  patterns?: (string | { regex: string; caseSensitive: boolean; allowTypeImports?: boolean })[];
  syntax?: { selector: string; message: string }[];
  predicates?: ArchitecturePredicate[];
}

function representative(pattern: string): string {
  if (pattern.endsWith(TYPESCRIPT_SCOPE)) {
    return pattern.slice(0, -TYPESCRIPT_SCOPE.length) + "__architecture_scope__.ts";
  }
  if (/[!*?{}[\]]/u.test(pattern)) throw new Error(`Unsupported architecture scope: ${pattern}`);
  return pattern;
}

function applies(row: ArchitectureBanRow, filename: string): boolean {
  return row.files.some((pattern) => matchesGlob(filename, pattern)) &&
    !row.ignores?.some((pattern) => matchesGlob(filename, pattern));
}

function unionOptions(rows: ArchitectureBanRow[]): Linter.RulesRecord {
  const paths = [...new Set(rows.flatMap((row) => row.paths ?? []))];
  const patterns = [...new Set(rows.flatMap((row) => row.patterns ?? []))];
  const syntax = [...new Set(rows.flatMap((row) => row.syntax ?? []))];
  const predicates = [...new Set(rows.flatMap((row) => row.predicates ?? []))];
  return {
    ...(paths.length || patterns.length ? {
      "no-restricted-imports": ["error", { paths, patterns }],
    } : {}),
    ...(syntax.length ? { "no-restricted-syntax": ["error", ...syntax] } : {}),
    ...(predicates.length ? { "arc/architecture-imports": ["error", predicates] } : {}),
  };
}

/**
 * Partition rooted directory globs and exact-file exceptions without enumerating source files.
 * @param rows Architecture bans scoped to directories or exact files.
 * @returns Disjoint configurations whose rules contain every matching row's options.
 */
export function composeArchitectureBans(rows: ArchitectureBanRow[]): Linter.Config[] {
  const anchors = [...new Set(rows.flatMap((row) => [...row.files, ...(row.ignores ?? [])]))];
  return anchors.flatMap((anchor) => {
    const matching = rows.filter((row) => applies(row, representative(anchor)));
    if (!matching.length) return [];
    // Every more specific anchor owns its own partition, including exception-only anchors.
    const descendants = anchors.filter((other) => other !== anchor && matchesGlob(representative(other), anchor));
    return [{ files: [anchor], ignores: descendants, rules: unionOptions(matching) }];
  });
}
