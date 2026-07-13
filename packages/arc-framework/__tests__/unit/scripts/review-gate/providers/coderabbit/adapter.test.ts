import { describe, expect, it } from "vitest";

import type { ReviewRequest } from "../../../../../../src/scripts/review-gate/core/execution.js";
import {
  CodeRabbitProviderAdapter,
  CodeRabbitRequestError,
  CODERABBIT_SHADOW_CAPABILITIES,
  normalizeCodeRabbitRun,
  selectCodeRabbitRequestMechanism,
  type CodeRabbitApi,
  type CodeRabbitCapabilities,
  type CodeRabbitRunContext,
  type CodeRabbitSignal,
  type TriggerOutcome,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/adapter.js";

const BOT_ID = "136622811";
const DIFF_BASE = "c".repeat(40);
const HEAD = "d".repeat(40);

const acknowledgedTrigger = {
  eventKind: "label" as const,
  eventId: "TRIGGER_1",
  actorIdentity: "7",
  contentDigest: "e".repeat(64),
  occurredAt: "2026-07-11T12:01:00Z",
  headSha: HEAD,
};

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
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    generation: 0,
    actorIdentity: "7",
    requestMechanism: "automatic",
    requiredActorIdentity: "7",
    requestCommand: null,
    ...overrides,
  };
}

const capabilities: CodeRabbitCapabilities = {
  resolvedConfiguration: true,
  exclusiveLabelTrigger: true,
  labelOneShot: true,
  fullReviewCommand: true,
  exactCoverage: true,
  durableFindings: true,
  durableCleanResults: false,
  sourceConfirmedClosures: false,
};

function context(overrides: Partial<CodeRabbitRunContext> = {}): CodeRabbitRunContext {
  return {
    requestIdentity: "request-1",
    requirementId: "independent-analysis",
    policyVersion: "b".repeat(64),
    rubricVersion: "independent-analysis/v1",
    baseRef: "main",
    diffBaseSha: DIFF_BASE,
    headSha: HEAD,
    changeSetId: "a".repeat(64),
    coverage: "full",
    coverageFromSha: DIFF_BASE,
    coverageThroughSha: HEAD,
    reviewRunId: "run-1",
    observedAt: "2026-07-11T12:00:00Z",
    trigger: "controller",
    ...overrides,
  };
}

function findingSignals(overrides: Record<string, unknown> = {}): CodeRabbitSignal[] {
  return [
    { kind: "status", state: "success", headSha: HEAD },
    { kind: "review", nodeId: "PRR_1", state: "CHANGES_REQUESTED", headSha: HEAD, botUserId: BOT_ID, url: "https://github.com/acme/repo/pull/7#pullrequestreview-1" },
    {
      kind: "finding",
      findingId: "finding-1",
      commentNodeId: "PRRC_1",
      threadNodeId: "PRRT_1",
      reviewNodeId: "PRR_1",
      botUserId: BOT_ID,
      locus: "src/a.ts:7",
      severity: "high",
      url: "https://github.com/acme/repo/pull/7#discussion_r1",
      ...overrides,
    } as CodeRabbitSignal,
  ];
}

class MemoryApi implements CodeRabbitApi {
  current: "current" | "replay" | "stale" = "current";
  outcome: TriggerOutcome = {
    kind: "acknowledged",
    acknowledgedAt: "2026-07-11T12:01:00Z",
    trigger: acknowledgedTrigger,
  };
  capacity: "not-observable" | "lookup-failed" | "exhausted" = "not-observable";
  signals: CodeRabbitSignal[] = [];
  readonly triggers: string[] = [];
  cleanupFails = false;

  async validateCurrent(): Promise<"current" | "replay" | "stale"> { return this.current; }
  async applyTriggerLabel(): Promise<TriggerOutcome> { this.triggers.push("label"); return this.outcome; }
  async requestFullReview(): Promise<TriggerOutcome> { this.triggers.push("full-review"); return this.outcome; }
  async removeTriggerLabel(): Promise<void> {
    this.triggers.push("remove-label");
    if (this.cleanupFails) throw new Error("cleanup failed");
  }
  async readRunContext(): Promise<CodeRabbitRunContext> { return context(); }
  async readSignals(): Promise<CodeRabbitSignal[]> { return this.signals; }
  async readCapacity(): Promise<"not-observable" | "lookup-failed" | "exhausted"> { return this.capacity; }
}

