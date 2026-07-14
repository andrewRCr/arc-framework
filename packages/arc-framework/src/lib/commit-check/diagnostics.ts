/** Shared human diagnostic rendering for commit-message validation. */

import type {
  CommitCheckDetailValue,
  CommitCheckFinding,
  CommitCheckLocation,
  CommitCheckOutcome,
} from "./types.js";

const PREVIEW_LIMIT = 80;

function locationLabel(location: CommitCheckLocation): string {
  switch (location.kind) {
    case "message-line":
      return `line ${location.line}`;
    case "configuration-key":
      return `config ${location.key}`;
    case "whole-message":
      return "message";
  }
}

function escapeControl(character: string): string {
  if (character === "\n") return "\\n";
  if (character === "\r") return "\\r";
  if (character === "\t") return "\\t";
  const code = character.codePointAt(0) ?? 0;
  return `\\u${code.toString(16).padStart(4, "0")}`;
}

function safePreview(value: string): string {
  const escaped = Array.from(value, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 31 || code === 127 ? escapeControl(character) : character;
  }).join("");
  const codePoints = Array.from(escaped);
  return codePoints.length > PREVIEW_LIMIT
    ? `${codePoints.slice(0, PREVIEW_LIMIT).join("")}…`
    : escaped;
}

function detailValue(value: CommitCheckDetailValue): string {
  return Array.isArray(value) ? value.join(", ") : String(value);
}

function findingLines(finding: CommitCheckFinding): string[] {
  const lines = [
    `${finding.severity.toUpperCase()} [${locationLabel(finding.location)}] ${finding.code}: ${finding.message}`,
  ];
  const scalarDetails = Object.entries(finding.detail).filter(
    ([key]) => key !== "preview" && key !== "suggestions",
  );
  if (scalarDetails.length > 0) {
    lines.push(`  ${scalarDetails.map(([key, value]) => `${key}: ${detailValue(value)}`).join("; ")}`);
  }
  const preview = finding.detail["preview"];
  if (typeof preview === "string") lines.push(`  preview: "${safePreview(preview)}"`);
  const suggestions = finding.detail["suggestions"];
  if (Array.isArray(suggestions) && suggestions.length > 0) {
    lines.push("  suggestions:", ...suggestions.map((suggestion) => `  - ${suggestion}`));
  }
  return lines;
}

/**
 * Render a typed outcome for hook, standalone, and wrapper human output.
 *
 * @param outcome - Machine-stable commit-check outcome
 * @returns Deterministic, terminal-safe diagnostic text
 */
export function formatCommitCheckOutcome(outcome: CommitCheckOutcome): string {
  if (outcome.kind === "skipped") {
    return `Commit validation SKIPPED: ${outcome.reason}`;
  }

  const errors = outcome.findings.filter(({ severity }) => severity === "error").length;
  const warnings = outcome.findings.length - errors;
  const lines = outcome.findings.flatMap(findingLines);
  if (lines.length > 0) lines.push("");
  if (outcome.verdict === "pass") {
    lines.push("Commit validation PASSED");
  } else if (outcome.verdict === "pass-with-warnings") {
    lines.push(`Commit validation PASSED with ${errors} error(s) and ${warnings} warning(s)`);
  } else {
    lines.push(`Commit validation FAILED with ${errors} error(s) and ${warnings} warning(s)`);
  }
  return lines.join("\n");
}
