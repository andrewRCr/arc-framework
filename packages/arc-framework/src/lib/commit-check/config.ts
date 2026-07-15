/** Commit-check configuration defaults and active-domain validation. */

import type {
  CommitCheckConfiguration,
  CommitCheckConfigurationKey,
  CommitCheckFinding,
  CommitCheckPolicyResolution,
} from "./types.js";

/** Defaults shared with the installed commit-msg hook. */
export const COMMIT_CHECK_DEFAULTS: CommitCheckConfiguration = Object.freeze({
  "hooks.commit_msg": "enabled",
  "commit.format": "conventional",
  "commit.context_footer": "required",
  "commit.custom_pattern": "",
  "commit.context_pattern": "",
  "hooks.subject_max_length": "72",
  "hooks.body_max_lines": "100",
  "hooks.body_max_line_length": "100",
});

const FORMAT_VALUES = ["conventional", "custom", "any"] as const;
const FOOTER_VALUES = ["required", "recommended", "custom", "disabled"] as const;

/**
 * Select the eight commit-check values from a parsed ARC configuration.
 *
 * @param values - Quote-normalized values from `parseArcConfig`
 * @returns Complete configuration with Bash-compatible defaults
 */
export function readCommitCheckConfiguration(
  values: Readonly<Record<string, string>>,
): CommitCheckConfiguration {
  return {
    "hooks.commit_msg": values["hooks.commit_msg"] ?? COMMIT_CHECK_DEFAULTS["hooks.commit_msg"],
    "commit.format": values["commit.format"] ?? COMMIT_CHECK_DEFAULTS["commit.format"],
    "commit.context_footer":
      values["commit.context_footer"] ?? COMMIT_CHECK_DEFAULTS["commit.context_footer"],
    "commit.custom_pattern":
      values["commit.custom_pattern"] ?? COMMIT_CHECK_DEFAULTS["commit.custom_pattern"],
    "commit.context_pattern":
      values["commit.context_pattern"] ?? COMMIT_CHECK_DEFAULTS["commit.context_pattern"],
    "hooks.subject_max_length":
      values["hooks.subject_max_length"] ?? COMMIT_CHECK_DEFAULTS["hooks.subject_max_length"],
    "hooks.body_max_lines":
      values["hooks.body_max_lines"] ?? COMMIT_CHECK_DEFAULTS["hooks.body_max_lines"],
    "hooks.body_max_line_length":
      values["hooks.body_max_line_length"] ?? COMMIT_CHECK_DEFAULTS["hooks.body_max_line_length"],
  };
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
  minimum: number,
  key: CommitCheckConfigurationKey,
  findings: CommitCheckFinding[],
): number | undefined {
  if (!/^\d+$/.test(value)) {
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
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
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
  enumValue(configuration["hooks.commit_msg"], ["enabled"] as const, "hooks.commit_msg", findings);
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
    10,
    "hooks.subject_max_length",
    findings,
  );
  const bodyMaxLines = numericValue(
    configuration["hooks.body_max_lines"],
    1,
    "hooks.body_max_lines",
    findings,
  );
  const bodyMaxLineLength = numericValue(
    configuration["hooks.body_max_line_length"],
    1,
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
