/** Unit tests for shared human commit-check diagnostics. */

import { describe, expect, it } from "vitest";
import { formatCommitCheckOutcome } from "../../../src/lib/commit-check/index.js";
import type { CommitCheckOutcome } from "../../../src/lib/commit-check/index.js";

describe("formatCommitCheckOutcome", () => {
  it.each([
    ["fail", "FAILED with 1 error(s) and 0 warning(s)"],
    ["pass-with-warnings", "PASSED with 0 error(s) and 1 warning(s)"],
  ] as const)("renders deterministic %s summaries", (verdict, summary) => {
    const severity = verdict === "fail" ? "error" : "warning";
    const result: CommitCheckOutcome = {
      kind: "validated",
      verdict,
      findings: [
        {
          code: "footer.missing",
          severity,
          location: { kind: "whole-message" },
          message: "Missing final Context trailer",
          detail: {},
        },
      ],
    };

    expect(formatCommitCheckOutcome(result)).toContain(summary);
  });

  it("renders line, whole-message, and configuration locations distinctly", () => {
    const result: CommitCheckOutcome = {
      kind: "validated",
      verdict: "fail",
      findings: [
        {
          code: "body.line-too-long",
          severity: "error",
          location: { kind: "message-line", line: 4 },
          message: "Commit body line exceeds the configured maximum",
          detail: { actual: 14, maximum: 10, preview: "long body line" },
        },
        {
          code: "footer.missing",
          severity: "error",
          location: { kind: "whole-message" },
          message: "Missing final Context trailer",
          detail: {},
        },
        {
          code: "config.invalid-value",
          severity: "error",
          location: { kind: "configuration-key", key: "commit.format" },
          message: "Invalid commit.format value",
          detail: { value: "strict" },
        },
      ],
    };

    const rendered = formatCommitCheckOutcome(result);
    expect(rendered).toContain("ERROR [line 4] body.line-too-long");
    expect(rendered).toContain("actual: 14; maximum: 10");
    expect(rendered).toContain('preview: "long body line"');
    expect(rendered).toContain("ERROR [message] footer.missing");
    expect(rendered).toContain("ERROR [config commit.format] config.invalid-value");
  });

  it("renders only the applicable footer suggestions carried by the finding", () => {
    const result: CommitCheckOutcome = {
      kind: "validated",
      verdict: "fail",
      findings: [
        {
          code: "footer.invalid",
          severity: "error",
          location: { kind: "message-line", line: 3 },
          message: "Invalid Context trailer",
          detail: { suggestions: ["single-task task-list footer", "task-range task-list footer"] },
        },
      ],
    };

    const rendered = formatCommitCheckOutcome(result);
    expect(rendered).toContain("suggestions:");
    expect(rendered).toContain("- single-task task-list footer");
    expect(rendered).toContain("- task-range task-list footer");
    expect(rendered).not.toContain("standalone maintenance footer");
  });

  it("escapes controls and truncates diagnostic previews", () => {
    const preview = `\n\u0000${"x".repeat(100)}tail`;
    const result: CommitCheckOutcome = {
      kind: "validated",
      verdict: "fail",
      findings: [
        {
          code: "body.line-too-long",
          severity: "error",
          location: { kind: "message-line", line: 3 },
          message: "Commit body line exceeds the configured maximum",
          detail: { preview },
        },
      ],
    };

    const rendered = formatCommitCheckOutcome(result);
    expect(rendered).not.toContain("\u0000");
    expect(rendered).not.toContain("\n\u0000");
    expect(rendered).toContain("\\n\\u0000");
    expect(rendered).toContain("…");
  });

  it("does not mutate the machine-stable finding payload", () => {
    const result: CommitCheckOutcome = {
      kind: "validated",
      verdict: "pass-with-warnings",
      findings: [
        {
          code: "footer.artifact-not-found",
          severity: "warning",
          location: { kind: "message-line", line: 3 },
          message: "Referenced Context artifact was not found",
          detail: { filename: "spec-example.md", suggestions: ["planning design footer"] },
        },
      ],
    };
    const before = JSON.stringify(result);

    formatCommitCheckOutcome(result);

    expect(JSON.stringify(result)).toBe(before);
  });
});
