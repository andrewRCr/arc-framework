/** Candidate chain confirmation through production pre-publication dependencies and real records. */
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GitExec } from "../../src/lib/git/exec.js";
import { writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { IntegrationBoundaryLocusSchema } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { handleReviewLocalPrepare, handleReviewResolve } from "../../src/handlers/review.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import { inProcessReview, localReviewResult, type PreparedLocalReview } from "../helpers/in-process-review.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createCandidateAttestation, createCandidateReviewResponseEvidence } from "../../src/lib/work-unit/candidate-attestation.js";
import { readCandidateRecordVersioned, writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateSubject } from "../../src/lib/work-unit/git-candidate-subject.js";
import { ApprovedDispositionRecordSchema } from "../../src/scripts/review-gate/core/advisory-records.js";
import { createFixAuthorization, consumeFixAuthorization } from "../../src/scripts/review-gate/core/fix-authorization.js";
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { createHostedAdmission, type HostedRequestHandle } from "../../src/scripts/review-gate/hosted/request.js";
import { LocalApprovedDispositionRecordStore } from "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { acknowledgeHostedRequest, bindHostedAttemptDisposition, hostedLaneAttemptId, recordHostedAwaitAttempt,
  recordHostedRequestAdmission, recordLaneResponsePerformance } from "../../src/scripts/review-gate/lane-progress.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { approvedRecord } from "../fixtures/review-response-proof.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => removeGitBackedDir(root))); });
