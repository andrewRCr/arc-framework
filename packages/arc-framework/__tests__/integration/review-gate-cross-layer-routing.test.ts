import { describe, expect, it } from "vitest";

import {
  createReviewReceipt,
  createReviewRequest,
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createLocalChangeSetCarrier } from "../../src/scripts/review-gate/core/local-carrier.js";
import type { ForwardReviewReceiptStore } from "../../src/scripts/review-gate/core/ports.js";
import { projectStandardReviewObligation } from "../../src/scripts/review-gate/policy/standard-review-projection.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { reduceReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";
import type { ReviewRoutingFacts } from "../../src/scripts/review-gate/policy/routing-schema.js";
import { SELF_HOSTING_POLICY } from "../../src/scripts/review-gate/policy/self-hosting/schema.js";
import { projectForwardReviewContract } from "../../src/scripts/review-gate/runtime/forward-contract.js";
import { attestLocalReviewResult } from "../../src/scripts/review-gate/runtime/local-attestation.js";

const objectId = (character: string): string => character.repeat(40);

const routineCode: ReviewRoutingFacts = {
  schemaVersion: 1,
  changeSetState: "known",
  contentKind: "code-bearing",
  reviewRisk: "routine",
  changeDeterminacy: "ordinary",
  ownership: "self",
  surfaceAuthority: "ordinary",
  assurance: { workContext: "work-unit", workClass: "Light" },
  activity: { selfReview: true, frontlineReview: true },
};

