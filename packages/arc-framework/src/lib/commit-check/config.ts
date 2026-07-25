/** Commit-check configuration defaults and active-domain validation. */

import {
  COMMIT_CHECK_CONFIG_FIELDS,
  getArcConfigField,
} from "../config/schema.js";
import type {
  CommitCheckConfiguration,
  CommitCheckConfigurationKey,
  CommitCheckFinding,
  CommitCheckPolicyResolution,
} from "./types.js";

export { COMMIT_CHECK_CONFIG_FIELDS } from "../config/schema.js";

/** Defaults shared with the installed commit-msg hook. */
export const COMMIT_CHECK_DEFAULTS = Object.freeze(Object.fromEntries(
  COMMIT_CHECK_CONFIG_FIELDS.map(({ key, defaultValue }) => [key, defaultValue]),
) as CommitCheckConfiguration);

const COMMIT_MSG_VALUES = getArcConfigField("hooks.commit_msg").policy.values;
const FORMAT_VALUES = getArcConfigField("commit.format").policy.values;
const FOOTER_VALUES = getArcConfigField("commit.context_footer").policy.values;

/**
 * Select the eight commit-check values from a parsed ARC configuration.
 *
 * @param values - Quote-normalized values from `parseArcConfig`
 * @returns Complete configuration with Bash-compatible defaults
 */
export function readCommitCheckConfiguration(
  values: Readonly<Record<string, string>>,
): CommitCheckConfiguration {
  return Object.fromEntries(
    COMMIT_CHECK_CONFIG_FIELDS.map(({ key, defaultValue }) => [
      key,
      values[key] ?? defaultValue,
    ]),
  ) as CommitCheckConfiguration;
}

function configurationFinding(
  code: "config.invalid-value" | "config.invalid-number",
  key: CommitCheckConfigurationKey,
  value: string,
  expected: string,
): CommitCheckFinding {
  return {
    code,
    severity: "error",
    location: { kind: "configuration-key", key },
    message: `Invalid ${key} value`,
    detail: { value, expected },
  };
}

function enumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  key: CommitCheckConfigurationKey,
  findings: CommitCheckFinding[],
): T | undefined {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  findings.push(configurationFinding("config.invalid-value", key, value, allowed.join(", ")));
  return undefined;
}

function numericValue(
  value: string,
  key:
    | "hooks.subject_max_length"
    | "hooks.body_max_lines"
    | "hooks.body_max_line_length",
  findings: CommitCheckFinding[],
): number | undefined {
  const field = getArcConfigField(key);
  const minimum = field.policy.minimum;
  if (!field.schema.safeParse(value).success) {
    findings.push(
      configurationFinding(
        "config.invalid-number",
        key,
        value,
        `unsigned base-10 safe integer >= ${minimum}`,
      ),
    );
    return undefined;
  }

  const parsed = Number(value);
  return parsed;
}

/**
 * Validate active configuration and construct the normalized grammar policy.
 *
 * @param configuration - Complete raw commit-check configuration
 * @returns Disabled, active policy, or configuration findings
 */
export function resolveCommitCheckPolicy(
  configuration: CommitCheckConfiguration,
): CommitCheckPolicyResolution {
  if (configuration["hooks.commit_msg"] === "disabled") return { kind: "disabled" };

  const findings: CommitCheckFinding[] = [];
  enumValue(
    configuration["hooks.commit_msg"],
    COMMIT_MSG_VALUES.filter((value) => value === "enabled"),
    "hooks.commit_msg",
    findings,
  );
  const format = enumValue(
    configuration["commit.format"],
    FORMAT_VALUES,
    "commit.format",
    findings,
  );
  const contextFooter = enumValue(
    configuration["commit.context_footer"],
    FOOTER_VALUES,
    "commit.context_footer",
    findings,
  );
  const subjectMaxLength = numericValue(
    configuration["hooks.subject_max_length"],
    "hooks.subject_max_length",
    findings,
  );
  const bodyMaxLines = numericValue(
    configuration["hooks.body_max_lines"],
    "hooks.body_max_lines",
    findings,
  );
  const bodyMaxLineLength = numericValue(
    configuration["hooks.body_max_line_length"],
    "hooks.body_max_line_length",
    findings,
  );

  if (
    findings.length > 0 ||
    format === undefined ||
    contextFooter === undefined ||
    subjectMaxLength === undefined ||
    bodyMaxLines === undefined ||
    bodyMaxLineLength === undefined
  ) {
    return { kind: "invalid", findings };
  }

  return {
    kind: "active",
    policy: {
      format,
      contextFooter,
      customPattern: configuration["commit.custom_pattern"],
      contextPattern: configuration["commit.context_pattern"],
      subjectMaxLength,
      bodyMaxLines,
      bodyMaxLineLength,
    },
  };
}
