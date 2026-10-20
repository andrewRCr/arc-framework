/** Native pre-publication defaults retain the named primary before accessing review facts. */
import { expect, it, onTestFinished } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { handleReviewPrePublication } from "../../../src/handlers/review.js";
import { CandidateManagedRecordV1Schema, createCandidateAttestation, createCandidateSubjectSnapshot, createCandidateReviewResponseEvidence } from "../../../src/lib/work-unit/candidate-attestation.js";
import { PrePublicationReplayInputSchema } from "../../../src/scripts/review-gate/policy/pre-publication-replay.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { IntegrationBoundaryLocusV2Schema } from "../../../src/scripts/review-gate/policy/integration-boundary-locus-v2.js";
import { createProjectIdentityReader } from "../../../src/lib/store/project-identity.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { projectPublicationBoundary, projectCandidateReviewResumeBoundary } from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { writeSubmissionBoundary, readSubmissionBoundaryVersioned } from "../../../src/lib/store/kinds/review/integration-boundary/access.js";

import { createReviewCompositionContext } from "../../../src/scripts/review-gate/runtime/composition-context.js";
import { readReviewReadinessBinding } from "../../../src/scripts/review-gate/runtime/readiness-binding.js";
import { readCandidateRecord } from "../../../src/lib/store/kinds/review/candidate/access.js";
import { recordNativeFrontlineSkip } from "../../../src/scripts/review-gate/runtime/native-frontline-window.js";
import { composePrePublicationReviewRequest } from "../../../src/scripts/review-gate/policy/pre-publication-request.js";
import { createPrePublicationCompositionDependencies } from "../../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { resolveReviewPolicy } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";

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
  return { ...checkout, seedCandidate, run: async (settled = false, lanes: unknown = { frontline: { invocation: { mode: "skip" } } }, resume?: string) => {
    let output = "";
    await handleReviewPrePublication("example", resume === undefined ? settled ? { selfReview: "settled", lanes: "lanes.json" } : {} : { resume }, { resolveRoot: () => checkout.cwd,
      readText: async () => JSON.stringify(lanes),
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

it("projects a native skipped window as proven closure through default pre-publication composition", async () => {
  const h = await fixture();
  const owner = await h.seedCandidate();
  await mkdir(join(h.cwd, ".arc/system/methods"), { recursive: true });
  await writeFile(join(h.cwd, ".arc/system/methods/code-review-frontline.md"), "---\nname: code-review-frontline\ndescription: Review the target\nactive: true\noverride-active: false\n---\nReview the target.\n");
  await writeFile(join(h.cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.frontline_sources: [coderabbit-cli]\nreview.standard_sources: [delegated-agent]\n");
  const invocation = { ...h, workItem: owner };
  const { family } = createReviewCompositionContext(invocation);
  if (family.mode !== "stored" || family.ports.inFlight.nativeFacts === undefined) throw new Error("Expected native facts");
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.store, owner });
  if (candidate === null) throw new Error("Expected the selected Candidate");
  await recordNativeFrontlineSkip({ invocation, facts: family.ports.inFlight.nativeFacts, repositoryId: projectId,
    lineage: { kind: "candidate", candidateId: candidate.attestation.candidateId }, headSha: "a".repeat(40),
    now: "2026-10-20T12:00:00Z" });
  const composition = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    changeSet: { schemaVersion: 1, changeSetState: "known", contentKind: "code-bearing", reviewRisk: "routine",
      changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" } },
  createPrePublicationCompositionDependencies(invocation));
  expect(composition, JSON.stringify(composition)).toMatchObject({ status: "composed" });
  if (composition.status !== "composed") throw new Error(composition.reason);
  expect(resolveReviewPolicy(composition.request.frontline)).toMatchObject({ state: "skipped",
    payload: { reason: "phase-closed" }, diagnostics: [{ code: "frontline-window-closed" }] });
});

it("records native readiness with the selected Candidate's complete review binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const result = await h.run(true, { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } });
  const stored = (await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary;
  const candidate = await readCandidateRecord(h.cwd, "example", { store: h.store, owner });
  if (candidate === null) throw new Error("expected the current Candidate");
  const { family } = createReviewCompositionContext({ ...h, workItem: owner });
  const binding = await readReviewReadinessBinding({ store: h.store, workItem: owner, inFlight: family.ports.inFlight,
    repositoryId: projectId, candidateId: candidate.attestation.candidateId, headSha: "a".repeat(40) });
  if (binding.status !== "complete") throw new Error(binding.condition);
  expect(result, JSON.stringify(result)).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: binding.digest });
  expect(stored).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready", readinessBinding: binding.digest });
  expect(stored).not.toHaveProperty("standardLaneOwnerVersion");
});

it.each(["candidate-publish-ready", "publication-pending"] as const)("re-enters native %s without recomposing saved judgments or changing records", async locus => {
  const h = await fixture(), owner = await h.seedCandidate();
  const first = await h.run(true, { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } });
  expect(first).toMatchObject({ schemaVersion: 2, locus: "candidate-publish-ready" });
  const ready = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (ready.boundary?.schemaVersion !== 2 || ready.boundary.locus !== "candidate-publish-ready") throw new Error("expected native readiness");
  const expected = locus === "candidate-publish-ready" ? ready.boundary : projectPublicationBoundary({ workUnit: "example", branch: "topic/opaque",
    candidateId: ready.boundary.candidateId, candidateSubjectDigest: ready.boundary.candidateSubjectDigest,
    reservation: ready.boundary.reservation, terminus: ready.boundary.terminus, readinessBinding: ready.boundary.readinessBinding, changeRequest: null }, 2);
  if (locus === "publication-pending") await writeSubmissionBoundary(h.cwd, expected, ready.version, { store: h.store, owner });
  const before = await h.store.version();
  expect(await h.run()).toMatchObject({ ...expected });
  expect(await h.store.version()).toEqual(before);
});

it("recovers native attestation ordering against its stored version and records the live readiness binding", async () => {
  const h = await fixture(), owner = await h.seedCandidate();
  const lanes = { frontline: { invocation: { mode: "skip" } }, standard: { terminus: { mode: "owner-accepted" } } };
  expect(await h.run(true, lanes)).toMatchObject({ locus: "candidate-publish-ready" });
  const ready = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  if (ready.boundary?.schemaVersion !== 2 || ready.boundary.locus !== "candidate-publish-ready"
    || ready.boundary.candidateSubjectDigest === null) throw new Error("Expected native readiness");
  const token = Buffer.from(JSON.stringify(PrePublicationReplayInputSchema.parse({ candidateId: ready.boundary.candidateId,
    candidateSubjectDigest: ready.boundary.candidateSubjectDigest, selfReview: "settled", lanes })), "utf8").toString("base64url");
  const pending = projectCandidateReviewResumeBoundary({ workUnit: "example", candidateId: ready.boundary.candidateId,
    candidateSubjectDigest: ready.boundary.candidateSubjectDigest, reservation: null, postAttestContinuation: {
      reviewedHead: "b".repeat(40), nextAction: { kind: "continue-pre-publication-review",
        command: `arc review pre-publication example --resume ${token}`, interactionText: "Resume review" } } }, 2);
  await writeSubmissionBoundary(h.cwd, pending, ready.version, { store: h.store, owner });
  const stored = await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner });
  const before = await h.store.version();
  const refusal = await h.run(true, lanes);
  expect(refusal).toMatchObject({ error: { code: "attestation-ordering-conflict" } });
  expect(await h.store.version()).toEqual(before);
  const action = (refusal as { remedy: { argv: string[] } }).remedy.argv;
  const resume = action[5];
  if (resume === undefined) throw new Error("Expected the explicit recovery token");
  expect(PrePublicationReplayInputSchema.parse(JSON.parse(Buffer.from(resume, "base64url").toString("utf8"))))
    .toMatchObject({ attestationOrderingRecovery: { expectedBoundaryVersion: stored.version } });
  expect(await h.run(false, undefined, resume)).toMatchObject({ locus: "candidate-publish-ready", schemaVersion: 2,
    readinessBinding: ready.boundary.readinessBinding });
  expect((await readSubmissionBoundaryVersioned(h.cwd, "example", { store: h.store, owner })).boundary)
    .toMatchObject({ locus: "candidate-publish-ready", schemaVersion: 2, readinessBinding: ready.boundary.readinessBinding });
});

