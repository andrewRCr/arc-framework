/** Exact local continuation evidence survives pre-publication policy replay. */

import { describe, expect, it } from "vitest";
import { createLocalContinuationFixture } from "../../../../fixtures/local-review-continuation.js";
import { canonicalDigest } from "../../../../../src/lib/kernel/index.js";
import { SlugSchema } from "../../../../../src/lib/kernel/schema/slug.js";
import { parseReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { readLaneProgressAcrossLineage } from "../../../../../src/scripts/review-gate/lane-progress.js";
import { composePrePublicationReviewRequest, type PrePublicationCompositionDependencies } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { projectPrePublicationReview } from "../../../../../src/scripts/review-gate/policy/pre-publication-procedure.js";

function compositionDependencies(fixture: Awaited<ReturnType<typeof createLocalContinuationFixture>>): PrePublicationCompositionDependencies {
  const target = fixture.currentTarget();
  const lineage = fixture.original.lineage;
  if (lineage.kind !== "candidate") throw new Error("expected Candidate lineage");
  return {
    readCandidate: async () => ({
      status: "current", candidateId: lineage.candidateId, headSha: target.headSha,
      subjectDigest: canonicalDigest({ subject: "current" }), implementationChanged: false,
      convergenceVerification: "satisfied", convergenceScope: null, lineageHeadShas: [target.headSha],
    }),
    readAssurance: async () => ({
      status: "resolved", assurance: { workContext: "work-unit", workClass: "Heavy" },
      activity: { selfReview: true, frontlineReview: true },
    }),
    resolveTarget: async () => ({
      status: "resolved", target: { repository: "owner/repository", pullRequest: null, headSha: target.headSha },
    }),
    readReservationTarget: async (_workUnit, singleton) => ({ status: "resolved", target: { kind: "pinned-head", ...singleton } }),
    readDeliveryReviewTargets: async () => ({ status: "absent" }),
    deriveImmutableTarget: async () => ({ status: "resolved", target }),
    readOwnerTerminusAuthority: async () => ({ status: "authorized", ownerIdentity: "author-1" }),
    readLaneProgress: (lane, headSha, lineageHeadShas, owner) => readLaneProgressAcrossLineage(fixture.dependencies.operationStore, {
      lane, repositoryId: target.repositoryId, headSha, lineageHeadShas, ...(owner === undefined ? {} : { lineage: owner }),
    }),
    readLanePolicy: async (lane) => ({ sources: lane === "standard" ? ["delegated-agent"] : [], maxPasses: 2 }),
    resultReader: fixture.resultReader,
    dispositionStore: {
      readDispositionRecord: async () => null,
      appendDispositionRecord: async () => { throw new Error("unexpected disposition write"); },
    },
    readResponsePerformance: async () => null,
    confirmIncrementalApplicability: async () => "applicable",
    confirmPriorProducerApplicability: async () => "applicable",
  };
}

describe("pre-publication local continuation", () => {
  it("refuses a pending continuation and resumes after its exact receipt arrives", async () => {
    const fixture = await createLocalContinuationFixture();
    const continuation = await fixture.moveBase();
    const input = {
      workUnit: SlugSchema.parse("review-surface-binding"), selfReview: "settled" as const,
      changeSet: {
        changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
      },
      lanes: { frontline: { invocation: { mode: "skip" as const } } },
    };
    expect(await composePrePublicationReviewRequest(input, compositionDependencies(fixture))).toMatchObject({
      status: "refused", pendingReview: { lane: "standard", operationId: continuation.operationId },
    });
    await fixture.conclude(continuation, "clean");
    expect((await composePrePublicationReviewRequest(input, compositionDependencies(fixture))).status).toBe("composed");
  });

  it.each(["clean", "findings"] as const)("composes current-base %s from one same-pass producer", async (outcome) => {
    const fixture = await createLocalContinuationFixture("chunked");
    const continuation = await fixture.moveBase();
    await fixture.conclude(continuation, outcome);
    const composition = await composePrePublicationReviewRequest({
      workUnit: SlugSchema.parse("review-surface-binding"), selfReview: "settled",
      changeSet: {
        changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary",
      },
      lanes: { frontline: { invocation: { mode: "skip" } }, standard: { scopeMode: "chunked" } },
    }, compositionDependencies(fixture));
    expect(composition.status).toBe("composed");
    if (composition.status !== "composed") throw new Error(composition.reason);
    expect(composition.request.standard.attempts).toEqual([{
      sourceId: "delegated-agent", outcome, reviewOperationId: continuation.operationId, chunkSeriesComplete: true,
    }]);
    const envelope = projectPrePublicationReview(composition.request, {
      reviewedHead: continuation.target.headSha,
      nextAction: {
        kind: "continue-pre-publication-review", command: "arc review pre-publication review-surface-binding",
        interactionText: "Resume review.",
      },
      projectionDisposition: "keep-staged-until-publication",
    });
    expect(envelope.locus).toBe(outcome === "findings" ? "candidate-fix-pending" : "candidate-publish-ready");
    if (outcome === "findings") {
      expect(envelope.nextAction).toMatchObject({
        kind: "continue-pre-publication-review", responseOperationId: continuation.operationId,
        command: "arc review respond -",
      });
      const source = composition.request.pendingResponse.standard;
      expect(source?.kind).toBe("attested-local");
      if (source?.kind !== "attested-local") throw new Error("missing findings response");
      expect(parseReviewSourceReference(source.receiptRef, "attested-local")).toMatchObject({
        operationId: continuation.operationId, durableRef: "git-common:review-gate/evidence/receipts-v2.json#1",
      });
    }
  });
});
