/** Producer-generated local operations and their repository persistence envelopes. */
import { createLocalReviewPreparationFixture } from "./local-review-preparation.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { recordLocalReceiptConclusion } from "../../src/scripts/review-gate/lane-progress.js";
import { createReviewReceipt, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { ReviewOperationStoreRecordSchema } from "../../src/scripts/review-gate/core/repository-record-schemas.js";
import type { ReviewOperationState } from "../../src/scripts/review-gate/core/operation-state-schema.js";
import type { ReviewMappingInput } from "../../src/lib/store/kinds/review/mapping-types.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

export const mappingErrand = { kind: "errand" as const, slug: "review-errand", claimId: "claim-live",
  uid: "123e4567-e89b-42d3-a456-426614174000", live: true };

export function mappingOperation(state: ReviewOperationState, version = 1) {
  const record = ReviewOperationStoreRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "review-operation-store/v1",
    operationId: state.operationId, version, state });
  return { path: `arc/review-gate/operations/operation-${canonicalDigest({ operationId: state.operationId }).slice(7)}.json`,
    bytes: new TextEncoder().encode(JSON.stringify(record)) };
}

export async function createLocalMappingFixture() {
  const fixture = createLocalReviewPreparationFixture();
  fixture.dependencies.resolveLineage = async (_vehicle, headSha) => ({ kind: "head-bound", vehicleKind: "errand",
    vehicleIdentity: mappingErrand.claimId, headSha });
  fixture.dependencies.resolveAuthority = async () => ({ authority: {
    vehicle: { kind: "errand", identity: mappingErrand.slug, claimId: mappingErrand.claimId }, authorIdentity: "author-1", evaluatorIdentity: "evaluator-1",
    attestationRuntimeKind: "arc-cli", runtimeIdentity: "arc-cli/0.1.0", attestationMechanism: "local-attestation",
  }, member: null });
  fixture.dependencies.resolveVehicle = async () => ({ vehicle: { kind: "errand", identity: mappingErrand.slug, claimId: mappingErrand.claimId },
    authorIdentity: "author-1", member: null });
  let target = fixture.changeSetTarget;
  fixture.deriveTarget.mockImplementation(async () => target);
  fixture.dependencies.readCurrentHeadSha = async () => target.headSha;
  fixture.dependencies.confirmTarget = async (attempted) => attempted.targetId === target.targetId
    ? { state: "current", target } : { state: "stale-target", attemptedTarget: attempted, currentTarget: target };
  async function prepare() {
  const prepared = await prepareLocalReview({ schemaVersion: 1, evaluatorIdentity: "evaluator-1",
    routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
      ownership: "self", surfaceAuthority: "ordinary" }, policyJudgment: { scopeMode: "whole-target" } }, fixture.dependencies);
  const state = fixture.published();
  if (prepared.state !== "ready" || state?.kind !== "local-review") throw new Error("Expected local producer");
  return state;
  }
  const state = await prepare();
  async function moveHead() {
    const { targetId: ignored, ...coordinates } = target;
    void ignored;
    target = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
    return prepare();
  }
  const receipts: ReturnType<typeof createReviewReceipt>[] = [];
  function input(): ReviewMappingInput {
    return { projectId: state.repositoryId, workItems: [mappingErrand], candidates: [],
      gate: [...fixture.operations.values()].map(({ state, version }) => mappingOperation(state, version)).concat([{
        path: "arc/review-gate/evidence/receipts-v2.json", bytes: new TextEncoder().encode(JSON.stringify({
          schemaVersion: 2, semanticsVersion: "review-gate/v2", repositoryId: state.repositoryId,
          ledgerVersion: receipts.length, receipts,
        })),
      }]) };
  }
  async function conclude(result: "clean" | "findings" | "failed" = "findings", producer = state) {
    const state = producer;
    const receipt = createReviewReceipt({ target: state.target, requirement: state.requirement, request: state.request,
      applicabilityId: null, reviewRunId: "run-1", evaluatorIdentity: state.request.evaluatorIdentity,
      attestingRuntimeIdentity: state.attestation.runtimeIdentity, attestationMechanism: state.attestation.mechanism,
      providerEventIdentity: null, result, findings: result === "findings" ? [{ findingId: "finding-1", severity: "major",
        locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }] : [] });
    receipts.push(receipt);
    await recordLocalReceiptConclusion(fixture.dependencies.operationStore, { state, receipt, now: fixture.dependencies.now() });
    fixture.dependencies.readReceipts = async (targetId) => ({ ledgerVersion: receipts.length,
      receipts: receipts.filter((item) => item.targetId === targetId) });
    return receipt;
  }
  return { ...fixture, state, receipts, input, conclude, moveHead, prepare };
}

export async function createFrontlineMappingFixture() {
  const { createFrontlineFixture } = await import("./frontline-review.js");
  const { createReviewTarget } = await import("../../src/scripts/review-gate/core/gate-contract-v2.js");
  const { FrontlineOutcomeStoreRecordSchema } = await import("../../src/scripts/review-gate/core/repository-record-schemas.js");
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40), headTree: "d".repeat(40) });
  const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example", planId: "123e4567-e89b-42d3-a456-426614174002",
    deliverableId: `sha256:${"7".repeat(64)}` as const, head: target.headSha });
  const { head: ignoredHead, ...lineage } = vehicle;
  const { targetId: ignoredTargetId, ...coordinates } = target;
  void ignoredHead; void ignoredTargetId;
  const fixture = createFrontlineFixture(target, { lineage, responseBinding: {
    candidate: { workUnit: vehicle.workUnitId, candidateId: `sha256:${"8".repeat(64)}`, target: createReviewTarget({
      ...coordinates, kind: "change-set" }) }, deliveryMember: vehicle,
  }, findings: [{ findingId: "frontline-finding", severity: "minor", locus: "src/example.ts:2",
    evidenceUrlOrId: "frontline-finding", sourceOrdinal: 1 }] });
  const record = FrontlineOutcomeStoreRecordSchema.parse({ schemaVersion: 1, semanticsVersion: "frontline-outcome-store/v1",
    operationId: fixture.admission.operationId, version: 1, record: fixture.outcomeRecord });
  const input = { projectId: target.repositoryId, candidates: [],
    workItems: [{ kind: "work-unit" as const, slug: "example", uid: mappingErrand.uid, live: true }],
    gate: [mappingOperation(fixture.lane), { path: "arc/review-gate/outcomes/frontline-outcome.json",
      bytes: new TextEncoder().encode(JSON.stringify(record)) }] };
  return { fixture, input };
}