describe("CodeRabbit request translation", () => {
  it("keeps label qualification disabled until resolved configuration proves exclusivity", () => {
    expect(() => selectCodeRabbitRequestMechanism(request(), CODERABBIT_SHADOW_CAPABILITIES))
      .toThrowError("configuration-unresolved");
  });

  it("selects the controller label only for generation zero and full review for refresh", () => {
    expect(selectCodeRabbitRequestMechanism(request(), capabilities)).toBe("label");
    expect(selectCodeRabbitRequestMechanism(request({ generation: 1 }), capabilities)).toBe("full-review-command");
  });

  it("rejects unsupported incremental refresh before reservation", () => {
    expect(() => selectCodeRabbitRequestMechanism(request({ generation: 1, coverage: "incremental" }), capabilities))
      .toThrow(CodeRabbitRequestError);
  });

  it("maps an admitted request to exactly one trigger and removes the one-shot label after acknowledgement", async () => {
    const api = new MemoryApi();
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
    await expect(adapter.request(request())).resolves.toMatchObject({ acknowledgedAt: "2026-07-11T12:01:00Z" });
    expect(api.triggers).toEqual(["label", "remove-label"]);
  });

  it("retains durable trigger provenance when the GitHub transport provides it", async () => {
    const api = new MemoryApi();
    api.outcome = {
      kind: "acknowledged",
      acknowledgedAt: "2026-07-11T12:01:00Z",
      durableRef: "https://github.test/pull/7#issuecomment-99",
      trigger: acknowledgedTrigger,
    };
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });

    await expect(adapter.request(request())).resolves.toMatchObject({
      durableRef: "https://github.test/pull/7#issuecomment-99",
      trigger: acknowledgedTrigger,
    });
  });

  it("removes the one-shot label when acknowledged provenance is invalid", async () => {
    const api = new MemoryApi();
    api.outcome = {
      kind: "acknowledged",
      acknowledgedAt: "2026-07-11T12:01:00Z",
      trigger: { ...acknowledgedTrigger, actorIdentity: "wrong-actor" },
    };
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
    await expect(adapter.request(request())).rejects.toMatchObject({ code: "trigger-provenance-mismatch" });
    expect(api.triggers).toEqual(["label", "remove-label"]);
  });

  it("keeps acknowledged label delivery successful when cleanup fails", async () => {
    const api = new MemoryApi();
    api.cleanupFails = true;
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });

    await expect(adapter.request(request())).resolves.toMatchObject({ acknowledgedAt: "2026-07-11T12:01:00Z" });
    expect(api.triggers).toEqual(["label", "remove-label"]);
  });

  it("does not trigger for replayed or stale requests", async () => {
    for (const current of ["replay", "stale"] as const) {
      const api = new MemoryApi();
      api.current = current;
      const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
      await expect(adapter.request(request())).rejects.toMatchObject({ code: current });
      expect(api.triggers).toEqual([]);
    }
  });

  it("blocks an ambiguous delivery without falling through to another mechanism", async () => {
    const api = new MemoryApi();
    api.outcome = { kind: "ambiguous" };
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
    await expect(adapter.request(request())).rejects.toMatchObject({ code: "ambiguous-delivery", effectAmbiguous: true });
    expect(api.triggers).toEqual(["label", "remove-label"]);
  });
});

