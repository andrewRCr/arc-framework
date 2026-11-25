/** The locus probe reads a sibling checkout's in-repo delivery state from that checkout, never from the entering one. */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import { serializeCandidateManagedRecord } from "../../src/lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath, resolveSubmissionBoundaryPath } from "../../src/lib/store/kinds/review/paths.js";
import { writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { candidateFixture } from "../helpers/store/tracked-write-fixture.js";
import { deliveryStackPlanForWorkUnitFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { makeGitExec } from "../helpers/integration.js";
import { setupWorktreeSiblings } from "../helpers/multi-clone.js";

const IDENTITY = "test-user", WORK_UNIT = "example", BRANCH = `feat/${WORK_UNIT}`;

async function write(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

it("resolves an Integrating sibling's bound delivery from its own records while the entering checkout holds a stale copy", async () => {
  const harness = await setupWorktreeSiblings({ siblingBranch: BRANCH });
  onTestFinished(harness.cleanup);
  const sibling = harness.sibling, candidate = candidateFixture(WORK_UNIT), plan = deliveryStackPlanForWorkUnitFixture(WORK_UNIT);
  await write(sibling, `.arc/active/meta-${WORK_UNIT}.md`, renderMetaFile(WORK_UNIT, { state: "Integrating", owner: IDENTITY,
    branch: BRANCH, workClass: "Light", candidateId: candidate.attestation.candidateId, taskList: `tasks-${WORK_UNIT}.md` }));
  await write(sibling, `.arc/active/tasks-${WORK_UNIT}.md`,
    `# Tasks\n\n${renderDeliveryPlanSection(plan)}\n## **Phase 1:** Build\n\n### \`[x]\` **1.1 Build**\n`);
  await write(sibling, resolveCandidateRecordRelativePath(WORK_UNIT), serializeCandidateManagedRecord(candidate));
  await write(sibling, ".arc/system/.internal/worktree-marker.json", `${JSON.stringify({ spawnedByArc: true, wuName: WORK_UNIT,
    createdFor: { kind: "work-unit", name: WORK_UNIT }, spawningIdentity: IDENTITY, createdAt: "2026-07-14T00:00:00.000Z" })}\n`);
  const publisher = new RepositoryGitCommonStatePublisher(makeGitExec(sibling), sibling);
  expect(await new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec).publishCurrent(plan.planId, plan, null))
    .toMatchObject({ status: "ok" });
  expect(await new RepositoryDeliveryStateStore(publisher).publish(plan.planId, deliveryStateFixture(plan), 0))
    .toMatchObject({ status: "ok" });
  const reservation = createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
    sourceId: "delegated-agent", target: { kind: "delivery", repository: "owner/repo", workUnitId: WORK_UNIT, planId: plan.planId },
    obligation: { obligation: "required", reasons: ["sensitive-change-set"], rubricVersion: "standard-review/v1",
      rubricDigest: canonicalDigest({ rubric: 1 }), retrigger: "full-final", count: 1 } });
  await writeSubmissionBoundary(sibling, projectPublicationBoundary({ workUnit: WORK_UNIT, branch: BRANCH,
    candidateId: candidate.attestation.candidateId, candidateSubjectDigest: candidate.subject.subjectDigest, reservation,
    changeRequest: null }, 1), null);

  // The entering checkout keeps a stale, unreadable copy of the same work unit's boundary; only a read through the
  // wrong checkout's records ever opens it.
  await write(harness.primary, resolveSubmissionBoundaryPath(WORK_UNIT), "{ stale");

  const frame = await runDerivedLocusStateProbe({ cwd: harness.primary, identity: IDENTITY, baseBranch: "main",
    exec: makeGitExec(harness.primary) });

  const row = frame.roster.find(entry => !entry.checkout.primary);
  expect(row, JSON.stringify(frame)).toMatchObject({ kind: "work-unit", subject: { kind: "work-unit", key: WORK_UNIT },
    diagnostics: [], context: { kind: "resolved", sessionType: "integration" } });
}, 60_000);
