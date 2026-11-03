/** Published continuations admit backend-specific actions while persisted versions retain their own rules. */
import { expect, it } from "vitest";
import { boundaryV1Fixture, boundaryV2Fixture } from "../../../../fixtures/review-boundary.js";
import { checkpointDependencies } from "../../../../helpers/integration-checkpoint.js";
import { IntegrationCheckpointResultSchema } from "../../../../../src/scripts/integration/checkpoint.js";
import { RoutedReviewObligationSchema } from "../../../../../src/scripts/review-gate/status.js";
import { createRunConvergenceVerificationAction, IntegrationBoundaryLocusSchema } from "../../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const original = boundaryV1Fixture("candidate-convergence-verification-pending");
if (original.nextAction.kind !== "run-convergence-verification") throw new Error("Expected convergence action");
const native = boundaryV2Fixture("candidate-convergence-verification-pending");
const { projectionDisposition: ignored, ...continuation } = original.nextAction.postAttestContinuation;
void ignored;
const actions = [original.nextAction, native.nextAction,
  { ...original.nextAction, postAttestContinuation: continuation }];

it.each(actions)("carries a supported convergence action in status: %j", action => {
  expect(RoutedReviewObligationSchema.parse({ state: "review-required", detail: "Convergence is pending.",
    prePublicationAction: action })).toMatchObject({ prePublicationAction: action });
});

it.each(actions)("carries a supported convergence action in the checkpoint: %j", async action => {
  const candidate = await checkpointDependencies().readCandidate("example", "a".repeat(40));
  expect(IntegrationCheckpointResultSchema.parse({ schemaVersion: 1, mode: "integrate-checkpoint", workUnit: "example",
    state: "blocked", reason: "candidate-convergence-pending", nextAction: "run-convergence-verification",
    detail: "Convergence is pending.", coordinates: { observedBaseOid: null, observedHeadOid: null },
    action, payload: { candidate } })).toMatchObject({ action });
});

it("keeps persisted version 1's continuation and verification kind requirements", () => {
  for (const action of actions.slice(1)) expect(IntegrationBoundaryLocusSchema.safeParse({ ...original, nextAction: action }).success).toBe(false);
});

it("builds a projection-independent post-attest continuation", () => {
  expect(createRunConvergenceVerificationAction("example", "full", continuation).postAttestContinuation).toEqual(continuation);
});

it.each([
  { verificationKind: "focused" },
  { attestArgv: ["arc", "attest", "example", "--scope", "focused", "--verification-evidence-ref", "{verificationEvidenceRef}", "--json"] },
  { command: "arc attest unrelated --scope full" },
])("preserves published convergence bindings: %j", patch => {
  const action = { ...original.nextAction, ...patch, postAttestContinuation: continuation };
  expect(RoutedReviewObligationSchema.safeParse({ state: "review-required", detail: "Convergence is pending.", prePublicationAction: action }).success).toBe(false);
});
