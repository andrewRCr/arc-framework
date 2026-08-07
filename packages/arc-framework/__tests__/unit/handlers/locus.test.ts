/** User-visible output coverage for the read-only locus handler. */

import { describe, expect, it } from "vitest";

import { runLocusCli } from "../../../src/handlers/locus.js";
import type { LocusEnvelope } from "../../../src/commands/locus.js";

const ROW = {
  checkout: {
    path: "/repo/work",
    head: "a".repeat(40),
    branch: "feat/reader",
    detached: false,
    primary: false,
  },
  markerGeneration: `sha256:${"b".repeat(64)}`,
  parentCheckoutPath: "/repo",
  origin: null,
  identity: null,
  context: null,
  lifecycleLocation: "active" as const,
  diagnostics: [],
  kind: "work-unit" as const,
  subject: { kind: "work-unit" as const, key: "reader" },
};

const SUCCESS: LocusEnvelope = {
  mode: "locus",
  ok: true,
  roster: [ROW],
  entering: { kind: "selected", row: ROW },
  primaryAvailability: { kind: "unsafe", checkoutPath: null, reasons: ["primary-missing"] },
  identityDiscovery: { kind: "absent" },
  active: null,
};

function capture() {
  let stdout = "";
  let stderr = "";
  let exitCode: number | undefined;
  return {
    output: {
      stdout: (text: string) => { stdout += text; },
      stderr: (text: string) => { stderr += text; },
      exit: (code: number) => { exitCode = code; },
    },
    read: () => ({ stdout, stderr, exitCode }),
  };
}

describe("runLocusCli", () => {
  it("renders the derived checkout, role, subject, and parent without retired state", async () => {
    const sink = capture();

    await runLocusCli({ json: false }, { read: async () => SUCCESS, output: sink.output });

    expect(sink.read()).toEqual({
      stdout: [
        "Checkout: /repo/work",
        "Role: work-unit",
        "Subject: work-unit:reader",
        "Parent checkout: /repo",
        "",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    });
  });

  it("emits exactly one validated JSON envelope", async () => {
    const sink = capture();

    await runLocusCli({ json: true }, { read: async () => SUCCESS, output: sink.output });

    const result = sink.read();
    expect(JSON.parse(result.stdout)).toStrictEqual(SUCCESS);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("renders row-local diagnostics in the human display", async () => {
    const sink = capture();
    const diagnosticRow = {
      ...ROW,
      diagnostics: [{ code: "marker-malformed", source: "marker", message: "Marker is malformed" }],
    };
    const envelope: LocusEnvelope = {
      ...SUCCESS,
      roster: [diagnosticRow],
      entering: { kind: "selected", row: diagnosticRow },
    };

    await runLocusCli({ json: false }, { read: async () => envelope, output: sink.output });

    expect(sink.read().stdout).toContain("Diagnostic: marker-malformed Marker is malformed");
  });

  it("routes a human reader error only to stderr", async () => {
    const sink = capture();
    const envelope: LocusEnvelope = {
      mode: "locus",
      ok: false,
      error: { code: "identity-missing", message: "ARC identity is unavailable" },
    };

    await runLocusCli({ json: false }, { read: async () => envelope, output: sink.output });

    expect(sink.read()).toEqual({
      stdout: "",
      stderr: "Error [identity-missing]: ARC identity is unavailable\n",
      exitCode: 1,
    });
  });
});
