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

export function compileConfiguredPattern(
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
    const compiled = compileConfiguredPattern(policy.customPattern, "commit.custom_pattern");
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
    if (/Phase [0-9]+\.[0-9]+(?:$|[^.])/.test(line.text)) {
      findings.push(
        lineFinding("message.dotted-phase", line, "Dotted identifiers must use Task, not Phase"),
      );
    }
  }

  return findings;
}

const TASK_ID_SOURCE = "[0-9]+(?:\\.[0-9A-Za-z]+)+";
const TASK_RANGE_SOURCE = `${TASK_ID_SOURCE}-[0-9A-Za-z]+(?:\\.[0-9A-Za-z]+)*`;
const TASK_ITEM_SOURCE = `(?:${TASK_ID_SOURCE}|${TASK_RANGE_SOURCE})`;
const TASK_LIST_SOURCE = `(?:${TASK_RANGE_SOURCE}|${TASK_ITEM_SOURCE}(?:, ${TASK_ITEM_SOURCE})+)`;
const TASK_REFERENCE_PATTERN = new RegExp(
  `^(?:Task ${TASK_ID_SOURCE}|Tasks ${TASK_LIST_SOURCE}|` +
    `Task ${TASK_ID_SOURCE}; (?:planning|maintenance)|Tasks ${TASK_LIST_SOURCE}; (?:planning|maintenance)|` +
    "incidental during \\S(?:.*\\S)?|planning|maintenance|code review)$",
);
const TASK_FOOTER_PATTERN = /^(tasks-[A-Za-z0-9-]+\.md) \((.+)\)$/;
const DESIGN_FOOTER_PATTERN = /^((?:draft|spec)-[A-Za-z0-9-]+\.md) \((planning|code review)\)$/;
const META_FOOTER_PATTERN =
  /^(meta-[A-Za-z0-9-]+\.md) \((handoff|activation|integration|archival|deactivation|maintenance|incidental during \S(?:.*\S)?)\)$/;
const STANDALONE_FOOTER_PATTERN = /^standalone \((maintenance|planning|documentation|refactor)\)$/;
const INTEGRATION_FOOTER_PATTERN = /^integration \(\S(?:.*\S)?\)$/;
const CONTRIBUTION_FOOTER_PATTERN = /^contribution \(\S(?:.*\S)?\)$/;

interface FooterClassification {
  valid: boolean;
  artifact?: { family: "tasks" | "design" | "meta"; filename: string };
  contribution: boolean;
  suggestions: readonly string[];
}

function classifyFooter(value: string): FooterClassification {
  const taskMatch = value.match(TASK_FOOTER_PATTERN);
  if (taskMatch) {
    const filename = taskMatch[1] ?? "";
    return {
      valid: TASK_REFERENCE_PATTERN.test(taskMatch[2] ?? ""),
      artifact: { family: "tasks", filename },
      contribution: false,
      suggestions: [
        `Context: ${filename} (planning)`,
        `Context: ${filename} (maintenance)`,
        `Context: ${filename} (code review)`,
      ],
    };
  }
  const designMatch = value.match(DESIGN_FOOTER_PATTERN);
  if (designMatch) {
    return {
      valid: true,
      artifact: { family: "design", filename: designMatch[1] ?? "" },
      contribution: false,
      suggestions: [],
    };
  }
  const metaMatch = value.match(META_FOOTER_PATTERN);
  if (metaMatch) {
    return {
      valid: true,
      artifact: { family: "meta", filename: metaMatch[1] ?? "" },
      contribution: false,
      suggestions: [],
    };
  }
  if (STANDALONE_FOOTER_PATTERN.test(value) || INTEGRATION_FOOTER_PATTERN.test(value)) {
    return { valid: true, contribution: false, suggestions: [] };
  }
  if (CONTRIBUTION_FOOTER_PATTERN.test(value)) {
    return { valid: true, contribution: true, suggestions: [] };
  }
  return {
    valid: false,
    contribution: false,
    suggestions: [
      "Context: standalone (maintenance)",
      "Context: standalone (planning)",
      "Context: contribution (describe the change)",
      "Context: integration (describe the integration)",
    ],
  };
}

function footerFinding(
  code: CommitCheckFinding["code"],
  severity: CommitCheckFinding["severity"],
  message: string,
  line: number | null,
  detail: CommitCheckFinding["detail"] = {},
): CommitCheckFinding {
  return {
    code,
    severity,
    location: line === null ? { kind: "whole-message" } : { kind: "message-line", line },
    message,
    detail,
  };
}

/** Validate Context trailer mode, grammar, artifact state, and role advisory. */
export async function validateFooter(
  parsed: ParsedCommitMessage,
  policy: CommitCheckPolicy,
  repository: { role: "maintainer" | "contributor"; resolveArtifact: import("./types.js").CommitCheckArtifactResolver },
): Promise<CommitCheckFinding[]> {
  if (policy.contextFooter === "disabled") return [];
  if (policy.contextFooter === "custom") {
    const compiled = compileConfiguredPattern(policy.contextPattern, "commit.context_pattern");
    if (compiled.finding) return [compiled.finding];
    const matched = parsed.physicalLines.some(({ text }) => compiled.pattern?.test(text) === true);
    return matched
      ? []
      : [
          footerFinding(
            "footer.custom-mismatch",
            "error",
            "No message line matches the custom context pattern",
            null,
            { pattern: policy.contextPattern },
          ),
        ];
  }

  const severity = policy.contextFooter === "recommended" ? "warning" : "error";
  const contextTrailer =
    parsed.contextTrailer?.key === "Context" ? parsed.contextTrailer : null;
  if (!contextTrailer) {
    return [footerFinding("footer.missing", severity, "Missing final Context trailer", null)];
  }

  const contextPreview = parsed.physicalLines.find(({ line }) => line === contextTrailer.line)?.text
    ?? `Context: ${contextTrailer.value}`;

  const classification = classifyFooter(contextTrailer.value);
  if (!classification.valid) {
    return [
      footerFinding("footer.invalid", severity, "Invalid Context trailer", contextTrailer.line, {
        value: contextTrailer.value,
        preview: contextPreview,
        suggestions: classification.suggestions,
      }),
    ];
  }

  const findings: CommitCheckFinding[] = [];
  if (classification.artifact) {
    const resolution = await repository.resolveArtifact(classification.artifact);
    if (resolution === "not-found") {
      findings.push(
        footerFinding(
          "footer.artifact-not-found",
          "warning",
          "Referenced Context artifact was not found",
          contextTrailer.line,
          { filename: classification.artifact.filename, preview: contextPreview },
        ),
      );
    } else if (resolution === "unresolvable") {
      findings.push(
        footerFinding(
          "footer.artifact-unresolvable",
          "warning",
          "Context artifact lookup could not run",
          contextTrailer.line,
          { filename: classification.artifact.filename, preview: contextPreview },
        ),
      );
    }
  }
  if (repository.role === "contributor" && !classification.contribution) {
    findings.push(
      footerFinding(
        "footer.contributor-advisory",
        "warning",
        "Contributors typically use Context: contribution (description)",
        contextTrailer.line,
        { preview: contextPreview },
      ),
    );
  }
  return findings;
}
