import { OwnerIdentitySchema } from "../../../../../../../src/lib/store/identity.js";
import { describe, expect, it } from "vitest";
import { storedLocalApproval } from "../../../../../../fixtures/review-family-access.js";
import { bindReviewSourceReference } from "../../../../../../../src/scripts/review-gate/core/review-source-reference.js";
import { reviewOutcomeKey } from "../../../../../../../src/lib/store/kinds/review/outcome/key.js";
import { createDispositionSet, approveDispositionState, proposeDispositionSet } from
  "../../../../../../../src/scripts/review-gate/core/dispositions.js";
import { createFixAuthorization } from "../../../../../../../src/scripts/review-gate/core/fix-authorization.js";
import { ApprovedDispositionRecordSchema } from "../../../../../../../src/scripts/review-gate/core/advisory-records.js";
import { lifecycleSuccess } from "../../../../../../helpers/store/lifecycle-harness.js";
import { performedEvidenceFixture, privateMemberEvidenceFixture } from "../../../../../../fixtures/review-evidence.js";
import { composeReviewDispositionRecord } from "../../../../../../../src/lib/store/kinds/review/evidence/composed-record.js";
import { ReviewEvidenceSchema } from "../../../../../../../src/lib/store/kinds/review/evidence/schema.js";
import { laneProgressOperationId } from "../../../../../../../src/scripts/review-gate/lane-progress.js";
import { createProjectIdentityReader } from "../../../../../../../src/lib/store/project-identity.js";
import { canonicalDigest } from "../../../../../../../src/lib/kernel/index.js";
import { StoreRefusalError } from "../../../../../../../src/lib/store/refusal-error.js";

const owner = OwnerIdentitySchema.parse({ type: "work-item", name: "example",
  uid: "14bc6336-193b-4d7a-9380-1b4ca79a714b" });

