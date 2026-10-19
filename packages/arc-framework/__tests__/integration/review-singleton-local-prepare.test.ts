/** Ordinary local review binds a Candidate's reserved obligation through real preparation and attestation. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { makeGitExec } from "../helpers/integration.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { inProcessReview, localReviewResult } from "../helpers/in-process-review.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { createCandidateAttestation } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { createStandardReviewReservation, IntegrationBoundaryLocusSchema, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { projectStandardReviewObligation } from "../../src/scripts/review-gate/policy/standard-review-projection.js";
import { resolveReviewRouting } from "../../src/scripts/review-gate/policy/routing.js";
import { createReviewRequirement } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });
const routingFacts = { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "ordinary",
  ownership: "self", surfaceAuthority: "ordinary" } as const;

it("refuses conflicting routing, then records the reserved singleton requirement after repair", async () => {
  const cwd = await createTempRepoCore({ prefix: "arc-singleton-reserved-local-", identity: "andrew" });
  roots.push(cwd);
  const exec = makeGitExec(cwd);
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"),
    "branch.base: main\nreview.standard_sources: [codex-pr, delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, "source.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "base");
  const baseRevision = await git("rev-parse", "HEAD");
  await git("switch", "-c", "feat/example");
  await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
  await git("commit", "-am", "contribution");
  const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec });
  if (collected.status !== "collected") throw new Error(collected.detail);
  const attestation = createCandidateAttestation({ workUnit: "example", subject: collected.target.subject,
    baseRevision, attestedBy: "andrew", attestedAt: "2026-10-18T00:00:00Z", verificationEvidenceRef: "test://verified" });
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", {
    state: "Integrating", currentWorkflow: "integrate-work-unit", owner: "andrew", branch: "feat/example", workClass: "Light", taskList: "tasks-example.md" }));
  await writeCandidateRecord(cwd, "example", { schemaVersion: 1, semanticsVersion: "candidate-attestation/v1",
    attestation, subject: collected.target.subject, transitions: [], lineageAttestations: [] }, null);
  await writeSubmissionBoundary(cwd, IntegrationBoundaryLocusSchema.parse({ schemaVersion: 1,
    mode: "pre-publication-review", workUnit: "example", candidateId: attestation.candidateId,
    candidateSubjectDigest: collected.target.subject.subjectDigest, locus: "candidate-review-pending",
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." },
    policy: null, reservation: null }), null);
  await git("add", "."); await git("commit", "-m", "record Candidate");
  const dependencies = createLocalPrepareDependencies({ cwd, exec });
  const { authority } = await dependencies.resolveAuthority("independent-reviewer");
  const assurance = await dependencies.composeAssurance(authority);
  if (assurance.status !== "resolved") throw new Error("expected resolved work-unit assurance");
  const obligation = projectStandardReviewObligation(resolveReviewRouting({ schemaVersion: 1, ...routingFacts,
    changeSetState: "known", assurance: assurance.assurance, activity: assurance.activity }).decision);
  const current = await readSubmissionBoundaryVersioned(cwd, "example");
  if (current.boundary === null || current.version === null) throw new Error("expected Candidate boundary");
  const reservation = createStandardReviewReservation({ candidateId: attestation.candidateId, sourceId: "codex-pr",
    sources: ["codex-pr", "delegated-agent"], obligation,
    target: { kind: "pinned-head", repository: "owner/repo", headSha: await git("rev-parse", "HEAD") } });
  await writeSubmissionBoundary(cwd, projectPublicationBoundary({ workUnit: "example", branch: "feat/example",
    candidateId: attestation.candidateId, candidateSubjectDigest: collected.target.subject.subjectDigest,
    reservation, changeRequest: { repository: "owner/repo", pullRequest: 42 } }), current.version);
  await git("add", "."); await git("commit", "-m", "reserve standard review");
  const request = { schemaVersion: 1, evaluatorIdentity: "independent-reviewer", routingFacts,
    policyJudgment: { invocation: { mode: "force", sourceId: "delegated-agent" } } };
  await expect(inProcessReview.prepare(cwd, { ...request, routingFacts: { ...routingFacts, reviewRisk: "routine" } }))
    .rejects.toThrow(/reserved.*obligation/u);
  const prepared = LocalPrepareEnvelopeSchema.parse(await inProcessReview.prepare(cwd, request));
  expect(prepared).toMatchObject({ state: "ready" });
  if (prepared.state !== "ready") throw new Error("expected reserved local preparation");
  await inProcessReview.attest(cwd, localReviewResult(prepared.payload, "reserved-local-pass", []));
  const result = await createRepositoryReviewResultReader(new RepositoryGitCommonStatePublisher(exec, cwd))
    .readResult(prepared.payload.operationId);
  if (result.kind !== "attested-local") throw new Error("expected attested local result");
  expect(result.admission.lineage).toEqual({ kind: "candidate", candidateId: attestation.candidateId });
  expect(result.requirement).toEqual(createReviewRequirement({ target: result.target, projection: reservation.obligation,
    acceptableSources: result.requirement.acceptableSources, initialAdmission: result.requirement.initialAdmission }));
  await expect(inProcessReview.prepare(cwd, { ...request, routingFacts: { ...routingFacts, reviewRisk: "routine" } }))
    .rejects.toThrow(/reserved.*obligation/u);
  await expect(inProcessReview.prepare(cwd, request)).resolves.toMatchObject({ state: "review-complete",
    payload: { operationId: prepared.payload.operationId } });
}, 60_000);
