/** Production review registrations admit, check, and read back review records over a real ref backend. */
import { expect, it } from "vitest";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { bindNativeReviewPorts } from "../helpers/store/native-review-ports.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitExec } from "../helpers/integration.js";
import { localOutcome } from "../fixtures/review-outcome.js";
import { reviewEvidenceFixture } from "../fixtures/review-evidence.js";
import { createHostedHandleFixture } from "../fixtures/hosted-review.js";
import { createRefStore, RecordReferenceSchema, type Store } from "../../src/lib/store/index.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { renderMetaFile } from "../../src/lib/store/kinds/meta/writers.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { reviewOutcomeKey } from "../../src/lib/store/kinds/review/outcome/key.js";
import { ReviewEvidenceSchema } from "../../src/lib/store/kinds/review/evidence/schema.js";
import { composeReviewDispositionRecord } from "../../src/lib/store/kinds/review/evidence/composed-record.js";
import { createApprovedFixReviewDecision } from "../../src/lib/store/kinds/review/decision/approved-fix.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { createDispositionSet, approveDispositionSet } from "../../src/scripts/review-gate/core/dispositions.js";
import { publishNativeReviewApproval } from "../../src/scripts/review-gate/runtime/native-review-approval.js";
import { publishNativeConditionalPass } from "../../src/scripts/review-gate/runtime/native-conditional-pass.js";
import { publishNativeReviewSuccessor } from "../../src/scripts/review-gate/runtime/native-review-successor.js";

const projectId = "34567890-1234-4234-8234-123456789abc";
const provenance = { verb: "seed", lifecycleAction: "create" };

it("writes an outcome, its approval, an approved-fix grant, and a successor, refusing a grant with no stored producer",
  async () => {
    const f = await refSyncFixture();
    const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
    success(await f.a.store.write({ action: "put", reference: identity, expected: null,
      content: JSON.stringify({ projectId }), provenance }));
    const meta = success(await f.a.store.write({ action: "put", expected: null, placement: { kind: "active" },
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "example" } }),
      content: renderMetaFile("example", { state: "Active", owner: "test-user", workClass: "Light", currentWorkflow: "process-task-loop" }),
      provenance: { verb: "start", lifecycleAction: "activate" } }));
    const owner = meta.reference.owner;
    const bind = (store: Store) => ({ ...bindNativeReviewPorts({ store, owner, projectId: createProjectIdentityReader(store),
      publisher: new RepositoryGitCommonStatePublisher(makeGitExec(f.a.root), f.a.root) }), readProjectId: createProjectIdentityReader(store) });
    const ports = bind(f.a.store), now = () => "2026-10-30T12:01:00Z";
    const target = createHostedHandleFixture({ repositoryId: projectId }).admission.reviewTarget;
    const outcome = ReviewOutcomeSchema.parse(localOutcome({ target, outcome: "findings", vehicle: { kind: "work-unit", identity: "example" },
      findings: [{ findingId: "finding-1", severity: "major", locus: "src/example.ts:1", evidenceUrlOrId: "finding-1", sourceOrdinal: 1 }] }));
    await ports.outcomes.create(outcome);
    const approved = reviewEvidenceFixture(outcome, "fix");
    const prior = await publishNativeReviewApproval({ ...ports, now,
      record: composeReviewDispositionRecord(outcome, [approved], owner) });

    const capture = { lane: outcome.lane, repositoryId: projectId, headSha: outcome.target.headSha, lineage: outcome.lineage,
      producerId: outcome.attemptId, dispositionSetId: approved.dispositionSet.dispositionSetId,
      authorizedBy: approved.approval.approvedBy, exhaustedPassCount: outcome.logicalPass, nextPass: outcome.logicalPass + 1,
      now: "2026-10-30T12:02:00Z" };
    const unbound = createApprovedFixReviewDecision({ ...capture, producerId: "local/missing-producer",
      originatingHeadSha: capture.headSha, capturedAt: capture.now });
    await expect(ports.decisions.create(unbound)).rejects.toMatchObject({
      refusal: { code: "record-malformed", rule: "review.decision.approved-fix-producer" } });
    const grant = await publishNativeConditionalPass({ ...ports, capture });

    const { dispositionSetId: ignored, ...original } = prior.value.dispositionSet;
    void ignored;
    const dispositionSet = createDispositionSet({ ...original, proposedBy: "successor-proposer" });
    const next = ReviewEvidenceSchema.parse({ ...prior.value, dispositionSet, predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId,
      approval: approveDispositionSet({ dispositionSet, approvedBy: "andrew", approvedAt: "2026-10-30T12:03:00Z" }) });
    const successor = await publishNativeReviewSuccessor({ ...ports, now, store: f.a.store,
      record: composeReviewDispositionRecord(outcome, [{ ...prior.value,
        successorDispositionSetId: dispositionSet.dispositionSetId }, next], owner) });

    const reopened = bind(createRefStore(f.a.ports));
    expect((await reopened.outcomes.read(reviewOutcomeKey(outcome)))?.value).toEqual(outcome);
    expect(await reopened.decisions.read(reviewDecisionKey(grant.value))).toEqual(grant);
    expect(await reopened.decisions.read(reviewDecisionKey(unbound))).toBeNull();
    expect(await reopened.evidence.read(dispositionSet.dispositionSetId)).toEqual(successor);
    expect(await reopened.evidence.readDispositionRecord(outcome.attemptId)).toMatchObject({
      currentDispositionSetId: dispositionSet.dispositionSetId, approvedDispositionLineage: [
        { successorDispositionSetId: dispositionSet.dispositionSetId },
        { predecessorDispositionSetId: prior.value.dispositionSet.dispositionSetId }] });
  }, 60_000);
