import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseCodeRabbitAgentResult } from "../../../../../../src/scripts/review-gate/providers/coderabbit/frontline-agent.js";

const fixtureUrl = new URL(
  "../../../../../fixtures/coderabbit-frontline/observations.json",
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    observations: Array<{ shape: string; events?: Array<Record<string, unknown>> }>;
    syntheticInjectedCommandCases: Array<Record<string, unknown>>;
  };
}

function parse(stdout: string, override: Partial<Parameters<typeof parseCodeRabbitAgentResult>[0]> = {}) {
  return parseCodeRabbitAgentResult({
    cliVersion: "0.6.5",
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    expectedHead: "a".repeat(40),
    observedHead: "a".repeat(40),
    ...override,
  });
}

describe("CodeRabbit structured frontline parser", () => {
  it("normalizes the bounded clean and findings observations", async () => {
    const observations = (await fixture()).observations;
    const clean = observations.find((item) => item.shape === "clean-scoped-directory");
    const findings = observations.find((item) => item.shape === "findings");

    expect(parse((clean?.events ?? []).map((event) => JSON.stringify(event)).join("\n")))
      .toEqual({ kind: "clean" });
    expect(parse((findings?.events ?? []).map((event) => JSON.stringify(event)).join("\n")))
      .toMatchObject({
        kind: "findings",
        findings: [{
          findingId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          severity: "minor",
          locus: "packages/arc-framework/__tests__/unit/scripts/review-gate/policy/routing.test.ts",
          evidenceUrlOrId: expect.stringContaining("complete normalized facts"),
        }],
      });
  });

  it.each(["0.6.4", "0.7.2", "development"])(
    "accepts the qualified agent contract independently of CLI version %s",
    (cliVersion) => {
      const stdout = JSON.stringify({
        type: "complete",
        status: "review_completed",
        findings: 0,
        reviewedFiles: ["src/index.ts"],
      });

      expect(parse(stdout, { cliVersion })).toEqual({ kind: "clean" });
    },
  );

  it("keeps normalized finding identity stable across executable versions", () => {
    const finding = {
      type: "finding",
      severity: "minor",
      fileName: "src/index.ts",
      codegenInstructions: "Preserve the exact target binding.",
      suggestions: [],
    };
    const stdout = [
      JSON.stringify(finding),
      JSON.stringify({
        type: "complete",
        status: "review_completed",
        findings: 1,
        reviewedFiles: [finding.fileName],
      }),
    ].join("\n");
    const beforeUpdate = parse(stdout, { cliVersion: "0.6.4" });
    const afterUpdate = parse(stdout, { cliVersion: "0.7.2" });

    expect(beforeUpdate).toMatchObject({ kind: "findings" });
    expect(afterUpdate).toMatchObject({ kind: "findings" });
    if (beforeUpdate.kind !== "findings" || afterUpdate.kind !== "findings") return;
    expect(beforeUpdate.findings[0]?.findingId).toBe(afterUpdate.findings[0]?.findingId);
  });

  it("fails closed on incomplete, skipped, duplicated, or unsupported output", () => {
    const complete = {
      type: "complete",
      status: "review_completed",
      findings: 1,
      reviewedFiles: ["src/index.ts"],
    };
    expect(parse(JSON.stringify(complete))).toEqual({ kind: "partial" });
    expect(parse(JSON.stringify({ ...complete, findings: 0, outcome: "failed" })))
      .toEqual({ kind: "partial" });
    for (const outcome of ["cancelled", "partial", "future_failure"]) {
      expect(parse(JSON.stringify({ ...complete, findings: 0, outcome })))
        .toEqual({ kind: "partial" });
    }
    for (const outcome of ["completed", "completed_with_warnings"]) {
      expect(parse(JSON.stringify({ ...complete, findings: 0, outcome })))
        .toEqual({ kind: "clean" });
    }
    expect(parse(JSON.stringify({ ...complete, findings: 0, unreviewedFileCount: 1 })))
      .toEqual({ kind: "partial" });
    expect(parse(JSON.stringify({ ...complete, status: "review_skipped", findings: 0 })))
      .toEqual({ kind: "malformed" });
    expect(parse([JSON.stringify({ ...complete, findings: 0 }), JSON.stringify({ ...complete, findings: 0 })].join("\n")))
      .toEqual({ kind: "ambiguous" });
    const finding = {
      type: "finding",
      severity: "minor",
      fileName: "src/index.ts",
      codegenInstructions: "Preserve the exact target binding.",
      suggestions: [],
    };
    expect(parse([
      JSON.stringify(finding),
      JSON.stringify(finding),
      JSON.stringify({ ...complete, findings: 2 }),
    ].join("\n"))).toEqual({ kind: "ambiguous" });
    expect(parse([
      JSON.stringify({ type: "unknown" }),
      JSON.stringify({ ...complete, findings: 0 }),
    ].join("\n"))).toEqual({ kind: "malformed" });
  });

  it("maps process, rate-limit, malformed, and stale-head failures without a clean fallback", async () => {
    const cases = (await fixture()).syntheticInjectedCommandCases;
    const rateLimit = cases.find((item) => item.shape === "rate-limit");
    const malformed = cases.find((item) => item.shape === "malformed");
    const stale = cases.find((item) => item.shape === "stale-head");

    expect(parse(String(rateLimit?.stdout), {
      exitCode: Number(rateLimit?.exitCode),
      stderr: String(rateLimit?.stderr),
    })).toEqual({ kind: "rate-limited" });
    expect(parse(String(malformed?.stdout))).toEqual({ kind: "malformed" });
    expect(parse(String(stale?.stdout), {
      expectedHead: String(stale?.expectedHead),
      observedHead: String(stale?.observedHead),
    })).toEqual({
      kind: "stale-head",
      expectedHeadSha: "a".repeat(40),
      observedHeadSha: "b".repeat(40),
    });
    expect(parse("", { exitCode: null, signal: "SIGTERM" }))
      .toEqual({ kind: "failed", reason: "process-signal:SIGTERM" });
    expect(parse("", { exitCode: 2, stderr: "auth token=private-value denied" }))
      .toEqual({ kind: "failed", reason: "process-exit:2: auth token=[redacted] denied" });
    expect(parse(JSON.stringify({
      type: "error",
      message: "Review startup failed: token=private-value storage unavailable",
    }), { exitCode: 1 })).toEqual({
      kind: "failed",
      reason: "process-exit:1: Review startup failed: token=[redacted] storage unavailable",
    });
  });

  it.each([
    ["GITHUB_TOKEN=private-value", "GITHUB_TOKEN=[redacted]"],
    ["AWS_SECRET_ACCESS_KEY=private-value", "AWS_SECRET_ACCESS_KEY=[redacted]"],
    ["AWS_SECRET_ACCESS_KEY: private-value", "AWS_SECRET_ACCESS_KEY: [redacted]"],
    ["SECRET_KEY='private value'", "SECRET_KEY='[redacted]'"],
    ["{\"secret_key\":\"private-value\",\"next\":\"keep\"}", "{\"secret_key\":\"[redacted]\",\"next\":\"keep\"}"],
    ["PRIVATE_KEY=private-value", "PRIVATE_KEY=[redacted]"],
    ["SESSION_COOKIE=private-value", "SESSION_COOKIE=[redacted]"],
    ["credentials: private-value", "credentials: [redacted]"],
    ["tokens=private-value", "tokens=[redacted]"],
    ["{\"token\":\"private-value\",\"next\":\"keep\"}", "{\"token\":\"[redacted]\",\"next\":\"keep\"}"],
    ["BUILD_SECRET='private value'", "BUILD_SECRET='[redacted]'"],
    ["https://private-user@example.com/path", "https://[redacted]@example.com/path"],
    ["Authorization: Basic dXNlcjpwYXNz", "Authorization: [redacted]"],
    ["Authorization: Signature keyId=private signature=secret", "Authorization: [redacted]"],
    ["Authorization: Basic dXNlcjpwYXNz\nrequest failed", "Authorization: [redacted] request failed"],
  ])("redacts credential-bearing process output: %s", (stderr, detail) => {
    expect(parse("", { exitCode: 2, stderr }))
      .toEqual({ kind: "failed", reason: `process-exit:2: ${detail}` });
  });

  it("normalizes a structured provider file-cap refusal as unsupported capability", () => {
    const stdout = [
      { type: "review_context", reviewType: "committed" },
      { type: "status", phase: "setup", status: "setting_up" },
      {
        type: "error",
        errorType: "review",
        code: "too_many_files",
        message: "Review failed: Too many files!",
        recoverable: false,
        retryable: false,
        actionRequired: true,
        actualFiles: 359,
        maxFiles: 300,
        details: {},
      },
    ].map((event) => JSON.stringify(event)).join("\n");

    expect(parse(stdout, { cliVersion: "0.7.0", exitCode: 1 }))
      .toEqual({ kind: "capability-unsupported" });
  });
});
