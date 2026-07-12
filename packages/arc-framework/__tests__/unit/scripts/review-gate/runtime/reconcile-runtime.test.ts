import { describe, expect, it, vi } from "vitest";

import type { NormalizedChangeRequest } from "../../../../../src/scripts/review-gate/core/contracts.js";
import type {
  ReceiptAppendResult,
  ReceiptLedger,
  ReviewReceiptStore,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import type {
  ReceiptEnvelope,
  ReviewReceipt,
  ReviewRequest,
  SourceCapacity,
} from "../../../../../src/scripts/review-gate/core/execution.js";
import { planBeginFix } from "../../../../../src/scripts/review-gate/core/head-mutability.js";
import { computeChangeSetId, computePolicyVersion } from "../../../../../src/scripts/review-gate/core/identity.js";
import { computeRequestKey, createReceipt } from "../../../../../src/scripts/review-gate/core/request-key.js";
import type {
  ActorAddress,
  GitHostAdapter,
  HostChangeRequestResolution,
  LifecycleTailProofAdapter,
  NativeReviewObservation,
  ReviewProviderAdapter,
  VerdictPublicationInput,
} from "../../../../../src/scripts/review-gate/core/ports.js";
import type { CapabilitySet } from "../../../../../src/scripts/review-gate/core/contracts.js";
import {
  SELF_HOSTING_POLICY,
  type SelfHostingPolicy,
} from "../../../../../src/scripts/review-gate/policy/self-hosting/schema.js";
import {
  SelfHostingReconcileRuntime,
  type ReconcileRuntimeDependencies,
} from "../../../../../src/scripts/review-gate/runtime/reconcile-runtime.js";
import { reconcile } from "../../../../../src/scripts/review-gate/runtime/reconcile.js";

const HOST_REF = "github:o/r/pull/7";
const DIFF_BASE = "b".repeat(40);
const HEAD = "c".repeat(40);
const NOW = new Date("2026-07-11T20:00:00.000Z");
const APP_BOT = SELF_HOSTING_POLICY.providerIdentities.appBotUserId;

const changeRequest: NormalizedChangeRequest = {
  schemaVersion: 1,
  repositoryId: "100",
  changeRequestId: "PR_node",
  hostRef: HOST_REF,
  baseRef: "main",
  baseSha: "a".repeat(40),
  diffBaseSha: DIFF_BASE,
  headSha: HEAD,
  changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: HEAD }),
};

const nativeObservation: NativeReviewObservation = {
  nativeReview: { requestedChanges: false, unresolvedRequiredConversations: 0, decision: "not-configured" },
  peerApprovals: [],
  closures: [],
  providerReviews: [],
};

function capabilities(actorIdentity: string, permissions: CapabilitySet["permissions"]): CapabilitySet {
  return { schemaVersion: 1, actorIdentity, permissions };
}

function availableCapacity(sourceIdentity: string): SourceCapacity {
  return {
    schemaVersion: 1,
    sourceIdentity,
    status: "available",
    reason: "provider-reported",
    provenance: `capacity:${sourceIdentity}`,
    observedAt: NOW.toISOString(),
  };
}

function coderabbitPolicy(): SelfHostingPolicy {
  const [coderabbit, ...rest] = SELF_HOSTING_POLICY.qualifications;
  if (coderabbit === undefined) throw new Error("missing CodeRabbit policy fixture");
  return {
    ...SELF_HOSTING_POLICY,
    qualifications: [
      {
        ...coderabbit,
        enabled: true,
        exactCoverage: true,
        durableResults: true,
        distinctOutcomes: true,
        closureCapability: true,
      },
      ...rest,
    ],
  };
}

/** Version-checked in-memory receipt store faithful to the append/replay contract. */
class InMemoryReceiptStore implements ReviewReceiptStore {
  envelopes: ReceiptEnvelope[] = [];
  version = 0;
  ledger: ReceiptLedger | null = null;
  authorizedActor: string | null = null;

  async readLedger(): Promise<ReceiptLedger> {
    if (this.ledger !== null) return this.ledger;
    return { kind: "valid", ledgerVersion: this.version, receipts: this.envelopes };
  }