it.each(["ceilingOverride", "additionalPassAuthorization"] as const)("records and relays a native %s judgment by its decision key", async field => {
  const h = await fixture(), owner = await h.seedCandidate();
  const invocation = { ...h, workItem: owner };
  const dependencies = createPrePublicationCompositionDependencies(invocation);
  const value = field === "ceilingOverride" ? { exhaustedPassCount: 0, nextPass: 1 }
    : { headSha: "a".repeat(40), precedingProducerId: "producer-1", completedPasses: 0, nextPass: 1 };
  const first = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled",
    lanes: { standard: { [field]: value } } }, dependencies);
  if (first.status !== "composed") throw new Error(JSON.stringify(first));
  expect(first.request.standard[field]).toMatchObject({ lane: "standard", target: { headSha: "a".repeat(40) } });
  const key = first.request.standard[field]?.decisionKey;
  expect(key).toEqual(expect.stringMatching(/^sha256:/u));
  const { family } = createReviewCompositionContext(invocation);
  if (family.mode !== "stored") throw new Error("Expected stored review facts");
  expect(await family.ports.decisions.list()).toMatchObject({ status: "complete", records: [{ reference: { key }, value: {
    lane: "standard", decidedBy: "test-user", basis: null, choice: { kind: "extra-pass", passCount: 0,
      precondition: { kind: field === "ceilingOverride" ? "ceiling" : "additional" } },
  } }] });
  const before = await h.store.version();
  for (const lanes of [undefined, { standard: { [field]: { ...value, decisionKey: key } } }]) {
    const replay = await composePrePublicationReviewRequest({ workUnit: "example", selfReview: "settled", lanes }, dependencies);
    expect(replay, JSON.stringify(replay)).toMatchObject({ status: "composed", request: { standard: { [field]: {
      decisionKey: key, lane: "standard", target: { headSha: "a".repeat(40) },
    } } } });
    expect(await h.store.version()).toEqual(before);
  }
});
