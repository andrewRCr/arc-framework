import { describe, expect, it } from "vitest";

import { createKernelRegistry } from "../../../../src/lib/kernel/index.js";
import {
  MergeLockCommandErrorEnvelopeSchema,
  MergeLockCommandModeSchema,
  MergeLockHoldEnvelopeSchema,
  MergeLockReleaseEnvelopeSchema,
  MergeLockResolveEnvelopeSchema,
  registerMergeLockCommandEnvelopeSchemas,
} from "../../../../src/scripts/review-gate/merge-lock-command-envelope.js";

const SHA = "a".repeat(40);

const TARGET_PAYLOAD = {
  repository: "owner/repo",
  pullRequest: 42,
  headSha: SHA,
};

function resolveEnvelopes() {
  return [
    {
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "locked",
      nextAction: "open-locked",
      payload: {},
    },
    {
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "none",
      nextAction: "open-plain",
      payload: {},
    },
    {
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [{ code: "config-unresolved", message: "arc-config.yml could not be read." }],
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    },
  ];
}

function transitionEnvelopes(mode: "merge-lock-hold" | "merge-lock-release", settled: "held" | "released") {
  return [
    {
      schemaVersion: 1,
      mode,
      diagnostics: [],
      state: settled,
      nextAction: "proceed",
      payload: TARGET_PAYLOAD,
    },
    {
      schemaVersion: 1,
      mode,
      diagnostics: [],
      state: "no-lock",
      nextAction: "none",
      payload: { ...TARGET_PAYLOAD, reason: "lock-disabled" },
    },
    {
      schemaVersion: 1,
      mode,
      diagnostics: [],
      state: "no-lock",
      nextAction: "none",
      payload: { ...TARGET_PAYLOAD, reason: "already-in-state" },
    },
    {
      schemaVersion: 1,
      mode,
      diagnostics: [{ code: "stale-head", message: "The requested SHA is not the exact live head." }],
      state: "blocked",
      nextAction: "stop",
      payload: { ...TARGET_PAYLOAD, reason: "stale-head" },
    },
  ];
}

describe("merge-lock command envelopes", () => {
  it("registers one contract per verb plus the shared error envelope", () => {
    const registry = registerMergeLockCommandEnvelopeSchemas(createKernelRegistry());

    for (const id of [
      "merge-lock-resolve-envelope",
      "merge-lock-hold-envelope",
      "merge-lock-release-envelope",
      "merge-lock-command-error-envelope",
    ]) {
      expect(registry.get(id)).toBeDefined();
      expect(registry.meta(id)).toMatchObject({ id, version: 1, migrationPosture: "strict-current" });
    }
  });

  it("validates each verb's results against its registered contract", () => {
    const registry = registerMergeLockCommandEnvelopeSchemas(createKernelRegistry());

    for (const [id, envelopes] of [
      ["merge-lock-resolve-envelope", resolveEnvelopes()],
      ["merge-lock-hold-envelope", transitionEnvelopes("merge-lock-hold", "held")],
      ["merge-lock-release-envelope", transitionEnvelopes("merge-lock-release", "released")],
    ] as const) {
      const schema = registry.get(id);
      if (schema === undefined) throw new Error(`${id} is not registered`);
      for (const envelope of envelopes) {
        expect(schema.parse(envelope)).toEqual(envelope);
      }
    }
  });

  it("round-trips every envelope variant through its schema unchanged", () => {
    for (const [schema, envelopes] of [
      [MergeLockResolveEnvelopeSchema, resolveEnvelopes()],
      [MergeLockHoldEnvelopeSchema, transitionEnvelopes("merge-lock-hold", "held")],
      [MergeLockReleaseEnvelopeSchema, transitionEnvelopes("merge-lock-release", "released")],
    ] as const) {
      for (const envelope of envelopes) {
        expect(schema.parse(schema.parse(envelope))).toEqual(envelope);
      }
    }
  });

  it("rejects a result carrying another verb's mode", () => {
    expect(() => MergeLockHoldEnvelopeSchema.parse({
      ...transitionEnvelopes("merge-lock-release", "released")[0],
    })).toThrow();
    expect(() => MergeLockReleaseEnvelopeSchema.parse({
      ...transitionEnvelopes("merge-lock-hold", "held")[0],
    })).toThrow();
    expect(() => MergeLockResolveEnvelopeSchema.parse({
      ...resolveEnvelopes()[0],
      mode: "merge-lock-hold",
    })).toThrow();
  });

  it("rejects a transition result carrying the other transition's settled state", () => {
    expect(() => MergeLockHoldEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "merge-lock-hold",
      diagnostics: [],
      state: "released",
      nextAction: "proceed",
      payload: TARGET_PAYLOAD,
    })).toThrow();
  });

  it("rejects a resolve payload carrying the pull-request triple", () => {
    expect(() => MergeLockResolveEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "locked",
      nextAction: "open-locked",
      payload: TARGET_PAYLOAD,
    })).toThrow();
  });

  it("validates each error variant under its own mode", () => {
    for (const mode of MergeLockCommandModeSchema.options) {
      for (const code of ["invalid-input", "corrupt-state", "unexpected-failure"] as const) {
        const envelope = {
          schemaVersion: 1,
          mode,
          diagnostics: [],
          error: { code, message: "failed" },
        };

        expect(MergeLockCommandErrorEnvelopeSchema.parse(envelope)).toEqual(envelope);
      }
    }
  });

  it("rejects an error variant carrying a review mode", () => {
    expect(() => MergeLockCommandErrorEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "review-unlock",
      diagnostics: [],
      error: { code: "invalid-input", message: "failed" },
    })).toThrow();
  });

  it("requires at least one diagnostic on a blocked result", () => {
    expect(() => MergeLockResolveEnvelopeSchema.parse({
      schemaVersion: 1,
      mode: "merge-lock-resolve",
      diagnostics: [],
      state: "blocked",
      nextAction: "stop",
      payload: { reason: "config-unresolved" },
    })).toThrow();
  });
});
