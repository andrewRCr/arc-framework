/** Unit tests for stable standalone commit-check output contracts. */

import { describe, expect, it } from "vitest";

import { renderCheckCommitMessage } from "../../../../src/handlers/check/commit-msg-output.js";
import { formatCommitCheckOutcome } from "../../../../src/lib/commit-check/diagnostics.js";
import type { CommitCheckOutcome } from "../../../../src/lib/commit-check/types.js";
import type {
  CommitMessageCheckFailure,
  CommitMessageCheckResult,
  RunCheckCommitMessageResult,
} from "../../../../src/handlers/check/commit-msg.js";

function result(result: CommitCheckOutcome, exitCode: 0 | 1 = 0): CommitMessageCheckResult {
  return { kind: "result", exitCode, sourceBytes: new Uint8Array(), result };
}

function failure(
  kind: "usage" | "infrastructure",
  code: CommitMessageCheckFailure["error"]["code"],
): CommitMessageCheckFailure {
  return {
    kind: "error",
    exitCode: 2,
    error: { kind, code, message: `${kind} failure` },
  };
}

describe("renderCheckCommitMessage JSON", () => {
  it.each<{
    label: string;
    outcome: RunCheckCommitMessageResult;
    discriminator: "skipped" | "validated" | "usage" | "infrastructure";
    exitCode: 0 | 1 | 2;
  }>([
    {
      label: "pass",
      outcome: result({ kind: "validated", verdict: "pass", findings: [] }),
      discriminator: "validated",
      exitCode: 0,
    },
    {
      label: "warning",
      outcome: result({
        kind: "validated",
        verdict: "pass-with-warnings",
        findings: [{
          code: "footer.missing",
          severity: "warning",
          location: { kind: "whole-message" },
          message: "Footer recommended",
          detail: {},
        }],
      }),
      discriminator: "validated",
      exitCode: 0,
    },
    {
      label: "validation failure",
      outcome: result({
        kind: "validated",
        verdict: "fail",
        findings: [{
          code: "subject.too-short",
          severity: "error",
          location: { kind: "message-line", line: 1 },
          message: "Subject too short",
          detail: { actual: 5, minimum: 10 },
        }],
      }, 1),
      discriminator: "validated",
      exitCode: 1,
    },
    {
      label: "disabled skip",
      outcome: result({ kind: "skipped", reason: "disabled" }),
      discriminator: "skipped",
      exitCode: 0,
    },
    {
      label: "merge skip",
      outcome: result({ kind: "skipped", reason: "merge-in-progress" }),
      discriminator: "skipped",
      exitCode: 0,
    },
    {
      label: "usage failure",
      outcome: failure("usage", "input.required"),
      discriminator: "usage",
      exitCode: 2,
    },
    {
      label: "infrastructure failure",
      outcome: failure("infrastructure", "input.unreadable"),
      discriminator: "infrastructure",
      exitCode: 2,
    },
  ])("emits one versioned $label envelope", ({ outcome, discriminator, exitCode }) => {
    const rendered = renderCheckCommitMessage(outcome, true);

    expect(rendered.stderr).toBeUndefined();
    expect(rendered.stdout?.trim().split("\n")).toHaveLength(1);
    const envelope = JSON.parse(rendered.stdout ?? "") as {
      schemaVersion: number;
      result?: { kind: string };
      error?: { kind: string };
    };
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.result?.kind ?? envelope.error?.kind).toBe(discriminator);
    expect(outcome.exitCode).toBe(exitCode);
  });

  it("keeps previews and suggestions parseable", () => {
    const outcome = result({
      kind: "validated",
      verdict: "fail",
      findings: [{
        code: "footer.invalid",
        severity: "error",
        location: { kind: "message-line", line: 3 },
        message: "Invalid footer",
        detail: {
          preview: "quoted \"value\"\nnext line",
          suggestions: ["Context: contribution (explain change)"],
        },
      }],
    }, 1);

    const rendered = renderCheckCommitMessage(outcome, true);
    const envelope = JSON.parse(rendered.stdout ?? "") as {
      result: { findings: Array<{ detail: { preview: string; suggestions: string[] } }> };
    };
    expect(envelope.result.findings[0]?.detail).toEqual({
      preview: "quoted \"value\"\nnext line",
      suggestions: ["Context: contribution (explain change)"],
    });
  });
});

describe("renderCheckCommitMessage human output", () => {
  it("uses the shared commit-check formatter", () => {
    const validation: CommitCheckOutcome = {
      kind: "validated",
      verdict: "pass",
      findings: [],
    };

    const rendered = renderCheckCommitMessage(result(validation), false);

    expect(rendered).toEqual({ stdout: `${formatCommitCheckOutcome(validation)}\n` });
  });

  it("routes typed pre-validation failures to stderr", () => {
    const rendered = renderCheckCommitMessage(failure("infrastructure", "encoding.malformed"), false);

    expect(rendered).toEqual({ stderr: "error: infrastructure failure\n" });
  });
});
