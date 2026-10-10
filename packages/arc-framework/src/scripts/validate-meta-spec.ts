/**
 * Meta-file field validator — pre-commit hook entry point over staged bytes.
 *
 * Given a list of staged file paths, identifies lifecycle meta-files
 * (`meta-*.md`) under active, backlog, and completed tiers. Validates the
 * managed field-block shape, the `**Design:**` field value against the allowed
 * shapes (empty, `[none]`, bare-basename `.md` filename, or `https?://` URL),
 * the codified four-value `**State:**` enum, the optional `**Cohort:**`
 * two-segment path cap, and active-meta `**Current Workflow:**` agreement with
 * lifecycle state and the staged task cursor. Surrounding whitespace and a
 * single pair of wrapping backticks are stripped before matching.
 *
 * @module
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  parseIdentifierList,
  parseMetaRecord,
  stripInlineCode,
  validateMetaFieldBlockShape,
} from "../lib/active/meta-reader.js";
import { validateCohortPath } from "../lib/active/cohort-path.js";
import { checkCurrentWorkflowConsistency } from "../lib/active/current-workflow-consistency.js";
import { resolveTaskListPath } from "../commands/active/status.js";
import { resolveTaskListCursor } from "../lib/task-list/cursor.js";
import { MAX_GIT_OUTPUT_BYTES } from "../lib/git/process-executor.js";
import { runPathListScript } from "./cli-runner.js";

/** Path classifications the validator dispatches on. */
export type PathClassification = "meta" | "other";

/** Aggregate validation outcome. */
export interface ValidationResult {
  pass: boolean;
  diagnostics: string[];
}

const META_PATH = new RegExp(
  String.raw`(?:^|/)\.arc/`
    + String.raw`(?:active(?:/[^/]+)?|backlog/(?:planned|provisional)(?:/.*)?|completed(?:/.*)?)/`
    + String.raw`meta-[^/]+\.md$`,
);
const ACTIVE_META_PATH = /(?:^|\/)\.arc\/active(?:\/[^/]+)?\/meta-[^/]+\.md$/u;
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

/**
 * Collect every `**Field:**` line value for `field`, **raw** (regex-trimmed but
 * backticks intact). Single-value callers normalize per their needs
 * ({@link normalizeFieldValue} strips one wrapping pair); list-valued `Design`
 * strips code spans globally before splitting, so the per-element form survives.
 */
function collectFieldValues(content: string, field: string): string[] {
  const captures: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = META_FIELD_LINE.exec(line);
    if (match?.[1] === field) captures.push((match[2] ?? "").trim());
  }
  return captures;
}

/**
 * Locate the `**Design:**` line in a meta file and validate its value. A single
 * bullet may carry one OR two comma-separated references (the layered Design
 * pattern); code spans are stripped globally so the per-element (`` `a`, `b` ``)
 * and legacy compound (`` `a, b` ``) forms both split the same way, then each
 * element is shape-checked (empty / `[none]` / bare-basename `.md` filename /
 * `https?://` URL). Multiple `**Design:**` *lines* remain a failure, as does a
 * third reference. Returns one diagnostic per problem; an empty array passes.
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

  const stripped = stripInlineCode(captures[0] ?? "").trim();
  if (stripped === "" || stripped === "[none]") return [];

  const refs = parseIdentifierList(stripped);
  if (refs.length > 2) {
    return [
      `${path}: too many \`**Design:**\` references (found ${refs.length}); ` +
        `expected one or two (the layered pattern)`,
    ];
  }
  const invalid = refs.find((ref) => !MD_FILENAME.test(ref) && !URL_SHAPE.test(ref));
  if (invalid !== undefined) {
    return [`${path}: invalid \`**Design:**\` value "${invalid}"; ${EXPECTED_SHAPE}`];
  }
  return [];
}

/**
 * Validate the `**State:**` field. State is mandatory and must be one of the
 * codified four values (`Planning, Active, Integrating, Shipped`).
 *
 * The canonical value comes from the shared meta reader, so State is recovered
 * from the hoisted core-block table as well as the legacy flat-bullet form
 * (with inline backticks stripped). The legacy duplicate-`- **State:**`-line
 * diagnostic still scans bullets directly — a malformation possible only in the
 * flat form, which the table layout cannot express.
 */
