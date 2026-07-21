/** Side-effect-free validation service for authorable ARC configuration. */

import { readFile as defaultReadFile } from "node:fs/promises";

import { parseArcConfig } from "../../lib/config/index.js";
import {
  ArcConfigSchema,
  CONFIG_VALIDATION_FIELDS,
  getArcConfigField,
  type ArcConfigKey,
} from "../../lib/config/schema.js";

type ReadFile = (path: string, encoding: "utf8") => Promise<string>;

/** Inputs selecting the file to read and the token rendered in diagnostics. */
export interface ValidateConfigFileOptions {
  readPath: string;
  displayPath: string;
  readFile?: ReadFile;
}

/** Structured configuration-validation output for CLI and launcher adapters. */
export interface ConfigValidationResult {
  lines: string[];
  passes: number;
  warnings: number;
  errors: number;
  exitCode: 0 | 1 | 2;
}

interface ValidationOutput {
  lines: string[];
  passes: number;
  warnings: number;
  errors: number;
}

const VALIDATION_DOMAIN_ORDER = [
  "branch.base",
  "branch.protection",
  "commit.format",
  "commit.context_footer",
  "hooks.pre_commit",
  "hooks.commit_msg",
  "hooks.pre_push",
  "hooks.task_numbering",
  "hooks.subject_max_length",
  "hooks.body_max_lines",
  "hooks.body_max_line_length",
  "review.pre_merge",
  "merge.strategy",
  "platform.type",
  "pm.mode",
  "team.mode",
  "session.remote_sync",
  "session.init_pull.worktree",
  "session.init_pull.notes",
  "session.init_pull.base",
  "session.init_load.notes",
  "user.notes_push",
  "sync.auto_pull",
  "archive.cadence",
] as const satisfies readonly ArcConfigKey[];

const OPTIONAL_INTEGER_KEYS = [
  "inbox.remind_after_days",
  "integration.stale_after_days",
] as const;

const KNOWN_CONFIG_KEYS = new Set<string>(CONFIG_VALIDATION_FIELDS.map(({ key }) => key));

function pass(output: ValidationOutput, message: string): void {
  output.passes += 1;
  output.lines.push(`PASS  ${message}`);
}

function warn(output: ValidationOutput, message: string): void {
  output.warnings += 1;
  output.lines.push(`WARN  ${message}`);
}

function error(output: ValidationOutput, message: string): void {
  output.errors += 1;
  output.lines.push(`ERROR ${message}`);
}

function validatableKeyOccurrences(content: string): string[] {
  const keys: string[] = [];
  for (const line of content.replace(/\r\n/gu, "\n").split("\n")) {
    const match = line.match(/^([a-z][a-z0-9_.]+):/u);
    if (match?.[1] !== undefined) keys.push(match[1]);
  }
  return keys;
}

function matchingValueMap(content: string, occurrences: readonly string[]): Record<string, string> {
  const matchingKeys = new Set(occurrences);
  return Object.fromEntries(
    Object.entries(parseArcConfig(content)).filter(([key]) => matchingKeys.has(key)),
  );
}

function invalidKnownKeys(values: Record<string, string>): Set<ArcConfigKey> {
  const result = ArcConfigSchema.safeParse(values);
  if (result.success) return new Set();

  const keys = new Set<ArcConfigKey>();
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && KNOWN_CONFIG_KEYS.has(key)) {
      keys.add(key as ArcConfigKey);
    }
  }
  return keys;
}

function finiteValues(key: ArcConfigKey): readonly string[] | undefined {
  const policy = getArcConfigField(key).policy;
  if (policy.kind === "enum") return policy.values;
  if (policy.kind === "boolean-token") return ["false", "true"];
  return undefined;
}

function renderDomain(
  output: ValidationOutput,
  key: (typeof VALIDATION_DOMAIN_ORDER)[number],
  values: Readonly<Record<string, string>>,
  invalidKeys: ReadonlySet<ArcConfigKey>,
): void {
  const field = getArcConfigField(key);
  const configured = values[key];

  if (key === "branch.base") {
    pass(
      output,
      configured === undefined || configured === ""
        ? `${key}: [absent, default: ${field.defaultValue}]`
        : `${key}: ${configured}`,
    );
    return;
  }

  if (field.policy.kind === "positive-safe-integer") {
    const selected = configured ?? field.defaultValue;
    if (invalidKeys.has(key)) {
      error(
        output,
        `${key}: '${selected}' must be an unsigned base-10 safe integer >= ${field.policy.minimum}`,
      );
    } else {
      pass(output, `${key}: ${selected}`);
    }
    return;
  }

  const allowed = finiteValues(key);
  if (allowed === undefined) return;
  if (configured === undefined || configured === "") {
    pass(output, `${key}: [absent, default: ${field.defaultValue}]`);
  } else if (invalidKeys.has(key)) {
    error(output, `${key}: '${configured}' is not valid (expected: ${allowed.join(" ")})`);
  } else {
    pass(output, `${key}: ${configured}`);
  }
}

