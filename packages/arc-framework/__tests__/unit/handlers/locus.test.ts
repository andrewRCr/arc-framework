/** User-visible output coverage for the read-only locus handler. */

import { describe, expect, it } from "vitest";

import { runLocusCli } from "../../../src/handlers/locus.js";
import type { LocusEnvelopeV1 } from "../../../src/lib/locus/schema/index.js";

const SUCCESS: LocusEnvelopeV1 = {
  mode: "locus",
  ok: true,
  primaryPath: "/repo",
  rows: [
    {
      kind: "managed-role",
      checkoutPath: "/repo/work",
      primary: false,
      recordId: `sha256:${"1".repeat(64)}`,
      role: {
        kind: "work-unit",
        subject: { kind: "work-unit", key: "reader", claimId: null },
        parentCheckoutPath: null,
        dispatchId: null,
        originEntry: null,
        routingPlanDigest: null,
      },
      identity: null,
      lease: {
        leaseId: "a".repeat(32),
        state: "live",
        sessionHomePath: "/repo/work",
        attachedAt: "2026-07-20T12:00:00.000Z",
        heartbeatAt: "2026-07-20T12:01:00.000Z",
      },
      frame: "active",
      derived: {
        workflow: "process-task-loop",
        stage: null,
        sessionType: "execution",
        taskCursor: null,
        loadSet: null,
      },
      diagnostics: [],
    },
  ],
  diagnostics: [],
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
  it("renders deterministic human output with every operational field", async () => {
    const sink = capture();

    await runLocusCli({ json: false }, { read: async () => SUCCESS, output: sink.output });

    expect(sink.read()).toEqual({
      stdout: [
        "Primary: /repo",
        "Checkout: /repo/work",
        "Role: work-unit (work-unit:reader)",
        "Lease: live",
        "Session home: /repo/work",
        "Active locus: active",
        "Workflow/stage: process-task-loop / -",
        "",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
    });
  });

  it("emits one JSON envelope and succeeds when the roster has diagnostics", async () => {
    const sink = capture();
    const envelope: LocusEnvelopeV1 = {
      ...SUCCESS,
      diagnostics: [{
        code: "lease-unknown",
        source: { kind: "record", key: "locus-reader.json" },
        message: "Lease liveness is unavailable",
      }],
    };

    await runLocusCli({ json: true }, { read: async () => envelope, output: sink.output });

    expect(sink.read()).toEqual({
      stdout: `${JSON.stringify(envelope)}\n`,
      stderr: "",
      exitCode: 0,
    });
  });

  it.each([
    "identity-missing",
    "identity-root-unavailable",
    "git-topology-unavailable",
    "record-root-unavailable",
  ] as const)("emits the %s root error as JSON and exits one", async (code) => {
    const sink = capture();
    const envelope: LocusEnvelopeV1 = {
      mode: "locus",
      ok: false,
      error: { code, message: `${code} message` },
    };

    await runLocusCli({ json: true }, { read: async () => envelope, output: sink.output });

    expect(sink.read()).toEqual({
      stdout: `${JSON.stringify(envelope)}\n`,
      stderr: "",
      exitCode: 1,
    });
  });

  it("routes a human root error only to stderr", async () => {
    const sink = capture();
    const envelope: LocusEnvelopeV1 = {
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

  it("renders an identity-only subject when no durable role exists", async () => {
    const sink = capture();
    const identity = {
      kind: "errand" as const,
      key: "review-docs",
      claimId: "b".repeat(32),
      protection: "full" as const,
      branch: "chore/review-docs",
      purpose: "errand" as const,
      origin: "description" as const,
      originEntry: null,
      dispatchId: null,
      state: "paused" as const,
      savedHead: "c".repeat(40),
      changeRequest: null,
    };
    const envelope: LocusEnvelopeV1 = {
      mode: "locus",
      ok: true,
      primaryPath: "/repo",
      rows: [{
        kind: "identity-only",
        checkoutPath: null,
        primary: null,
        recordId: null,
        role: null,
        identity,
        lease: null,
        frame: "idle",
        derived: null,
        diagnostics: [],
      }],
      diagnostics: [],
    };

    await runLocusCli({ json: false }, { read: async () => envelope, output: sink.output });

    expect(sink.read().stdout).toContain("Role: identity-only (errand:review-docs)");
  });
});
