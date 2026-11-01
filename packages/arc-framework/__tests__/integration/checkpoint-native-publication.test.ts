/** Native checkpoint composition retains the publication boundary's format and decision references. */
import { expect, it } from "vitest";
import { createNativeDeliveryReviewRepository } from "../helpers/store/native-delivery-repository.js";
import { createIntegrationCheckpointDependencies } from "../../src/scripts/integration/checkpoint-composition.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { createReviewDecisionPort } from "../../src/lib/store/kinds/review/decision/access.js";
import { reviewDecisionKey } from "../../src/lib/store/kinds/review/decision/key.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";

it("composes checkpoint readiness with a stored native terminus decision key", async () => {
  const h = await createNativeDeliveryReviewRepository();
  const decisions = createReviewDecisionPort(h.reference.store, h.primary.reference.owner);
  const decision = await decisions.create({ schemaVersion: 1, subject: { lineage: { kind: "candidate",
    candidateId: h.boundary.candidateId }, headSha: null, subjectDigest: h.boundary.candidateSubjectDigest },
    lane: "standard", choice: { kind: "terminus" }, decidedBy: "andrew", decidedAt: "2026-11-01T12:00:00Z",
    basis: { passCount: 1 } });
  const snapshot = await readSubmissionBoundaryVersioned(h.cwd, "example", h.access);
  await writeSubmissionBoundary(h.cwd, projectPublicationBoundary({ workUnit: "example", branch: "member-2",
    candidateId: h.boundary.candidateId, candidateSubjectDigest: h.boundary.candidateSubjectDigest,
    reservation: null, terminus: reviewDecisionKey(decision.value), readinessBinding: canonicalDigest({ ready: true }),
    changeRequest: { repository: "owner/repo", pullRequest: 42 } }, 2), snapshot.version, h.access);
  const dependencies = createIntegrationCheckpointDependencies({ cwd: h.cwd, exec: h.realExec,
    store: h.reference.store, workItem: h.primary.reference.owner, projectId: createProjectIdentityReader(h.reference.store) });
  const baseRevision = await h.git("rev-parse", "main");
  const candidate = await dependencies.readCandidate("example", baseRevision);
  if (candidate === null || !("status" in candidate) || candidate.status !== "current") throw new Error(JSON.stringify(candidate));
  const composed = await dependencies.composeReady({ workUnit: "example", baseRevision, candidate,
    lifecycle: await dependencies.readLifecycle("example"), delivery: { status: "not-applicable" } });
  expect(composed).toMatchObject({ approvedHead: h.heads[1], requirementSummary: { conclusion: "satisfied" },
    statusSummary: { changeRequest: { pullRequest: 42, headSha: h.heads[1] } } });
}, 60_000);