function selectedValue(values: Readonly<Record<string, string>>, key: ArcConfigKey): string {
  const field = getArcConfigField(key);
  const value = values[key];
  return value === undefined || (value === "" && field.quotedEmpty === "default")
    ? field.defaultValue
    : value;
}

function renderCrossFieldChecks(
  output: ValidationOutput,
  values: Readonly<Record<string, string>>,
): void {
  const format = selectedValue(values, "commit.format");
  const customPattern = selectedValue(values, "commit.custom_pattern");
  const footer = selectedValue(values, "commit.context_footer");
  const contextPattern = selectedValue(values, "commit.context_pattern");

  if (format === "custom") {
    if (customPattern === "") {
      error(output, "commit.format is 'custom' but commit.custom_pattern is empty");
    } else {
      pass(output, "commit.custom_pattern is set for custom format");
    }
  } else if (customPattern !== "") {
    warn(output, `commit.custom_pattern is set but commit.format is '${format}' (pattern is ignored)`);
  }

  if (footer === "custom") {
    if (contextPattern === "") {
      error(output, "commit.context_footer is 'custom' but commit.context_pattern is empty");
    } else {
      pass(output, "commit.context_pattern is set for custom footer");
    }
  } else if (contextPattern !== "") {
    warn(
      output,
      `commit.context_pattern is set but commit.context_footer is '${footer}' (pattern is ignored)`,
    );
  }
}

function renderOptionalInteger(
  output: ValidationOutput,
  key: (typeof OPTIONAL_INTEGER_KEYS)[number],
  values: Readonly<Record<string, string>>,
  invalidKeys: ReadonlySet<ArcConfigKey>,
): void {
  const value = values[key];
  if (value === undefined) return;
  if (invalidKeys.has(key)) {
    error(output, `${key} must be a positive integer (got '${value}')`);
  } else {
    pass(output, `${key} is a positive integer`);
  }
}

function exitCode(output: ValidationOutput): 0 | 1 | 2 {
  if (output.errors > 0) return 2;
  if (output.warnings > 0) return 1;
  return 0;
}

/**
 * Validate one selected ARC configuration file without writing process output.
 *
 * @param options - Resolved read path, diagnostic token, and optional file reader
 * @returns Rendered diagnostics, severity counts, and the corresponding exit code
 */
export async function validateConfigFile(
  options: ValidateConfigFileOptions,
): Promise<ConfigValidationResult> {
  const readFile = options.readFile ?? defaultReadFile;
  let content: string;
  try {
    content = await readFile(options.readPath, "utf8");
  } catch {
    return {
      lines: [
        `ERROR Config file not found: ${options.displayPath}`,
        "",
        "Summary: 0 passed, 0 warnings, 1 error",
      ],
      passes: 0,
      warnings: 0,
      errors: 1,
      exitCode: 2,
    };
  }

  const output: ValidationOutput = { lines: [], passes: 0, warnings: 0, errors: 0 };
  pass(output, `Config file exists: ${options.displayPath}`);

  const occurrences = validatableKeyOccurrences(content);
  const values = matchingValueMap(content, occurrences);
  const invalidKeys = invalidKnownKeys(values);

  for (const key of VALIDATION_DOMAIN_ORDER) renderDomain(output, key, values, invalidKeys);

  const locationTemplate = values["worktree.location_template"];
  if (locationTemplate !== undefined && invalidKeys.has("worktree.location_template")) {
    error(output, "worktree.location_template: '' is not valid (expected: non-empty value)");
  }

  renderCrossFieldChecks(output, values);
  for (const key of OPTIONAL_INTEGER_KEYS) {
    renderOptionalInteger(output, key, values, invalidKeys);
  }

  for (const key of occurrences) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      warn(output, `Unknown key: '${key}' (possible typo?)`);
    }
  }

  output.lines.push("");
  const total = output.passes + output.warnings + output.errors;
  output.lines.push(
    `Summary: ${output.passes} passed, ${output.warnings} warnings, ${output.errors} errors (${total} checks)`,
  );

  return { ...output, exitCode: exitCode(output) };
}
