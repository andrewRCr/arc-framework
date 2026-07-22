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

  it("fails closed on incomplete, skipped, duplicated, or unsupported output", () => {
    const complete = {
      type: "complete",
      status: "review_completed",
      findings: 1,
      reviewedFiles: ["src/index.ts"],
    };
    expect(parse(JSON.stringify(complete))).toEqual({ kind: "partial" });
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
    expect(parse(JSON.stringify({ ...complete, findings: 0 }), { cliVersion: "0.7.0" }))
      .toEqual({ kind: "malformed" });
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
    })).toEqual({ kind: "stale-head" });
    expect(parse("", { exitCode: null, signal: "SIGTERM" }))
      .toEqual({ kind: "failed", reason: "process-signal:SIGTERM" });
  });
});