export function validateLifecycleFields(content: string, path: string): string[] {
  const diagnostics: string[] = [];

  const bulletStateLines = collectFieldValues(content, "State");
  if (bulletStateLines.length > 1) {
    diagnostics.push(
      `${path}: multiple \`**State:**\` lines (found ${bulletStateLines.length})`,
    );
    return diagnostics;
  }

  let state: string | null;
  try {
    state = parseMetaRecord(content).state;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`${path}: ${message}`);
    return diagnostics;
  }

  if (state === null) {
    diagnostics.push(`${path}: missing \`**State:**\` line`);
    return diagnostics;
  }
  if (!VALID_STATES.has(state)) {
    diagnostics.push(
      `${path}: invalid \`**State:**\` value "${state}"; ${EXPECTED_STATE}`,
    );
  }

  return diagnostics;
}

/**
 * Validate the optional `**Cohort:**` field's path shape (the two-segment cap).
 * The field is optional — a meta with no `**Cohort:**` line passes (a standalone
 * work unit carries `[none]`, but a pre-schema meta may omit it). A present
 * value is validated against {@link validateCohortPath}; multiple lines are
 * flagged. Returns one diagnostic per problem; an empty array means pass.
 */
export function validateCohort(content: string, path: string): string[] {
  const captures = collectFieldValues(content, "Cohort");

  if (captures.length === 0) return [];
  if (captures.length > 1) {
    return [`${path}: multiple \`**Cohort:**\` lines (found ${captures.length})`];
  }

  const error = validateCohortPath(normalizeFieldValue(captures[0] ?? ""));
  return error === null ? [] : [`${path}: invalid \`**Cohort:**\` value; ${error}`];
}

/**
 * Validate an active meta's workflow pointer against its lifecycle tuple and staged task cursor.
 *
 * Non-active paths are outside this interim guard. Parse failures are already
 * reported by {@link validateLifecycleFields}, so this check avoids duplicating
 * the same structural diagnostic.
 */
export function validateCurrentWorkflow(
  content: string,
  path: string,
  readFile?: (path: string) => string,
): string[] {
  if (!ACTIVE_META_PATH.test(path)) return [];

  let record: ReturnType<typeof parseMetaRecord>;
  try {
    record = parseMetaRecord(content);
  } catch {
    return [];
  }

  const diagnostics = checkCurrentWorkflowConsistency(record)
    .map((diagnostic) => `${path}: ${diagnostic}`);
  if (diagnostics.length > 0 || record.currentWorkflow !== "prepare-work-unit" || readFile === undefined) {
    return diagnostics;
  }

  const taskListPath = resolveTaskListPath(path, record.taskList);
  if (taskListPath === null) {
    diagnostics.push(
      `${path}: Current Workflow "prepare-work-unit" requires a resolvable Task List`,
    );
    return diagnostics;
  }
  let taskListContent: string;
  try {
    taskListContent = readFile(taskListPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push(
      `${path}: Current Workflow cannot be checked because staged task list ${taskListPath} `
        + `is unavailable (${message})`,
    );
    return diagnostics;
  }
  const cursor = resolveTaskListCursor(taskListContent);
  if (cursor.status === "found") {
    diagnostics.push(
      `${path}: Current Workflow "prepare-work-unit" contradicts open task ${cursor.cursor.leaf.id} `
        + `in ${taskListPath}`,
    );
  } else if (cursor.status === "malformed") {
    diagnostics.push(
      `${path}: Current Workflow cannot be checked against malformed task cursor in ${taskListPath} `
        + `(line ${cursor.error.line}: ${cursor.error.message})`,
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
    diagnostics.push(...validateMetaFieldBlockShape(content, path));
    diagnostics.push(...validateSpec(content, path));
    diagnostics.push(...validateLifecycleFields(content, path));
    diagnostics.push(...validateCohort(content, path));
    diagnostics.push(...validateCurrentWorkflow(content, path, readFile));
  }
  return { pass: diagnostics.length === 0, diagnostics };
}

// --- CLI entry ---

function readStagedFile(path: string): string {
  return execFileSync("git", ["show", `:${path}`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
  });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  runPathListScript(validateFiles, { readFile: readStagedFile });
}