  async appendReceipt(receipt: ReviewReceipt, expected: number): Promise<ReceiptAppendResult> {
    const replay = this.envelopes.find((entry) => entry.receipt.idempotencyKey === receipt.idempotencyKey);
    if (replay !== undefined) {
      return { ledgerVersion: replay.ledgerVersion, durableEvidenceRef: replay.durableRecordId };
    }
    if (this.authorizedActor !== null && receipt.request.actorIdentity !== this.authorizedActor) {
      throw new Error("unauthorized-write");
    }
    if (this.version !== expected || receipt.previousLedgerVersion !== expected) {
      throw new Error("version-conflict");
    }
    this.version += 1;
    const envelope: ReceiptEnvelope = {
      schemaVersion: 1,
      durableRecordId: `record-${this.version}`,
      recordedAt: NOW.toISOString(),
      lastModifiedAt: NOW.toISOString(),
      ledgerVersion: this.version,
      receipt,
    };
    this.envelopes.push(envelope);
    return { ledgerVersion: this.version, durableEvidenceRef: envelope.durableRecordId };
  }
}

interface HarnessOverrides {
  policy?: SelfHostingPolicy;
  store?: InMemoryReceiptStore;
  resolveActorCapabilities?: (actor: ActorAddress) => Promise<CapabilitySet>;
  confirmPendingProjection?: GitHostAdapter["confirmPendingProjection"];
  deps?: Partial<ReconcileRuntimeDependencies>;
}

function harness(overrides: HarnessOverrides = {}) {
  const store = overrides.store ?? new InMemoryReceiptStore();
  const publishCalls: VerdictPublicationInput[] = [];
  const requestCalls: unknown[] = [];
  const resolveActorCapabilities = overrides.resolveActorCapabilities
    ?? (async (actor: ActorAddress) => capabilities(actor.expectedActorId, ["write"]));

  const host: GitHostAdapter = {
    resolveChangeRequest: async (): Promise<HostChangeRequestResolution> => ({
      changeRequest,
      context: {
        changedPaths: [],
        author: { identity: "author-1", login: "author" },
        isDraft: false,
        isCrossRepository: false,
        mergeability: "mergeable",
      },
    }),
    resolveActorCapabilities,
    observeNativeReview: async () => nativeObservation,
    publishVerdict: async (input) => {
      publishCalls.push(input);
      return [{ opaqueRef: "projection-1" }];
    },
    confirmPendingProjection: overrides.confirmPendingProjection ?? (async () => true),
  };
  const provider: ReviewProviderAdapter = {
    readCapacity: async (sourceIdentity) => availableCapacity(sourceIdentity),
    request: async (request) => {
      requestCalls.push(request);
      return { requestIdentity: "request-1", acknowledgedAt: NOW.toISOString(), durableRef: "receipt:ack" };
    },
    observe: async () => [],
    normalizeEvidence: async () => [],
  };
  const noTail: LifecycleTailProofAdapter = { resolveLifecycleTail: async () => null };

  const deps: ReconcileRuntimeDependencies = {
    policy: overrides.policy ?? SELF_HOSTING_POLICY,
    host,
    store,
    provider,
    lifecycleTailAdapter: noTail,
    coordinates: { repositoryId: 100, pullRequestNumber: 7, hostRef: HOST_REF },
    mode: "shadow",
    expectedAppId: "4268856",
    resolveCiState: async () => "success",
    resolveLane: async () => ({ lane: "reviewed", reasons: ["non-lane-path"] }),
    resolveRisk: () => ({ risk: "routine", reasons: ["routine-doc-surface"] }),
    listCommandComments: async () => [],
    ...overrides.deps,
  };
  return { runtime: new SelfHostingReconcileRuntime(deps), store, publishCalls, requestCalls, provider };
}

