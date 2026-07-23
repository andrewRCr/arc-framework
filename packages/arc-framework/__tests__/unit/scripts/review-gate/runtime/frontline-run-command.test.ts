import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  ReviewOperationStateSchema,
  type ReviewOperationState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewOperationStateStore } from "../../../../../src/scripts/review-gate/core/ports.js";
import { normalizeFrontlineOutcome } from "../../../../../src/scripts/review-gate/policy/frontline-outcome.js";
import { runFrontlineReviewCommand } from "../../../../../src/scripts/review-gate/runtime/frontline-run-command.js";

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
const resolution = {
  schemaVersion: 1,
  mode: "review-frontline-resolve",
  diagnostics: [],
  state: "ready",
  nextAction: "run-frontline",
  payload: {
    routing: { decision: "review" },
    frontlineReview: {
      schemaVersion: 1,
      semanticsVersion: "frontline-review/v1",
      action: "attempt",
      reasons: ["routine-code"],
      source,
      maxPasses: 2,
      promptText: "Review the aggregate candidate.",
    },
    pass: 2,
    maxPasses: 2,
  },
} as const;

describe("frontline run command", () => {
  it("refuses when the exact-head checkout re-derives different target coordinates", async () => {
    const execute = vi.fn();
    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: target("c"),
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: target("d"),
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      operationStore: {
        readOperation: vi.fn(),
        publishOperation: vi.fn(),
      },
      outcomeStore: {
        readOutcome: vi.fn(),
        appendOutcome: vi.fn(),
      },
      now: () => "2026-07-23T19:00:00Z",
    })).rejects.toThrow(/target/iu);
    expect(execute).not.toHaveBeenCalled();
  });

  it("takes pass only from the ready resolution and emits durable terminal coordinates", async () => {
    const reviewTarget = target("c");
    const execute = vi.fn(async (input: {
      pass: 1 | 2;
      maxPasses: 1 | 2;
    }) => ({
      outcome: normalizeFrontlineOutcome({
        providerResult: { kind: "clean" },
        source,
        target: reviewTarget,
        pass: input.pass,
        maxPasses: input.maxPasses,
      }),
      executableIdentity: {
        digest: canonicalDigest({ executable: "reviewer" }),
        qualifiedVersion: "reviewer/1.0.0",
      },
    }));
    const records = new Map<string, { version: number; state: ReviewOperationState }>();
    const operationStore: ReviewOperationStateStore = {
      readOperation: async (operationId: string) => records.get(operationId) ?? { version: 0, state: null },
      publishOperation: async (state, expectedVersion) => {
        const current = records.get(state.operationId);
        if ((current?.version ?? 0) !== expectedVersion) throw new Error("version-conflict");
        records.set(state.operationId, {
          version: expectedVersion + 1,
          state: ReviewOperationStateSchema.parse(state),
        });
        return { version: expectedVersion + 1 };
      },
    };

    await expect(runFrontlineReviewCommand({
      schemaVersion: 1,
      target: reviewTarget,
      resolution,
    }, {
      confirmSource: async () => source,
      prepareExecutionTarget: async () => ({
        target: reviewTarget,
        reviewRoot: "/tmp/review",
        release: vi.fn(),
      }),
      execute,
      operationStore,
      outcomeStore: {
        readOutcome: async () => ({ version: 0, record: null, outcomeRef: null }),
        appendOutcome: async () => ({ version: 1, outcomeRef: "outcomes/run.json" }),
      },
      now: () => "2026-07-23T19:00:00Z",
    })).resolves.toMatchObject({
      state: "clean",
      nextAction: "none",
      payload: {
        persistedVersion: 2,
        target: reviewTarget,
        outcomeRef: "outcomes/run.json",
        outcomeDigest: expect.stringMatching(/^sha256:/u),
      },
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      pass: 2,
      maxPasses: 2,
      reviewRoot: "/tmp/review",
    }));
  });
});
