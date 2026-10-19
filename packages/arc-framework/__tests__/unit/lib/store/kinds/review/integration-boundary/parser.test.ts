import { describe, expect, it, vi } from "vitest";
import { parseReviewIntegrationBoundary } from "../../../../../../../src/lib/store/kinds/review/integration-boundary/parser.js";
import { boundaryLoci, boundaryV1Fixture, boundaryV2Fixture, boundaryContinuation } from "../../../../../../fixtures/review-boundary.js";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { DeliveryReviewMemberVehicleSchema } from "../../../../../../../src/lib/delivery/review-vehicle.js";
import { DeliveryPublicReviewContinuationV1Schema } from "../../../../../../../src/lib/delivery/public-review-continuation.js";
import { createRunConvergenceVerificationAction } from "../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

describe("persisted publication boundary versions", () => {
  it.each(boundaryLoci)("reads version 1's %s as its existing parser does", (locus) => {
    const value = boundaryV1Fixture(locus);
    expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toEqual(value);
  });
  it.each(boundaryLoci)("reads version 2's %s", (locus) => {
    const value = boundaryV2Fixture(locus);
    expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toEqual(value);
  });
  it.each(["policy", "standardLaneOwnerVersion"] as const)("refuses version 2's removed %s field", (field) => {
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture(), [field]: field === "policy" ? null : 1 }))).toBeNull();
  });
  it.each(["candidate-publish-ready", "publication-pending"] as const)("requires the readiness binding at %s", (locus) => {
    const { readinessBinding: ignored, ...value } = boundaryV2Fixture(locus);
    void ignored;
    expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toBeNull();
  });
  it("does not admit a readiness binding at another locus", () => {
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture(), readinessBinding: null }))).toBeNull();
  });
  it("refuses the retired verification kind", () => {
    const original = boundaryV1Fixture("candidate-convergence-verification-pending");
    if (original.nextAction.kind !== "run-convergence-verification") throw new Error("expected convergence");
    const { projectionDisposition: ignored, ...postAttestContinuation } = original.nextAction.postAttestContinuation;
    void ignored;
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture(original.locus), nextAction: {
      ...original.nextAction, postAttestContinuation } }))).toBeNull();
  });
  it("refuses the staged-projection continuation field under version 2", () => {
    const original = boundaryV1Fixture("candidate-convergence-verification-pending");
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture(original.locus), nextAction: {
      ...original.nextAction, verificationKind: "merge" } }))).toBeNull();
  });
  it.each(["action", "reservation"] as const)("requires the locus's own %s variant", (kind) => {
    const value = kind === "action" ? { ...boundaryV2Fixture(), nextAction: boundaryV1Fixture("candidate-publish-ready").nextAction }
      : { ...boundaryV2Fixture("hosted-review-pending"), reservation: boundaryV1Fixture("delivery-status-required").reservation };
    expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toBeNull();
  });
  it("requires unique exact delivery-member vehicles even when decision names differ", () => {
    const vehicle = DeliveryReviewMemberVehicleSchema.parse({ kind: "delivery-member", workUnitId: "example",
      planId: "11111111-1111-4111-8111-111111111111", deliverableId: canonicalDigest({ member: 1 }), head: "a".repeat(40) });
    const first = { vehicle, terminus: canonicalDigest({ decision: 1 }) };
    const value = { ...boundaryV2Fixture("delivery-status-required"), terminus: canonicalDigest({ singleton: 1 }),
      deliveryReviewTermini: [first, { vehicle, terminus: canonicalDigest({ decision: 2 }) }] };
    expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toBeNull();
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...value, deliveryReviewTermini: [first] })))
      .toEqual({ ...value, deliveryReviewTermini: [first] });
  });
  it.each(["placeholder", "work-unit"] as const)("normalizes version 1's legacy %s delivery action", (kind) => {
    const original = boundaryV1Fixture("delivery-status-required");
    const nextAction = kind === "placeholder" ? { kind: "continue-hosted-review", command: "arc review status --target '{targetRef}' --json",
      interactionText: "Resolve retained delivery status." } : { ...original.nextAction, kind: "continue-hosted-review" };
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...original, locus: "hosted-review-pending", nextAction })))
      .toMatchObject({ locus: "delivery-status-required", nextAction: { kind: "resolve-delivery-status", workUnitId: "example" } });
  });
  it("keeps the post-attest continuation's field requirements specific to each version", () => {
    const original = boundaryV1Fixture("candidate-convergence-verification-pending");
    if (original.nextAction.kind !== "run-convergence-verification") throw new Error("expected convergence");
    const { projectionDisposition: ignored, ...postAttestContinuation } = original.nextAction.postAttestContinuation;
    void ignored;
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...original, nextAction: { ...original.nextAction, postAttestContinuation } }))).toBeNull();
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture(), nextAction: postAttestContinuation.nextAction,
      reservation: boundaryV1Fixture("hosted-review-pending").reservation, postAttestContinuation }))).not.toBeNull();
  });
  it("does not add a post-attest continuation at the fix locus", () => {
    const { projectionDisposition: ignored, ...postAttestContinuation } = boundaryContinuation;
    void ignored;
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture("candidate-fix-pending"), postAttestContinuation }))).toBeNull();
  });
  it.each([1, 2] as const)("defines version %s from a fresh module evaluation", async (version) => {
    vi.resetModules();
    const value = { schemaVersion: version, mode: "integration-boundary", workUnit: "example", candidateId: canonicalDigest({ candidate: 1 }),
      locus: "candidate-review-pending", nextAction: { kind: "run-self-review", command: "arc review pre-publication example", interactionText: "Review." },
      reservation: null, ...(version === 1 ? { policy: null } : {}) };
    const schema = version === 1
      ? (await import("../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js")).IntegrationBoundaryLocusSchema
      : (await import("../../../../../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js")).IntegrationBoundaryLocusV2Schema;
    expect(schema.safeParse(value).success).toBe(true);
  });
  it.each(["reservation", "work-unit", "continuation"] as const)("retains the delivery %s binding", (field) => {
    const value = boundaryV2Fixture("delivery-status-required");
    const original = boundaryV1Fixture("delivery-status-required");
    if (original.nextAction.kind !== "resolve-delivery-status" || original.reservation?.target.kind !== "delivery") throw new Error("expected delivery");
    const continuation = DeliveryPublicReviewContinuationV1Schema.parse({ schemaVersion: 1,
      semanticsVersion: "delivery-public-review-continuation/v1", planId: original.reservation.target.planId,
      planRevision: 1, stateRevision: 1, planDigest: canonicalDigest({ plan: 1 }), stateDigest: canonicalDigest({ state: 1 }),
      memberEvidenceDigest: canonicalDigest({ evidence: 1 }) });
    const changed = field === "reservation" ? { ...value, reservation: boundaryV1Fixture("hosted-review-pending").reservation }
      : field === "work-unit" ? { ...value, nextAction: { ...original.nextAction, workUnitId: "other",
          command: "arc review status --work-unit other" } }
      : { ...value, deliveryContinuation: { ...continuation, planId: "22222222-2222-4222-8222-222222222222" } };
    expect(parseReviewIntegrationBoundary(JSON.stringify(changed))).toBeNull();
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...value, deliveryContinuation: continuation }))).not.toBeNull();
  });
  it.each(["kind", "argv", "placeholder", "command", "work-unit"] as const)("retains the convergence %s binding", (field) => {
    const value = boundaryV2Fixture("candidate-convergence-verification-pending");
    const original = boundaryV1Fixture("candidate-convergence-verification-pending");
    if (original.nextAction.kind !== "run-convergence-verification") throw new Error("expected convergence");
    const { projectionDisposition: ignored, ...postAttestContinuation } = original.nextAction.postAttestContinuation;
    void ignored;
    const attestArgv = original.nextAction.attestArgv.map((argument, index) => field === "work-unit" && index === 2 ? "other"
      : field === "argv" && index === 3 ? "--other" : field === "placeholder" && index === 7 ? "verification://filled" : argument);
    const nextAction = { ...original.nextAction, postAttestContinuation, verificationKind: field === "kind" ? "focused" : "merge",
      attestArgv, command: field === "command" ? "arc attest another" : attestArgv.join(" ") };
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...value, nextAction }))).toBeNull();
  });
  it("admits focused convergence verification with its exact focused command", () => {
    const action = createRunConvergenceVerificationAction("example", "focused", boundaryContinuation);
    const { projectionDisposition: ignored, ...postAttestContinuation } = action.postAttestContinuation;
    void ignored;
    expect(parseReviewIntegrationBoundary(JSON.stringify({ ...boundaryV2Fixture("candidate-convergence-verification-pending"),
      nextAction: { ...action, postAttestContinuation } }))).not.toBeNull();
  });
  it("retains a bound readiness digest at the publication loci", () => {
    for (const locus of ["candidate-publish-ready", "publication-pending"] as const) {
      const value = { ...boundaryV2Fixture(locus), readinessBinding: canonicalDigest({ readiness: 1 }) };
      expect(parseReviewIntegrationBoundary(JSON.stringify(value))).toEqual(value);
    }
  });
});
