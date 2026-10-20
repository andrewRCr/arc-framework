/** Portable frontline results retain original approval identities without launch coordinates. */
import { expect, it } from "vitest";
import { createFrontlineMappingFixture } from "../../../../../fixtures/review-mapping.js";
import { approvedRecord } from "../../../../../fixtures/review-response-proof.js";
import { createReviewHarness } from "../../../../../helpers/store/review-harness.js";
import { lifecycleSuccess } from "../../../../../helpers/store/lifecycle-harness.js";
import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { mapReviewRecords } from "../../../../../../src/lib/store/kinds/review/mapping.js";
import { createReviewOutcomePort } from "../../../../../../src/lib/store/kinds/review/outcome/access.js";
import { createReviewEvidencePort } from "../../../../../../src/lib/store/kinds/review/evidence/access.js";
import { StoredReviewResultReader } from "../../../../../../src/scripts/review-gate/hosts/local/stored-result-reader.js";
import { validateApprovedDispositionRecordForResult } from "../../../../../../src/scripts/review-gate/core/review-result-disposition.js";
import { currentApprovedDispositionNode } from "../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { projectFrontlineFollowUpAdvice, resolveFrontlineFollowUp } from "../../../../../../src/scripts/review-gate/policy/frontline-follow-up.js";
import { projectFrontlineResponse } from "../../../../../../src/scripts/review-gate/policy/frontline-response.js";
import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { FrontlineExecutionOutcomeSchema } from "../../../../../../src/scripts/review-gate/policy/frontline-outcome.js";

async function portableFrontline(result: "clean" | "findings" = "findings") {
  const h = createReviewHarness(), projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example");
  if (primary.reference.owner.type !== "work-item" || primary.reference.owner.uid === undefined) throw new Error("Expected work-item generation");
  const { fixture, input } = await createFrontlineMappingFixture(projectId, result);
  const original = await fixture.reader.readResult(fixture.admission.operationId);
  input.workItems = [{ kind: "work-unit", slug: "example", uid: primary.reference.owner.uid, live: true }];
  if (result === "findings") {
    const approved = approvedRecord(original, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer" }]);
    input.gate.push({ path: `arc/review-gate/evidence/disposition-${canonicalDigest({ operationId: original.producerId }).slice(7)}.json`,
      bytes: new TextEncoder().encode(JSON.stringify(approved)) });
  }
  const mapped = mapReviewRecords(input);
  lifecycleSuccess(await h.store.batch({ writes: mapped.records.map(({ reference, contents }) => ({
    action: "put", reference, expected: null, content: contents[0]!,
  })), provenance: { verb: "review", lifecycleAction: "create" } }));
  return { h, primary, fixture, original, outcomes: createReviewOutcomePort(h.store, primary.reference.owner),
    evidence: createReviewEvidencePort(h.store, primary.reference.owner) };
}

it("reads the original frontline verdict and composed approval from portable facts alone", async () => {
  const { h, primary, fixture, original, outcomes, evidence } = await portableFrontline();
  const result = await new StoredReviewResultReader({ outcomes, readProjectId: h.projectId }).readResult(original.producerId);
  expect(result).toMatchObject({ kind: "frontline", workItem: primary.reference.owner,
    producerId: original.producerId, target: original.target, findings: original.findings,
    originalOutcome: original.originalOutcome, resultDigest: original.resultDigest, admission: original.admission });
  if (result.kind !== "frontline" || original.kind !== "frontline") throw new Error("Expected frontline results");
  expect(result.sourceBindingId).toBe(original.sourceBindingId);
  expect(result.outcomeRef).toBe(result.producerId);
  expect(result.executableIdentity).toEqual(original.executableIdentity);
  expect(result.responseBinding).toEqual(fixture.outcomeRecord.responseBinding);
  expect(result.outcome).toEqual({ ...original.outcome, source: { sourceId: original.sourceIdentity, kind: "command", capability: null } });
  expect(result.outcome.source).not.toHaveProperty("executable");
  expect(result.outcome.source).not.toHaveProperty("argv");
  const approval = await evidence.readDispositionRecord(original.producerId);
  if (approval === null) throw new Error("Expected composed approval");
  expect(() => validateApprovedDispositionRecordForResult(approval, result)).not.toThrow();
  expect(projectFrontlineFollowUpAdvice({ outcome: result.outcome,
    dispositionState: currentApprovedDispositionNode(approval).approvedDisposition }))
    .toEqual({ action: "stop", reason: "no-approved-material-fix" });
});

it("projects the same frontline response from the portable outcome and original executable outcome", async () => {
  const { h, fixture, original, outcomes, evidence } = await portableFrontline();
  const result = await new StoredReviewResultReader({ outcomes, readProjectId: h.projectId }).readResult(original.producerId);
  const approval = await evidence.readDispositionRecord(original.producerId);
  if (result.kind !== "frontline" || original.kind !== "frontline" || approval === null) throw new Error("Expected approved frontline result");
  const common = { routing: fixture.admission.routing.decision,
    dispositionState: currentApprovedDispositionNode(approval).approvedDisposition,
    candidateTarget: null, persistedTargetId: null, verificationPassed: false, verificationRefs: [],
    capabilities: { approve: true, fix: true, persist: true, close: true, reroute: true } };
  expect(projectFrontlineResponse({ ...common, outcome: result.outcome }))
    .toEqual(projectFrontlineResponse({ ...common, outcome: original.outcome }));
});

it("retains the bounded material-fix follow-up decision over a portable outcome", async () => {
  const { h, original, outcomes } = await portableFrontline();
  const result = await new StoredReviewResultReader({ outcomes, readProjectId: h.projectId }).readResult(original.producerId);
  if (result.kind !== "frontline") throw new Error("Expected portable frontline result");
  const approval = approvedRecord(result, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  const { targetId: ignored, ...coordinates } = result.target;
  void ignored;
  const changedTarget = createReviewTarget({ ...coordinates, headSha: "e".repeat(40), headTree: "f".repeat(40) });
  expect(resolveFrontlineFollowUp({ outcome: result.outcome,
    dispositionState: currentApprovedDispositionNode(approval).approvedDisposition, changedTarget }))
    .toEqual({ action: "follow-up", pass: 2, target: changedTarget });
});

it("reads a clean portable frontline verdict while keeping it unusable as an execution outcome", async () => {
  const { h, original, outcomes, evidence } = await portableFrontline("clean");
  const result = await new StoredReviewResultReader({ outcomes, readProjectId: h.projectId }).readResult(original.producerId);
  expect(result).toMatchObject({ kind: "frontline", producerId: original.producerId, originalOutcome: "clean",
    resultDigest: original.resultDigest, findings: [] });
  if (result.kind !== "frontline" || original.kind !== "frontline") throw new Error("Expected clean frontline results");
  expect(FrontlineExecutionOutcomeSchema.safeParse(original.outcome).success).toBe(true);
  expect(FrontlineExecutionOutcomeSchema.safeParse(result.outcome).success).toBe(false);
  expect(await evidence.readDispositionRecord(result.producerId)).toBeNull();
  expect(projectFrontlineFollowUpAdvice({ outcome: result.outcome })).toEqual({ action: "stop", reason: "outcome-clean" });
});
