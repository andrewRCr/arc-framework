import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import {
  CodexProviderAdapter,
  buildCodexReviewCommand,
  normalizeCodexRun,
  type CodexApi,
  type CodexCapabilities,
  type CodexRunContext,
  type CodexSignal,
} from "../../../../../../src/scripts/review-gate/providers/codex/adapter.js";

const HEAD = "a".repeat(40);
const DIFF_BASE = "b".repeat(40);
const APP_ID = "1144995";
const BOT_ID = "199175422";

const capabilities: CodexCapabilities = {
  resolvedGuidance: true,
  actorRequiredRequest: true,
  exactFullCoverage: true,
  durableFindings: true,
  durableCleanResults: true,
  connectedAccountTerminal: false,
};

function request(overrides: Partial<ReviewRequest> = {}): ReviewRequest {
  return {
    schemaVersion: 1,
    repositoryId: "100",
    changeRequestId: "PR_1",
    changeSetId: "c".repeat(64),
    policyVersion: "d".repeat(64),
    semanticsVersion: "review-gate/v1",
    rubricVersion: "independent-analysis/v1",
    requirementId: "independent-analysis",
    sourceIdentity: "codex-pr",
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    generation: 0,
    actorIdentity: "302312524",
    requestMechanism: "user-trigger",
    requiredActorIdentity: "7",
    requestCommand: buildCodexReviewCommand("e".repeat(64)),
    ...overrides,
  };
}

function context(overrides: Partial<CodexRunContext> = {}): CodexRunContext {
  return {
    requestIdentity: "request-1",
    requirementId: "independent-analysis",
    policyVersion: "d".repeat(64),
    rubricVersion: "independent-analysis/v1",
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    headSha: HEAD,
    changeSetId: "c".repeat(64),
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    reviewRunId: "codex-run-1",
    observedAt: "2026-07-12T20:05:00Z",
    triggerEventId: "IC_trigger",
    triggerOccurredAt: "2026-07-12T20:00:00Z",
    guidanceDigest: "e".repeat(64),
    ...overrides,
  };
}

function cleanComment(overrides: Partial<Extract<CodexSignal, { kind: "issue-comment" }>> = {}): CodexSignal {
  return {
    kind: "issue-comment",
    nodeId: "IC_clean",
    appId: APP_ID,
    botUserId: BOT_ID,
    body: `Codex Review:\n\nDidn't find any major issues.\n\nReviewed commit: ${HEAD.slice(0, 12)}`,
    createdAt: "2026-07-12T20:04:00Z",
    updatedAt: "2026-07-12T20:04:00Z",
    resolvedCommitSha: HEAD,
    url: "https://github.test/pull/1#issuecomment-clean",
    ...overrides,
  };
}

describe("hosted Codex adapter", () => {
  it("builds an actor-required rubric command with the effective guidance digest", () => {
    expect(buildCodexReviewCommand("e".repeat(64))).toContain("@codex review");
    expect(buildCodexReviewCommand("e".repeat(64))).toContain("independent-analysis/v1");
    expect(buildCodexReviewCommand("e".repeat(64))).toContain("e".repeat(64));
  });

  it("normalizes an unedited pinned clean comment for the uniquely resolved exact head", () => {
    expect(normalizeCodexRun(context(), [cleanComment()], capabilities, { appId: APP_ID, botUserId: BOT_ID }))
      .toMatchObject({
        state: "clean",
        qualifying: true,
        evidence: { result: "clean", headSha: HEAD, findings: [] },
      });
  });

  it.each([
    ["edited", { updatedAt: "2026-07-12T20:06:00Z" }],
    ["stale", { resolvedCommitSha: "f".repeat(40) }],
    ["wrong app", { appId: "999" }],
    ["unknown grammar", { body: "Looks good" }],
    ["pre-trigger", { createdAt: "2026-07-12T19:59:00Z", updatedAt: "2026-07-12T19:59:00Z" }],
  ])("keeps %s clean comments non-satisfying", (_name, overrides) => {
    expect(normalizeCodexRun(
      context(),
      [cleanComment(overrides)],
      capabilities,
      { appId: APP_ID, botUserId: BOT_ID },
    )).toMatchObject({ qualifying: false, evidence: null });
  });

  it("normalizes full-commit findings correlated to the pinned submitted review", () => {
    const signals: CodexSignal[] = [{
      kind: "review",
      nodeId: "PRR_1",
      state: "COMMENTED",
      headSha: HEAD,
      botUserId: BOT_ID,
      url: "https://github.test/review/1",
      observedAt: "2026-07-12T20:04:00Z",
    }, {
      kind: "finding",
      findingId: "T_1",
      commentNodeId: "PRRC_1",
      threadNodeId: "T_1",
      reviewNodeId: "PRR_1",
      botUserId: BOT_ID,
      locus: "src/a.ts:7",
      severity: "high",
      url: "https://github.test/discussion/1",
    }];
    expect(normalizeCodexRun(context(), signals, capabilities, { appId: APP_ID, botUserId: BOT_ID }))
      .toMatchObject({
        state: "findings",
        qualifying: true,
        evidence: { result: "findings", findings: [{ findingId: "T_1", locus: "src/a.ts:7" }] },
      });
  });

  it("keeps connected-account grammar parser-only without live terminal qualification", () => {
    const signal = cleanComment({
      body: "Codex Review:\n\nConnect your ChatGPT account to use Codex.\nhttps://chatgpt.com/codex/settings/connectors",
      resolvedCommitSha: null,
    });
    expect(normalizeCodexRun(context(), [signal], capabilities, { appId: APP_ID, botUserId: BOT_ID }))
      .toMatchObject({ state: "unavailable", qualifying: false, evidence: null, reasons: ["connected-account-parser-only"] });
  });

  it("implements the neutral request and observation boundary", async () => {
    const api: CodexApi = {
      validateCurrent: async () => "current",
      resolveRequestGuidance: async () => ({ qualified: true, guidanceDigest: "e".repeat(64) }),
      acknowledgeUserTrigger: async () => ({
        kind: "acknowledged",
        acknowledgedAt: "2026-07-12T20:00:00Z",
        durableRef: "https://github.test/trigger",
        trigger: {
          eventKind: "comment",
          eventId: "IC_trigger",
          actorIdentity: "7",
          contentDigest: "f".repeat(64),
          occurredAt: "2026-07-12T20:00:00Z",
          headSha: HEAD,
        },
      }),
      readRunContext: async () => context(),
      readSignals: async () => [cleanComment()],
      readCapacity: async () => "not-observable",
    };
    const adapter = new CodexProviderAdapter({
      api,
      capabilities,
      expectedAppId: APP_ID,
      expectedBotUserId: BOT_ID,
    });
    await expect(adapter.request(request())).resolves.toMatchObject({ trigger: { eventId: "IC_trigger" } });
    await expect(adapter.normalizeEvidence(await adapter.observe("request-1"))).resolves.toMatchObject([
      { sourceIdentity: "codex-pr", result: "clean" },
    ]);
    await expect(adapter.qualifyRequest(request({ requestCommand: "@codex review" }))).resolves.toEqual({
      qualified: false,
      reason: "guidance-command-mismatch",
    });
  });
});