async function candidateFix(local = false, member = false) {
  const cwd = await createTempRepoCore({ prefix: "arc-pre-publication-correction-", identity: "andrew" });
  roots.push(cwd);
  const realExec = makeGitExec(cwd);
  const exec: GitExec = async (command, args, options) => {
    if (command !== "gh") return realExec(command, args, options);
    if (args[0] === "pr" && args[1] === "list") return { stdout: "[]", stderr: "" };
    throw new Error(`Unexpected host invocation: ${args.join(" ")}`);
  };
  const git = async (...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();
  await mkdir(join(cwd, ".arc/system"), { recursive: true });
  await writeFile(join(cwd, ".arc/system/arc-config.yml"), "branch.base: main\nreview.standard_sources: [codex-pr, coderabbit-pr, delegated-agent]\nreview.standard_max_passes: 4\n");
  await writeFile(join(cwd, "source.ts"), "export const value = 0;\n");
  await git("add", "."); await git("commit", "-m", "base");
  const base = await git("rev-parse", "HEAD");
  const baseTree = await git("rev-parse", "HEAD^{tree}");
  await git("switch", "-c", "feat/example");
  await writeFile(join(cwd, "source.ts"), "export const value = 1;\n");
  await git("commit", "-am", "contribution");
  const collect = async (revision: string) => {
    const collected = await collectGitCandidateSubject({ cwd, name: "example", baseBranch: "main", exec, revision: await git("rev-parse", revision) });
    if (collected.status !== "collected") throw new Error(collected.detail);
    return collected.target;
  };
  const subject = await collect("HEAD");
  const candidate = { schemaVersion: 1 as const, semanticsVersion: "candidate-attestation/v1" as const,
    attestation: createCandidateAttestation({ workUnit: "example", subject: subject.subject, baseRevision: base,
      attestedBy: "andrew", attestedAt: "2026-10-18T00:00:00Z", verificationEvidenceRef: "test://verified" }),
    subject: subject.subject, transitions: [], lineageAttestations: [] };
  await mkdir(join(cwd, ".arc/active"), { recursive: true });
  await writeFile(join(cwd, ".arc/active/meta-example.md"), makeMetaFixture("example", {
    owner: "andrew", branch: "feat/example", workClass: "Light", taskList: "tasks-example.md" }));
  await writeCandidateRecord(cwd, "example", candidate, null);
  await writeSubmissionBoundary(cwd, IntegrationBoundaryLocusSchema.parse({ schemaVersion: 1,
    mode: "pre-publication-review", workUnit: "example", candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest, locus: "candidate-review-pending",
    nextAction: { kind: "run-self-review", command: "self-review", interactionText: "Review the Candidate." },
    policy: null, reservation: null }), null);
  await git("add", "."); await git("commit", "-m", "record candidate");
  const oldSubject = await collect("HEAD");
  const publisher = new RepositoryGitCommonStatePublisher(exec, cwd);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const store = new LocalReviewOperationStateStore(publisher);
  const dispositions = new LocalApprovedDispositionRecordStore(publisher);
  const reader = createRepositoryReviewResultReader(publisher);
  const memberIdentity = { kind: "delivery-member" as const, planId: "123e4567-e89b-12d3-a456-426614174000",
    deliverableId: canonicalDigest({ member: 1 }), workUnitId: SlugSchema.parse("example") };
  const lineage = member ? memberIdentity : { kind: "candidate" as const, candidateId: candidate.attestation.candidateId };
  const provider = member ? "coderabbit-pr" as const : "codex-pr" as const;
  const projection = { obligation: "required" as const, reasons: local || member ? ["routine-code", "frontline-inactive"] as const : ["sensitive-change-set"] as const,
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version, rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: local || member ? "incremental" as const : "full-final" as const, count: 1 as const };
  const review = async (pass: number, findings: boolean) => {
    if (local) {
      const output: string[] = []; const exitCodes: number[] = [];
      const headSha = await git("rev-parse", "HEAD");
      await handleReviewLocalPrepare("-", { resolveRoot: () => cwd,
        readText: async () => JSON.stringify({ schemaVersion: 1, evaluatorIdentity: "independent-reviewer",
          routingFacts: { contentKind: "code-bearing", reviewRisk: "routine", changeDeterminacy: "ordinary",
            ownership: "self", surfaceAuthority: "ordinary" },
          ...(pass === 1 ? {} : { coverageAdmission: { requestedCoverage: "incremental", correctionScope: {
            schemaVersion: 1, predecessorProducerId: firstProducerId, predecessorHeadSha: firstHead,
            basisHeadSha: firstHead, headSha,
            requiredFindings: [{ producerId: firstProducerId, findingId: "finding-1", locus: "source.ts:1" }] } } }),
        }),
        prepare: input => prepareLocalReview(input, createLocalPrepareDependencies({ cwd, exec })),
        write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
      expect(exitCodes, output.join("")).toEqual([]);
      const envelope = JSON.parse(output.join(""));
      expect(envelope).toMatchObject({ state: "ready" });
      const prepared = envelope.payload as PreparedLocalReview;
      await inProcessReview.attest(cwd, localReviewResult(prepared, `local-run-${pass}`, findings ? [{
        findingId: "finding-1", severity: "major", locus: "source.ts:1", evidenceUrlOrId: "test://finding-1" }] : []));
      return reader.readResult(prepared.operationId);
    }
    const headSha = await git("rev-parse", "HEAD");
    const target = { repository: "owner/repo", pullRequest: 42, headSha };
    const reviewTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: member ? "delivery-member" : "change-set",
      repositoryId, baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha,
      headTree: await git("rev-parse", "HEAD^{tree}") });
    const requirement = createReviewRequirement({ target: reviewTarget, projection,
      acceptableSources: [{ sourceKind: "hosted", qualifier: provider }], initialAdmission: "automatic" });
    if (requirement === null) throw new Error("missing requirement");
    const vehicle = member ? { ...memberIdentity, head: headSha } : undefined;
    const coverage = member && pass > 1 ? "incremental" as const : "complete" as const;
    const correctionScope = coverage === "complete" ? undefined : {
      schemaVersion: 1 as const, predecessorProducerId: firstProducerId!, predecessorHeadSha: firstHead!,
      basisHeadSha: firstHead!, headSha,
      requiredFindings: [{ producerId: firstProducerId!, findingId: "finding-1", locus: "source.ts:1" }] };
    const admission = createHostedAdmission({ schemaVersion: 1, repositoryId, lineage, logicalPass: pass,
      sourceId: provider, target, requestedCoverage: coverage, ...(vehicle === undefined ? {} : { vehicle }),
      ...(correctionScope === undefined ? {} : { correctionScope }), reviewTarget, requirement, actorIdentity: "1" });
    const handle: HostedRequestHandle = { schemaVersion: 1, provider, requestedCoverage: coverage,
      effectiveCoverage: coverage, target, admission, ...(vehicle === undefined ? {} : { vehicle }),
      artifact: { kind: "issue-comment", id: `request-${pass}`, url: `https://example.test/request-${pass}`,
        createdAt: `2026-10-18T00:0${pass}:00Z` } };
    const recorded = await recordHostedRequestAdmission(store, { repositoryId, lineage, reviewTarget, requirement,
      request: { schemaVersion: 1, target, provider, coverage, ...(vehicle === undefined ? {} : { vehicle }),
        ...(correctionScope === undefined ? {} : { correctionScope }) },
      progressVehicle: vehicle, actorIdentity: "1",
      authorizeCapacity: async () => undefined, now: handle.artifact.createdAt });
    if (recorded.state !== "admitted") throw new Error("missing admission");
    await acknowledgeHostedRequest(store, { admission: recorded.admission, handle, now: handle.artifact.createdAt });
    await recordHostedAwaitAttempt(store, { repositoryId, now: handle.artifact.createdAt,
      result: { ...(coverage === "complete" ? {} : { coverageEvidence: {
            schemaVersion: 1, kind: "provider-native-incremental", sourceId: "coderabbit-pr", requestArtifactId: handle.artifact.id,
            status: "established", baselineSha: firstHead!, headSha,
            providerGeneration: { artifactId: "summary-2", url: "https://example.test/summary-2",
              createdAt: handle.artifact.createdAt, updatedAt: handle.artifact.createdAt, actorIdentity: "136622811", appId: "347564" },
          } }), ...(findings ? { schemaVersion: 1, mode: "review-hosted-await", handle, state: "findings", nextAction: "triage",
        reviewUrl: "https://example.test/review", findings: [{ findingId: "finding-1", origin: "review-body",
          reviewId: "review-1", fingerprint: "fingerprint-1", settlement: "not-applicable", severity: pass === 1 ? "major" : "minor",
          locus: "source.ts:1", url: "https://example.test/review", body: "Fix the contribution.", sourceOrdinal: 1 }] }
        : { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
          reviewUrl: "https://example.test/review",  }) } });
    return reader.readResult(hostedLaneAttemptId(handle));
  };
  const first = await review(1, true);
  if (first.kind === "frontline") throw new Error("expected standard result");
  const firstProducerId = first.producerId;
  const firstHead = first.target.headSha;
  let record = approvedRecord(first, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  if (member) record = ApprovedDispositionRecordSchema.parse({ ...record,
    deliveryMember: { ...memberIdentity, head: first.target.headSha },
    approvedDispositionLineage: record.approvedDispositionLineage.map(node => ({ ...node,
      fixAuthorization: createFixAuthorization({ dispositionState: node.approvedDisposition, oldTarget: first.target }) })) });
  await dispositions.appendDispositionRecord(record);
  if (first.kind === "hosted") await bindHostedAttemptDisposition(store, { operationId: first.laneOperationId, attemptId: first.producerId,
    dispositionSetId: record.currentDispositionSetId,
    findingDispositions: [{ findingId: "finding-1", disposition: "fix", channelAction: "record-only" }],
    now: "2026-10-18T00:01:10Z" });
  await writeFile(join(cwd, "source.ts"), "export const value = 2;\n");
  await git("commit", "-am", "fix");
  const fixed = await collect("HEAD");
  if (!member) {
  const response = createCandidateReviewResponseEvidence({ candidateId: candidate.attestation.candidateId,
    oldTarget: oldSubject, newTarget: fixed, dispositionId: record.currentDispositionSetId,
    approvedBy: "andrew", appliedBy: "review-agent", applicability: "focused", approvedVerification: "focused",
    verificationEvidenceRefs: ["test://fix"], implementationChanged: true });
  await recordLaneResponsePerformance(store, { lane: "standard", repositoryId, headSha: first.target.headSha, lineage,
    attemptId: first.producerId, dispositionSetId: record.currentDispositionSetId, producedHeadSha: fixed.revision,
    candidateResponseId: response.responseId, now: "2026-10-18T00:01:20Z" });
  await writeCandidateRecord(cwd, "example", { ...candidate, transitions: [response] },
    (await readCandidateRecordVersioned(cwd, "example")).version);
  await git("add", "."); await git("commit", "-m", "record response");
  } else {
    const newTarget = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "delivery-member",
      repositoryId, baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha: fixed.revision,
      headTree: await git("rev-parse", "HEAD^{tree}") });
    record = ApprovedDispositionRecordSchema.parse({ ...record,
      approvedDispositionLineage: record.approvedDispositionLineage.map(node => ({ ...node, deliveryMemberFixResponse: {
        oldTarget: first.target, newTarget, applicability: "focused",
        fixConsumption: consumeFixAuthorization({ authorization: node.fixAuthorization!, oldTarget: first.target, newTarget,
          appliedBy: "review-agent", consumedAt: "2026-10-18T00:01:20Z", verificationRefs: ["test://fix"], priorConsumptions: [] }),
        hostedTarget: first.kind === "hosted" ? first.hostedTarget : null,
        hostedFixTarget: first.kind === "hosted" ? { ...first.hostedTarget, headSha: fixed.revision } : null,
      } })) });
    await dispositions.appendDispositionRecord(record);
    await recordLaneResponsePerformance(store, { lane: "standard", repositoryId, headSha: first.target.headSha, lineage,
      attemptId: first.producerId, dispositionSetId: record.currentDispositionSetId,
      producedHeadSha: fixed.revision, now: "2026-10-18T00:01:20Z" });
  }
  let current = await review(2, member);
  if (member) {
    const settlement = approvedRecord(current, [{ sourceVerification: "verified", verifiedSeverity: "minor", disposition: "defer" }]);
    await dispositions.appendDispositionRecord(settlement);
    if (current.kind !== "hosted") throw new Error("expected hosted member result");
    await bindHostedAttemptDisposition(store, { operationId: current.laneOperationId, attemptId: current.producerId,
      dispositionSetId: settlement.currentDispositionSetId,
      findingDispositions: [{ findingId: "finding-1", disposition: "defer", channelAction: "record-only" }],
      now: "2026-10-18T00:02:10Z" });
    await recordLaneResponsePerformance(store, { lane: "standard", repositoryId, headSha: current.target.headSha, lineage,
      attemptId: current.producerId, dispositionSetId: settlement.currentDispositionSetId,
      producedHeadSha: current.target.headSha, now: "2026-10-18T00:02:20Z" });
    current = await reader.readResult(current.producerId);
  }
  const remote = join(await git("rev-parse", "--git-common-dir"), "fixture-origin.git");
  await git("init", "--bare", remote);
  await git("remote", "add", "origin", "git@github.com:owner/repo.git");
  await git("config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git");
  return { cwd, exec, git, predecessor: await reader.readResult(first.producerId), current,
    dependencies: createPrePublicationCompositionDependencies({ cwd, exec }) };
}

