/**
 * Unit tests for `arc release setup print-patterns`.
 *
 * Covers native reference-harness output, raw pattern output, and
 * agent-adaptive fallback behavior for unknown harnesses.
 */

import { describe, expect, it } from "vitest";

import { runReleaseSetupPrintPatterns } from "../../../../../src/handlers/release/setup/print-patterns.js";

describe("runReleaseSetupPrintPatterns", () => {
  it("emits the Claude Code permissions JSON snippet", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      harness: "claude-code",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toBe(`{
  "permissions": {
    "allow": [
      "Bash(arc release commit:*)",
      "Bash(arc release push:*)"
    ]
  }
}
`);
  });

  it("emits the Codex CLI Starlark prefix rules", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      harness: "codex",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toBe(`prefix_rule(pattern=["arc", "release", "commit"])
prefix_rule(pattern=["arc", "release", "push"])
`);
  });

  it("emits the abstract six-element contract when no harness is specified", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    const output = stdout.join("");
    expect(output).toContain("1. Canonical command shape:");
    expect(output).toContain("2. Prefix-match semantics:");
    expect(output).toContain("3. Scope:");
    expect(output).toContain("4. Mode awareness:");
    expect(output).toContain("5. Side effects:");
    expect(output).toContain("6. Verification expectations:");
    expect(output).toContain("arc release commit");
    expect(output).toContain("arc release push");
  });

  it("warns and falls back to the abstract contract for an unknown harness", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      harness: "foo",
      writeStdout: (msg) => stdout.push(msg),
      writeStderr: (msg) => stderr.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(stderr.join("")).toContain("Unknown release setup harness: foo");
    expect(stdout.join("")).toContain("Release-wrapper allowlist contract:");
  });

  it("emits raw command patterns for a known harness when format is raw", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      harness: "claude-code",
      format: "raw",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toBe(`arc release commit:*
arc release push:*
`);
  });

  it("emits raw command patterns with no harness when format is raw", () => {
    const stdout: string[] = [];

    const result = runReleaseSetupPrintPatterns({
      format: "raw",
      writeStdout: (msg) => stdout.push(msg),
    });

    expect(result.exitCode).toBe(0);
    expect(stdout.join("")).toBe(`arc release commit:*
arc release push:*
`);
  });
});
