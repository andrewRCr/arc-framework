import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewReceiptV2 } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { ReviewOperationState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { projectLocalReviewGuidance } from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { DEFAULT_LOCAL_REVIEW_POLICY_BINDING } from "../../../../../src/scripts/review-gate/policy/local-review-policy.js";
import { createLocalReviewReceipt } from "../../../../../src/scripts/review-gate/runtime/local-attestation.js";
import {
  LocalPrepareRequestSchema,
  prepareLocalReview,
} from "../../../../../src/scripts/review-gate/runtime/local-prepare.js";

const objectId = (character: string): string => character.repeat(40);
const routingFacts = {
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
} as const;

describe("local review preparation request", () => {
  it("accepts exactly the five caller-owned routing facts", () => {
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    })).toEqual({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    });
  });

  it("preserves missing or malformed caller facts for conservative routing", () => {
    const routingFactsInput = {
      contentKind: "surprise",
      ownership: "self",
    };
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts: routingFactsInput,
    }).routingFacts).toEqual(routingFactsInput);
  });

  it.each([
    ["schemaVersion", 1],
    ["changeSetState", "known"],
    ["assurance", { workContext: "work-unit", workClass: "Light" }],
    ["activity", { selfReview: true, frontlineReview: true }],
  ] as const)("rejects caller-supplied derived routing field %s", (field, value) => {
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts: { ...routingFacts, [field]: value },
    })).toThrow();
  });

  it("converges concurrent identical preparations on the admitted operation", async () => {
    const target = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: "repo-1",
      baseRef: "main",
      diffBaseSha: objectId("a"),
      diffBaseTree: objectId("b"),
      headSha: objectId("c"),
      headTree: objectId("d"),
    });
    let persistedVersion = 0;
    let persistedState: ReviewOperationState | null = null;
    let persistedSource: LocalReviewSource | null = null;
    let initialReads = 0;
    let releaseInitialReads: (() => void) | undefined;
    const bothInitialReads = new Promise<void>((resolve) => {
      releaseInitialReads = resolve;
    });
    let clockTick = 0;
    const dependencies = {
      sweep: async () => undefined,
      withSourceLock: async <T>(action: () => Promise<T>) => action(),
      resolveRepositoryId: async () => target.repositoryId,
      deriveTarget: async () => target,
      confirmTarget: async () => ({ state: "current" as const, target }),
      resolveAuthority: async () => ({
        vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
        authorIdentity: "author-1",
        evaluatorIdentity: "evaluator-1",
        attestationRuntimeKind: "arc-cli",
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation" as const,
      }),
      composeAssurance: async () => ({
        status: "resolved" as const,
        assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
        activity: { selfReview: true, frontlineReview: true },
        guidance: projectLocalReviewGuidance(),
        diagnostics: [],
      }),
      resolvePolicy: () => ({
        status: "resolved" as const,
        binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
        diagnostics: [] as [],
      }),
      validatePolicySelection: () => undefined,
      operationStore: {
        readOperation: async () => {
          if (persistedState === null && initialReads < 2) {
            initialReads += 1;
            if (initialReads === 2) releaseInitialReads?.();
            await bothInitialReads;
            return { version: 0, state: null };
          }
          return { version: persistedVersion, state: persistedState };
        },
        publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
          if (persistedVersion !== expectedVersion) {
            throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
          }
          persistedVersion += 1;
          persistedState = state;
          return { version: persistedVersion };
        },
      },
      sourceStore: {
        readSource: async () => persistedSource,
        appendSource: async (source: LocalReviewSource) => {
          persistedSource = source;
          return { sourceRef: "sources/local.json" };
        },
      },
      readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
      describeSource: async (operationId: string) => createLocalReviewSource({
        schemaVersion: 1,
        semanticsVersion: "git-object-range/v1",
        repositoryId: target.repositoryId,
        targetId: target.targetId,
        objectFormat: "sha1",
        diffBaseSha: target.diffBaseSha,
        diffBaseTree: target.diffBaseTree,
        headSha: target.headSha,
        headTree: target.headTree,
        reachabilityRef: `refs/arc/review/local/${operationId}`,
        materializationRef: "/tmp/review-root",
      }),
      materialize: async () => ({ reviewRoot: "/tmp/review-root" }),
      now: () => `2026-07-23T17:00:0${clockTick++}Z`,
    };
    const request = {
      schemaVersion: 1 as const,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    };

    const prepared = await Promise.all([
      prepareLocalReview(request, dependencies),
      prepareLocalReview(request, dependencies),
    ]);
    const first = prepared[0];
    if (first?.state !== "ready") throw new Error("first concurrent preparation was not ready");

    expect(first).toMatchObject({
      state: "ready",
      nextAction: "launch-review",
      payload: { persistedVersion: 1 },
    });
    expect(prepared[1]).toMatchObject({
      state: "ready",
      nextAction: "launch-review",
      payload: {
        operationId: first.payload.operationId,
        persistedVersion: 1,
      },
    });
  });

  it.each(["clean", "findings"] as const)(
    "returns an existing completed %s operation for reduction without relaunching",
    async (result) => {
      const target = createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: objectId("a"),
        diffBaseTree: objectId("b"),
        headSha: objectId("c"),
        headTree: objectId("d"),
      });
      let persistedVersion = 0;
      let persistedState: ReviewOperationState | null = null;
      let persistedSource: LocalReviewSource | null = null;
      let receipts: ReviewReceiptV2[] = [];
      const materialize = vi.fn(async () => ({ reviewRoot: "/tmp/review-root" }));
      const dependencies = {
        sweep: async () => undefined,
        withSourceLock: async <T>(action: () => Promise<T>) => action(),
        resolveRepositoryId: async () => target.repositoryId,
        deriveTarget: async () => target,
        confirmTarget: async () => ({ state: "current" as const, target }),
        resolveAuthority: async () => ({
          vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
          authorIdentity: "author-1",
          evaluatorIdentity: "evaluator-1",
          attestationRuntimeKind: "arc-cli",
          runtimeIdentity: "arc-cli/0.1.0",
          attestationMechanism: "local-attestation" as const,
        }),
        composeAssurance: async () => ({
          status: "resolved" as const,
          assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
          activity: { selfReview: true, frontlineReview: true },
          guidance: projectLocalReviewGuidance(),
          diagnostics: [],
        }),
        resolvePolicy: () => ({
          status: "resolved" as const,
          binding: DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
          diagnostics: [] as [],
        }),
        validatePolicySelection: () => undefined,
        operationStore: {
          readOperation: async () => ({ version: persistedVersion, state: persistedState }),
          publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
            if (persistedVersion !== expectedVersion) throw new Error("version-conflict");
            persistedVersion += 1;
            persistedState = state;
            return { version: persistedVersion };
          },
        },
        sourceStore: {
          readSource: async () => persistedSource,
          appendSource: async (source: LocalReviewSource) => {
            persistedSource = source;
            return { sourceRef: "sources/local.json" };
          },
        },
        readReceipts: async () => ({ ledgerVersion: receipts.length, receipts }),
        describeSource: async (operationId: string) => createLocalReviewSource({
          schemaVersion: 1,
          semanticsVersion: "git-object-range/v1",
          repositoryId: target.repositoryId,
          targetId: target.targetId,
          objectFormat: "sha1",
          diffBaseSha: target.diffBaseSha,
          diffBaseTree: target.diffBaseTree,
          headSha: target.headSha,
          headTree: target.headTree,
          reachabilityRef: `refs/arc/review/local/${operationId}`,
          materializationRef: "/tmp/review-root",
        }),
        materialize,
        now: () => "2026-07-23T17:00:00Z",
      };
      const request = {
        schemaVersion: 1 as const,
        evaluatorIdentity: "evaluator-1",
        routingFacts,
      };

      const launched = await prepareLocalReview(request, dependencies);
      const state = persistedState as ReviewOperationState | null;
      const source = persistedSource as LocalReviewSource | null;
      if (launched.state !== "ready"
        || state === null
        || state.kind !== "local-review"
        || source === null) {
        throw new Error("local review was not prepared");
      }
      receipts = [createLocalReviewReceipt({
        target,
        requirement: state.requirement,
        carrier: {
          target,
          request: state.request,
          attestation: state.attestation,
        },
        result: {
          status: "complete",
          result,
          targetId: target.targetId,
          headSha: target.headSha,
          headTree: target.headTree,
          rubricVersion: state.requirement.rubricVersion,
          rubricDigest: state.requirement.rubricDigest,
          sourceDigest: source.sourceDigest,
          guidanceDigest: state.guidanceDigest,
          evaluatorIdentity: state.request.evaluatorIdentity,
          reviewRunId: `run-${result}`,
          applicabilityId: null,
          findings: result === "findings"
            ? [{
                findingId: "finding-1",
                severity: "major",
                locus: "src/index.ts:1",
                evidenceUrlOrId: "review:finding-1",
              }]
            : [],
        },
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation",
        sourceDigest: source.sourceDigest,
        guidanceDigest: state.guidanceDigest,
      })];

      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "review-complete",
        nextAction: "reduce",
        payload: {
          operationId: state.operationId,
          persistedVersion: 1,
          target,
        },
      });
      expect(materialize).toHaveBeenCalledOnce();
    },
  );
});
