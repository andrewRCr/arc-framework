/** Ordinary next-look composition retains the selected Candidate history. */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectIdentityError } from "../../../src/lib/store/project-identity.js";
import { expect, it } from "vitest";
import { createLocalMappingFixture } from "../../fixtures/review-mapping.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { candidateFixture } from "../../helpers/store/tracked-write-fixture.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { readCandidateRecordVersioned, writeCandidateRecord } from "../../../src/lib/store/kinds/review/candidate/access.js";
import { createReviewEvidencePort } from "../../../src/lib/store/kinds/review/evidence/access.js";
import { serializeCandidateManagedRecord, createCandidateAttestation } from "../../../src/lib/work-unit/candidate-attestation.js";
import { ReviewPolicyCommandRequestSchema } from "../../../src/scripts/review-gate/policy/review-policy-driver.js";
import { RepositoryGitCommonStatePublisher } from "../../../src/lib/git-common-state.js";
import { resolveRepositoryIdentity } from "../../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { readResolveNextPassContext } from "../../../src/handlers/review-next-pass-context.js";

it("counts an inherited complete look from stored Candidate history without a Candidate file", async ({ onTestFinished }) => {
  const older = candidateFixture();
  const harness = createLifecycleHarness();
  const meta = await harness.seedMeta("example");
  await harness.seed(recordReferences["review/candidate"](meta.reference.owner), serializeCandidateManagedRecord(older));
  const producerFixture = await createLocalMappingFixture({ repositoryId: "123e4567-e89b-42d3-a456-426614174099",
    lineage: { kind: "candidate", candidateId: older.attestation.candidateId },
    vehicle: { kind: "work-unit", identity: "example" } });
  await producerFixture.conclude("clean");
  const producer = await producerFixture.resultReader.readResult(producerFixture.state.operationId);
  const fixture = { harness, owner: meta.reference.owner, fixture: producerFixture, producer };
  const current = { ...older, attestation: createCandidateAttestation({ ...older.attestation, subject: older.subject,
    attestedAt: "2026-08-13T14:00:00.000Z", supersedes: older.attestation.candidateId }) };
  const options = { store: fixture.harness.store, owner: fixture.owner };
  const prior = await readCandidateRecordVersioned("/unavailable", "example", options);
  await writeCandidateRecord("/unavailable", "example", current, prior.version, options);
  const root = await mkdtemp(join(tmpdir(), "review-next-context-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", "meta-example.md"), makeMetaFixture("example", { branch: "feat/example" }));
  if (fixture.producer.kind !== "attested-local") throw new Error("Expected local producer");
  const target = fixture.producer.target;
  const exec = scriptGitExec([
    { match: ["check-ref-format", "refs/heads/main"], responses: [{ stdout: "main" }] },
    { match: ["rev-parse", "--verify", "HEAD"], responses: [{ stdout: target.headSha }] },
    { match: ["rev-parse", "--verify", "refs/heads/main"], responses: [{ stdout: target.diffBaseSha }] },
    { match: { prefix: ["cat-file", "-t"] }, responses: [{ stdout: "commit" }] },
    { match: { prefix: ["status"] }, responses: [{ stdout: "" }] },
    { match: ["merge-base", "--all", target.diffBaseSha, target.headSha], responses: [{ stdout: target.diffBaseSha }] },
    { match: ["rev-parse", `${target.headSha}^{tree}`], responses: [{ stdout: target.headTree }] },
    { match: ["rev-parse", `${target.diffBaseSha}^{tree}`], responses: [{ stdout: target.diffBaseTree }] },
    { match: ["config", "--null", "--get", "arc.identity"], responses: [{ stdout: "andrew\0" }] },
    { match: ["rev-parse", "--abbrev-ref", "HEAD"], responses: [{ stdout: "feat/example" }] },
    { match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: join(root, "git-common") }] },
  ]).exec;
  await resolveRepositoryIdentity(new RepositoryGitCommonStatePublisher(exec, root), () => target.repositoryId);
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = fixture.producer.requirement;
  const request = ReviewPolicyCommandRequestSchema.parse({ schemaVersion: 1, lane: "standard",
    target: { repository: "example/repo", pullRequest: null, headSha: target.headSha }, completedPasses: 2, attempts: [],
    standardReview: { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } });
  const input = { root, exec, request, configuredSources: ["delegated-agent"],
    store: fixture.harness.store, workItem: fixture.owner, projectId: async () => target.repositoryId,
    operationStore: fixture.fixture.dependencies.operationStore, resultReader: fixture.fixture.resultReader,
    dispositionStore: createReviewEvidencePort(fixture.harness.store, fixture.owner) };
  expect(await readResolveNextPassContext(input)).toMatchObject({ completePasses: 1, convergence: "converged", responseDue: false });
  const terminalRequest = ReviewPolicyCommandRequestSchema.parse({ ...request,
    attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: producer.producerId }] });
  const unavailable = new ProjectIdentityError({ status: "unavailable", reason: "Project identity record is missing.",
    remedy: { text: "Restore the authoritative project identity." } });
  await expect(readResolveNextPassContext({ ...input, request: terminalRequest,
    projectId: async () => { throw unavailable; } })).rejects.toMatchObject({ failure: unavailable.failure });
  expect(await readResolveNextPassContext({ ...input, request: terminalRequest })).toMatchObject({ completePasses: 2 });
});
