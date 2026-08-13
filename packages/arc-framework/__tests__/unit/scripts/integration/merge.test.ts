/** Pinned integration merge behavior and fail-closed exits. */

import { describe, expect, it } from "vitest";

import {
  mergeIntegration,
  type IntegrationMergeDependencies,
} from "../../../../src/scripts/integration/merge.js";
import { replaceReviewSection } from "../../../../src/scripts/integration/merge-composition.js";
import { IntegrationCheckpointCompositionRecordSchema } from "../../../../src/scripts/integration/checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "../../../../src/scripts/integration/settlement-plan.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const checkpointHandle = `checkpoint-v1:${oid("c")}:${digest("e")}`;

function dependencies() {
  const state = { held: true, merged: false, posted: false };
  const value: IntegrationMergeDependencies = {
    readCheckpoint: async () => IntegrationCheckpointCompositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "integration-checkpoint-composition/v1",
      checkpointId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      workUnit: "example",
      approvedHead: oid("c"),
      settlementPlan: composeCanonicalSettlementPlan([]),
      reviewRecord: { markdown: null, dispositionIds: [] },
      mergeMethod: {
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        state: "validated",
        nextAction: "use-method",
        method: "merge",
        allowedMethods: ["merge"],
        policyFingerprint: digest("d"),
      },
      compositionDigest: digest("e"),
    }),
    executeSettlement: async () => ({ state: "settled", completedActions: 0 }),
    readStatus: async () => ({
      actualHead: oid("c"),
      lifecycleComplete: true,
      target: { repository: "owner/repo", pullRequest: 42, headSha: oid("c") },
    }),
    releaseLock: async () => {
      state.held = false;
      return { state: "released" };
    },
    holdLock: async () => {
      state.held = true;
      return { state: "held" };
    },
    awaitChecks: async () => ({
      schemaVersion: 1,
      mode: "review-checks-await",
      repository: "owner/repo",
      pullRequest: 42,
      headSha: oid("c"),
      state: "not-required",
      nextAction: "complete",
      checks: [],
    }),
    resolveMergeMethod: async () => ({
      schemaVersion: 1,
      mode: "review-merge-method-resolve",
      repository: "owner/repo",
      state: "validated",
      nextAction: "use-method",
      method: "merge",
      allowedMethods: ["merge"],
      policyFingerprint: digest("d"),
    }),
    postReviewRecord: async () => { state.posted = true; },
    readFinalDrift: async () => ({ verdict: "clean" }),
    mergePinned: async () => {
      state.merged = true;
      return { state: "merged" };
    },
  };
  return { value, state };
}

const request = { schemaVersion: 1 as const, workUnit: "example", checkpointHandle };

describe("integration merge", () => {
  it("replaces the pull-request Review section with the exact checkpointed record", () => {
    const record = "## Review\n\n- Local: clean\n- Triage: settled";

    expect(replaceReviewSection(
      "# Change\n\nIntro.\n\n## Review\n\nStale.\n\n## Notes\n\nKeep.\n",
      record,
    )).toBe(`# Change\n\nIntro.\n\n${record}\n## Notes\n\nKeep.\n`);
  });

  it("posts the persisted record and merges only the checkpointed head", async () => {
    const { value, state } = dependencies();

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({
      state: "merged",
      payload: { approvedHead: oid("c"), pullRequest: 42 },
    });
    expect(state).toEqual({ held: false, merged: true, posted: true });
  });

  it.each([
    ["settlement-invalidated", (deps: IntegrationMergeDependencies) => {
      deps.executeSettlement = async () => ({
        state: "invalidated",
        reason: "stale",
        dispositionId: digest("1"),
        completedActions: 0,
      });
    }],
    ["head-mismatch", (deps: IntegrationMergeDependencies) => {
      deps.readStatus = async () => ({
        actualHead: oid("f"),
        lifecycleComplete: true,
        target: { repository: "owner/repo", pullRequest: 42, headSha: oid("f") },
      });
    }],
    ["merge-method-moved", (deps: IntegrationMergeDependencies) => {
      deps.resolveMergeMethod = async () => ({
        schemaVersion: 1,
        mode: "review-merge-method-resolve",
        repository: "owner/repo",
        state: "validated",
        nextAction: "use-method",
        method: "squash",
        allowedMethods: ["merge", "squash"],
        policyFingerprint: digest("f"),
      });
    }],
    ["checks-failed", (deps: IntegrationMergeDependencies) => {
      deps.awaitChecks = async () => ({
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha: oid("c"),
        state: "failed",
        nextAction: "stop",
        checks: [{ name: "test", state: "failed" }],
      });
    }],
    ["drift-reconcile", (deps: IntegrationMergeDependencies) => {
      deps.readFinalDrift = async () => ({ verdict: "reconcile" });
    }],
  ] as const)("re-locks before returning %s", async (reason, arrange) => {
    const { value, state } = dependencies();
    arrange(value);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "invalidated", reason });
    expect(state.held).toBe(true);
    expect(state.merged).toBe(false);
  });

  it("resumes the same checkpoint after required checks reach their deadline", async () => {
    const { value, state } = dependencies();
    let attempts = 0;
    value.awaitChecks = async () => {
      attempts += 1;
      if (attempts === 1) {
        return {
          schemaVersion: 1,
          mode: "review-checks-await",
          repository: "owner/repo",
          pullRequest: 42,
          headSha: oid("c"),
          state: "pending",
          nextAction: "await",
          checks: [{ name: "test", state: "pending" }],
          elapsedMs: 600_000,
        };
      }
      return {
        schemaVersion: 1,
        mode: "review-checks-await",
        repository: "owner/repo",
        pullRequest: 42,
        headSha: oid("c"),
        state: "not-required",
        nextAction: "complete",
        checks: [],
      };
    };

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "awaiting-checks" });
    expect(state.held).toBe(false);
    expect(state.merged).toBe(false);

    await expect(mergeIntegration(request, value)).resolves.toMatchObject({ state: "merged" });
    expect(state.held).toBe(false);
    expect(state.merged).toBe(true);
  });
});