describe("composed approved disposition records", () => {
  it.each(["roots", "successor", "outcome"] as const)("attributes a broken %s lineage to its producer and record keys", async fault => {
    const h = await storedLocalApproval();
    const prior = (await h.evidence.read(h.original.currentDispositionSetId))!;
    const missing = canonicalDigest({ missing: fault });
    const { dispositionSetId: ignored, ...fields } = prior.value.dispositionSet;
    void ignored;
    const dispositionSet = createDispositionSet({ ...fields, proposedBy: "second-proposer" });
    const approved = approveDispositionState({ proposed: proposeDispositionSet(dispositionSet), approvedBy: "andrew",
      approvedAt: "2026-09-09T21:00:00Z" });
    const duplicate = { ...prior.value, dispositionSet, approval: approved.approval };
    const records = fault === "roots" ? [prior.value, duplicate]
      : [{ ...prior.value, successorDispositionSetId: missing }];
    const read = h.harness.store.read.bind(h.harness.store);
    if (fault === "outcome") h.harness.store.read = async input => input.reference.kind === "review/outcome"
      ? { status: "refused", refusal: { code: "not-found", class: "recoverable", reference: input.reference,
        condition: "Outcome is missing.", remedy: { text: "Restore the outcome." } } } : read(input);
    const attempt = () => fault === "outcome" ? h.evidence.readDispositionRecord(h.original.operationId)
      : Promise.resolve().then(() => composeReviewDispositionRecord(h.outcome, records, h.owner));
    const error: unknown = await attempt().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StoreRefusalError);
    expect(error).toMatchObject({ offBranch: true, refusal: { code: "record-malformed",
      rule: `review.evidence.${fault === "roots" ? "root" : fault}` } });
    const message = (error as Error).message;
    for (const key of [h.original.operationId, prior.value.dispositionSet.dispositionSetId, prior.value.result.outcomeKey,
      ...(fault === "roots" ? [dispositionSet.dispositionSetId] : fault === "successor" ? [missing] : [])]) expect(message).toContain(key);
    h.harness.store.read = read;
    expect(await h.evidence.readDispositionRecord(h.original.operationId)).not.toBeNull();
  });
  it("reproduces the native local approval with portable source coordinates", async () => {
    const { evidence, original, outcome, fixture, harness, owner } = await storedLocalApproval();
    expect(await createProjectIdentityReader(harness.store)()).toBe(fixture.state.repositoryId);
    expect(await evidence.readDispositionRecord(original.operationId)).toEqual({ ...original, source: {
      kind: "attested-local", receiptRef: bindReviewSourceReference({ kind: "attested-local",
        operationId: original.operationId, durableRef: reviewOutcomeKey(outcome), repositoryId: outcome.target.repositoryId, workItem: owner }),
      localSourceRef: fixture.state.sourceDigest,
    } });
  });

  it("enumerates one composed record per producer on the bound work item", async () => {
    const { evidence, original } = await storedLocalApproval();
    expect(await evidence.listDispositionRecords()).toEqual([await evidence.readDispositionRecord(original.operationId)]);
  });

  it.each(["keyed", "index"] as const)("refuses an incomplete %s approval read and succeeds after repair", async (mode) => {
    const { evidence, original, harness } = await storedLocalApproval();
    const nativeList = harness.store.list.bind(harness.store);
    let missed = true;
    harness.store.list = async (input) => {
      const result = await nativeList(input);
      return result.status !== "ok" || result.result.status !== "complete" ? result : { status: "ok",
        result: { ...result.result, missed } };
    };
    const read = () => mode === "keyed" ? evidence.readDispositionRecord(original.operationId) : evidence.listDispositionRecords();
    await expect(read()).rejects.toThrow(/incomplete/u);
    missed = false;
    const repaired = await read();
    expect(repaired).not.toBeNull();
    if (mode === "index") expect(repaired).toHaveLength(1);
    else expect(ApprovedDispositionRecordSchema.parse(repaired).currentDispositionSetId).toBe(original.currentDispositionSetId);
  });

  it("orders a native approval lineage by edges and preserves each set's optional tags", async () => {
    const { evidence, original, outcome, harness, owner } = await storedLocalApproval();
    const prior = (await evidence.read(original.currentDispositionSetId))!;
    const { dispositionSetId: ignored, ...fields } = prior.value.dispositionSet;
    void ignored;
    const dispositionSet = createDispositionSet({ ...fields, proposedBy: "second-proposer",
      findings: fields.findings.map(finding => {
        if (finding.sourceVerification !== "verified") throw new Error("Expected verified native finding");
        return { ...finding, disposition: "fix" as const };
      }) });
    const approved = approveDispositionState({ proposed: proposeDispositionSet(dispositionSet), approvedBy: "andrew",
      approvedAt: "2026-09-09T21:00:00Z" });
    const tags = [{ findingId: dispositionSet.findings[0]!.findingId, tag: "local-correction" as const }];
    const successor = { ...prior.value, dispositionSet, approval: approved.approval, advisoryFixTags: tags,
      predecessorDispositionSetId: original.currentDispositionSetId };
    lifecycleSuccess(await harness.store.batch({ writes: [
      evidence.prepareAdvance({ ...prior.value, successorDispositionSetId: dispositionSet.dispositionSetId }, prior.version),
      evidence.prepareCreate(successor),
    ], provenance: { verb: "review", lifecycleAction: "edit" } }));
    const nativeList = harness.store.list.bind(harness.store);
    harness.store.list = async (input) => {
      const result = await nativeList(input);
      return result.status !== "ok" || result.result.status !== "complete" ? result : { status: "ok",
        result: { ...result.result, records: [...result.result.records].sort((a) =>
          a.reference.key === dispositionSet.dispositionSetId ? -1 : 1) } };
    };
    const expected = ApprovedDispositionRecordSchema.parse({ ...original, currentDispositionSetId: dispositionSet.dispositionSetId,
      approvedDispositionLineage: [{ ...original.approvedDispositionLineage[0], successorDispositionSetId: dispositionSet.dispositionSetId },
        { ...original.approvedDispositionLineage[0], approvedDisposition: approved, advisoryFixTags: tags,
          fixAuthorization: createFixAuthorization({ dispositionState: approved, oldTarget: outcome.target }),
          predecessorDispositionSetId: original.currentDispositionSetId }],
    });
    const composed = await evidence.readDispositionRecord(original.operationId);
    expect(composed).toEqual({ ...expected, source: { kind: "attested-local",
      receiptRef: bindReviewSourceReference({ kind: "attested-local", operationId: original.operationId,
        durableRef: reviewOutcomeKey(outcome), repositoryId: outcome.target.repositoryId, workItem: owner }), localSourceRef: outcome.local!.sourceDigest } });
    expect(composed?.approvedDispositionLineage[0]).not.toHaveProperty("advisoryFixTags");
  });

  it.each(["errand", "delivery-member"] as const)("retains the complete native %s performed response", (kind) => {
    const { outcome, value } = performedEvidenceFixture(kind);
    const composed = composeReviewDispositionRecord(outcome, [ReviewEvidenceSchema.parse(value)], owner);
    const node = composed.approvedDispositionLineage[0]!;
    expect(kind === "errand" ? node.errandFixResponse : node.deliveryMemberFixResponse).toEqual(value.performance.fixResponse);
    expect(node.fixAuthorization?.fixAuthorizationId).toBe(value.performance.fixResponse!.fixConsumption.fixAuthorizationId);
    if (outcome.hosted !== undefined) expect(composed.source).toEqual({ kind: "hosted",
      attemptRef: bindReviewSourceReference({ kind: "hosted", operationId: laneProgressOperationId({
        lane: outcome.lane, repositoryId: outcome.target.repositoryId, headSha: outcome.target.headSha, lineage: outcome.lineage,
      }), durableRef: outcome.attemptId, repositoryId: outcome.target.repositoryId, workItem: owner }), hostedResultId: outcome.hosted.sealedResult!.hostedResultId });
    expect(ApprovedDispositionRecordSchema.safeParse(composed).success).toBe(true);
  });

  it("binds frontline source coordinates to the stored outcome while retaining its private-member owner", () => {
    const { outcome, value } = privateMemberEvidenceFixture();
    const composed = composeReviewDispositionRecord(outcome, [value], owner);
    expect(composed.source).toEqual({ kind: "frontline", outcomeRef: bindReviewSourceReference({
      kind: "frontline", operationId: outcome.attemptId, durableRef: reviewOutcomeKey(outcome), repositoryId: outcome.target.repositoryId, workItem: owner,
    }) });
    if (value.binding?.kind !== "candidate-member") throw new Error("Expected native private-member binding");
    expect(composed.candidate).toEqual(value.binding.candidate);
    expect(composed.deliveryMember).toEqual(value.binding.deliveryMember);
  });
});
