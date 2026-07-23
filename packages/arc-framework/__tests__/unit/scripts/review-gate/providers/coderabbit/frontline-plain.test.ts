import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseCodeRabbitPlainResult } from "../../../../../../src/scripts/review-gate/providers/coderabbit/frontline-plain.js";

const fixtureUrl = new URL(
  "../../../../../fixtures/coderabbit-frontline/observations.json",
  import.meta.url,
);

async function fixture() {
  return JSON.parse(await readFile(fixtureUrl, "utf8")) as {
    plainObservations: Array<{ shape: string; stdout: string }>;
    syntheticInjectedCommandCases: Array<Record<string, unknown>>;
  };
}

describe("CodeRabbit plain frontline compatibility parser", () => {
  it("emits clean only for the pinned fixture-proven explicit marker", async () => {
    const observed = (await fixture()).plainObservations[0];
    expect(parseCodeRabbitPlainResult({
      cliVersion: "0.6.5",
      exitCode: 0,
      signal: null,
      stdout: observed?.stdout ?? "",
      stderr: "",
      expectedHead: "a".repeat(40),
      observedHead: "a".repeat(40),
    })).toEqual({ kind: "clean" });

    expect(parseCodeRabbitPlainResult({
      cliVersion: "0.6.5",
      exitCode: 0,
      signal: null,
      stdout: "Review complete\n",
      stderr: "",
      expectedHead: "a".repeat(40),
      observedHead: "a".repeat(40),
    })).toEqual({ kind: "malformed" });
  });

  it("maps synthetic rate-limit and stale-head fixtures without clean fallback", async () => {
    const cases = (await fixture()).syntheticInjectedCommandCases;
    const rateLimit = cases.find((item) => item.shape === "rate-limit");
    const stale = cases.find((item) => item.shape === "stale-head");

    expect(parseCodeRabbitPlainResult({
      cliVersion: "0.6.5",
      exitCode: Number(rateLimit?.exitCode),
      signal: null,
      stdout: String(rateLimit?.stdout),
      stderr: String(rateLimit?.stderr),
      expectedHead: "a".repeat(40),
      observedHead: "a".repeat(40),
    })).toEqual({ kind: "rate-limited" });
    expect(parseCodeRabbitPlainResult({
      cliVersion: "0.6.5",
      exitCode: Number(stale?.exitCode),
      signal: null,
      stdout: String(stale?.stdout),
      stderr: String(stale?.stderr),
      expectedHead: String(stale?.expectedHead),
      observedHead: String(stale?.observedHead),
    })).toEqual({
      kind: "stale-head",
      expectedHeadSha: "a".repeat(40),
      observedHeadSha: "b".repeat(40),
    });
  });

  it.each([
    [{ cliVersion: "0.7.0" }, "malformed"],
    [{ exitCode: 1, stderr: "review refused" }, "failed"],
    [{ exitCode: null, signal: "SIGTERM" }, "failed"],
    [{ stdout: "", stderr: "" }, "malformed"],
  ] as const)("keeps unsupported or failed output non-clean", (override, kind) => {
    expect(parseCodeRabbitPlainResult({
      cliVersion: "0.6.5",
      exitCode: 0,
      signal: null,
      stdout: "unknown output",
      stderr: "",
      expectedHead: "a".repeat(40),
      observedHead: "a".repeat(40),
      ...override,
    })).toMatchObject({ kind });
  });
});
