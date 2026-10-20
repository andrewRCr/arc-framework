/** Native publication parameters backed by production review reads and claim preparation. */
import { onTestFinished } from "vitest";
import { createReviewCheckout } from "../helpers/store/review-checkout.js";
import type { createReviewHarness } from "../helpers/store/review-harness.js";
import { createProjectIdentityReader } from "../../src/lib/store/project-identity.js";
import { lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { candidateFixture } from "../helpers/store/tracked-write-fixture.js";
import { boundaryV2Fixture } from "./review-boundary.js";
import { createReviewCompositionContext } from "../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../src/scripts/review-gate/runtime/readiness-binding.js";
import { readWorkUnit } from "../../src/lib/store/lifecycle-write.js";
import { readCandidateRecord } from "../../src/lib/store/kinds/review/candidate/access.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/store/kinds/review/integration-boundary/access.js";
import { prepareNativePublicationClaim } from "../../src/lib/store/kinds/review/integration-boundary/publication.js";
import { IntegrationBoundaryLocusV2Schema, type IntegrationBoundaryLocusV2 } from "../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";

/** Keep lifecycle scenarios on real native readiness and an unwritten publication claim. */
export async function nativePublicationParameters(h: ReturnType<typeof createReviewHarness>, check: () => Promise<void>, record = candidateFixture()) {
  const repositoryId = "123e4567-e89b-42d3-a456-426614174099";
  const projects = lifecycleSuccess(await h.store.list({ family: "project-registry", kind: "project-registry/identity" }));
  if (projects.status === "absent") await h.seedProject(repositoryId);
  const checkout = await createReviewCheckout({ ...h, projectId: createProjectIdentityReader(h.store) });
  onTestFinished(checkout.cleanup);
  await checkout.occupy("feat/example", { kind: "work-unit", name: "example" });
  const primary = await readWorkUnit(h.store, "example");
  const owner = primary.status === "ok" ? primary.result.reference.owner : undefined;
  const candidateId = record.attestation.candidateId, candidateSubjectDigest = record.subject.subjectDigest;
  const forbidden = (): Promise<never> => Promise.reject(new Error("legacy publication authority"));
  const family = owner === undefined ? undefined : createReviewCompositionContext({ ...checkout, workItem: owner }).family;
  const readReadinessBinding = () => owner === undefined || family === undefined
    ? Promise.resolve({ status: "incomplete" as const, condition: "No publication owner" })
    : readReviewReadinessBinding({ store: h.store, workItem: owner, inFlight: family.ports.inFlight,
      repositoryId, candidateId, headSha: "a".repeat(40) });
  const binding = await readReadinessBinding();
  const boundary = IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("candidate-publish-ready"), candidateId,
    candidateSubjectDigest, reservation: null, readinessBinding: binding.status === "complete" ? binding.digest : candidateSubjectDigest });
  if (owner !== undefined && (await readCandidateRecord(checkout.cwd, "example", { store: h.store, owner }))?.attestation.candidateId === candidateId) {
    const stored = await readSubmissionBoundaryVersioned(checkout.cwd, "example", { store: h.store, owner });
    if (stored.boundary === null) await writeSubmissionBoundary(checkout.cwd, boundary, null, { store: h.store, owner });
  }
  const snapshot = owner === undefined ? null : await readSubmissionBoundaryVersioned(checkout.cwd, "example", { store: h.store, owner });
  return { name: "example", candidateId, candidateSubjectDigest, candidateCurrent: true, boundary, readReadinessBinding,
    refreshCandidateAuthorization: async () => { await check(); return { candidateId, candidateSubjectDigest, candidateCurrent: true }; },
    readStandardLaneOwnerVersion: forbidden, claimPublicationBoundary: forbidden,
    preparePublicationClaim: async (claim: IntegrationBoundaryLocusV2) => {
      await check();
      if (owner === undefined || snapshot === null) throw new Error("No publication owner");
      return prepareNativePublicationClaim({ store: h.store, cwd: checkout.cwd, owner, boundary: claim,
        expectedVersion: snapshot.version, readReadinessBinding });
    } };
}
