/** ARC policy over policy-free commit-message structure. */

import type { CommitCheckFinding, CommitCheckPolicy, CommitCheckConfigurationKey } from "./types.js";
import type { ParsedCommitMessage, ParsedCommitLine } from "./parser.js";

const CONVENTIONAL_TYPES = new Set([
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "revert",
]);
const SCOPE_PATTERN = /^[a-z][a-z0-9-]*$/;
const POSIX_ONLY_PATTERN = /\[\[(?::[A-Za-z]+:|\.[^\]]+\.|=[^\]]+=)\]\]/;

function lineFinding(
  code: CommitCheckFinding["code"],
  line: ParsedCommitLine,
  message: string,
  detail: CommitCheckFinding["detail"] = {},
): CommitCheckFinding {
  return {
    code,
    severity: "error",
    location: { kind: "message-line", line: line.line },
    message,
    detail: { preview: line.text, ...detail },
  };
}

function configFinding(
  code: CommitCheckFinding["code"],
  key: CommitCheckConfigurationKey,
  message: string,
  detail: CommitCheckFinding["detail"],
): CommitCheckFinding {
  return {
    code,
    severity: "error",
    location: { kind: "configuration-key", key },
    message,
    detail,
  };
}

function compilePattern(
  source: string,
  key: CommitCheckConfigurationKey,
): { pattern: RegExp | null; finding: CommitCheckFinding | null } {
  if (source.length === 0) {
    return {
      pattern: null,
      finding: configFinding("config.empty-pattern", key, `Empty ${key}`, { source }),
    };
  }
  if (POSIX_ONLY_PATTERN.test(source)) {
    return {
      pattern: null,
      finding: configFinding(
        "config.unsupported-pattern-dialect",
        key,
        `${key} contains POSIX-only pattern syntax`,
        { source, dialect: "ECMAScript Unicode" },
      ),
    };
  }
  try {
    return { pattern: new RegExp(source, "u"), finding: null };
  } catch (error: unknown) {
    return {
      pattern: null,
      finding: configFinding("config.invalid-pattern", key, `Invalid ${key}`, {
        source,
        reason: error instanceof Error ? error.message : "invalid pattern",
      }),
    };
  }
}

function validateConventionalSubject(parsed: ParsedCommitMessage): CommitCheckFinding[] {
  const line = parsed.physicalLines[0] ?? { line: 1, text: "" };
  const { subject } = parsed;
  if (subject.type === null || subject.description === null) {
    return [lineFinding("subject.invalid-format", line, "Subject is not Conventional Commit syntax")];
  }

  const findings: CommitCheckFinding[] = [];
  if (!CONVENTIONAL_TYPES.has(subject.type)) {
    findings.push(
      lineFinding("subject.invalid-type", line, "Subject uses an unsupported commit type", {
        type: subject.type,
        allowed: [...CONVENTIONAL_TYPES],
      }),
    );
  }
  if (subject.scope === null) {
    findings.push(lineFinding("subject.missing-scope", line, "Subject scope is required"));
  } else if (!SCOPE_PATTERN.test(subject.scope)) {
    findings.push(
      lineFinding("subject.invalid-scope", line, "Subject scope has invalid characters", {
        scope: subject.scope,
      }),
    );
  }
  if (subject.breaking) {
    findings.push(
      lineFinding(
        "subject.breaking-not-allowed",
        line,
        "Breaking-change marker is not enabled by current policy",
      ),
    );
  }
  return findings;
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Validate subject syntax/limits and Bash-compatible raw body limits. */
export function validateSubjectAndBody(
  parsed: ParsedCommitMessage,
  policy: CommitCheckPolicy,
): CommitCheckFinding[] {
  const findings: CommitCheckFinding[] = [];
  const subjectLine = parsed.physicalLines[0] ?? { line: 1, text: "" };

  if (policy.format === "conventional") {
    findings.push(...validateConventionalSubject(parsed));
  } else if (policy.format === "custom") {
    const compiled = compilePattern(policy.customPattern, "commit.custom_pattern");
    if (compiled.finding) findings.push(compiled.finding);
    else if (compiled.pattern && !compiled.pattern.test(parsed.subject.raw)) {
      findings.push(
        lineFinding("subject.custom-mismatch", subjectLine, "Subject does not match custom pattern", {
          pattern: policy.customPattern,
        }),
      );
    }
  }

  if (policy.format !== "any") {
    const length = codePointLength(parsed.subject.raw);
    if (length < 10) {
      findings.push(
        lineFinding("subject.too-short", subjectLine, "Subject is shorter than the minimum", {
          actual: length,
          minimum: 10,
        }),
      );
    } else if (length > policy.subjectMaxLength) {
      findings.push(
        lineFinding("subject.too-long", subjectLine, "Subject exceeds the configured maximum", {
          actual: length,
          maximum: policy.subjectMaxLength,
        }),
      );
    }
  }

  const measuredLines = parsed.physicalLines.filter(({ line }) => line >= 3);
  const nonEmptyLines = measuredLines.filter(({ text }) => text.length > 0);
  if (nonEmptyLines.length > policy.bodyMaxLines) {
    const firstExcess = nonEmptyLines[policy.bodyMaxLines];
    if (firstExcess) {
      findings.push(
        lineFinding("body.too-many-lines", firstExcess, "Commit body has too many non-empty lines", {
          actual: nonEmptyLines.length,
          maximum: policy.bodyMaxLines,
        }),
      );
    }
  }
  for (const line of measuredLines) {
    const length = codePointLength(line.text);
    if (length > policy.bodyMaxLineLength) {
      findings.push(
        lineFinding("body.line-too-long", line, "Commit body line exceeds the configured maximum", {
          actual: length,
          maximum: policy.bodyMaxLineLength,
        }),
      );
    }
  }
  for (const line of parsed.physicalLines) {
    if (/\bPhase \d+\.\d+(?![\d.])/.test(line.text)) {
      findings.push(
        lineFinding("message.dotted-phase", line, "Dotted identifiers must use Task, not Phase"),
      );
    }
  }

  return findings;
}
