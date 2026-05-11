/**
 * CI audit for section-sign references in source and tests.
 *
 * Source and test comments should describe behavior directly instead of
 * citing planning artifacts or process sections. The audit keeps that rule
 * mechanical by refusing the section-sign glyph anywhere under `src/` or
 * `__tests__/`.
 *
 * @module
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveRepoRoot } from "./repo-root.js";

/** Aggregate validation outcome. */
export interface SectionRefsAuditResult {
  pass: boolean;
  diagnostics: string[];
}

const SECTION_SIGN = "\u00a7";
const SEARCH_ROOTS = [
  "packages/arc-framework/src",
  "packages/arc-framework/__tests__",
] as const;

function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}

/**
 * Collect TypeScript source and test files covered by the audit.
 */
export function collectAuditFiles(repoRoot: string): string[] {
  const files: string[] = [];

  function walk(absDir: string): void {
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const absPath = join(absDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        files.push(toPosixPath(relative(repoRoot, absPath)));
      }
    }
  }

  for (const root of SEARCH_ROOTS) {
    walk(join(repoRoot, root));
  }

  return files.sort();
}

/**
 * Validate file contents for section-sign references.
 */
export function auditFiles(
  paths: string[],
  readFile: (path: string) => string,
): SectionRefsAuditResult {
  const diagnostics: string[] = [];

  for (const path of paths) {
    const lines = readFile(path).split("\n");
    lines.forEach((line, idx) => {
      const col = line.indexOf(SECTION_SIGN);
      if (col === -1) return;
      diagnostics.push(
        `${path}:${idx + 1}:${col + 1}: section-sign references are not allowed in source or tests; describe the invariant directly`,
      );
    });
  }

  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

function main(): void {
  const root = resolveRepoRoot();
  const paths = collectAuditFiles(root);
  const result = auditFiles(paths, (path) => readFileSync(join(root, path), "utf8"));

  if (!result.pass) {
    for (const diagnostic of result.diagnostics) {
      process.stderr.write(`${diagnostic}\n`);
    }
    process.exit(1);
  }

  process.stdout.write(`audit-section-refs: ${paths.length} file(s) validated\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
