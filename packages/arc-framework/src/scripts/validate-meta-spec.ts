/**
 * Meta-file field validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, identifies meta-files (`meta-*.md`)
 * under both flat (`.arc/active/meta-*.md`) and subdir
 * (`.arc/active/<category>/meta-*.md`) layouts. Validates the `**Design:**`
 * field value against the allowed shapes: empty, `[none]`, bare-basename
 * `.md` filename, or `https?://` URL; requires a valid `**State:**` value
 * from the codified four-value enum. Surrounding whitespace and a single
 * pair of wrapping backticks are stripped before matching.
 *
 * @module
 */

import { fileURLToPath } from "node:url";

import { runPathListScript } from "./cli-runner.js";

/** Path classifications the validator dispatches on. */
export type PathClassification = "meta" | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const META_PATH =
  /(?:^|\/)\.arc\/active\/(?:[^/]+\/)?meta-[^/]+\.md$/;
const MD_FILENAME = /^[a-zA-Z0-9._-]+\.md$/;
const URL_SHAPE = /^https?:\/\/\S+$/;
const META_FIELD_LINE = /^\s*-\s+\*\*([^:]+):\*\*\s*(.*?)\s*$/;

const VALID_STATES = new Set([
  "Planning",
  "Active",
  "Integrating",
  "Shipped",
]);

const EXPECTED_SHAPE =
  "expected: empty, [none], bare-basename .md filename, or https?://... URL";
const EXPECTED_STATE =
  "expected one of: Planning, Active, Integrating, Shipped";

/**
 * Classify a path — `meta` when it matches a meta-file under either layout
 * (`.arc/active/(<category>/)?meta-{name}.md`); `other` otherwise.
 */
export function classifyPath(path: string): PathClassification {
  return META_PATH.test(path) ? "meta" : "other";
}

function normalizeFieldValue(value: string): string {
  let normalized = value.trim();
  const stripped = /^`(.*)`$/.exec(normalized);
  if (stripped) normalized = (stripped[1] ?? "").trim();
  return normalized;
}

function collectFieldValues(content: string, field: string): string[] {
  const captures: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = META_FIELD_LINE.exec(line);
    if (match?.[1] === field) captures.push(normalizeFieldValue(match[2] ?? ""));
  }
  return captures;
}

/**
 * Locate `**Design:**` lines in a meta file and validate the value's shape.
 * Returns one diagnostic per problem; an empty array means the file passes.
 */
export function validateSpec(content: string, path: string): string[] {
  const captures = collectFieldValues(content, "Design");

  if (captures.length === 0) {
    return [`${path}: missing \`**Design:**\` line`];
  }
  if (captures.length > 1) {
    return [
      `${path}: multiple \`**Design:**\` lines (found ${captures.length})`,
    ];
  }

  const value = captures[0] ?? "";

  if (value === "") return [];
  if (value === "[none]") return [];
  if (MD_FILENAME.test(value)) return [];
  if (URL_SHAPE.test(value)) return [];

  return [
    `${path}: invalid \`**Design:**\` value "${value}"; ${EXPECTED_SHAPE}`,
  ];
}

/**
 * Validate the `**State:**` field. State is mandatory and must be one of the
 * codified four values (`Planning, Active, Integrating, Shipped`).
 */
export function validateLifecycleFields(content: string, path: string): string[] {
  const diagnostics: string[] = [];
  const stateCaptures = collectFieldValues(content, "State");

  if (stateCaptures.length === 0) {
    diagnostics.push(`${path}: missing \`**State:**\` line`);
    return diagnostics;
  }
  if (stateCaptures.length > 1) {
    diagnostics.push(
      `${path}: multiple \`**State:**\` lines (found ${stateCaptures.length})`,
    );
    return diagnostics;
  }

  const state = stateCaptures[0] ?? "";
  if (!VALID_STATES.has(state)) {
    diagnostics.push(
      `${path}: invalid \`**State:**\` value "${state}"; ${EXPECTED_STATE}`,
    );
  }

  return diagnostics;
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
    diagnostics.push(...validateLifecycleFields(content, path));
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript(validateFiles);
}
