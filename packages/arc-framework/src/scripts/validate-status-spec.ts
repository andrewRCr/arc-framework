/**
 * Status-file field validator — pre-commit hook entry point.
 *
 * Given a list of staged file paths, identifies status files at
 * `.arc/active/{category}/status-{name}.md` and validates the `**Spec:**` field
 * value against the allowed shapes: empty, `[none]`, bare-basename `.md`
 * filename, or `https?://` URL; requires a valid `**State:**` value; and
 * permits `**Integration:** Merged` only for `State: Complete`. Surrounding
 * whitespace and a single pair of wrapping backticks are stripped before
 * matching.
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
const MD_FILENAME = /^[a-zA-Z0-9._-]+\.md$/;
const URL_SHAPE = /^https?:\/\/\S+$/;
const STATUS_FIELD_LINE = /^\s*-\s+\*\*([^:]+):\*\*\s*(.*?)\s*$/;

const VALID_STATES = new Set([
  "Planning",
  "In Progress",
  "Complete",
  "Paused",
  "Superseded",
]);

const VALID_INTEGRATION_STATES = new Set([
  "Merged",
]);

const EXPECTED_SHAPE =
  "expected: empty, [none], bare-basename .md filename, or https?://... URL";
const EXPECTED_STATE =
  "expected: Planning, In Progress, Complete, Paused, or Superseded";
const EXPECTED_INTEGRATION =
  "expected: Merged";

/**
 * Classify a path — `status` when it matches
 * `.arc/active/{category}/status-{name}.md`, `other` otherwise.
 */
export function classifyPath(path: string): PathClassification {
  return STATUS_PATH.test(path) ? "status" : "other";
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
    const match = STATUS_FIELD_LINE.exec(line);
    if (match?.[1] === field) captures.push(normalizeFieldValue(match[2] ?? ""));
  }
  return captures;
}

/**
 * Locate `**Spec:**` lines in a status file and validate the value's shape.
 * Returns one diagnostic per problem; an empty array means the file passes.
 */
export function validateSpec(content: string, path: string): string[] {
  const captures = collectFieldValues(content, "Spec");

  if (captures.length === 0) {
    return [`${path}: missing \`**Spec:**\` line`];
  }
  if (captures.length > 1) {
    return [
      `${path}: multiple \`**Spec:**\` lines (found ${captures.length})`,
    ];
  }

  const value = captures[0] ?? "";

  if (value === "") return [];
  if (value === "[none]") return [];
  if (MD_FILENAME.test(value)) return [];
  if (URL_SHAPE.test(value)) return [];

  return [
    `${path}: invalid \`**Spec:**\` value "${value}"; ${EXPECTED_SHAPE}`,
  ];
}

/**
 * Validate status lifecycle fields. `State` is mandatory for status files.
 * `Integration` is optional and valid only for `State: Complete`, where it
 * records that the work unit has merged and is eligible for archival.
 */
export function validateLifecycleFields(content: string, path: string): string[] {
  const diagnostics: string[] = [];
  const stateCaptures = collectFieldValues(content, "State");
  const integrationCaptures = collectFieldValues(content, "Integration");

  if (stateCaptures.length === 0) {
    diagnostics.push(`${path}: missing \`**State:**\` line`);
  } else if (stateCaptures.length > 1) {
    diagnostics.push(
      `${path}: multiple \`**State:**\` lines (found ${stateCaptures.length})`,
    );
  }

  if (integrationCaptures.length > 1) {
    diagnostics.push(
      `${path}: multiple \`**Integration:**\` lines (found ${integrationCaptures.length})`,
    );
  }

  const hasSingleState = stateCaptures.length === 1;
  const hasSingleIntegration = integrationCaptures.length === 1;
  const state = hasSingleState ? stateCaptures[0] ?? "" : null;
  const integration = hasSingleIntegration
    ? integrationCaptures[0] ?? ""
    : null;

  if (state !== null && !VALID_STATES.has(state)) {
    diagnostics.push(
      `${path}: invalid \`**State:**\` value "${state}"; ${EXPECTED_STATE}`,
    );
  }

  if (hasSingleState && state === "Complete") {
    if (hasSingleIntegration) {
      const integrationValue = integrationCaptures[0] ?? "";
      if (integrationValue === "") {
        diagnostics.push(`${path}: empty \`**Integration:**\` value for \`State: Complete\``);
      } else if (!VALID_INTEGRATION_STATES.has(integrationValue)) {
        diagnostics.push(
          `${path}: invalid \`**Integration:**\` value "${integrationValue}"; ${EXPECTED_INTEGRATION}`,
        );
      }
    }
  } else if (hasSingleState && hasSingleIntegration && integration !== null) {
    diagnostics.push(
      `${path}: \`**Integration:**\` is only valid when \`**State:**\` is \`Complete\``,
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
