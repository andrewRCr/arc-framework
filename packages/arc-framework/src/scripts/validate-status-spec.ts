/**
 * Status-file `**Spec:**` field shape validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, identifies status files at
 * `.arc/active/{category}/status-{name}.md` and validates the `**Spec:**` field
 * value against the allowed shapes: empty, `[none]`, bare-basename `.md`
 * filename, or `https?://` URL. Surrounding whitespace and a single pair of
 * wrapping backticks are stripped before matching. Tier-aware semantics
 * (e.g., per-WU-type Spec requirements) are intentionally out of scope.
 *
 * @module
 */

import { fileURLToPath } from "node:url";

import { runPathListScript } from "./cli-runner.js";

/** Path classifications the validator dispatches on. */
export type PathClassification = "status" | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const STATUS_PATH = /(?:^|\/)\.arc\/active\/[^/]+\/status-[^/]+\.md$/;
const SPEC_LINE = /^\s*-\s+\*\*Spec:\*\*\s*(.*?)\s*$/;
const MD_FILENAME = /^[a-zA-Z0-9._-]+\.md$/;
const URL_SHAPE = /^https?:\/\/\S+$/;

const EXPECTED_SHAPE =
  "expected: empty, [none], bare-basename .md filename, or https?://... URL";

/**
 * Classify a path — `status` when it matches
 * `.arc/active/{category}/status-{name}.md`, `other` otherwise.
 */
export function classifyPath(path: string): PathClassification {
  return STATUS_PATH.test(path) ? "status" : "other";
}

/**
 * Locate `**Spec:**` lines in a status file and validate the value's shape.
 * Returns one diagnostic per problem; an empty array means the file passes.
 */
export function validateSpec(content: string, path: string): string[] {
  const captures: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = SPEC_LINE.exec(line);
    if (match) captures.push(match[1] ?? "");
  }

  if (captures.length === 0) {
    return [`${path}: missing \`**Spec:**\` line`];
  }
  if (captures.length > 1) {
    return [
      `${path}: multiple \`**Spec:**\` lines (found ${captures.length})`,
    ];
  }

  let value = (captures[0] ?? "").trim();
  const stripped = /^`(.*)`$/.exec(value);
  if (stripped) value = (stripped[1] ?? "").trim();

  if (value === "") return [];
  if (value === "[none]") return [];
  if (MD_FILENAME.test(value)) return [];
  if (URL_SHAPE.test(value)) return [];

  return [
    `${path}: invalid \`**Spec:**\` value "${value}"; ${EXPECTED_SHAPE}`,
  ];
}

/**
 * Validate a set of staged paths. Paths classified as `other` are skipped
 * silently — the hook may invoke this with a broader set than the scope.
 */
export function validateFiles(
  paths: string[],
  readFile: (path: string) => string,
): ValidationResult {
  const diagnostics: string[] = [];
  for (const path of paths) {
    if (classifyPath(path) === "other") continue;
    const content = readFile(path);
    diagnostics.push(...validateSpec(content, path));
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript(validateFiles);
}
