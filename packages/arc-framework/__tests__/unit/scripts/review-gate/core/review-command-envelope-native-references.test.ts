/** Published continuation contracts carry native locators beside their existing identities. */
import { describe, expect, it } from "vitest";
import { assertSchemaAccepts, assertSchemaRefuses } from "../../../../helpers/schema-assertion.js";
import { createHostedHandleFixture } from "../../../../fixtures/hosted-review.js";
import { createFrontlineFixture } from "../../../../fixtures/frontline-review.js";
import { localOutcome } from "../../../../fixtures/review-outcome.js";
import { OwnerIdentitySchema } from "../../../../../src/lib/store/identity.js";
import { ReviewOutcomeSchema } from "../../../../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../../../../src/lib/store/kinds/review/outcome/key.js";
import { bindNativeReviewOperationReference } from
  "../../../../../src/scripts/review-gate/core/review-operation-reference.js";
import { bindReviewSourceReference } from "../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { LocalAttestRequestSchema } from "../../../../../src/scripts/review-gate/runtime/local-attest-command.js";
import { LocalResumeRequestSchema } from "../../../../../src/scripts/review-gate/runtime/local-resume-command.js";
import { ReduceRequestSchema } from "../../../../../src/scripts/review-gate/runtime/reduce-command.js";
import { LocalCancelRequestSchema } from "../../../../../src/scripts/review-gate/runtime/local-cancel-command.js";
import { LocalCancelEnvelopeSchema } from "../../../../../src/scripts/review-gate/core/local-cancel-envelope.js";
import { LocalAttestEnvelopeSchema, LocalPrepareEnvelopeSchema, LocalResumeEnvelopeSchema, ReduceEnvelopeSchema,
  FrontlineResolveEnvelopeSchema, FrontlineRunEnvelopeSchema } from
  "../../../../../src/scripts/review-gate/core/review-command-envelope.js";
import { FrontlineRunCommandRequestSchema } from
  "../../../../../src/scripts/review-gate/core/frontline-run-command-schema.js";
import { HostedRequestResultSchema, HostedAwaitActionSchema, hostedAwaitAction, hostedLaneAttemptId } from
  "../../../../../src/scripts/review-gate/hosted/request.js";
import { HostedAwaitEnvelopeSchema, HostedAwaitExecutionEnvelopeSchema, HostedAwaitResultSchema } from
  "../../../../../src/scripts/review-gate/hosted/await.js";
import { resolveHostedAwaitTiming } from "../../../../../src/scripts/review-gate/hosted/await-config.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "review-owner",
  uid: "3d3f3090-d1c1-4f4e-bb1a-60cb438480c5" });
const local = ReviewOutcomeSchema.parse(localOutcome());
const localOperation = { repositoryId: local.target.repositoryId, workItem: owner, operationId: local.attemptId };
const operationRef = bindNativeReviewOperationReference(localOperation);
const receiptRef = bindReviewSourceReference({ ...localOperation, kind: "attested-local",
  durableRef: reviewOutcomeKey(local) });
const operationPayload = { operationId: local.attemptId, operationRef, persistedVersion: 0 };
const attested = { schemaVersion: 1, mode: "review-local-attest", diagnostics: [], state: "attested-current",
  nextAction: "reduce", payload: { ...operationPayload, target: local.target, receiptRef, receiptRecorded: true } };
const cancelled = { schemaVersion: 1, mode: "review-local-cancel", diagnostics: [], state: "terminal-operation",
  nextAction: "resume-review", payload: operationPayload };
const evaluatorResult = { status: "partial", result: null, evaluatorIdentity: "evaluator-1", reviewRunId: "run-1",
  applicabilityId: null, findings: [] };
const handle = createHostedHandleFixture();
const hostedRef = bindNativeReviewOperationReference({ repositoryId: handle.admission.repositoryId,
  workItem: owner, operationId: handle.admission.admissionId });
const hostedAction = { schemaVersion: 1 as const, handle, operationRef: hostedRef };
const { admission, outcomeRecord } = createFrontlineFixture();
const frontlineRef = bindNativeReviewOperationReference({ repositoryId: admission.target.repositoryId,
  workItem: owner, operationId: admission.operationId });
const ready = { schemaVersion: 1, mode: "review-frontline-resolve", diagnostics: [], state: "ready",
  nextAction: "run-frontline", payload: { routing: admission.routing, frontlineReview: admission.frontlineReview,
    pass: admission.logicalPass, maxPasses: admission.maxPasses, admission, operationRef: frontlineRef } };

const requestInput = { schemaVersion: 1, operationId: local.attemptId, operationRef };
const completedHeader = { schemaVersion: 1, diagnostics: [], state: "review-complete", nextAction: "reduce" };
const currentTarget = createHostedHandleFixture({ target: { ...handle.target, headSha: "e".repeat(40) } })
  .admission.reviewTarget;
