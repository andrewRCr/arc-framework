import { describe, expect, it } from "vitest";

import { parseAggregateAwaitState } from "../../../../../../src/scripts/review-gate/hosts/github/await-observation.js";

const HEAD = "a".repeat(40);
const CHANGE_SET = "b".repeat(64);

function check(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "review-gate-shadow",
    head_sha: HEAD,
    external_id: `arc-review-gate:7:${CHANGE_SET}:review-gate-shadow`,
    app: { id: 91 },
    output: {
      summary: `<!-- arc-review-gate-state:v1:${Buffer.from(JSON.stringify({
        schemaVersion: 1,
        conclusion: "pending",
        blockerCodes: [],
        ledgerVersion: 4,
        receiptRefs: ["receipt:1"],
      })).toString("base64url")} -->`,
    },
    ...overrides,
  };
}

describe("aggregate await observation", () => {
  it("pins App, check name, stable external id, PR, and exact head", () => {
    expect(parseAggregateAwaitState([check(), check({ app: { id: 92 } })], {
      expectedAppId: "91",
      contextName: "review-gate-shadow",
      pullRequestNumber: 7,
      headSha: HEAD,
    })).toEqual({ conclusion: "pending", blockerCodes: [], ledgerVersion: 4, receiptRefs: ["receipt:1"] });
  });

  it("waits for an aggregate projection that has not been published yet", () => {
    const scope = { expectedAppId: "91", contextName: "review-gate-shadow" as const, pullRequestNumber: 7, headSha: HEAD };
    expect(parseAggregateAwaitState([], scope)).toEqual({
      conclusion: "pending",
      blockerCodes: ["projection-pending"],
      ledgerVersion: null,
      receiptRefs: [],
    });
  });

  it("fails closed for duplicate or malformed authoritative projections", () => {
    const scope = { expectedAppId: "91", contextName: "review-gate-shadow" as const, pullRequestNumber: 7, headSha: HEAD };
    expect(() => parseAggregateAwaitState([check(), check()], scope)).toThrow("malformed-or-ambiguous-aggregate-projection");
    expect(() => parseAggregateAwaitState([check({ output: { summary: "human prose" } })], scope))
      .toThrow("malformed-or-ambiguous-aggregate-projection");
  });
});