describe("SelfHostingReconcileRuntime", () => {
  it("assembles canonical state from live resolution", async () => {
    const { runtime } = harness();
    const state = await runtime.read();

    expect(state).toMatchObject({
      repositoryId: 100,
      pullRequestNumber: 7,
      headSha: HEAD,
      policyVersion: computePolicyVersion({ policy: SELF_HOSTING_POLICY }),
      ledgerVersion: 0,
    });
    expect(state.permissionVersion).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("fails closed when reduce runs against a state the cached read did not produce", async () => {
    const { runtime } = harness();
    const state = await runtime.read();

    await expect(runtime.reduce(state, NOW)).resolves.toBeTruthy();
    await expect(runtime.reduce({ ...state, headSha: "d".repeat(40) }, NOW)).rejects.toThrow(/matching cached read/u);
  });

  it("enforces the self-hosting runtime's single-requirement invariant", async () => {
    const first = SELF_HOSTING_POLICY.requirementTemplates[0];
    if (first === undefined) throw new Error("missing requirement fixture");
    const policy: SelfHostingPolicy = {
      ...SELF_HOSTING_POLICY,
      requirementTemplates: [first, { ...first, id: "independent-analysis-secondary" }],
    };
    const { runtime } = harness({ policy });

    await expect(runtime.read()).rejects.toThrow(/at most one requirement/u);
  });

  it("flips permissionVersion only when the author's resolved permission changes", async () => {
    const byActor = new Map<string, CapabilitySet>([["author-1", capabilities("author-1", ["write"])]]);
    const resolveActorCapabilities = async (actor: ActorAddress) =>
      byActor.get(actor.expectedActorId) ?? capabilities(actor.expectedActorId, []);
    const { runtime } = harness({ resolveActorCapabilities });

    const first = await runtime.read();
    const second = await runtime.read();
    expect(second.permissionVersion).toBe(first.permissionVersion);

    byActor.set("author-1", capabilities("author-1", ["write", "maintain"]));
    const third = await runtime.read();
    expect(third.permissionVersion).not.toBe(first.permissionVersion);
  });

  it("keeps an attestation-only obligation pending with no automatic request", async () => {
    const { runtime } = harness({ deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) } });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);

    expect(decision.request).toBeNull();
    expect(decision.projection.conclusion).toBe("pending");
  });

  it("admits one controller-authored provider request under an enabled qualified policy", async () => {
    const { runtime } = harness({
      policy: coderabbitPolicy(),
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);

    expect(decision.request).toMatchObject({
      sourceIdentity: "coderabbit-pr",
      generation: 0,
      coverage: "full",
      actorIdentity: APP_BOT,
    });
  });

  it("drives the reserve-confirm-invoke-acknowledge protocol through the provider", async () => {
    const { runtime, store, requestCalls } = harness({
      policy: coderabbitPolicy(),
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);
    if (decision.request === null) throw new Error("expected an admitted request");

    const reserved = await runtime.reserve(decision.request, 0);
    if (reserved === null) throw new Error("expected a confirmed reservation");
    const result = await runtime.execute(decision.request, reserved.envelope);

    expect(result).toEqual({ status: "acknowledged", invoked: true });
    expect(requestCalls).toHaveLength(1);
    expect(store.envelopes.map((entry) => entry.receipt.action)).toEqual(["reserved", "acknowledged"]);
  });

  it("consumes an exact begin-fix transition before admitting follow-up review on the new head", async () => {
    const policy = coderabbitPolicy();
    const oldHead = "f".repeat(40);
    const oldRequest: ReviewRequest = {
      schemaVersion: 1,
      repositoryId: changeRequest.repositoryId,
      changeRequestId: changeRequest.changeRequestId,
      changeSetId: computeChangeSetId({ baseRef: "main", diffBaseSha: DIFF_BASE, headSha: oldHead }),
      policyVersion: computePolicyVersion({ policy }),
      semanticsVersion: "review-gate/v1",
      rubricVersion: "independent-analysis/v1",
      requirementId: "independent-analysis",
      sourceIdentity: "coderabbit-pr",
      coverage: "full",
      coverageFromSha: DIFF_BASE,
      coverageThroughSha: oldHead,
      generation: 0,
      actorIdentity: APP_BOT,
      requestMechanism: "automatic",
      requiredActorIdentity: APP_BOT,
      requestCommand: null,
    };
    const reserved = createReceipt({
      eventId: "old-reserved", previousLedgerVersion: 0, action: "reserved", request: oldRequest,
      result: null, evidenceUrlOrId: null, findingIds: [],
      payload: { kind: "reservation", reservedAt: null, pendingProjectionRef: null },
    });
    const acknowledged = createReceipt({
      eventId: "old-acknowledged", previousLedgerVersion: 1, action: "acknowledged", request: oldRequest,
      result: null, evidenceUrlOrId: "trigger-1", findingIds: [],
      payload: {
        kind: "acknowledgement", acknowledgedAt: NOW.toISOString(), acknowledgementRef: "trigger-1",
        trigger: {
          mechanism: "automatic", eventId: "trigger-1", actorIdentity: APP_BOT,
          occurredAt: NOW.toISOString(), headSha: oldHead,
        },
      },
    });
    const terminal = createReceipt({
      eventId: "old-findings", previousLedgerVersion: 2, action: "attested", request: oldRequest,
      result: "findings", evidenceUrlOrId: "review-1", findingIds: ["finding-1"],
      payload: {
        kind: "terminal-evidence", terminalAt: NOW.toISOString(), evidenceRefs: ["review-1"],
        findingIds: ["finding-1"],
      },
      evidence: {
        schemaVersion: 1, requirementId: oldRequest.requirementId, sourceKind: "agent",
        sourceIdentity: oldRequest.sourceIdentity, result: "findings", evidenceUrlOrId: "review-1",
        policyVersion: oldRequest.policyVersion, rubricVersion: oldRequest.rubricVersion,
        coverage: "full", coverageFromSha: DIFF_BASE, coverageThroughSha: oldHead,
        baseRef: "main", diffBaseSha: DIFF_BASE, changeSetId: oldRequest.changeSetId, headSha: oldHead,
        findings: [{ findingId: "finding-1", severity: "high", locus: "src/file.ts", evidenceUrlOrId: "review-1" }],
        closures: [], observedAt: NOW.toISOString(),
      },
    });
    const begin = planBeginFix({
      receipts: [reserved, acknowledged, terminal],
      terminalRequestKey: computeRequestKey(oldRequest),
      actorIdentity: "author-1",
      authorizedActorIdentities: ["author-1"],
      targetHeadSha: HEAD,
      carriedFindingIds: ["finding-1"],
      expectedLedgerVersion: 3,
      authorizedAt: NOW,
    });
    if (!begin.ok) throw new Error(begin.reason);
    const store = new InMemoryReceiptStore();
    for (const receipt of [reserved, acknowledged, terminal, begin.receipt]) {
      await store.appendReceipt(receipt, store.version);
    }
    const { runtime, requestCalls } = harness({
      policy,
      store,
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });

    const result = await reconcile(runtime, NOW);

    expect(result.status).toBe("published");
    expect(store.envelopes.map((envelope) => envelope.receipt.action)).toEqual([
      "reserved", "acknowledged", "attested", "begin-fix", "head-update-consumed", "superseded", "finding-opened",
      "reserved", "acknowledged",
    ]);
    expect(requestCalls).toHaveLength(1);
  });

  it("confirms pending only for the matching request generation and ledger projection", async () => {
    const { runtime } = harness({
      policy: coderabbitPolicy(),
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);
    if (decision.request === null) throw new Error("expected an admitted request");
    const reserved = await runtime.reserve(decision.request, 0);
    if (reserved === null) throw new Error("expected a confirmed reservation");

    expect(await runtime.confirmPending(
      decision.request,
      reserved.envelope,
      { ...decision.projection, conclusion: "pending", ledgerVersion: 0 },
    )).toBe(false);
    expect(await runtime.confirmPending(
      { ...decision.request, generation: 1 },
      reserved.envelope,
      { ...decision.projection, conclusion: "pending", ledgerVersion: 1 },
    )).toBe(false);
  });

  it("orchestrates durable pending publication and confirmation before provider execution", async () => {
    const { runtime, store, publishCalls, requestCalls } = harness({
      policy: coderabbitPolicy(),
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });

    await expect(reconcile(runtime, NOW)).resolves.toMatchObject({ status: "published" });
    expect(store.envelopes.map((entry) => entry.receipt.action)).toEqual(["reserved", "acknowledged"]);
    expect(publishCalls).toHaveLength(2);
    expect(publishCalls[0]?.projection).toMatchObject({
      conclusion: "pending",
      ledgerVersion: 1,
      requirementExecutions: [{ state: "queued" }],
    });
    expect(requestCalls).toHaveLength(1);
  });

  it("leaves the durable reservation pending when the host projection cannot be confirmed", async () => {
    const { runtime, store, publishCalls, requestCalls } = harness({
      policy: coderabbitPolicy(),
      confirmPendingProjection: async () => false,
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });

    await expect(reconcile(runtime, NOW)).resolves.toEqual({ status: "pending-unconfirmed", effect: null });
    expect(store.envelopes.map((entry) => entry.receipt.action)).toEqual(["reserved"]);
    expect(publishCalls).toHaveLength(1);
    expect(requestCalls).toHaveLength(0);
  });

  it("records a terminal failure at the expected ledger version when invocation is ambiguous", async () => {
    const { runtime, store, provider } = harness({
      policy: coderabbitPolicy(),
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    provider.request = vi.fn(async () => { throw new Error("ambiguous delivery"); });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);
    if (decision.request === null) throw new Error("expected an admitted request");

    const reserved = await runtime.reserve(decision.request, 0);
    if (reserved === null) throw new Error("expected a confirmed reservation");
    const result = await runtime.execute(decision.request, reserved.envelope);

    expect(result).toEqual({ status: "invocation-ambiguous", invoked: true });
    expect(store.envelopes.map((entry) => entry.receipt.action)).toEqual(["reserved", "terminal-failure"]);
  });

  it("authors a controller reservation despite an unknown fork author", async () => {
    const resolveActorCapabilities = async (actor: ActorAddress) => {
      if (actor.expectedActorId === "author-1") throw new Error("no collaborator access");
      return capabilities(actor.expectedActorId, ["write"]);
    };
    const { runtime } = harness({
      policy: coderabbitPolicy(),
      resolveActorCapabilities,
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);

    expect(decision.request).toMatchObject({ actorIdentity: APP_BOT });
  });

  it("rejects an append the store does not authorize for the controller bot", async () => {
    const store = new InMemoryReceiptStore();
    store.authorizedActor = "someone-else";
    const { runtime } = harness({
      policy: coderabbitPolicy(),
      store,
      deps: { resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }) },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);
    if (decision.request === null) throw new Error("expected an admitted request");

    await expect(runtime.reserve(decision.request, 0)).rejects.toThrow(/unauthorized-write/u);
  });

  it("projects a degraded ledger as a current failure without an effect", async () => {
    const store = new InMemoryReceiptStore();
    store.ledger = { kind: "degraded", diagnostics: ["ledger-unavailable"], observedLedgerVersion: null, receipts: [] };
    const command = {
      commentId: 1,
      commentNodeId: "IC_require",
      actor: { login: "maintainer", expectedActorId: "maintainer-1" },
      actorNodeId: "U_maintainer",
      body: "/review-gate require independent-analysis needs a second look",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      durableRef: "https://github.test/pull/7#issuecomment-1",
    };
    const { runtime } = harness({
      store,
      resolveActorCapabilities: async (actor) => capabilities(actor.expectedActorId, ["maintain"]),
      deps: {
        resolveRisk: () => ({ risk: "sensitive", reasons: ["code-surface"] }),
        listCommandComments: async () => [command],
      },
    });

    const state = await runtime.read();
    expect(state.ledgerVersion).toBeNull();

    const decision = await runtime.reduce(state, NOW);
    expect(decision.request).toBeNull();
    expect(decision.receiptsToAppend).toEqual([]);
    expect(decision.requestReservation).toBeNull();
    expect(decision.projection).toMatchObject({
      conclusion: "failure",
      blockers: expect.arrayContaining([expect.objectContaining({ code: "ledger-unavailable" })]),
    });
  });

  it("applies an authorized require command surfaced from PR comments", async () => {
    const requirementScopeComment = {
      commentId: 1,
      commentNodeId: "IC_require",
      actor: { login: "maintainer", expectedActorId: "maintainer-1" },
      actorNodeId: "U_maintainer",
      body: "/review-gate require independent-analysis needs a second look",
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
      durableRef: "https://github.test/pull/7#issuecomment-1",
    };
    const resolveActorCapabilities = async (actor: ActorAddress) =>
      actor.expectedActorId === "maintainer-1"
        ? capabilities("maintainer-1", ["write", "maintain"])
        : capabilities(actor.expectedActorId, ["write"]);

    const baseline = harness();
    const baseState = await baseline.runtime.read();
    expect((await baseline.runtime.reduce(baseState, NOW)).projection.conclusion).toBe("success");

    const { runtime } = harness({
      resolveActorCapabilities,
      deps: { listCommandComments: async () => [requirementScopeComment] },
    });
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);

    expect(decision.projection.conclusion).toBe("pending");
    expect(decision.projection.requirementExecutions[0]).toMatchObject({
      requirementId: "independent-analysis",
      state: "not-requested",
    });
  });

  it("delegates publication to the host adapter with the configured mode and app id", async () => {
    const { runtime, publishCalls } = harness();
    const state = await runtime.read();
    const decision = await runtime.reduce(state, NOW);
    await runtime.publish(decision.projection);

    expect(publishCalls).toHaveLength(1);
    expect(publishCalls[0]).toMatchObject({
      projection: decision.projection,
      mode: "shadow",
      expectedAppId: "4268856",
      headSha: HEAD,
    });
  });
});