const nativeSchemaCases = [
  ["local attest request", LocalAttestRequestSchema, { ...requestInput, result: evaluatorResult }],
  ["local resume request", LocalResumeRequestSchema, requestInput],
  ["reduce request", ReduceRequestSchema, requestInput],
  ["local cancel request", LocalCancelRequestSchema, requestInput],
  ["local cancel result", LocalCancelEnvelopeSchema, cancelled],
  ["local attested result", LocalAttestEnvelopeSchema, attested],
  ["local prepare completion", LocalPrepareEnvelopeSchema, { ...completedHeader, mode: "review-local-prepare",
    payload: { ...operationPayload, target: local.target } }],
  ["local resume completion", LocalResumeEnvelopeSchema, { ...completedHeader, mode: "review-local-resume",
    payload: { ...operationPayload, currentTarget: local.target, receiptRef } }],
  ["local reduction", ReduceEnvelopeSchema, { schemaVersion: 1, diagnostics: [], mode: "review-reduce",
    state: "stale-target", nextAction: "prepare-current-target", payload: { ...operationPayload,
      attemptedTarget: local.target, currentTarget } }],
  ["frontline ready resolution", FrontlineResolveEnvelopeSchema, ready],
  ["frontline run request", FrontlineRunCommandRequestSchema, { schemaVersion: 1, target: admission.target,
    resolution: ready }],
  ["frontline run result", FrontlineRunEnvelopeSchema, { schemaVersion: 1, mode: "review-frontline-run", diagnostics: [],
    state: "clean", nextAction: "none", payload: { operationId: admission.operationId, operationRef: frontlineRef,
      persistedVersion: 0, target: admission.target, outcomeRef: "outcome-key",
      outcomeDigest: outcomeRecord.outcomeDigest } }],
  ["hosted await action", HostedAwaitActionSchema, hostedAction],
  ["hosted public await", HostedAwaitEnvelopeSchema, hostedAction],
  ["hosted execution await", HostedAwaitExecutionEnvelopeSchema,
    { ...hostedAction, timeoutMs: 1000, pollIntervalMs: 100 }],
  ["hosted request result", HostedRequestResultSchema, { schemaVersion: 1, mode: "review-hosted-request", state: "requested",
    nextAction: "await", requestedCoverage: handle.requestedCoverage, attemptedProviders: [handle.provider],
    handle, operationRef: hostedRef, action: hostedAction }],
  ["hosted await result", HostedAwaitResultSchema, { ...hostedAction, mode: "review-hosted-await", state: "pending",
    nextAction: "await", action: hostedAction, elapsedMs: 0 }],
] as const;

describe("native continuation embeddings", () => {
  it.each(nativeSchemaCases)("retains the native locator in %s", (_label, schema, input) => {
    expect(assertSchemaAccepts(schema, input)).toEqual(input);
  });

  it("preserves the locator outside the handle when building submit-ready hosted actions", () => {
    const attemptId = hostedLaneAttemptId(handle);
    const action = hostedAwaitAction(handle, hostedRef);
    expect(action).toEqual(hostedAction);
    expect(hostedLaneAttemptId(action.handle)).toBe(attemptId);
  });

  it("preserves the locator when resolving hosted timing", () => {
    const timing = resolveHostedAwaitTiming(hostedAction, { "review.hosted_await_timeout_seconds": "30",
      "review.hosted_await_initial_poll_interval_seconds": "1", "review.hosted_await_attention_after_minutes": "15" });
    expect(timing.request.operationRef).toBe(hostedRef);
  });

  it.each([
    ["local attest", LocalAttestRequestSchema, { ...requestInput, operationId: "different", result: evaluatorResult }],
    ["local resume", LocalResumeRequestSchema, { ...requestInput, operationId: "different" }],
    ["reduce", ReduceRequestSchema, { ...requestInput, operationId: "different" }],
    ["local cancel", LocalCancelRequestSchema, { ...requestInput, operationId: "different" }],
    ["cancel envelope", LocalCancelEnvelopeSchema, { ...cancelled, payload: { ...operationPayload, operationId: "different" } }],
    ["attested envelope", LocalAttestEnvelopeSchema, { ...attested,
      payload: { ...attested.payload, operationId: "different" } }],
    ["frontline ready", FrontlineResolveEnvelopeSchema, { ...ready,
      payload: { ...ready.payload, operationRef } }],
    ["hosted await action", HostedAwaitActionSchema, { ...hostedAction, operationRef }],
    ["hosted public await", HostedAwaitEnvelopeSchema, { ...hostedAction, operationRef }],
  ] as const)("refuses a reference for another operation in %s", (_label, schema, input) => {
    assertSchemaRefuses(schema, input);
  });

  it("requires a native locator before omitting the source record", () => {
    const payload = { ...attested.payload, operationRef: undefined };
    assertSchemaRefuses(LocalAttestEnvelopeSchema, { ...attested, payload: { ...payload, persistedVersion: 1 } });
  });

  it("requires a native locator for a zero working-state version", () => {
    const payload = { ...attested.payload, operationRef: undefined };
    assertSchemaRefuses(LocalAttestEnvelopeSchema, { ...attested,
      payload: { ...payload, sourceRef: "original-source-record" } });
    assertSchemaRefuses(LocalCancelEnvelopeSchema, { ...cancelled, payload: { ...operationPayload, operationRef: undefined } });
  });

  it("keeps the existing repository requests and action values", () => {
    const input = { schemaVersion: 1, operationId: local.attemptId };
    expect(assertSchemaAccepts(LocalResumeRequestSchema, input)).toEqual(input);
    expect(assertSchemaAccepts(ReduceRequestSchema, input)).toEqual(input);
    expect(assertSchemaAccepts(LocalCancelRequestSchema, input)).toEqual(input);
    const repositoryCancel = { ...cancelled, payload: { operationId: local.attemptId, persistedVersion: 1 } };
    expect(assertSchemaAccepts(LocalCancelEnvelopeSchema, repositoryCancel)).toEqual(repositoryCancel);
    expect(hostedAwaitAction(handle)).toEqual({ schemaVersion: 1, handle });
  });
});
