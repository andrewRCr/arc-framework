/** Default status retains linked work-unit ownership through stored review composition. */
import { expect, it, onTestFinished } from "vitest";
import { createReviewHarness } from "../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../helpers/store/review-checkout.js";
import { scriptRawGitExec, type GitExecScriptEntry } from "../../../helpers/git-exec-fake.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../../src/lib/work-unit/candidate-attestation.js";
import { createProjectIdentityReader } from "../../../../src/lib/store/project-identity.js";
import { createStandardReviewReservation, IntegrationBoundaryLocusV2Schema } from "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { boundaryV2Fixture } from "../../../fixtures/review-boundary.js";
import { createReviewStatusPort, readRoutedObligation } from "../../../../src/scripts/review-gate/status-composition.js";
import { assessDeliveryLandingReviewReadiness } from "../../../../src/scripts/review-gate/delivery-landing-readiness.js";
import { createHostedHandleFixture } from "../../../fixtures/hosted-review.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
const head = "a".repeat(40), branch = "topic/opaque";
async function fixture(script: GitExecScriptEntry[] = []) {
  const h = createReviewHarness();
  await h.seedProject(projectId);
  const checkout = await createReviewCheckout(h, { script: [...script,
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
  return { ...checkout, primary, run: (store: Store = checkout.store) => readRoutedObligation(checkout.cwd, checkout.exec,
    { repository: "owner/repo", headRef: branch, headSha: head }, 42, undefined, head, undefined, undefined,
    { store, projectId: createProjectIdentityReader(store), rawExec: scriptRawGitExec([]).exec }) };
}

it("reads an adopted branch's native lane without owner injection or a metadata file", async () => {
  const h = await fixture();
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ state: "review-required" });
});

it("raises a native refusal of the work unit's publication-boundary read, and reads the lane after repair", async () => {
  const h = await fixture();
  let unreadable = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => unreadable && input.reference.kind === "review/integration-boundary" ? { status: "refused",
    refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "review",
      condition: "The review namespace cannot be read.", remedy: { text: "Restore the review namespace, then retry." } }) }
    : h.store.read(input);
  await expect(h.run(store)).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true,
    refusal: { code: "namespace-corrupt", condition: "The review namespace cannot be read." } });
  unreadable = false;
  expect(await h.run(store)).toMatchObject({ state: "review-required" });
});

const changeRequestScript: GitExecScriptEntry[] = [
  { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: branch }] },
  { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
  { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: `${head}\trefs/heads/${branch}` }] },
  { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repo.git" }] },
  { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repo", "--state", "all", "--head", branch] },
    responses: [{ stdout: JSON.stringify([{ number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
      baseRefName: "main", headRefName: branch, headRefOid: head }]) }] },
  { match: ["fetch", "origin", "main"], responses: [{ stdout: "" }] },
  { match: ["rev-parse", "--verify", "refs/remotes/origin/main"], responses: [{ stdout: head }] },
  { match: ["merge-base", "--is-ancestor", head, head], responses: [{ stdout: "" }] },
];

it("raises a native store refusal whole through the composed status port and landing readiness", async () => {
  const h = await fixture(changeRequestScript);
  let unreadable = true;
  const store = Object.create(h.store) as Store;
  store.read = async input => unreadable && input.reference.kind === "review/integration-boundary" ? { status: "refused",
    refusal: StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "review",
      condition: "The review namespace cannot be read.", remedy: { text: "Restore the review namespace, then retry." } }) }
    : h.store.read(input);
  const port = createReviewStatusPort({ cwd: h.cwd, exec: h.exec, store, projectId: createProjectIdentityReader(store),
    rawExec: scriptRawGitExec([]).exec });
  const target = { repository: "owner/repo", headRef: branch, headSha: head };
  const refusal = { name: "StoreRefusalError", offBranch: true, refusal: { code: "namespace-corrupt" } };
  await expect(port.observe(target)).rejects.toMatchObject(refusal);
  await expect(assessDeliveryLandingReviewReadiness(target, port)).rejects.toMatchObject(refusal);
  unreadable = false;
  expect(await h.run(store)).toMatchObject({ state: "review-required" });
});