describe("CodeRabbit observation and capacity", () => {
  it("does not treat COMMENTED, walkthrough text, or a success status without a review as clean evidence", () => {
    const cases: CodeRabbitSignal[][] = [
      [{ kind: "review", nodeId: "PRR_1", state: "COMMENTED", headSha: HEAD, botUserId: BOT_ID, url: "https://example.test/review" }],
      [{ kind: "walkthrough", text: "No actionable comments", mutable: true }],
      [{ kind: "status", state: "success", headSha: HEAD }],
    ];
    for (const signals of cases) {
      expect(normalizeCodeRabbitRun(context(), signals, capabilities, BOT_ID)).toMatchObject({ evidence: null });
    }
  });

  it("normalizes pending/failure/quota signals without converting capacity into policy", () => {
    expect(normalizeCodeRabbitRun(context(), [{ kind: "status", state: "pending", headSha: HEAD }], capabilities, BOT_ID).state).toBe("running");
    expect(normalizeCodeRabbitRun(context(), [{ kind: "status", state: "failure", headSha: HEAD }], capabilities, BOT_ID).state).toBe("failed");
    expect(normalizeCodeRabbitRun(context(), [{ kind: "quota-rejected", detail: "limit reached" }], capabilities, BOT_ID).state).toBe("unavailable");
  });

  it("admits a pinned substantive clean artifact only with proven exact durable capability", () => {
    const signal: CodeRabbitSignal = {
      kind: "clean",
      reviewNodeId: "PRR_clean",
      botUserId: BOT_ID,
      headSha: HEAD,
      url: "https://github.test/pull/7#pullrequestreview-clean",
    };
    expect(normalizeCodeRabbitRun(context(), [signal], {
      ...capabilities,
      durableCleanResults: true,
    }, BOT_ID)).toMatchObject({
      state: "clean",
      qualifying: true,
      evidence: { result: "clean", headSha: HEAD, findings: [] },
    });
  });

  it("keeps stale clean artifacts and unproven durable clean capability non-satisfying", () => {
    const signal: CodeRabbitSignal = {
      kind: "clean",
      reviewNodeId: "PRR_clean",
      botUserId: BOT_ID,
      headSha: "e".repeat(40),
      url: "https://github.test/review",
    };
    expect(normalizeCodeRabbitRun(context(), [signal], { ...capabilities, durableCleanResults: true }, BOT_ID))
      .toMatchObject({ qualifying: false, evidence: null });
    expect(normalizeCodeRabbitRun(context(), [{ ...signal, headSha: HEAD }], capabilities, BOT_ID))
      .toMatchObject({ qualifying: false, evidence: null, reasons: ["durable-clean-result-unproven"] });
  });

  it.each([
    ["not-observable", "unknown", "not-observable"],
    ["lookup-failed", "unknown", "lookup-failed"],
    ["exhausted", "exhausted", "provider-reported"],
  ] as const)("maps %s capacity with provenance", async (raw, status, reason) => {
    const api = new MemoryApi();
    api.capacity = raw;
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
    await expect(adapter.readCapacity("coderabbit-pr")).resolves.toMatchObject({ status, reason });
  });
});

describe("CodeRabbit durable finding qualification", () => {
  it("implements the neutral observation/normalization port without parsing provider prose", async () => {
    const api = new MemoryApi();
    api.signals = findingSignals();
    const adapter = new CodeRabbitProviderAdapter({ api, capabilities, expectedBotUserId: BOT_ID });
    const observations = await adapter.observe("request-1");
    await expect(adapter.normalizeEvidence(observations)).resolves.toMatchObject([
      { sourceIdentity: "coderabbit-pr", result: "findings" },
    ]);
  });

  it("normalizes exact immutable finding evidence bound to the pinned Bot and run", () => {
    const result = normalizeCodeRabbitRun(context(), findingSignals(), capabilities, BOT_ID);
    expect(result).toMatchObject({
      state: "findings",
      qualifying: true,
      evidence: {
        sourceIdentity: "coderabbit-pr",
        result: "findings",
        coverage: "full",
        findings: [{ findingId: "finding-1", locus: "src/a.ts:7" }],
        closures: [],
      },
    });
  });

  it.each([
    ["wrong bot", { botUserId: "999" }],
    ["missing thread", { threadNodeId: "" }],
    ["missing locus", { locus: "" }],
    ["wrong review", { reviewNodeId: "PRR_other" }],
  ])("keeps %s observations non-satisfying", (_name, override) => {
    expect(normalizeCodeRabbitRun(context(), findingSignals(override), capabilities, BOT_ID)).toMatchObject({
      qualifying: false,
      evidence: null,
    });
  });

  it("never derives closure from thread resolution or provider approval", () => {
    const signals = [
      ...findingSignals(),
      { kind: "thread-resolution", threadNodeId: "PRRT_1", resolvedByBotUserId: BOT_ID },
      { kind: "review", nodeId: "PRR_2", state: "APPROVED", headSha: HEAD, botUserId: BOT_ID, url: "https://example.test/approval" },
    ] as CodeRabbitSignal[];
    expect(normalizeCodeRabbitRun(context(), signals, capabilities, BOT_ID).evidence?.closures).toEqual([]);
  });

  it("marks independently triggered observations for unadmitted receipts", () => {
    expect(normalizeCodeRabbitRun(context({ trigger: "direct" }), findingSignals(), capabilities, BOT_ID))
      .toMatchObject({ receiptAction: "unadmitted" });
  });
});
