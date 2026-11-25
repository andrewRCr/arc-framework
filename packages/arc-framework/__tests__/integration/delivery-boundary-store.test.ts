/** Native delivery inspection reads its stored publication boundary through the default repository adapter. */
import { access } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createReviewRepositoryHarness } from "../helpers/store/review-differential.js";
import { candidateFixture } from "../helpers/store/tracked-write-fixture.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { inspectRepositoryDeliveryEntry } from "../../src/lib/delivery/repository-entry.js";
import { DeliveryEntryInspectionRequestSchema } from "../../src/lib/delivery/entry-inspection.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

it("continues a native delivery publication through its stored boundary without projected records", async ({ onTestFinished }) => {
  const repositories = await createReviewRepositoryHarness();
  onTestFinished(repositories.cleanup);
  const h = repositories.reference, projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example", { branch: null, taskList: "tasks-example.md" });
  const candidate = candidateFixture(), plan = deliveryStackPlanForWorkUnitFixture("example");
  await h.seedCandidate(primary.reference.owner, candidate);
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    `# Tasks\n\n${renderDeliveryPlanSection(plan)}\n## **Phase 1:** Build\n\n### \`[x]\` **1.1 Build**\n`);
  const checkout = repositories.native;
  const publisher = new RepositoryGitCommonStatePublisher(checkout.exec, checkout.cwd);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  expect(await states.publish(plan.planId, deliveryStateFixture(plan), 0)).toMatchObject({ status: "ok" });
  const reservation = createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
    sourceId: "delegated-agent", target: { kind: "delivery", repository: "owner/repo", workUnitId: "example", planId: plan.planId },
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
  const boundary = projectPublicationBoundary({ workUnit: "example", branch: "opaque", candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest, reservation, changeRequest: null, readinessBinding: null }, 2);
  await writeSubmissionBoundary(checkout.cwd, boundary, null, { store: h.store, owner: primary.reference.owner });
  const input = { ...checkout, workItem: primary.reference.owner, taskListPath: ".arc/active/tasks-example.md", baseBranch: "main",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }) };
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "continue-publication",
    publicationAction: boundary.nextAction });
  expect((await readSubmissionBoundaryVersioned(checkout.cwd, "example", { store: h.store, owner: primary.reference.owner })).boundary)
    .toEqual(boundary);
  await expect(access(join(checkout.cwd, ".arc/system/.internal/candidates/example.boundary.json"))).rejects.toMatchObject({ code: "ENOENT" });
}, 30_000);
