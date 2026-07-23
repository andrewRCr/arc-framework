import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import {
  executeFrontlineRun,
  persistFrontlineRunPending,
  persistFrontlineRunOutcome,
  resolveFrontlineRun,
} from "../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";

const oid = (value: string): string => value.repeat(40);
const target = (head: string) => createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid(head),
  headTree: oid(head),
});
const source = {
  sourceId: "review-cli",
  kind: "command" as const,
  executable: "reviewer",
  argv: ["--plain"],
};
const policyVersion = canonicalDigest({ policy: "review" });

function memoryStore(): ReviewOperationStateStore & { records: Map<string, { version: number; state: ReviewOperationState }> } {
  const records = new Map<string, { version: number; state: ReviewOperationState }>();
  return {
    records,
    readOperation: async (operationId) => records.get(operationId) ?? { version: 0, state: null },
    publishOperation: async (state, expectedVersion) => {
      const current = records.get(state.operationId);
      const version = current?.version ?? 0;
      if (version !== expectedVersion) throw new Error("version-conflict");
      const next = { version: version + 1, state: ReviewOperationStateSchema.parse(state) };
      records.set(state.operationId, next);
      return { version: next.version };
    },
  };
}

function binding(overrides: Partial<Parameters<typeof resolveFrontlineRun>[1]> = {}) {
  return {
    target: target("c"),
    source,
    generation: 0,
    policyVersion,
    ...overrides,
  };
}

describe("frontline operation continuity", () => {
  it("records pending before execution and the durable outcome before terminal operation state", async () => {
    const store = memoryStore();
    const order: string[] = [];
    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target: target("c"),
      pass: 1,
      maxPasses: 2,
    });
    const outcomeStore = {
      readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
      appendOutcome: async () => {
        order.push("outcome");
        return { version: 1, outcomeRef: "outcomes/operation.json" };
      },
    };
    const publish = store.publishOperation;
    store.publishOperation = async (state, expectedVersion) => {
      order.push(state.kind === "frontline-run" && state.outcome === "pending" ? "pending" : "terminal");
      return publish(state, expectedVersion);
    };

    await expect(executeFrontlineRun({
      operationStore: store,
      outcomeStore,
      execute: async () => {
        order.push("execute");
        return {
          outcome,
          executableIdentity: {
            digest: canonicalDigest({ executable: "reviewer" }),
            qualifiedVersion: "reviewer/1.0.0",
          },
        };
      },
      now: () => "2026-07-23T19:00:00Z",
    }, binding())).resolves.toMatchObject({
      persistedVersion: 2,
      target: target("c"),
      outcomeRef: "outcomes/operation.json",
      outcomeDigest: expect.stringMatching(/^sha256:/u),
    });
    expect(order).toEqual(["pending", "execute", "outcome", "terminal"]);
  });

  it("reuses a durable outcome for an unchanged target, source, policy, and generation", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    expect(first).toMatchObject({ action: "execute", expectedVersion: 0, invalidatedBy: [] });
    if (first.action !== "execute") throw new Error("expected execution");
    await expect(persistFrontlineRunPending(store, {
      ...binding(),
      updatedAt: "2026-07-20T19:59:00Z",
      expectedVersion: first.expectedVersion,
    })).resolves.toMatchObject({ version: 1, state: { outcome: "pending", passCount: 0 } });
    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 1,
      state: { outcome: "pending", passCount: 0 },
    });

    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" },
      source,
      target: target("c"),
      pass: 1,
      maxPasses: 2,
    });
    await expect(persistFrontlineRunOutcome(store, {
      ...binding(),
      outcome,
      updatedAt: "2026-07-20T20:00:00Z",
      expectedVersion: 1,
    })).resolves.toMatchObject({ version: 2, state: { outcome: "clean", passCount: 1 } });

    await expect(resolveFrontlineRun(store, binding())).resolves.toMatchObject({
      action: "reuse",
      version: 2,
      state: { outcome: "clean", passCount: 1 },
    });
  });

  it("uses distinct operation keys when target, source, or generation changes", async () => {
    const store = memoryStore();
    const baseline = await resolveFrontlineRun(store, binding());
    const changed = await Promise.all([
      resolveFrontlineRun(store, binding({ target: target("d") })),
      resolveFrontlineRun(store, binding({ source: { ...source, sourceId: "other-reviewer" } })),
      resolveFrontlineRun(store, binding({ generation: 1 })),
    ]);

    expect(new Set([baseline, ...changed].map((result) => result.operationId)).size).toBe(4);
    for (const result of changed) expect(result).toMatchObject({ action: "execute", expectedVersion: 0 });
  });

  it("invalidates same-key state when policy or source binding changes", async () => {
    const store = memoryStore();
    const first = await resolveFrontlineRun(store, binding());
    if (first.action !== "execute") throw new Error("expected execution");
    await persistFrontlineRunOutcome(store, {
      ...binding(),
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "pass-cap-exhausted" }, source, target: target("c"), pass: 2, maxPasses: 2,
      }),
      updatedAt: "2026-07-20T20:00:00Z",
      expectedVersion: first.expectedVersion,
    });

    await expect(resolveFrontlineRun(store, binding({
      policyVersion: canonicalDigest({ policy: "changed" }),
    }))).resolves.toMatchObject({
      action: "execute",
      expectedVersion: 1,
      invalidatedBy: ["policy"],
    });
    await expect(resolveFrontlineRun(store, binding({
      source: { ...source, argv: ["--structured"] },
    }))).resolves.toMatchObject({
      action: "execute",
      expectedVersion: 1,
      invalidatedBy: ["source-binding"],
    });
  });

  it("blocks corrupt same-key identity and preserves optimistic publication conflicts", async () => {
    const store = memoryStore();
    const resolution = await resolveFrontlineRun(store, binding());
    if (resolution.action !== "execute") throw new Error("expected execution");
    const outcome = normalizeFrontlineOutcome({
      providerResult: { kind: "clean" }, source, target: target("c"), pass: 1, maxPasses: 1,
    });
    const published = await persistFrontlineRunOutcome(store, {
      ...binding(), outcome, updatedAt: "2026-07-20T20:00:00Z", expectedVersion: 0,
    });
    store.records.set(resolution.operationId, {
      version: published.version,
      state: { ...published.state, targetId: target("d").targetId },
    });
    await expect(resolveFrontlineRun(store, binding())).resolves.toEqual({
      action: "blocked",
      operationId: resolution.operationId,
      reason: "operation-identity-conflict",
    });
    await expect(persistFrontlineRunOutcome(store, {
      ...binding(), outcome, updatedAt: "2026-07-20T20:01:00Z", expectedVersion: 0,
    })).rejects.toThrow(/version-conflict/u);
  });
});
