/** Default status retains linked work-unit ownership through stored review composition. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { scriptRawGitExec } from "../../../helpers/git-exec-fake.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { createProjectIdentityReader } from "../../../../src/lib/store/project-identity.js";
import { createStandardReviewReservation, IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { readRoutedObligation } from "../../../../src/scripts/review-gate/status-composition.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), branch = "topic/opaque";
async function fixture() {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["merge-base", "--all", head, head], responses: [{ stdout: head }] },
    { match: ["diff", "--name-only", "-z", head, head, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--cached", "--name-only", "-z", head, "--"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", head], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", `${head}^{commit}`], responses: [{ stdout: head }] },
    { match: ["cat-file", "-t", head], responses: [{ stdout: "commit" }] },
    { match: ["rev-parse", `${head}^{tree}`], responses: [{ stdout: "b".repeat(40) }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, { kind: "work-unit", name: "example" });
  const primary = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
    branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
  });
  const subject = createCandidateSubjectSnapshot([]);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const, subject,
    attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
      attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] };
  await h.seedCandidate(primary.reference.owner, candidate);
  const handle = createHostedHandleFixture({ repositoryId: projectId,
    target: { repository: "owner/repo", pullRequest: 42, headSha: head },
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId } });
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = handle.admission.requirement;
  const reservation = createStandardReviewReservation({ candidateId: candidate.attestation.candidateId,
    sourceId: "codex-pr", repository: "owner/repo", headSha: head,
    obligation: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } });
  await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ ...boundaryV2Fixture("hosted-review-pending"),
    workUnit: "example", candidateId: candidate.attestation.candidateId, candidateSubjectDigest: subject.subjectDigest,
    reservation }));
  return { ...checkout, primary, run: () => readRoutedObligation(checkout.cwd, checkout.exec,
    { repository: "owner/repo", headRef: branch, headSha: head }, 42, undefined, head, undefined, undefined,
    { store: checkout.store, projectId: createProjectIdentityReader(checkout.store), rawExec: scriptRawGitExec([]).exec }) };
}

it("reads an adopted branch's native lane without owner injection or a metadata file", async () => {
  const h = await fixture();
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ state: "review-required" });
});
