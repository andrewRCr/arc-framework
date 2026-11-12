/**
 * Frontmatter schema validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, classifies each by schema directory
 * (method / domain-rules / other) and validates the frontmatter
 * against the corresponding schema. Unclassified paths are skipped silently —
 * the hook invokes this for all staged files, not a pre-filtered subset.
 *
 * ARC's own checkout runs this file through tsx; an installed project, which has
 * no package source, reaches it through the hidden `arc hook-validate-frontmatter`.
 * Both entries read each path's staged blob, the bytes the commit holds.
 *
 * @module
 */

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { runPathListScript } from "./cli-runner.js";
import { ValidateFrontmatterInputSchema } from "./validate-frontmatter-input.js";
import {
  parseDevRulesFrontmatter,
  parseMethodFrontmatter,
} from "../lib/frontmatter/index.js";
import { MAX_GIT_OUTPUT_BYTES } from "../lib/git/process-executor.js";

/** Path classifications the validator dispatches on. */
export type PathClassification =
  | "method"
  | "domain-rules"
  | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const METHOD_PATH = /(?:^|\/)system\/methods\/([^/]+)\.md$/;
const DOMAIN_RULES_PATH = /(?:^|\/)system\/rules\/DEV-RULES\.([^/]+)\.md$/;
const DOMAIN_RULES_RESERVED = new Set(["ARC", "PROJECT"]);

/**
 * Classify a path by schema directory.
 *
 * - Method: any `.md` under the directory except `README.md`.
 * - Domain-rules: `DEV-RULES.{DOMAIN}.md` under `system/rules/` where
 *   `{DOMAIN}` is neither `ARC` nor `PROJECT` (those carry no frontmatter and
 *   are discovered by the session-init probe via frontmatter presence).
 */
export function classifyPath(path: string): PathClassification {
  const methodMatch = METHOD_PATH.exec(path);
  if (methodMatch && methodMatch[1] !== "README") return "method";

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
    } else {
      const result = parseDevRulesFrontmatter(content, fileBase);
      for (const err of result.errors) diagnostics.push(`${path}: ${err}`);
    }
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

/** Read a path's staged blob rather than its working-tree file, which can differ from what is committed. */
function readStagedFile(path: string): string {
  return execFileSync("git", ["show", `:${path}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

/** Run the packaged hidden hook command over staged paths and set the process exit code. */
export function runValidateFrontmatterCommand(paths: readonly string[]): void {
  try {
    const input = ValidateFrontmatterInputSchema.parse({ paths: [...paths] });
    const result = validateFiles(input.paths, readStagedFile);
    for (const diagnostic of result.diagnostics) process.stderr.write(`${diagnostic}\n`);
    if (!result.pass) process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Frontmatter validation failed: ${message}\n`);
    process.exitCode = 1;
  }
}

// --- CLI entry ---

const modulePath = fileURLToPath(import.meta.url);
// Preserve the source-script entry without treating the importing bundle (`dist/cli.js`) as
// this module's entrypoint. Bundlers rewrite import.meta.url for every bundled source module.
if (basename(modulePath).startsWith("validate-frontmatter.") && modulePath === process.argv[1]) {
  runPathListScript(validateFiles, { readFile: readStagedFile });
}