describe("cross-layer routing to gate proof", () => {
  it.each([
    ["atomic routine code", { changeDeterminacy: "atomic" }, "recommended", "offer", "incremental"],
    ["ordinary code", {}, "required", "attempt", "incremental"],
    ["sensitive code", { reviewRisk: "sensitive" }, "required", "attempt", "full-final"],
    ["foreign ownership", { ownership: "foreign" }, "required", "attempt", "incremental"],
    ["constitutional authority", { surfaceAuthority: "constitutional" }, "required", "attempt", "full-final"],
    ["unknown facts", { changeSetState: "unknown" }, "required", "attempt", "full-final"],
    ["inactive review methods", { activity: { selfReview: false, frontlineReview: false } },
      "required", "skip", "incremental"],
  ] as const)("routes %s without source-capacity input", (_name, overrides, obligation, frontlineAction, retrigger) => {
    expect(reduceReviewRouting({ ...routineCode, ...overrides })).toMatchObject({
      standardReview: obligation,
      frontlineAction,
      retrigger,
    });
  });

  it("runs a local-only exact target through request, attestation, reduction, and manual handoff", async () => {
    const routing = reduceReviewRouting(routineCode);
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
    const requirement = createReviewRequirement({
      target,
      projection: projectStandardReviewObligation(routing),
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "checkpoint",
    });
    if (requirement === null) throw new Error("local route unexpectedly exempt");
    const carrier = createLocalChangeSetCarrier({
      target,
      requirementId: requirement.requirementId,
      snapshot: {
        state: "exact",
        repositoryId: target.repositoryId,
        baseRef: target.baseRef,
        diffBaseSha: target.diffBaseSha,
        diffBaseTree: target.diffBaseTree,
        headSha: target.headSha,
        headTree: target.headTree,
      },
      authorIdentity: "author-1",
      evaluatorIdentity: "evaluator-1",
      attestation: {
        evaluatorIdentity: "evaluator-1",
        runtimeIdentity: "local-attestor-1",
        mechanism: "local-runtime",
      },
      generation: 0,
      requestMechanism: "local-attestation",
    });
    const receipts = [] as unknown[];
    const store: ForwardReviewReceiptStore = {
      readReceipts: async () => ({ ledgerVersion: receipts.length, receipts: [] }),
      appendReceipt: async (receipt, expectedLedgerVersion) => {
        expect(expectedLedgerVersion).toBe(receipts.length);
        receipts.push(receipt);
        return { ledgerVersion: receipts.length, durableEvidenceRef: `local:receipt-${receipts.length}` };
      },
    };
    const receipt = await attestLocalReviewResult({
      target,
      requirement,
      carrier,
      result: {
        status: "complete",
        result: "clean",
        targetId: target.targetId,
        headSha: target.headSha,
        headTree: target.headTree,
        rubricVersion: requirement.rubricVersion,
        rubricDigest: requirement.rubricDigest,
        sourceDigest: `sha256:${"1".repeat(64)}`,
        guidanceDigest: `sha256:${"2".repeat(64)}`,
        evaluatorIdentity: carrier.request.evaluatorIdentity,
        reviewRunId: "local-run-1",
        applicabilityId: null,
        findings: [],
      },
      currentTarget: async () => target,
      runtimeIdentity: carrier.attestation.runtimeIdentity,
      attestationMechanism: carrier.attestation.mechanism,
      sourceDigest: `sha256:${"1".repeat(64)}`,
      guidanceDigest: `sha256:${"2".repeat(64)}`,
      store,
      expectedLedgerVersion: 0,
    });

    expect(projectForwardReviewContract({
      channel: "local",
      target,
      requirement,
      request: carrier.request,
      receipt,
    }).projection).toMatchObject({ conclusion: "success", blockers: [] });
    expect(projectForwardReviewContract({
      channel: "hosted",
      target,
      requirement,
      request: carrier.request,
      receipt,
    }).projection).toMatchObject({ conclusion: "failure" });
    expect(projectForwardReviewContract({
      channel: "both",
      target,
      requirement,
      request: carrier.request,
      receipt,
    }).projection).toMatchObject({ conclusion: "success" });
    expect(SELF_HOSTING_POLICY).toMatchObject({
      reviewChannel: "both",
      controllerAuthority: "inactive",
      mergeAuthority: "manual",
    });
  });

  it("admits a hosted-only chain without substituting it into the local channel", () => {
    const routing = reduceReviewRouting(routineCode);
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
    const requirement = createReviewRequirement({
      target,
      projection: projectStandardReviewObligation(routing),
      acceptableSources: [{ sourceKind: "agent", qualifier: "standard-review/v1" }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("hosted route unexpectedly exempt");
    const request = createReviewRequest(target, {
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      repositoryId: target.repositoryId,
      targetId: target.targetId,
      requirementId: requirement.requirementId,
      carrier: { kind: "change-request", adapterId: "github", changeRequestId: "pull/42" },
      authorIdentity: "author-1",
      evaluatorIdentity: "hosted-reviewer-1",
      generation: 0,
      requestMechanism: "provider-automatic",
    });
    const receipt = createReviewReceipt({
      target,
      requirement,
      request,
      applicabilityId: null,
      reviewRunId: "hosted-run-1",
      evaluatorIdentity: request.evaluatorIdentity,
      attestingRuntimeIdentity: "review-gate-app",
      attestationMechanism: "github-app",
      providerEventIdentity: "review-event-1",
      result: "clean",
      findings: [],
    });

    expect(projectForwardReviewContract({ channel: "hosted", target, requirement, request, receipt }).projection)
      .toMatchObject({ conclusion: "success" });
    expect(projectForwardReviewContract({ channel: "both", target, requirement, request, receipt }).projection)
      .toMatchObject({ conclusion: "success" });
    expect(projectForwardReviewContract({ channel: "local", target, requirement, request, receipt }).projection)
      .toMatchObject({ conclusion: "failure" });
  });

  it("carries a project rubric overlay into the exact requirement identity", () => {
    const routing = reduceReviewRouting(routineCode);
    const overlay = {
      version: "project-security/v1",
      digest: `sha256:${"e".repeat(64)}`,
    };
    const projected = projectStandardReviewObligation(routing, overlay);

    expect(projected).toMatchObject({
      rubricVersion: overlay.version,
      rubricDigest: overlay.digest,
      obligation: "required",
    });
    expect(projected.rubricDigest).not.toBe(STANDARD_REVIEW_RUBRIC_IDENTITY.digest);
  });
});
