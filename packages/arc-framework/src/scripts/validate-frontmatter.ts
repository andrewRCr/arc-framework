/**
 * Frontmatter schema validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, classifies each by schema directory
 * (method / extension / domain-rules / other) and validates the frontmatter
 * against the corresponding schema. Unclassified paths are skipped silently —
 * the hook invokes this for all staged files, not a pre-filtered subset.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseDevRulesFrontmatter,
  parseExtensionFrontmatter,
  parseMethodFrontmatter,
} from "../lib/frontmatter/index.js";

/** Path classifications the validator dispatches on. */
export type PathClassification =
  | "method"
  | "extension"
  | "domain-rules"
  | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const METHOD_PATH = /(?:^|\/)system\/methods\/([^/]+)\.md$/;
const EXTENSION_PATH = /(?:^|\/)system\/extensions\/([^/]+)\.md$/;
const DOMAIN_RULES_PATH = /(?:^|\/)reference\/constitution\/DEV-RULES\.([^/]+)\.md$/;
const DOMAIN_RULES_RESERVED = new Set(["ARC", "PROJECT"]);

/**
 * Classify a path by schema directory.
 *
 * - Method / extension: any `.md` under the respective directory except `README.md`.
 * - Domain-rules: `DEV-RULES.{DOMAIN}.md` under `reference/constitution/` where
 *   `{DOMAIN}` is neither `ARC` nor `PROJECT` (those carry no frontmatter and
 *   are discovered by the session-init probe via frontmatter presence).
 */
export function classifyPath(path: string): PathClassification {
  const methodMatch = METHOD_PATH.exec(path);
  if (methodMatch && methodMatch[1] !== "README") return "method";

  const extensionMatch = EXTENSION_PATH.exec(path);
  if (extensionMatch && extensionMatch[1] !== "README") return "extension";

  const domainRulesMatch = DOMAIN_RULES_PATH.exec(path);
  if (domainRulesMatch && !DOMAIN_RULES_RESERVED.has(domainRulesMatch[1] ?? "")) {
    return "domain-rules";
  }

  return "other";
}

/**
 * Validate a set of staged paths.
 *
 * Paths classified as `other` are skipped silently — the hook is invoked with
 * the full staged file list and filters happen here.
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
): ValidationResult {
  const diagnostics: string[] = [];
  for (const path of paths) {
    const classification = classifyPath(path);
    if (classification === "other") continue;

    const content = readFile(path);
    const fileBase = basename(path, ".md");

    if (classification === "method") {
      const result = parseMethodFrontmatter(content, fileBase);
      for (const err of result.errors) diagnostics.push(`${path}: ${err}`);
    } else if (classification === "extension") {
      const result = parseExtensionFrontmatter(content, fileBase);
      for (const err of result.errors) diagnostics.push(`${path}: ${err}`);
    } else {
      const result = parseDevRulesFrontmatter(content, fileBase);
      for (const err of result.errors) diagnostics.push(`${path}: ${err}`);
    }
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

function main(): void {
  const paths = process.argv.slice(2);
  if (paths.length === 0) {
    process.exit(0);
  }
  const result = validateFiles(paths, (p) => readFileSync(p, "utf8"));
  if (!result.pass) {
    for (const d of result.diagnostics) {
      process.stderr.write(`${d}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
