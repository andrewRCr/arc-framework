/** Native pre-publication defaults retain the named primary before accessing review facts. */
import { expect, it, onTestFinished } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handleReviewPrePublication } from "../../../src/handlers/review.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence } from "../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { readSubmissionBoundaryVersioned } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";

const projectId = "123e4567-e89b-42d3-a456-426614174099";
async function fixture(project = true) {
  const h = createReviewHarness();
  if (project) await h.seedProject(projectId);
  const head = "a".repeat(40), base = "b".repeat(40), branch = "topic/opaque";
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    { match: ["merge-base", "--all", "refs/heads/main", head], responses: [{ stdout: base }] },
    { match: ["diff", "--cached", "--name-only", "-z", base, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--name-only", "-z", base, head, "--"], responses: [{ stdout: "" }] },
    { match: ["config", "--get", "remote.origin.url"], responses: [{ stdout: "https://github.com/owner/repository.git" }] },
    { match: ["config", "--get-all", "arc.frontlineSources"], responses: [{ failure: { exitCode: 1 } }] },
    { match: ["rev-parse", "--show-object-format"], responses: [{ stdout: "sha1" }] },
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "" }] },
    { match: ["check-ref-format", "--branch", branch], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", `refs/heads/${branch}^{commit}`], responses: [{ stdout: head }] },
    { match: ["ls-remote", "--heads", "origin", `refs/heads/${branch}`], responses: [{ stdout: "" }] },
    { command: "gh", match: { prefix: ["pr", "list", "--repo", "owner/repository", "--state", "all"] }, responses: [{ stdout: "[]" }] },
    ...[head, base].flatMap(revision => [
      { match: ["rev-parse", "--verify", revision], responses: [{ stdout: revision }] },
      { match: ["cat-file", "-t", revision], responses: [{ stdout: "commit" }] },
      { match: ["rev-parse", `${revision}^{tree}`], responses: [{ stdout: "c".repeat(40) }] },
    ]),
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy(branch, { kind: "work-unit", name: "example" });
  const seedCandidate = async (convergence = false) => {
    const primary = await h.seedMeta("example", { branch: null }, { kind: "active" }, {
      branches: [{ repository: projectId, ref: branch, linkedAs: "adopted", excluded: [] }],
    });
    const subject = createCandidateSubjectSnapshot([]);
    let candidate = CandidateManagedRecordV1Schema.parse({ schemaVersion: 1, semanticsVersion: "candidate-attestation/v1", subject,
      attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
        attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] });
    if (convergence) {
      const oldSubject = createCandidateSubjectSnapshot([{ path: "src/example.ts", mode: "100644",
        digest: canonicalDigest({ source: "reviewed" }), treatment: "reviewable" }]);
      const attestation = createCandidateAttestation({ workUnit: "example", subject: oldSubject, baseRevision: base,
        attestedBy: "test-user", attestedAt: "2026-10-19T11:00:00Z", verificationEvidenceRef: "verified" });
      const response = createCandidateReviewResponseEvidence({ candidateId: attestation.candidateId,
        oldTarget: { revision: base, subject: oldSubject }, newTarget: { revision: head, subject },
        dispositionId: canonicalDigest({ response: 1 }), approvedBy: "test-user", appliedBy: "test-user",
        applicability: "full", approvedVerification: "full", verificationEvidenceRefs: ["verified-response"], implementationChanged: true });
      candidate = CandidateManagedRecordV1Schema.parse({ ...candidate, attestation, subject: oldSubject, transitions: [response] });
    }
    await h.seedCandidate(primary.reference.owner, candidate);
    await h.seedBoundary(primary.reference.owner, IntegrationBoundaryLocusV2Schema.parse({ schemaVersion: 2,
      mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
      candidateSubjectDigest: subject.subjectDigest, locus: "candidate-review-pending", reservation: null,
      nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." } }));
    return primary.reference.owner;
  };
  return { ...checkout, seedCandidate, run: async (settled = false) => {
    let output = "";
    await handleReviewPrePublication("example", settled ? { selfReview: "settled", lanes: "lanes.json" } : {}, { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify({ frontline: { invocation: { mode: "skip" } } }),
      write: text => { output += text; }, setExitCode: () => {} }, undefined,
    { ...checkout, projectId: createProjectIdentityReader(checkout.store) });
    return JSON.parse(output) as unknown;
  } };
}

it("reaches self-review through the native default without an injected owner or metadata file", async () => {
  const h = await fixture();
  await h.seedCandidate();
  const version = lifecycleSuccess(await h.store.version());
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
});

it("persists native full convergence and emits merge verification through the default command", async () => {
  const h = await fixture();
  const owner = await h.seedCandidate(true);
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr]\n");
  const result = await h.run(true);
  expect(result, JSON.stringify(result)).toMatchObject({ schemaVersion: 2, locus: "candidate-convergence-verification-pending",
    nextAction: { kind: "run-convergence-verification", verificationKind: "merge" } });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ schemaVersion: 2, locus: "candidate-convergence-verification-pending",
      nextAction: { verificationKind: "merge" } });
});

it("retains the project-identity remedy and reaches self-review after repair", async () => {
  const h = await fixture(false);
  await h.seedCandidate();
  expect(await h.run()).toMatchObject({ error: { code: "project-identity-unavailable" },
    remedy: { argv: ["arc", "review", "pre-publication", "example"] } });
  await h.seedProject(projectId);
  expect(await h.run()).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
});

it("keeps the missing-Candidate response and reaches self-review after the records are created", async () => {
  const h = await fixture();
  expect(await h.run()).toMatchObject({ error: { message: "No managed Candidate record exists for `example`." } });
  await h.seedCandidate();
  expect(await h.run()).toMatchObject({ locus: "candidate-review-pending", nextAction: { kind: "run-self-review" } });
});
