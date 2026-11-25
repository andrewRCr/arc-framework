/** Store authority retained by pre-publication policy composition. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { storedLocalApproval } from "../../../../fixtures/review-family-access.js";
import { scriptGitExec } from "../../../../helpers/git-exec-fake.js";
import { createPrePublicationCompositionDependencies } from
  "../../../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { composePrePublicationReviewRequest } from "../../../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { createReviewHarness } from "../../../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../../../helpers/store/review-checkout.js";
import { createCandidateAttestation, createCandidateSubjectSnapshot } from "../../../../../src/lib/work-unit/candidate-attestation.js";
import { writeMetaState } from "../../../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "../../../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../../../src/lib/store/lifecycle-write.js";
import { ArchiveQuarterSchema } from "../../../../../src/lib/kernel/index.js";

async function nativeFixture() {
  const h = createReviewHarness();
  const head = "a".repeat(40), base = "b".repeat(40);
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/main"], responses: [{ stdout: base }] },
    { match: ["rev-parse", "--verify", "HEAD^{commit}"], responses: [{ stdout: head }] },
    { match: ["rev-parse", "HEAD"], responses: [{ stdout: head }] },
    { match: ["merge-base", "--all", head, base], responses: [{ stdout: base }] },
    { match: ["diff", "--cached", "--name-only", "-z", base, "--"], responses: [{ stdout: "" }] },
    { match: ["diff", "--name-only", "-z", base, head, "--"], responses: [{ stdout: "" }] },
  ] });
  onTestFinished(checkout.cleanup);
  const subject = createCandidateSubjectSnapshot([]);
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const, subject,
    attestation: createCandidateAttestation({ workUnit: "example", subject, baseRevision: head, attestedBy: "test-user",
      attestedAt: "2026-10-19T12:00:00Z", verificationEvidenceRef: "verified" }), transitions: [], lineageAttestations: [] };
  const dependencies = createPrePublicationCompositionDependencies({ ...checkout });
  return { ...checkout, candidate, dependencies };
}

it("keeps the missing-Candidate response without a primary and reads normally after records are created", async () => {
  const h = await nativeFixture();
  const before = lifecycleSuccess(await h.store.version());
  expect(await composePrePublicationReviewRequest({ workUnit: "example" }, h.dependencies))
    .toMatchObject({ status: "refused", reason: "No managed Candidate record exists for `example`." });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  const primary = await h.seedMeta("example", { branch: null });
  await h.seedCandidate(primary.reference.owner, h.candidate);
  expect(await h.dependencies.readCandidate("example")).toMatchObject({ status: "current",
    candidateId: h.candidate.attestation.candidateId });
});

it("retains the selected metadata generation for assurance after its name is reused", async () => {
  const h = await nativeFixture();
  const primary = await h.seedMeta("example", { branch: null, workClass: "Light" });
  await h.seedCandidate(primary.reference.owner, h.candidate);
  expect(await h.dependencies.readCandidate("example")).toMatchObject({ status: "current" });
  lifecycleSuccess(await h.store.write({ ...recordPut(primary, { content: writeMetaState(primary.content, "Shipped"),
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }),
  provenance: { verb: "archive", lifecycleAction: "archive" } }));
  const replacement = await h.seedMeta("example", { workClass: "Heavy", branch: null });
  expect(replacement.reference.owner).not.toEqual(primary.reference.owner);
  expect(await h.dependencies.readAssurance("example")).toMatchObject({ status: "resolved",
    assurance: { workContext: "work-unit", workClass: "Light" } });
});

describe("pre-publication composition store", () => {
  it("reads approved evidence from the selected work item without repository files", async () => {
    const fixture = await storedLocalApproval();
    const commonDir = await mkdtemp(join(tmpdir(), "prepub-store-"));
    try {
      const dependencies = createPrePublicationCompositionDependencies({
        cwd: "/unavailable",
        exec: scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec,
        store: fixture.harness.store, workItem: fixture.owner,
      });
      expect(await dependencies.dispositionStore.readDispositionRecord(fixture.original.operationId))
        .toEqual(await fixture.evidence.readDispositionRecord(fixture.original.operationId));
    } finally { await rm(commonDir, { recursive: true, force: true }); }
  });
});
