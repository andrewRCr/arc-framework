import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import { GitHubRestClient } from "../../../../../../src/scripts/review-gate/hosts/github/api/rest.js";
import {
  GitHubCodeRabbitTriggerApi,
  type CodeRabbitRequestLocator,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/github-trigger.js";
import { fetchFake, networkError, response, type FetchStep } from "../../hosts/github/api/fetch-fake.js";

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_node",
    changeSetId: "a".repeat(64),
    policyVersion: "b".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "independent-analysis",
    sourceIdentity: "coderabbit-pr",
    coverage: "full",
    coverageFromSha: "c".repeat(40),
    coverageThroughSha: "d".repeat(40),
    generation: 0,
    actorIdentity: "302312524",
    requestMechanism: "automatic",
    requiredActorIdentity: "302312524",
    requestCommand: null,
    ...overrides,
  };
}

function api(steps: FetchStep[], state: "current" | "replay" | "stale" = "current") {
  const fake = fetchFake(steps);
  const rest = new GitHubRestClient({ fetch: fake.fetch, token: "t", sleep: fake.sleep, maxReadAttempts: 1 });
  const locator: CodeRabbitRequestLocator = {
    resolve: async () => ({ state, pullNumber: 7 }),
  };
  return { api: new GitHubCodeRabbitTriggerApi({ rest, owner: "o", repo: "r", locator }), fake };
}

describe("GitHub CodeRabbit trigger API", () => {
  it("applies and removes the sole generation-zero label with durable acknowledgement", async () => {
    const { api: trigger, fake } = api([
      response(200, JSON.stringify([{ name: "arc-review-gate" }])),
      response(200, JSON.stringify([])),
    ]);

    await expect(trigger.applyTriggerLabel(request())).resolves.toMatchObject({
      kind: "acknowledged",
      durableRef: "github-label:7:arc-review-gate",
    });
    await expect(trigger.removeTriggerLabel(request())).resolves.toBeUndefined();
    expect(fake.calls.map((call) => [new URL(call.url).pathname, call.init.method])).toEqual([
      ["/repos/o/r/issues/7/labels", "POST"],
      ["/repos/o/r/issues/7/labels/arc-review-gate", "DELETE"],
    ]);
  });

  it("posts exactly one full-review command with GitHub comment provenance", async () => {
    const { api: trigger, fake } = api([
      response(201, JSON.stringify({
        id: 99,
        node_id: "IC_99",
        html_url: "https://github.test/pull/7#issuecomment-99",
        created_at: "2026-07-11T20:00:00Z",
      })),
    ]);

    await expect(trigger.requestFullReview(request({ generation: 1 }))).resolves.toEqual({
      kind: "acknowledged",
      acknowledgedAt: "2026-07-11T20:00:00Z",
      durableRef: "https://github.test/pull/7#issuecomment-99",
    });
    expect(JSON.parse(fake.calls[0]?.init.body ?? "{}")).toEqual({ body: "@coderabbitai full review" });
  });

  it.each(["replay", "stale"] as const)("performs no mutation for %s requests", async (state) => {
    const { api: trigger, fake } = api([], state);
    expect(await trigger.validateCurrent(request())).toBe(state);
    await expect(trigger.applyTriggerLabel(request())).resolves.toEqual({ kind: "rejected", reason: state });
    expect(fake.calls).toEqual([]);
  });

  it("keeps rejected delivery pre-effect and network loss terminally ambiguous", async () => {
    await expect(api([response(422, "{\"message\":\"unprocessable\"}")]).api.applyTriggerLabel(request()))
      .resolves.toMatchObject({ kind: "rejected" });
    await expect(api([networkError()]).api.requestFullReview(request({ generation: 1 })))
      .resolves.toEqual({ kind: "ambiguous" });
  });
});
