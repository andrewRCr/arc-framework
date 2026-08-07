import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import type { ReviewReceiptV2 } from "../../../../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import type { ReviewOperationState } from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import { createLocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import type { LocalReviewSource } from "../../../../../src/scripts/review-gate/core/local-review-source.js";
import { projectLocalReviewGuidance } from "../../../../../src/scripts/review-gate/policy/local-review-guidance.js";
import { DEFAULT_LOCAL_REVIEW_POLICY_BINDING } from "../../../../../src/scripts/review-gate/policy/local-review-policy.js";
import { attestLocalReviewCommand } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
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

  it("carries an optional member selector without any other verb surface", () => {
    const memberHeadObjectId = objectId("e");
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      memberHeadObjectId,
    }).memberHeadObjectId).toBe(memberHeadObjectId);
    expect(LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    }).memberHeadObjectId).toBeUndefined();
    expect(() => LocalPrepareRequestSchema.parse({
      schemaVersion: 1,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
      memberHeadObjectId: "not-an-object-id",
    })).toThrow();
  });

  it("hands the request's member selector to authority resolution, and nothing when absent", async () => {
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
    // Refusing at resolution isolates the hand-off: nothing downstream has to be stubbed.
    const resolveAuthority = vi.fn(async () => {
      throw new Error("delivery-member-unbound");
    });
    const dependencies = {
      sweep: async () => undefined,
      resolveRepositoryId: async () => target.repositoryId,
      deriveTarget: async () => target,
      resolveAuthority,
    } as unknown as Parameters<typeof prepareLocalReview>[1];
    const request = { schemaVersion: 1 as const, evaluatorIdentity: "evaluator-1", routingFacts };

    await expect(prepareLocalReview(
      { ...request, memberHeadObjectId: objectId("e") },
      dependencies,
    )).rejects.toThrow(/delivery-member-unbound/u);
    expect(resolveAuthority).toHaveBeenCalledWith("evaluator-1", objectId("e"));

    resolveAuthority.mockClear();
    await expect(prepareLocalReview(request, dependencies)).rejects.toThrow(/delivery-member-unbound/u);
    expect(resolveAuthority).toHaveBeenCalledWith("evaluator-1", undefined);
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

  describe("member preparation", () => {
    const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;

    function fixture() {
      const targetOf = (kind: "change-set" | "delivery-member", seed: string) => createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind,
        repositoryId: "repo-1",
        baseRef: "main",
        diffBaseSha: objectId(seed),
        diffBaseTree: objectId("b"),
        headSha: objectId(seed === "a" ? "c" : "f"),
        headTree: objectId("d"),
      });
      const changeSetTarget = targetOf("change-set", "a");
      const memberTarget = targetOf("delivery-member", "e");
      const memberCoordinates = {
        base: memberTarget.diffBaseSha,
        head: memberTarget.headSha,
      };

      // Keyed by operation and source ref, so two vehicles over one repository
      // address separate records rather than overwriting a single slot.
      const operations = new Map<string, { version: number; state: ReviewOperationState }>();
      const sources = new Map<string, LocalReviewSource>();
      let lastPublished: ReviewOperationState | null = null;
      let clockTick = 0;

      const authorityOf = (vehicle: { kind: string; identity: string }) => ({
        vehicle,
        authorIdentity: "author-1",
        evaluatorIdentity: "evaluator-1",
        attestationRuntimeKind: "arc-cli",
        runtimeIdentity: "arc-cli/0.1.0",
        attestationMechanism: "local-attestation" as const,
      });
      const resolveAuthority = vi.fn(async (
        _evaluatorIdentity: string,
        memberHeadObjectId?: string,
      ) => (memberHeadObjectId === undefined
        ? { authority: authorityOf({ kind: "work-unit", identity: "review-surface-binding" }), member: null }
        : { authority: authorityOf({ kind: "delivery-member", identity: DELIVERABLE_ID }), member: memberCoordinates }
      ));
      const deriveTarget = vi.fn(async (
        _repositoryId: string,
        member?: { base: string; head: string },
      ) => (member === undefined ? changeSetTarget : memberTarget));
      const describeSource = vi.fn(async (operationId: string, target: typeof memberTarget) => (
        createLocalReviewSource({
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
        })
      ));
      const materialize = vi.fn(async () => ({ reviewRoot: "/tmp/review-root" }));

      const dependencies = {
        sweep: async () => undefined,
        withSourceLock: async <T>(action: () => Promise<T>) => action(),
        resolveRepositoryId: async () => "repo-1",
        deriveTarget,
        confirmTarget: async (target: typeof memberTarget) => ({ state: "current" as const, target }),
        resolveAuthority,
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
          readOperation: async (operationId: string) => (
            operations.get(operationId) ?? { version: 0, state: null }
          ),
          publishOperation: async (state: ReviewOperationState, expectedVersion: number) => {
            const current = operations.get(state.operationId)?.version ?? 0;
            if (current !== expectedVersion) {
              throw Object.assign(new Error("version-conflict"), { code: "version-conflict" });
            }
            const version = current + 1;
            operations.set(state.operationId, { version, state });
            lastPublished = state;
            return { version };
          },
        },
        sourceStore: {
          readSource: async (sourceRef: string) => sources.get(sourceRef) ?? null,
          appendSource: async (source: LocalReviewSource) => {
            const sourceRef = `sources/${source.targetId}.json`;
            sources.set(sourceRef, source);
            return { sourceRef };
          },
        },
        readReceipts: async () => ({ ledgerVersion: 0, receipts: [] }),
        describeSource,
        materialize,
        now: () => `2026-08-06T17:00:0${clockTick++}Z`,
      } as unknown as Parameters<typeof prepareLocalReview>[1];

      return {
        dependencies,
        memberTarget,
        changeSetTarget,
        memberCoordinates,
        deriveTarget,
        describeSource,
        materialize,
        resolveAuthority,
        operations,
        published: () => lastPublished,
      };
    }

    const request = {
      schemaVersion: 1 as const,
      evaluatorIdentity: "evaluator-1",
      routingFacts,
    };

    it("publishes a member vehicle over a member target when a selector is supplied", async () => {
      const context = fixture();

      await expect(prepareLocalReview(
        { ...request, memberHeadObjectId: context.memberTarget.headSha },
        context.dependencies,
      )).resolves.toMatchObject({ state: "ready", nextAction: "launch-review" });

      const state = context.published();
      expect(state).toMatchObject({
        kind: "local-review",
        vehicle: { kind: "delivery-member", identity: DELIVERABLE_ID },
        targetId: context.memberTarget.targetId,
        target: { kind: "delivery-member" },
      });
    });

    it("feeds the resolution's recorded shas to derivation, and none without a selector", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, memberHeadObjectId: context.memberTarget.headSha },
        context.dependencies,
      );
      expect(context.deriveTarget).toHaveBeenCalledWith("repo-1", context.memberCoordinates);

      const plain = fixture();
      await prepareLocalReview(request, plain.dependencies);
      expect(plain.deriveTarget).toHaveBeenCalledWith("repo-1", undefined);
    });

    it("refuses an unresolvable vehicle before a dirty worktree", async () => {
      const context = fixture();
      const deriveTarget = vi.fn(async () => {
        throw new Error("dirty-worktree");
      });
      const resolveAuthority = vi.fn(async () => {
        throw new Error("vehicle-unresolved");
      });

      await expect(prepareLocalReview(request, {
        ...context.dependencies,
        deriveTarget,
        resolveAuthority,
      } as unknown as Parameters<typeof prepareLocalReview>[1]))
        .rejects.toThrow(/vehicle-unresolved/u);
      expect(deriveTarget).not.toHaveBeenCalled();
    });

    it("carries the member's pinned head through the source descriptor and materialization", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, memberHeadObjectId: context.memberTarget.headSha },
        context.dependencies,
      );

      expect(context.describeSource).toHaveBeenCalledWith(expect.any(String), context.memberTarget);
      expect(context.materialize).toHaveBeenCalledWith(expect.objectContaining({
        headSha: context.memberTarget.headSha,
        diffBaseSha: context.memberTarget.diffBaseSha,
      }));
    });

    it("snapshots the member's base ref and recorded diff base into the admission carrier", async () => {
      const context = fixture();

      await prepareLocalReview(
        { ...request, memberHeadObjectId: context.memberTarget.headSha },
        context.dependencies,
      );

      const state = context.published();
      expect(state).toMatchObject({
        target: {
          baseRef: "main",
          diffBaseSha: context.memberCoordinates.base,
          headSha: context.memberCoordinates.head,
        },
      });
      // The carrier's snapshot is built from that same target, so a request bound
      // to it carries the member's coordinates rather than the control branch's.
      expect(state?.kind === "local-review" && state.request.targetId)
        .toBe(context.memberTarget.targetId);
    });

    it("preserves the no-selector path in a work-unit context", async () => {
      const context = fixture();

      await expect(prepareLocalReview(request, context.dependencies))
        .resolves.toMatchObject({ state: "ready" });

      expect(context.published()).toMatchObject({
        vehicle: { kind: "work-unit", identity: "review-surface-binding" },
        targetId: context.changeSetTarget.targetId,
        target: { kind: "change-set" },
      });
    });

    it("preserves the no-selector path in an Errand context", async () => {
      const context = fixture();
      const resolveAuthority = vi.fn(async () => ({
        authority: {
          vehicle: { kind: "errand" as const, identity: "repair-review-state" },
          authorIdentity: "author-1",
          evaluatorIdentity: "evaluator-1",
          attestationRuntimeKind: "arc-cli",
          runtimeIdentity: "arc-cli/0.1.0",
          attestationMechanism: "local-attestation" as const,
        },
        member: null,
      }));

      await expect(prepareLocalReview(request, {
        ...context.dependencies,
        resolveAuthority,
      } as unknown as Parameters<typeof prepareLocalReview>[1]))
        .resolves.toMatchObject({ state: "ready" });

      expect(context.published()).toMatchObject({
        vehicle: { kind: "errand", identity: "repair-review-state" },
        target: { kind: "change-set" },
      });
      expect(context.deriveTarget).toHaveBeenCalledWith("repo-1", undefined);
    });

    describe("re-entrant admission", () => {
      it("resolves the existing record when the same member is prepared again", async () => {
        const context = fixture();
        const memberRequest = {
          ...request,
          memberHeadObjectId: context.memberTarget.headSha,
        };

        const first = await prepareLocalReview(memberRequest, context.dependencies);
        const second = await prepareLocalReview(memberRequest, context.dependencies);
        if (first.state !== "ready" || second.state !== "ready") {
          throw new Error("member re-preparation was not ready");
        }

        expect(second.payload.operationId).toBe(first.payload.operationId);
        expect(context.operations.size).toBe(1);
      });

      it("holds distinct operation identities for a member and a work unit in one repository", async () => {
        const context = fixture();

        const member = await prepareLocalReview(
          { ...request, memberHeadObjectId: context.memberTarget.headSha },
          context.dependencies,
        );
        const workUnit = await prepareLocalReview(request, context.dependencies);
        if (member.state !== "ready" || workUnit.state !== "ready") {
          throw new Error("member and work-unit preparation were not both ready");
        }

        // The operation key is derived from the target, so the two vehicles never
        // collide on one key — the second admits fresh rather than mismatching.
        expect(workUnit.payload.operationId).not.toBe(member.payload.operationId);
        expect(context.operations.size).toBe(2);
        expect(context.published()).toMatchObject({
          vehicle: { kind: "work-unit", identity: "review-surface-binding" },
          targetId: context.changeSetTarget.targetId,
        });
      });

      it("admits a separate ordinary operation when the selector is forgotten", async () => {
        const context = fixture();

        await prepareLocalReview(
          { ...request, memberHeadObjectId: context.memberTarget.headSha },
          context.dependencies,
        );
        // A forgotten selector silently reviews the control branch rather than the
        // member; on the dirty locus that is normal there, derivation refuses first.
        await expect(prepareLocalReview(request, context.dependencies))
          .resolves.toMatchObject({ state: "ready" });

        const admitted = [...context.operations.values()].map(({ state }) => state.kind === "local-review"
          && state.vehicle.kind);
        expect(admitted).toEqual(["delivery-member", "work-unit"]);
      });
    });
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
        authority: {
          vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
          authorIdentity: "author-1",
          evaluatorIdentity: "evaluator-1",
          attestationRuntimeKind: "arc-cli",
          runtimeIdentity: "arc-cli/0.1.0",
          attestationMechanism: "local-attestation" as const,
        },
        member: null,
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
      let runtimeIdentity = "arc-cli/0.1.0";
      const materialize = vi.fn(async () => ({ reviewRoot: "/tmp/review-root" }));
      const dependencies = {
        sweep: async () => undefined,
        withSourceLock: async <T>(action: () => Promise<T>) => action(),
        resolveRepositoryId: async () => target.repositoryId,
        deriveTarget: async () => target,
        confirmTarget: async () => ({ state: "current" as const, target }),
        resolveAuthority: async () => ({
          authority: {
            vehicle: { kind: "work-unit" as const, identity: "review-surface-binding" },
            authorIdentity: "author-1",
            evaluatorIdentity: "evaluator-1",
            attestationRuntimeKind: "arc-cli",
            runtimeIdentity,
            attestationMechanism: "local-attestation" as const,
          },
          member: null,
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
      const source = persistedSource as LocalReviewSource | null;
      const initialState = persistedState as ReviewOperationState | null;
      if (launched.state !== "ready"
        || initialState === null
        || initialState.kind !== "local-review"
        || source === null) {
        throw new Error("local review was not prepared");
      }
      runtimeIdentity = "arc-cli/0.2.0";
      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "ready",
        nextAction: "launch-review",
        payload: {
          operationId: initialState.operationId,
          persistedVersion: 2,
        },
      });
      const state = persistedState as ReviewOperationState | null;
      if (state === null || state.kind !== "local-review") {
        throw new Error("local review runtime binding was not renewed");
      }
      expect(state.updatedAt).toBe(initialState.updatedAt);
      expect(state.cleanupTtlMs).toBe(initialState.cleanupTtlMs);
      expect(state.attestation.runtimeIdentity).toBe(runtimeIdentity);
      const attestationResult = {
        status: "complete" as const,
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
              severity: "major" as const,
              locus: "src/index.ts:1",
              evidenceUrlOrId: "review:finding-1",
            }]
          : [],
      };
      await expect(attestLocalReviewCommand({
        schemaVersion: 1,
        operationId: state.operationId,
        result: attestationResult,
      }, {
        withSourceLock: dependencies.withSourceLock,
        operationStore: dependencies.operationStore,
        sourceStore: dependencies.sourceStore,
        receiptStore: {
          readReceipts: dependencies.readReceipts,
          appendReceipt: async (receipt) => {
            receipts = [receipt];
            return {
              ledgerVersion: receipts.length,
              durableEvidenceRef: "receipts.json#1",
            };
          },
        },
        resolveAuthority: async () => (await dependencies.resolveAuthority()).authority,
        resolveGuidanceDigest: async () => state.guidanceDigest,
        confirmTarget: dependencies.confirmTarget,
        inspectMaterialization: async () => "materialized",
        releaseMaterialization: async () => undefined,
      })).resolves.toMatchObject({
        state: "attested-current",
        nextAction: "reduce",
      });

      await expect(prepareLocalReview(request, dependencies)).resolves.toMatchObject({
        state: "review-complete",
        nextAction: "reduce",
        payload: {
          operationId: state.operationId,
          persistedVersion: 2,
          target,
        },
      });
      expect(materialize).toHaveBeenCalledTimes(2);
    },
  );
});