describe("pre-publication correction confirmation", () => {
  it("proves an open-PR Candidate fix leg without carrying the earlier review", async () => {
    const { dependencies, predecessor, current } = await candidateFix();
    const target = { repository: "owner/repo", pullRequest: 42, headSha: current.target.headSha };
    await expect(dependencies.confirmIncrementalApplicability("example", predecessor, current, target)).resolves.toBe("applicable");
    await expect(dependencies.confirmPriorProducerApplicability("example", predecessor, current.target,
      current.admission.lineage, target)).resolves.not.toBe("applicable");
  });
  it.each(["resolve", "respond"] as const)("re-binds a private Candidate's local fix at %s", async surface => {
    const fixture = await candidateFix(true);
    const { current, cwd, exec } = fixture;
    if (current.kind === "frontline") throw new Error("expected standard result");
    const request = { ...responsePolicyRequestFixture({ repository: `local/${current.repositoryId}`,
      pullRequest: null, headSha: current.target.headSha, sourceId: "delegated-agent",
      reviewOperationId: current.producerId, completedPasses: 2,
      standardReview: { obligation: current.requirement.obligation, reasons: current.requirement.reasons,
        rubricVersion: current.requirement.rubricVersion, rubricDigest: current.requirement.rubricDigest,
        retrigger: current.requirement.retrigger, count: current.requirement.count } }),
      attempts: [{ sourceId: "delegated-agent", outcome: "clean" as const, reviewOperationId: current.producerId }] };
    if (surface === "respond") {
      await expect(createRespondDependencies({ cwd, exec }).resolvePolicy(request, current.target))
        .resolves.toMatchObject({ state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } });
    } else {
      const output: string[] = []; const exitCodes: number[] = [];
      await handleReviewResolve("-", { resolveRoot: () => cwd, readText: async () => JSON.stringify(request),
        write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
      expect({ exitCodes, result: JSON.parse(output.join("")) }).toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } } });
    }
  });

  it.each(["pre-publication", "respond"] as const)("re-binds a delivery member's fix check with findings at %s", async surface => {
    const { dependencies, predecessor, current, cwd, exec } = await candidateFix(false, true);
    const target = { repository: "owner/repo", pullRequest: 42, headSha: current.target.headSha };
    if (surface === "pre-publication") {
      await expect(dependencies.confirmIncrementalApplicability("example", predecessor, current, target)).resolves.toBe("applicable");
    } else {
      if (current.kind !== "hosted") throw new Error("expected hosted result");
      const request = { ...responsePolicyRequestFixture({ ...target, sourceId: current.sourceIdentity,
        reviewOperationId: current.producerId, completedPasses: 2,
        standardReview: { obligation: current.requirement.obligation, reasons: current.requirement.reasons,
          rubricVersion: current.requirement.rubricVersion, rubricDigest: current.requirement.rubricDigest,
          retrigger: current.requirement.retrigger, count: current.requirement.count } }),
        attempts: [{ sourceId: current.sourceIdentity, outcome: "findings" as const, reviewOperationId: current.producerId }] };
      await expect(createRespondDependencies({ cwd, exec }).resolvePolicy(request, current.target))
        .resolves.toMatchObject({ state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } });
    }
  });

});
