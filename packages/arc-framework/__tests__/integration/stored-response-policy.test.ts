import { expect, it, onTestFinished } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { reviewOutcomeKey } from "../../src/lib/store/kinds/review/outcome/key.js";
import { ReviewOutcomeSchema } from "../../src/lib/store/kinds/review/outcome/schema.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import { approvalPolicyBindingMismatches } from "../../src/scripts/review-gate/policy/approval-policy-binding.js";
import { DeliveryLocalReviewAdmissionSchema } from "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { createDeliveryLocalReviewAdmission, createLocalReviewPreparationFixture } from "../fixtures/local-review-preparation.js";
import { localOutcome } from "../fixtures/review-outcome.js";
import { responsePolicyRequest } from "../fixtures/review-response-policy.js";
import { seedProjectIdentity, seedStore } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { commitAll, createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

it("binds the approval request to the stored local findings producer's pull request and chunked scope", async () => {
  const identity = SlugSchema.parse("test-user");
  const root = await createTempRepoCore({ identity });
  onTestFinished(() => removeGitBackedDir(root));
  await commitAll(root);
  const repositoryId = await seedProjectIdentity(root, identity);
  const { memberTarget } = createLocalReviewPreparationFixture({ repositoryId });
  const wholeTarget = createDeliveryLocalReviewAdmission(memberTarget.headSha);
  const scopeSelection = { mode: "chunked" as const, target: wholeTarget.target };
  const admission = DeliveryLocalReviewAdmissionSchema.parse({ ...wholeTarget, scopeSelection });
  const { kind, planId, workUnitId, deliverableId } = admission.vehicle;
  const { meta } = await seedWorkUnit(root, workUnitId, { identity });
  const workItem = meta.reference.owner;
  const outcome = ReviewOutcomeSchema.parse(localOutcome({
    target: memberTarget, scopeMode: scopeSelection.mode, deliveryAdmission: admission,
    lineage: { kind, planId, workUnitId, deliverableId }, vehicle: { kind, identity: deliverableId },
    outcome: "findings", findings: [{ findingId: "finding-1", severity: "minor", sourceOrdinal: 1,
      locus: "example.ts:1", evidenceUrlOrId: "finding-1" }],
  }));
  const durableRef = reviewOutcomeKey(outcome);
  await seedStore(root, identity, [{ reference: recordReferences["review/outcome"](workItem, durableRef),
    content: JSON.stringify(outcome) }]);
  const receiptRef = bindReviewSourceReference({ kind: "attested-local", repositoryId, workItem,
    operationId: outcome.attemptId, durableRef });

  const request = await responsePolicyRequest(root, { kind: "attested-local", receiptRef }, "caller/other-repo");
  expect(request.scopeSelection).toEqual(scopeSelection);
  expect(approvalPolicyBindingMismatches(request, {
    lane: "standard", ...admission.target, scopeMode: scopeSelection.mode, completedPasses: admission.pass,
    finalAttempt: { outcome: "findings", reviewOperationId: outcome.attemptId },
  })).toEqual([]);
});
