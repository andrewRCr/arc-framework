import { describe, expect, it } from "vitest";
import { parseReviewOutcome } from "../../../../../../../src/lib/store/kinds/review/outcome/parser.js";
import { createReviewTarget } from "../../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createDispositionSet, proposeDispositionSet, approveDispositionState } from
  "../../../../../../../src/scripts/review-gate/core/dispositions.js";
import { dispositionSetMatchesSourceContext } from
  "../../../../../../../src/scripts/review-gate/core/disposition-records.js";
import { BoundFrontlineResponseBindingSchema } from
  "../../../../../../../src/scripts/review-gate/core/frontline-response-binding.js";
import { computeFrontlineSourceBindingId } from
  "../../../../../../../src/scripts/review-gate/policy/frontline-operation.js";
import { createFrontlineFixture } from "../../../../../../fixtures/frontline-review.js";
import { frontlineOutcome } from "../../../../../../fixtures/review-outcome.js";

function boundProducer() {
  const target = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
    repositoryId: "repo-1", baseRef: "main", diffBaseSha: "a".repeat(40), diffBaseTree: "b".repeat(40),
    headSha: "c".repeat(40), headTree: "d".repeat(40) });
  const responseBinding = BoundFrontlineResponseBindingSchema.parse({
    candidate: { workUnit: "example", candidateId: `sha256:${"c".repeat(64)}`,
      target: createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
        repositoryId: target.repositoryId, baseRef: target.baseRef, diffBaseSha: target.diffBaseSha,
        diffBaseTree: target.diffBaseTree, headSha: target.headSha, headTree: target.headTree }) },
    deliveryMember: { kind: "delivery-member", planId: "123e4567-e89b-42d3-a456-426614174000",
      deliverableId: `sha256:${"d".repeat(64)}`, workUnitId: "example", head: target.headSha },
  });
  const findings = [{ findingId: "finding-1", severity: "major" as const, locus: "src/main.ts:10",
    evidenceUrlOrId: "finding:1", sourceOrdinal: 1 }];
  const producer = createFrontlineFixture(target, { responseBinding, findings });
  const portable = frontlineOutcome({ findings });
  return { producer, value: { ...portable, attemptId: producer.admission.operationId, lineage: producer.admission.lineage,
    target, frontline: { ...portable.frontline,
      admission: { ...producer.admission, frontlineReview: { ...producer.admission.frontlineReview,
        source: portable.frontline.admission.frontlineReview.source } },
      sourceBindingId: producer.run.sourceBindingId, outcomeDigest: producer.outcomeRecord.outcomeDigest,
      responseBinding } } };
}

describe("portable frontline source identity", () => {
  it("retains the original digest and response binding while redacting executable details", () => {
    const { producer, value } = boundProducer();
    const parsed = parseReviewOutcome(JSON.stringify(value));
    expect(parsed?.frontline).toMatchObject({ sourceBindingId: producer.run.sourceBindingId,
      responseBinding: producer.run.responseBinding });
    expect(parsed?.frontline?.admission.frontlineReview.source).toEqual({
      sourceId: "coderabbit-cli", kind: "command", capability: null,
    });
    expect(JSON.stringify(parsed)).not.toContain('"executable"');
    expect(JSON.stringify(parsed)).not.toContain('"argv"');
    expect(parseReviewOutcome(JSON.stringify(parsed))).toEqual(parsed);
  });

  it("refuses a missing source-binding digest", () => {
    const value = frontlineOutcome();
    expect(parseReviewOutcome(JSON.stringify({ ...value, frontline: { ...value.frontline, sourceBindingId: undefined } })))
      .toBeNull();
  });

  it("refuses a malformed source-binding digest", () => {
    const { value } = boundProducer();
    expect(parseReviewOutcome(JSON.stringify({ ...value, frontline: { ...value.frontline, sourceBindingId: "not-a-digest" } })))
      .toBeNull();
  });

  it("keeps an existing approved set matched to the original command and response identity", async () => {
    const { producer, value } = boundProducer();
    const result = await producer.reader.readResult(producer.admission.operationId);
    if (result.kind !== "frontline") throw new Error("expected frontline producer");
    const set = createDispositionSet({ schemaVersion: 2, semanticsVersion: "review-gate/v2",
      targetId: result.target.targetId, producerId: result.producerId, resultDigest: result.resultDigest,
      policyVersion: result.admission.policyVersion, frontlineBinding: { operationId: result.producerId,
        sourceBindingId: result.sourceBindingId, outcomeDigest: result.resultDigest },
      proposedBy: "proposer", proposedVerification: "full", findings: result.findings.map((finding) => ({
        findingId: finding.findingId, sourceIdentity: result.sourceIdentity, locus: finding.locus,
        reportedSeverity: finding.severity, sourceVerification: "verified", verifiedSeverity: "major",
        disposition: "reject", rationale: "The finding is accepted as residual risk.", recommendation: "Retain the result.",
        verificationRefs: [finding.evidenceUrlOrId], openQuestions: [],
      })) });
    const approved = approveDispositionState({ proposed: proposeDispositionSet(set), approvedBy: "andrew",
      approvedAt: "2026-10-19T13:00:00Z" });
    const parsed = parseReviewOutcome(JSON.stringify(value));
    if (parsed?.frontline === undefined) throw new Error("expected portable frontline binding");
    expect(dispositionSetMatchesSourceContext(approved.dispositionSet, {
      kind: "frontline", producerId: parsed.attemptId, resultDigest: parsed.frontline.outcomeDigest,
      policyVersion: parsed.frontline.admission.policyVersion,
      frontlineBinding: { operationId: parsed.attemptId, sourceBindingId: parsed.frontline.sourceBindingId,
        outcomeDigest: parsed.frontline.outcomeDigest },
    })).toBe(true);
    const portableSource = parsed.frontline.admission.frontlineReview.source;
    const source = producer.admission.frontlineReview.source;
    if (source === null) throw new Error("expected admitted source");
    const sourceOnlyDigest = computeFrontlineSourceBindingId(source);
    expect(parsed.frontline.sourceBindingId).not.toBe(sourceOnlyDigest);
    expect(portableSource).not.toHaveProperty("executable");
  });
});
