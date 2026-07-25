import { describe, expect, it } from "vitest";

import {
  resolveHostedFallback,
  type HostedFallbackOutcome,
} from "../../../../../src/scripts/review-gate/hosted/fallback.js";

describe("hosted source fallback", () => {
  it("selects the preferred available source", async () => {
    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      return Promise.resolve({ kind: "completed" as const });
    };
    const result = await resolveHostedFallback({
      schemaVersion: 1,
      providers: ["coderabbit-pr", "codex-pr"],
    }, { attempt });

    expect(result).toMatchObject({
      state: "selected",
      provider: "coderabbit-pr",
      attemptedProviders: [{ provider: "coderabbit-pr", outcome: "completed" }],
    });
    expect(attempts).toBe(1);
  });

  it.each(["rate-limited", "transient-unavailable"] as const)(
    "falls through on safe %s without consuming a pass",
    async (kind) => {
      const outcomes: HostedFallbackOutcome[] = [{ kind }, { kind: "completed" }];
      const result = await resolveHostedFallback({
        schemaVersion: 1,
        providers: ["coderabbit-pr", "codex-pr"],
      }, { attempt: () => Promise.resolve(outcomes.shift() ?? { kind: "terminal-failure" }) });

      expect(result).toMatchObject({
        state: "selected",
        provider: "codex-pr",
        consumedPass: true,
        attemptedProviders: [
          { provider: "coderabbit-pr", outcome: kind },
          { provider: "codex-pr", outcome: "completed" },
        ],
      });
    },
  );

  it.each([
    ["pending", "pending"],
    ["ambiguous-delivery", "ambiguous-delivery"],
    ["terminal-failure", "terminal-failure"],
  ] as const)("stops on %s without invoking the next source", async (kind, state) => {
    let attempts = 0;
    const attempt = () => {
      attempts += 1;
      return Promise.resolve({ kind });
    };
    const result = await resolveHostedFallback({
      schemaVersion: 1,
      providers: ["coderabbit-pr", "codex-pr"],
    }, { attempt });

    expect(result.state).toBe(state);
    expect(attempts).toBe(1);
  });

  it("fails explicitly for exhausted and unknown lists", async () => {
    const exhausted = await resolveHostedFallback({
      schemaVersion: 1,
      providers: ["coderabbit-pr", "codex-pr"],
    }, { attempt: () => Promise.resolve({ kind: "rate-limited" }) });
    const unknown = await resolveHostedFallback({
      schemaVersion: 1,
      providers: ["unknown-pr"],
    }, { attempt: () => Promise.resolve({ kind: "completed" }) });

    expect(exhausted).toMatchObject({
      state: "exhausted",
      attemptedProviders: [
        { provider: "coderabbit-pr", outcome: "rate-limited" },
        { provider: "codex-pr", outcome: "rate-limited" },
      ],
    });
    expect(unknown).toMatchObject({ state: "invalid-source-list", unknownProviders: ["unknown-pr"] });
  });

  it("identifies duplicate configured providers separately from unknown providers", async () => {
    const result = await resolveHostedFallback({
      schemaVersion: 1,
      providers: ["coderabbit-pr", "coderabbit-pr"],
    }, { attempt: () => Promise.resolve({ kind: "completed" }) });

    expect(result).toMatchObject({
      state: "invalid-source-list",
      unknownProviders: [],
      duplicateProviders: ["coderabbit-pr"],
    });
  });
});
