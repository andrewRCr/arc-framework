import type { GitExec } from "../../src/lib/git/exec.js";
import type { ReviewAdditionalPassAuthorization } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import type { StandardReviewObligationProjection } from "../../src/scripts/review-gate/policy/standard-review-projection-schema.js";
import { LocalPrepareEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { approvedRecord } from "../fixtures/review-response-proof.js";
import { proveReviewDeltaRange } from "../../src/scripts/review-gate/policy/review-delta-range-proof.js";
import { confirmReviewCorrectionLeg } from "../../src/scripts/review-gate/policy/review-next-pass.js";
import { deriveLocalReviewTarget } from "../../src/scripts/review-gate/hosts/local/repository-target.js";
/** Errand local fix checks, complete hosted successors, and historical correction evidence. */

import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { localPrepareAdmissionRemedy } from "../../src/scripts/review-gate/runtime/review-policy-remedy.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { createLocalAttestDependencies } from "../../src/scripts/review-gate/runtime/local-attest-composition.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { attestLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { handleReviewLocalPrepare, handleReviewLocalAttest, handleReviewHostedRequest, handleReviewResolve } from "../../src/handlers/review.js";
import { readResolveNextPassContext } from "../../src/handlers/review-next-pass-context.js";
import { createRepositoryReviewResultReader } from "../../src/scripts/review-gate/hosts/local/review-result-reader-composition.js";
import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { ApprovedDispositionRecordSchema } from "../../src/scripts/review-gate/core/advisory-records.js";
import { createDispositionSet, proposeDispositionSet, approveDispositionState } from
  "../../src/scripts/review-gate/core/dispositions.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import { createHostedAdmission, HostedRequestHandleSchema, type HostedRequestHandle } from "../../src/scripts/review-gate/hosted/request.js";
import type { IncrementalReviewScope } from "../../src/scripts/review-gate/core/incremental-review-scope.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { LocalApprovedDispositionRecordStore } from
  "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  acknowledgeHostedRequest,
  bindHostedAttemptDisposition,
  hostedLaneAttemptId,
  readLaneProgressOwner,
  readLaneResponsePerformance,
  recordHostedAwaitAttempt,
  recordHostedRequestAdmission,
  recordLaneResponsePerformance,
} from "../../src/scripts/review-gate/lane-progress.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import {
  readErrandRoutedObligation,
} from "../../src/scripts/review-gate/status-errand.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from
  "../../src/scripts/review-gate/policy/standard-review.js";
import { makeGitExec } from "../helpers/integration.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => removeGitBackedDir(root)));
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execFileAsync("git", [...args], { cwd })).stdout.trim();
}

async function recordHostedPendingRequest(
  store: LocalReviewOperationStateStore,
  input: { repositoryId: string; handle: HostedRequestHandle; now: string },
) {
  const { handle } = input;
  const decision = await recordHostedRequestAdmission(store, {
    repositoryId: input.repositoryId,
    lineage: handle.admission.lineage,
    request: {
      schemaVersion: 1,
      target: handle.target,
      provider: handle.provider,
      coverage: handle.requestedCoverage,
      ...(handle.admission.correctionScope === undefined
        ? {} : { correctionScope: handle.admission.correctionScope }),
      ...(handle.vehicle?.kind === "errand"
        ? { vehicle: { kind: "errand" as const, standardReview: handle.vehicle.standardReview } }
        : {}),
    },
    progressVehicle: handle.vehicle,
    reviewTarget: handle.admission.reviewTarget,
    requirement: handle.admission.requirement,
    actorIdentity: handle.admission.actorIdentity,
    authorizeCapacity: async () => undefined,
    now: input.now,
  });
  if (decision.state !== "admitted") throw new Error("hosted request must admit");
  await acknowledgeHostedRequest(store, { admission: decision.admission, handle, now: input.now });
}

interface FixedErrandOptions {
  readonly provider?: "coderabbit-pr" | "codex-pr";
  readonly severity?: "major" | "minor";
  readonly retrigger?: "incremental" | "full-final";
  readonly responsePerformed?: boolean;
  readonly maxPasses?: number;
  readonly sources?: readonly string[];
  readonly hostedAdmission?: boolean;
  readonly routine?: boolean;
}

/** One Errand whose first hosted pass found one verified finding, fixed by an approved commit. */
async function fixedErrand(options: FixedErrandOptions = {}) {
  const provider = options.provider ?? "coderabbit-pr";
  const severity = options.severity ?? "major";
  let root = await createTempRepoCore({ prefix: "arc-review-errand-correction-", identity: "andrew" });
  roots.push(root);
  await git(root, ["commit", "--allow-empty", "-m", "base"]);
  const slug = "correction-errand";
  const branch = `chore/${slug}`;
  const claimId = "0123456789abcdef0123456789abcdef";
  const record = TransientIdentityRecordV3Schema.parse({
    version: 3, kind: "errand", slug, claimId, purpose: "errand", origin: "description",
    originEntry: null, intent: "Review an approved Errand fix", branch, state: "open",
    savedHead: null, changeRequest: null,
    createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z",
  });
  await writeFile(join(root, slug), serializeTransientIdentityRecord(record), "utf8");
  await git(root, ["add", slug]);
  await git(root, ["commit", "-m", "identity snapshot"]);
  await git(root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
  const base = await git(root, ["rev-parse", "HEAD"]);
  const baseTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  if (options.hostedAdmission === true) {
    const checkout = `${root}-errand`;
    await git(root, ["worktree", "add", "-b", branch, checkout, "HEAD"]);
    roots.push(checkout);
    root = checkout;
    await writeFile(join(await git(root, ["rev-parse", "--git-common-dir"]), "info", "exclude"),
      ".arc/system/.internal/\n", { flag: "a" });
    await writeWorktreeMarker(root, { spawnedByArc: true, createdFor: { kind: "errand", slug, claimId },
      spawningIdentity: "andrew", createdAt: record.createdAt, provisioning: "ready" });
  } else await git(root, ["switch", "-c", branch]);
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"),
    `review.standard_sources: [${(options.sources ?? ["coderabbit-pr", "codex-pr"]).join(", ")}]\nreview.standard_max_passes: ${options.maxPasses ?? 2}\n`, "utf8");
  await writeFile(join(root, "change.txt"), "reviewed change\n", "utf8");
  await git(root, ["add", "change.txt", ".arc/system/arc-config.yml"]);
  await git(root, ["commit", "-m", "reviewed change"]);
  const firstHead = await git(root, ["rev-parse", "HEAD"]);
  const firstTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const exec = makeGitExec(root);
  const rawExec = createRawGitExec(root);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const store = new LocalReviewOperationStateStore(publisher);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const standardReview = {
    obligation: "required" as const,
    reasons: [options.routine === true ? "routine-code" as const : "sensitive-change-set" as const, "frontline-inactive" as const],
    rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
    rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
    retrigger: options.retrigger ?? "incremental",
    count: 1 as const,
  };
  const vehicle = { kind: "errand" as const, key: slug, claimId, branch, sources: [provider], standardReview };
  const reviewTargetAt = (headSha: string, headTree: string) => createReviewTarget({
    schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId, baseRef: "main", diffBaseSha: base, diffBaseTree: baseTree, headSha, headTree,
  });
  const handleAt = (input: {
    headSha: string; headTree: string; pass: number; correctionScope?: IncrementalReviewScope;
  }): HostedRequestHandle => {
    const reviewTarget = reviewTargetAt(input.headSha, input.headTree);
    const requirement = createReviewRequirement({
      target: reviewTarget, projection: standardReview,
      acceptableSources: [{ sourceKind: "hosted", qualifier: provider }],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("hosted requirement is unavailable");
    const target = { repository: "owner/repo", pullRequest: 42, headSha: input.headSha };
    const coverage = input.correctionScope === undefined ? "complete" as const : "incremental" as const;
    return {
      schemaVersion: 1, provider, requestedCoverage: coverage, effectiveCoverage: coverage, target,
      artifact: { kind: "issue-comment", id: `comment-${String(input.pass)}`,
        url: `https://example.test/comment-${String(input.pass)}`,
        createdAt: `2026-10-08T00:0${String(input.pass)}:00Z` },
      vehicle,
      admission: createHostedAdmission({
        schemaVersion: 1, repositoryId,
        lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: claimId, headSha: input.headSha },
        logicalPass: input.pass, sourceId: provider, target, requestedCoverage: coverage,
        ...(input.correctionScope === undefined ? {} : { correctionScope: input.correctionScope }),
        vehicle, reviewTarget, requirement, actorIdentity: "github-user-1",
      }),
    };
  };
  const first = handleAt({ headSha: firstHead, headTree: firstTree, pass: 1 });
  await recordHostedPendingRequest(store, { repositoryId, handle: first, now: "2026-10-08T00:01:00Z" });
  const finding = {
    findingId: "finding-1", origin: "review-body" as const, reviewId: "review-1",
    fingerprint: "fingerprint-1", settlement: "not-applicable" as const,
    severity, locus: "change.txt:1", url: "https://example.test/review-1",
    body: "The reviewed change needs a correction.", sourceOrdinal: 1,
  };
  const firstProgress = await recordHostedAwaitAttempt(store, {
    repositoryId,
    result: { schemaVersion: 1, mode: "review-hosted-await", handle: first,
      state: "findings", nextAction: "triage", reviewUrl: finding.url, findings: [finding] },
    now: "2026-10-08T00:01:30Z",
  });
  if (firstProgress === null) throw new Error("findings producer was not recorded");
  const firstAttemptId = hostedLaneAttemptId(first);
  const firstResultId = firstProgress.attempts.find(({ attemptId }) => attemptId === firstAttemptId)
    ?.hosted?.sealedResult?.hostedResultId;
  if (firstResultId === undefined) throw new Error("findings result was not sealed");
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2, semanticsVersion: "review-gate/v2",
      targetId: first.admission.reviewTarget.targetId,
      producerId: firstAttemptId, resultDigest: firstResultId,
      policyVersion: first.admission.requirement.policyVersion,
      rubricVersion: standardReview.rubricVersion, rubricDigest: standardReview.rubricDigest,
      proposedBy: "reviewer", proposedVerification: "focused",
      findings: [{
        findingId: finding.findingId, sourceIdentity: provider, locus: finding.locus,
        sourceVerification: "verified", verificationRefs: [finding.url],
        reportedSeverity: severity, verifiedSeverity: severity, disposition: "fix",
        gating: severity === "major" ? "blocking" : "record-only",
        rationale: "The source confirms the finding.",
        recommendation: "Apply the correction.", openQuestions: [],
      }],
    })), approvedBy: "andrew", approvedAt: "2026-10-08T00:01:40Z",
  });
  const dispositionSetId = approvedDisposition.dispositionSet.dispositionSetId;
  await dispositionStore.appendDispositionRecord(ApprovedDispositionRecordSchema.parse({
    schemaVersion: 1, semanticsVersion: "review-advisory/v1", repositoryId,
    operationId: firstAttemptId, candidate: null, errand: null, deliveryMember: null,
    source: { kind: "hosted", attemptRef: bindReviewSourceReference({
      kind: "hosted", operationId: firstProgress.operationId, durableRef: firstAttemptId,
    }), hostedResultId: firstResultId },
    currentDispositionSetId: dispositionSetId,
    approvedDispositionLineage: [{
      approvedDisposition,
      responsePolicyRequest: responsePolicyRequestFixture({
        headSha: firstHead, pullRequest: 42, sourceId: provider,
        reviewOperationId: firstAttemptId, standardReview,
      }),
      fixAuthorization: null, errandFixResponse: null, deliveryMemberFixResponse: null,
      predecessorDispositionSetId: null, successorDispositionSetId: null,
    }],
  }));
  await bindHostedAttemptDisposition(store, {
    operationId: firstProgress.operationId, attemptId: firstAttemptId, dispositionSetId,
    findingDispositions: [{ findingId: finding.findingId, disposition: "fix", channelAction: "record-only" }],
    now: "2026-10-08T00:01:45Z",
  });
  await writeFile(join(root, "change.txt"), "reviewed change, fixed\n", "utf8");
  await git(root, ["add", "change.txt"]);
  await git(root, ["commit", "-m", "apply reviewed fix"]);
  const fixedHead = await git(root, ["rev-parse", "HEAD"]);
  const fixedTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  if (options.responsePerformed !== false) {
    await recordLaneResponsePerformance(store, {
      lane: "standard", repositoryId, headSha: firstHead,
      lineage: first.admission.lineage, attemptId: firstAttemptId, dispositionSetId,
      producedHeadSha: fixedHead, now: "2026-10-08T00:01:50Z",
    });
  }
  const lineage = { kind: "head-bound" as const, vehicleKind: "errand" as const,
    vehicleIdentity: claimId, headSha: fixedHead };
  const statusTarget = { repository: "owner/repo", headRef: branch, headSha: fixedHead };
  return {
    root, exec, dispositionStore, firstAttemptId, publisher, store, provider, standardReview, statusTarget, reviewTargetAt,
    errand: { slug, claimId, branch },
    fixedReviewTarget: reviewTargetAt(fixedHead, fixedTree),
    readStatus: (withBaseRef = true, sourceId?: string, additionalPassAuthorization?: ReviewAdditionalPassAuthorization) => readErrandRoutedObligation({
      cwd: root, exec, rawExec, target: statusTarget, pullRequest: 42, currentBaseOid: base,
      ...(sourceId === undefined ? {} : { sourceId }),
      ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
      ...(withBaseRef
        ? { changeRequestCandidate: { baseRefName: "main", url: "https://github.com/owner/repo/pull/42" } }
        : {}),
    }),
    /** Record a clean CodeRabbit pass over the given correction, with its provider-proven range. */
    recordCorrectionPass: async (correctionScope: IncrementalReviewScope) => {
      const second = handleAt({ headSha: fixedHead, headTree: fixedTree, pass: 2, correctionScope });
      await recordHostedPendingRequest(store, { repositoryId, handle: second, now: "2026-10-08T00:02:00Z" });
      await recordHostedAwaitAttempt(store, {
        repositoryId,
        result: { schemaVersion: 1, mode: "review-hosted-await", handle: second,
          state: "clean", nextAction: "complete", reviewUrl: "https://example.test/review-2",
          coverageEvidence: {
            schemaVersion: 1, kind: "provider-native-incremental", sourceId: "coderabbit-pr",
            requestArtifactId: second.artifact.id, status: "established",
            baselineSha: firstHead, headSha: fixedHead,
            providerGeneration: { artifactId: "summary-2", url: "https://example.test/summary-2",
              createdAt: "2026-10-08T00:02:00Z", updatedAt: "2026-10-08T00:02:10Z",
              actorIdentity: "136622811", appId: "347564" },
          } },
        now: "2026-10-08T00:02:20Z",
      });
    },
    readAttempts: async () => (await readLaneProgressOwner(store, {
      lane: "standard", repositoryId, headSha: fixedHead, lineage,
    }))?.attempts ?? [],
    expectedScope: {
      schemaVersion: 1 as const,
      predecessorProducerId: firstAttemptId,
      predecessorHeadSha: firstHead,
      basisHeadSha: firstHead,
      headSha: fixedHead,
      requiredFindings: severity === "major"
        ? [{ producerId: firstAttemptId, findingId: finding.findingId, locus: finding.locus }]
        : [],
    },
  };
}

type FixedErrand = Awaited<ReturnType<typeof fixedErrand>>;

interface LocalErrandFixture {
  root: string;
  exec: GitExec;
  publisher: RepositoryGitCommonStatePublisher;
  standardReview: StandardReviewObligationProjection;
}
type PreparedLocal = Extract<ReturnType<typeof LocalPrepareEnvelopeSchema.parse>, { state: "ready" }>;

async function prepareErrandLocal(errand: LocalErrandFixture, coverageAdmission?: {
  requestedCoverage: "complete" | "incremental"; correctionScope?: IncrementalReviewScope;
}) {
  const output: string[] = []; const exitCodes: number[] = [];
  await handleReviewLocalPrepare("-", { resolveRoot: () => errand.root,
    readText: async () => JSON.stringify({ schemaVersion: 1, evaluatorIdentity: "independent-reviewer",
      routingFacts: { contentKind: "code-bearing", reviewRisk: errand.standardReview.retrigger === "incremental" ? "routine" : "sensitive",
        changeDeterminacy: "ordinary", ownership: "self", surfaceAuthority: "ordinary" },
      ...(coverageAdmission === undefined ? {} : { coverageAdmission }) }),
    prepare: input => prepareLocalReview(input, createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec })),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return LocalPrepareEnvelopeSchema.parse(JSON.parse(output.join("")));
}

async function attestErrandLocal(errand: LocalErrandFixture, prepared: PreparedLocal, findings = false) {
  const output: string[] = []; const exitCodes: number[] = [];
  await handleReviewLocalAttest("-", { resolveRoot: () => errand.root,
    readText: async () => JSON.stringify({ schemaVersion: 1, operationId: prepared.payload.operationId,
      result: { status: "complete", result: findings ? "findings" : "clean", evaluatorIdentity: "independent-reviewer",
        reviewRunId: `local-pass-${prepared.payload.request.logicalPass}`, applicabilityId: null,
        findings: findings ? [{ findingId: "finding-1", severity: "major", locus: "change.txt:1", evidenceUrlOrId: "test://finding-1" }] : [] } }),
    attest: input => attestLocalReviewCommand(input, createLocalAttestDependencies({ cwd: errand.root, exec: errand.exec })),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  expect(JSON.parse(output.join(""))).toMatchObject({ state: "attested-current" });
  return createRepositoryReviewResultReader(errand.publisher).readResult(prepared.payload.operationId);
}

async function localFixCheck(errand: LocalErrandFixture & { expectedScope: IncrementalReviewScope }) {
  const prepared = await prepareErrandLocal(errand, { requestedCoverage: "incremental", correctionScope: errand.expectedScope });
  expect(prepared).toMatchObject({ state: "ready", payload: { request: { logicalPass: 2 } } });
  if (prepared.state !== "ready") throw new Error("expected ready local fix check");
  return attestErrandLocal(errand, prepared);
}

async function localFirstErrand(sources: readonly string[]) {
  const primary = await createTempRepoCore({ prefix: "arc-errand-full-cadence-", identity: "andrew" });
  roots.push(primary);
  await git(primary, ["commit", "--allow-empty", "-m", "base"]);
  const slug = "local-first-errand";
  const branch = `chore/${slug}`;
  const claimId = "0123456789abcdef0123456789abcdef";
  const record = TransientIdentityRecordV3Schema.parse({ version: 3, kind: "errand", slug, branch, claimId,
    purpose: "errand", origin: "description", originEntry: null, intent: "Exercise the local Errand cadence",
    state: "open", savedHead: null, changeRequest: null,
    createdAt: "2026-10-18T00:00:00Z", updatedAt: "2026-10-18T00:00:00Z" });
  await writeFile(join(primary, slug), serializeTransientIdentityRecord(record));
  await git(primary, ["add", "."]); await git(primary, ["commit", "-m", "identity"]);
  await git(primary, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
  const root = `${primary}-errand`; roots.push(root);
  await git(primary, ["worktree", "add", "-b", branch, root, "HEAD"]);
  await writeFile(join(await git(root, ["rev-parse", "--git-common-dir"]), "info", "exclude"),
    ".arc/system/.internal/\n", { flag: "a" });
  await writeWorktreeMarker(root, { spawnedByArc: true, createdFor: { kind: "errand", slug, claimId },
    spawningIdentity: "andrew", createdAt: record.createdAt, provisioning: "ready" });
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"),
    `review.standard_sources: [${sources.join(", ")}]\nreview.standard_max_passes: 4\n`);
  await writeFile(join(root, "change.txt"), "reviewed change\n");
  await git(root, ["add", "."]); await git(root, ["commit", "-m", "contribution"]);
  const exec = makeGitExec(root);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const standardReview: StandardReviewObligationProjection = { obligation: "required",
    reasons: ["sensitive-change-set", "frontline-inactive"], rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
    rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest, retrigger: "full-final", count: 1 };
  const context = { root, exec, publisher, standardReview };
  const prepared = await prepareErrandLocal(context);
  expect(prepared).toMatchObject({ state: "ready", payload: { request: { logicalPass: 1 } } });
  if (prepared.state !== "ready") throw new Error("expected first local complete pass");
  const first = await attestErrandLocal(context, prepared, true);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const approval = approvedRecord(first, [{ sourceVerification: "verified", verifiedSeverity: "major", disposition: "fix" }]);
  await dispositionStore.appendDispositionRecord(approval);
  await writeFile(join(root, "change.txt"), "reviewed change, fixed\n");
  await git(root, ["commit", "-am", "fix"]);
  const headSha = await git(root, ["rev-parse", "HEAD"]);
  const store = new LocalReviewOperationStateStore(publisher);
  await recordLaneResponsePerformance(store, { lane: "standard", repositoryId: first.repositoryId,
    headSha: first.target.headSha, lineage: first.admission.lineage, attemptId: first.producerId,
    dispositionSetId: approval.currentDispositionSetId, producedHeadSha: headSha, now: "2026-10-18T00:01:00Z" });
  return { ...context, store, dispositionStore, first,
    statusTarget: { repository: `local/${first.repositoryId}`, headRef: branch, headSha },
    expectedScope: { schemaVersion: 1 as const, predecessorProducerId: first.producerId,
      predecessorHeadSha: first.target.headSha, basisHeadSha: first.target.headSha, headSha,
      requiredFindings: [{ producerId: first.producerId, findingId: "finding-1", locus: "change.txt:1" }] } };
}

async function resolveErrandReview(errand: LocalErrandFixture & { statusTarget: { repository: string; headSha: string } },
  result: Awaited<ReturnType<typeof attestErrandLocal>>, pullRequest: number | null = null, forceHosted = false) {
  const output: string[] = []; const exitCodes: number[] = [];
  const sourceId = result.kind === "hosted" ? result.sourceIdentity : "delegated-agent";
  const request = responsePolicyRequestFixture({ repository: errand.statusTarget.repository, pullRequest,
    headSha: errand.statusTarget.headSha, sourceId, reviewOperationId: result.producerId,
    completedPasses: result.admission.logicalPass, standardReview: errand.standardReview });
  await handleReviewResolve("-", { resolveRoot: () => errand.root,
    readText: async () => JSON.stringify({ ...request,
      attempts: result.target.headSha === errand.statusTarget.headSha ? [{ sourceId, outcome: result.originalOutcome,
        reviewOperationId: result.producerId }] : [],
      ...(forceHosted ? { invocation: { mode: "force", sourceId: "codex-pr" } } : {}) }),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
  return { result: JSON.parse(output.join("")), exitCodes };
}

async function withErrandHost<T>(errand: FixedErrand, open: boolean, run: () => Promise<T>): Promise<T> {
  const root = errand.root;
  const remote = join(root, ".arc-fixture", "origin.git");
  const bin = join(root, ".arc-fixture", "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(await git(root, ["rev-parse", "--git-common-dir"]), "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(root, ["remote", "add", "origin", "git@github.com:owner/repo.git"]);
  await git(root, ["config", `url.${remote}.insteadOf`, "git@github.com:owner/repo.git"]);
  await git(root, ["push", "origin", "main", errand.errand.branch]);
  const candidate = { number: 42, url: "https://github.com/owner/repo/pull/42", state: "OPEN",
    baseRefName: "main", headRefName: errand.errand.branch, headRefOid: errand.statusTarget.headSha };
  const comment = { node_id: "request-successor", html_url: "https://example.test/request-successor", user: { id: 1 },
    body: "@codex review", created_at: "2026-10-18T00:00:00Z", updated_at: "2026-10-18T00:00:00Z" };
  const script = join(bin, "gh");
  await writeFile(script, ["#!/bin/sh", 'case "$1:$2" in',
    `repo:view) printf '%s\\n' '{"nameWithOwner":"owner/repo"}' ;;`,
    `pr:list) printf '%s\\n' '${JSON.stringify(open ? [candidate] : [])}' ;;`,
    `api:user) printf '%s\\n' '{"id":1}' ;;`,
    `api:repos/owner/repo/pulls/42) printf '%s\\n' '{"head":{"sha":"${errand.statusTarget.headSha}"}}' ;;`,
    `api:repos/owner/repo/issues/42/comments) printf '%s\\n' '${JSON.stringify(comment)}' ;;`,
    '*) echo "unexpected host invocation: $*" >&2; exit 1 ;;', "esac", ""].join("\n"));
  await chmod(script, 0o755);
  const priorPath = process.env.PATH; const priorCwd = process.cwd();
  process.env.PATH = `${bin}${delimiter}${priorPath ?? ""}`;
  process.chdir(root);
  try {
    return await run();
  } finally {
    process.chdir(priorCwd);
    if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
  }
}

async function performHostedRequest(errand: FixedErrand, coverage: "complete" | "incremental" = "complete",
  additionalPassAuthorization?: ReviewAdditionalPassAuthorization) {
  const output: string[] = []; const exitCodes: number[] = [];
  await handleReviewHostedRequest("-", { readText: async () => JSON.stringify({ schemaVersion: 1,
    target: { repository: "owner/repo", pullRequest: 42, headSha: errand.statusTarget.headSha },
    provider: "codex-pr", coverage, ...(coverage === "incremental" ? { correctionScope: errand.expectedScope } : {}),
    ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
    vehicle: { kind: "errand", standardReview: errand.standardReview } }),
    write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
  return { result: JSON.parse(output.join("")), exitCodes };
}

async function plainErrand(options: FixedErrandOptions = {}) {
  const errand = await fixedErrand({ retrigger: "incremental", routine: true,
    sources: ["codex-pr", "delegated-agent"], maxPasses: 6, hostedAdmission: true, ...options });
  const predecessor = await localFixCheck(errand);
  await writeFile(join(errand.root, "change.txt"), "reviewed change, fixed, then extended\n");
  await git(errand.root, ["commit", "-am", "plain successor after convergence"]);
  errand.statusTarget.headSha = await git(errand.root, ["rev-parse", "HEAD"]);
  return { ...errand, predecessor };
}

async function requestHostedSuccessor(errand: FixedErrand) {
  return withErrandHost(errand, true, () => performHostedRequest(errand));
}

describe("Errand local correction cadence", () => {
  it("keeps Errand review open across a plain commit even when the delta range is provable", async () => {
    const errand = await fixedErrand({ retrigger: "incremental", routine: true,
      sources: ["delegated-agent"], maxPasses: 4 });
    const checked = await localFixCheck(errand);
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "settled" });
    await writeFile(join(errand.root, "change.txt"), "reviewed change, fixed, then extended\n");
    await git(errand.root, ["commit", "-am", "plain successor after convergence"]);
    errand.statusTarget.headSha = await git(errand.root, ["rev-parse", "HEAD"]);
    const current = await deriveLocalReviewTarget({ cwd: errand.root, exec: errand.exec,
      baseRef: "main", repositoryId: checked.repositoryId });
    await expect(proveReviewDeltaRange({ predecessor: checked.target, current, convergence: "converged",
      cwd: errand.root, exec: errand.exec })).resolves.toBe(true);
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required" });
  });

  it.each([false, true])("admits the Errand delta range without a coverage choice with open PR=%s", async open => {
    const errand = await plainErrand();
    await withErrandHost(errand, open, async () => {
      expect(await prepareErrandLocal(errand)).toMatchObject({ state: "ready", payload: {
        reviewerPayload: { correctionScope: {
          predecessorProducerId: errand.predecessor.producerId, predecessorHeadSha: errand.predecessor.target.headSha,
          headSha: errand.statusTarget.headSha,
        } }, request: { logicalPass: 3 },
      } });
    });
  });

  it.each([false, true])("predicts a local Errand delta from claim history with open PR=%s", async open => {
    const errand = await plainErrand();
    await withErrandHost(errand, open, async () => {
      expect(await resolveErrandReview(errand, errand.predecessor, open ? 42 : null)).toMatchObject({ exitCodes: [],
        result: { state: "ready", nextAction: "local-prepare", payload: { sourceId: "delegated-agent", pass: 3 } } });
    });
  });

  it.each([false, true])("re-confirms a converged Errand delta in respond with open PR=%s", async open => {
    const errand = await plainErrand();
    await withErrandHost(errand, open, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected delta preparation");
      const result = await attestErrandLocal(errand, prepared);
      const request = responsePolicyRequestFixture({ headSha: result.target.headSha, pullRequest: open ? 42 : null,
        repository: open ? "owner/repo" : `local/${result.repositoryId}`, sourceId: "delegated-agent",
        reviewOperationId: result.producerId, completedPasses: 3, standardReview: errand.standardReview });
      const cleanRequest = { ...request, attempts: [{ sourceId: "delegated-agent", outcome: "clean" as const,
        reviewOperationId: result.producerId }] };
      await expect(createRespondDependencies({ cwd: errand.root, exec: errand.exec }).resolvePolicy(cleanRequest, result.target))
        .resolves.toMatchObject({ state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } });
    });
  });

  it.each([false, true])("re-confirms a converged Errand delta in resolve with open PR=%s", async open => {
    const errand = await plainErrand();
    await withErrandHost(errand, open, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected delta preparation");
      const result = await attestErrandLocal(errand, prepared);
      expect(await resolveErrandReview(errand, result, open ? 42 : null)).toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } } });
    });
  });

  it.each([false, true])("re-confirms a converged Errand delta in local prepare with open PR=%s", async open => {
    const errand = await plainErrand();
    await withErrandHost(errand, open, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected delta preparation");
      const result = await attestErrandLocal(errand, prepared);
      await expect(createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec }).validatePolicyAdmission({
        repositoryId: result.repositoryId, target: result.target, lineage: result.admission.lineage,
        standardReview: errand.standardReview, completedPasses: 3, completePasses: 1,
        attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: result.producerId }],
        terminalResponsePerformed: false,
      })).rejects.toMatchObject({ state: "pass-complete" });
    });
  });

  it("routes an Errand plain commit to a local delta despite hosted rank", async () => {
    const errand = await plainErrand();
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required",
      detail: expect.stringContaining("arc review local prepare") });
  });

  it("re-confirms a completed Errand delta in status", async () => {
    const errand = await plainErrand();
    const prepared = await prepareErrandLocal(errand);
    if (prepared.state !== "ready") throw new Error("expected delta preparation");
    await attestErrandLocal(errand, prepared);
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "settled" });
  });

  it("keeps delta source refusals and local recovery through status and hosted admission", async () => {
    const errand = await plainErrand();
    await expect(errand.readStatus(true, "codex-pr")).resolves.toMatchObject({ state: "blocked",
      reason: "delta-check-local-review-required", remedy: {
        text: expect.stringContaining("delta check"),
        argv: ["arc", "review", "status", "--target", JSON.stringify(errand.statusTarget), "--source", "delegated-agent"],
      } });
    await expect(errand.readStatus(true, "delegated-agent")).resolves.toMatchObject({ state: "review-required",
      detail: expect.stringContaining("arc review local prepare") });
    await withErrandHost(errand, true, async () => {
      expect(await performHostedRequest(errand)).toMatchObject({ exitCodes: [1], result: {
        remedy: { text: expect.stringContaining("delta check") },
      } });
    });
  });

  it("re-confirms a converged Errand delta at hosted admission", async () => {
    const errand = await plainErrand();
    await withErrandHost(errand, true, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected delta preparation");
      const result = await attestErrandLocal(errand, prepared);
      expect(result.admission.effectiveCoverage).toBe("incremental");
      expect(await performHostedRequest(errand, "complete", {
        target: { repository: "owner/repo", pullRequest: 42, headSha: result.target.headSha }, lane: "standard",
        precedingProducerId: result.producerId, completedPasses: 3, nextPass: 4,
      })).toMatchObject({ exitCodes: [],
        result: { state: "requested", handle: { requestedCoverage: "complete", admission: { logicalPass: 4 } } } });
    });
  });

  it("runs an open-PR full-final Errand delta before the ranked complete successor", async () => {
    const errand = await plainErrand({ retrigger: "full-final", routine: false });
    await withErrandHost(errand, true, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected delta preparation");
      const delta = await attestErrandLocal(errand, prepared);
      expect(delta.admission.effectiveCoverage).toBe("incremental");
      expect(await resolveErrandReview(errand, delta, 42)).toMatchObject({ exitCodes: [],
        result: { state: "ready", nextAction: "hosted-request", payload: { sourceId: "codex-pr", pass: 4 } } });
      await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required",
        action: { provider: "codex-pr", coverage: "complete" } });
      expect(await performHostedRequest(errand)).toMatchObject({ exitCodes: [],
        result: { state: "requested", handle: { requestedCoverage: "complete", admission: { logicalPass: 4 } } } });
    });
  });

  it("runs a pre-PR full-final Errand complete pass directly after a plain commit", async () => {
    const errand = await plainErrand({ retrigger: "full-final", routine: false });
    await withErrandHost(errand, false, async () => {
      const prepared = await prepareErrandLocal(errand);
      if (prepared.state !== "ready") throw new Error("expected complete preparation");
      const complete = await attestErrandLocal(errand, prepared);
      expect(complete.admission).toMatchObject({ effectiveCoverage: "complete", logicalPass: 3 });
      expect(complete.admission.correctionScope).toBeUndefined();
      expect(await resolveErrandReview(errand, complete)).toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", nextAction: "none" } });
    });
  });

  it("offers an authorized additional hosted pass after an Errand delta closes the lane", async () => {
    const errand = await plainErrand();
    const prepared = await prepareErrandLocal(errand);
    if (prepared.state !== "ready") throw new Error("expected delta preparation");
    const delta = await attestErrandLocal(errand, prepared);
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "settled" });
    await expect(errand.readStatus(true, "codex-pr", {
      target: { repository: "owner/repo", pullRequest: 42, headSha: delta.target.headSha }, lane: "standard",
      precedingProducerId: delta.producerId, completedPasses: 3, nextPass: 4,
    })).resolves.toMatchObject({ state: "review-required", action: { provider: "codex-pr", coverage: "complete",
      additionalPassAuthorization: { precedingProducerId: delta.producerId, completedPasses: 3, nextPass: 4 },
    } });
  });

  it("names local prepare after a hosted material fix", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", sources: ["codex-pr", "delegated-agent"] });
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required",
      detail: expect.stringContaining("arc review local prepare") });
  });
  it.each([true, false])("keeps the Errand status source refusal and retry, local source configured=%s", async configured => {
    const errand = await fixedErrand({ provider: "codex-pr",
      sources: configured ? ["codex-pr", "delegated-agent"] : ["codex-pr"] });
    const refusal = await errand.readStatus(true, configured ? "codex-pr" : undefined);
    expect(refusal).toMatchObject({ state: "blocked",
      reason: configured ? "material-fix-local-review-required" : "material-fix-local-source-unconfigured",
      remedy: { argv: ["arc", "review", "status", "--target", JSON.stringify(errand.statusTarget),
        ...(configured ? ["--source", "delegated-agent"] : [])] } });
    if (!configured) {
      await writeFile(join(errand.root, ".arc/system/arc-config.yml"),
        "review.standard_sources: [codex-pr, delegated-agent]\nreview.standard_max_passes: 2\n");
    }
    await expect(errand.readStatus(true, "delegated-agent")).resolves.toMatchObject({ state: "review-required",
      detail: expect.stringContaining("arc review local prepare") });
  });
  it("offers a hosted complete pass after a converged minor response", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", severity: "minor", retrigger: "full-final",
      sources: ["codex-pr", "delegated-agent"] });
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required", scope: "errand",
      action: { provider: "codex-pr", coverage: "complete" } });
  });
  it("offers the ranked hosted complete successor at a head with a converged fix check", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", retrigger: "full-final", maxPasses: 4,
      sources: ["codex-pr", "delegated-agent"], hostedAdmission: true });
    await localFixCheck(errand);
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "review-required", scope: "errand",
      action: { provider: "codex-pr", coverage: "complete", target: { headSha: errand.statusTarget.headSha } } });
  });
  it("refuses hand-composed hosted incremental coverage, then admits the complete successor after a local fix check", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", retrigger: "full-final", maxPasses: 4,
      sources: ["codex-pr", "delegated-agent"], hostedAdmission: true });
    await withErrandHost(errand, true, async () => {
      const refusal = await performHostedRequest(errand, "incremental");
      expect(refusal).toMatchObject({ exitCodes: [1], result: { error: { code: "invalid-input" },
        remedy: { text: expect.stringMatching(/local fix check/u) } } });
      await localFixCheck(errand);
      await expect(performHostedRequest(errand)).resolves.toMatchObject({ exitCodes: [],
        result: { state: "requested", handle: { requestedCoverage: "complete", admission: { logicalPass: 3 } } } });
    });
  });
});


describe("ordinary resolve next-pass records", () => {
  it("requires approval for a hosted complete request while a minor-fix incremental check is admissible", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", severity: "minor", retrigger: "incremental", routine: true,
      maxPasses: 1, sources: ["codex-pr", "delegated-agent"], hostedAdmission: true });
    await expect(errand.readStatus()).resolves.toMatchObject({ state: "approval-required",
      detail: expect.stringContaining("1 of 1 configured complete standard-review passes") });
    await withErrandHost(errand, true, async () => {
      expect(await performHostedRequest(errand)).toMatchObject({ exitCodes: [1], result: {
        error: { code: "invalid-input" }, remedy: { text: expect.stringContaining("--ceiling-override") },
      } });
      expect(await prepareErrandLocal(errand, { requestedCoverage: "incremental", correctionScope: errand.expectedScope }))
        .toMatchObject({ state: "ready", payload: { request: { logicalPass: 2 }, reviewerPayload: { correctionScope: errand.expectedScope } } });
    });
  });

  it.each([false, true])("keeps local fix checks outside the ceiling with open PR=%s", async (open) => {
    const errand = await fixedErrand({ provider: "codex-pr", retrigger: "full-final", maxPasses: 1,
      sources: ["codex-pr", "delegated-agent"], hostedAdmission: true });
    await withErrandHost(errand, open, async () => {
      const output: string[] = []; const exitCodes: number[] = [];
      await handleReviewLocalPrepare("-", { resolveRoot: () => errand.root,
        readText: async () => JSON.stringify({ schemaVersion: 1, evaluatorIdentity: "independent-reviewer",
          routingFacts: { contentKind: "code-bearing", reviewRisk: "sensitive", changeDeterminacy: "ordinary",
            ownership: "self", surfaceAuthority: "ordinary" }, coverageAdmission: { requestedCoverage: "complete" } }),
        prepare: input => prepareLocalReview(input, createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec })),
        write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
      expect({ exitCodes, result: JSON.parse(output.join("")) }).toMatchObject({ exitCodes: [1], result: {
        error: { code: "invalid-input" }, remedy: { text: expect.stringContaining("ceilingOverride") },
      } });
      const checked = await localFixCheck(errand);
      expect(await resolveErrandReview(errand, checked, open ? 42 : null)).toMatchObject({ exitCodes: [], result: {
        state: "approval-required", payload: { consequence: { exhaustedPassCount: 2, nextPass: 3 } },
      } });
      if (open) expect(await errand.readStatus()).toMatchObject({ state: "approval-required",
        detail: expect.stringContaining("used 1 complete standard-review passes") });
    });
  });

  it("resolves a clean full-final fix check directly to its complete successor", async () => {
    const errand = await fixedErrand({ retrigger: "full-final", maxPasses: 3 });
    await errand.recordCorrectionPass(errand.expectedScope);
    const terminal = (await errand.readAttempts()).at(-1);
    if (terminal === undefined) throw new Error("expected correction terminal");
    const policyRequest = responsePolicyRequestFixture({ headSha: errand.statusTarget.headSha, pullRequest: 42,
      repository: "owner/repo", sourceId: errand.provider, reviewOperationId: terminal.attemptId,
      completedPasses: 2, standardReview: errand.standardReview });
    const output: string[] = [];
    const exitCodes: number[] = [];
    await handleReviewResolve("-", { resolveRoot: () => errand.root,
      readText: async () => JSON.stringify({ ...policyRequest,
        attempts: [{ sourceId: errand.provider, outcome: "clean", reviewOperationId: terminal.attemptId }] }),
      write: text => output.push(text), setExitCode: code => exitCodes.push(code),
    });
    expect({ exitCodes, result: JSON.parse(output.join("")) }).toMatchObject({ exitCodes: [],
      result: { state: "ready", nextAction: "hosted-request", payload: { sourceId: "coderabbit-pr", pass: 3 } } });
  });

  it("breaks an Errand's unchecked fix leg after a base merge even if contribution is covered", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", retrigger: "incremental" });
    await git(errand.root, ["switch", "main"]);
    await writeFile(join(errand.root, "base-change.ts"), "export const baseChange = true;\n");
    await git(errand.root, ["add", "."]); await git(errand.root, ["commit", "-m", "advance base"]);
    await git(errand.root, ["switch", errand.errand.branch]);
    await git(errand.root, ["merge", "--no-edit", "main"]);
    const predecessor = await createRepositoryReviewResultReader(errand.publisher).readResult(errand.firstAttemptId);
    const currentTarget = await deriveLocalReviewTarget({ cwd: errand.root, exec: errand.exec, baseRef: "main",
      repositoryId: predecessor.repositoryId });
    await expect(confirmReviewCorrectionLeg({ predecessor, currentTarget,
      currentLineage: predecessor.admission.lineage, dispositionStore: errand.dispositionStore,
      readResponsePerformance: result => readLaneResponsePerformance(errand.store, result),
      confirmGrounds: async () => "applicable" })).resolves.toBe("unavailable");
  });

  it.each((["resolve", "respond", "local-prepare"] as const).flatMap(surface =>
    [false, true].map(open => ({ surface, open }))))("re-binds an incremental hosted-fix leg at $surface with open PR=$open", async ({ surface, open }) => {
    const errand = await fixedErrand({ retrigger: "incremental", routine: true,
      sources: ["codex-pr", "delegated-agent"], maxPasses: 4, hostedAdmission: true });
    const result = await localFixCheck(errand);
    await withErrandHost(errand, open, async () => {
    const policyRequest = responsePolicyRequestFixture({ headSha: result.target.headSha, pullRequest: open ? 42 : null,
      repository: surface === "respond" && !open ? `local/${result.repositoryId}` : "owner/repo", sourceId: "delegated-agent", reviewOperationId: result.producerId,
      completedPasses: 2, standardReview: errand.standardReview });
    const request = { ...policyRequest, attempts: [{ sourceId: "delegated-agent", outcome: "clean" as const, reviewOperationId: result.producerId }] };
    if (surface === "respond") {
      await expect(createRespondDependencies({ cwd: errand.root, exec: errand.exec }).resolvePolicy(request, result.target))
        .resolves.toMatchObject({ state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } });
    } else if (surface === "local-prepare") {
      await expect(createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec }).validatePolicyAdmission({
        repositoryId: result.repositoryId, target: result.target, lineage: result.admission.lineage,
        standardReview: errand.standardReview, completedPasses: 2, completePasses: 1,
        attempts: [{ sourceId: "delegated-agent", outcome: "clean", reviewOperationId: result.producerId }],
        terminalResponsePerformed: false,
      })).rejects.toMatchObject({ state: "pass-complete" });
    } else {
      const output: string[] = []; const exitCodes: number[] = [];
      await handleReviewResolve("-", { resolveRoot: () => errand.root, readText: async () => JSON.stringify(request),
        write: text => output.push(text), setExitCode: code => exitCodes.push(code) });
      expect({ exitCodes, result: JSON.parse(output.join("")) }).toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", payload: { verifiedTerminalSignal: { coverageAdequate: true } } } });
    }
    });
  });

  it.each([["delegated-agent", "codex-pr"], ["codex-pr", "delegated-agent"]])(
    "admits a hosted complete successor of a converged local fix check with sources %s", async (...sources) => {
      const errand = await fixedErrand({ retrigger: "full-final", maxPasses: 4, sources, hostedAdmission: true });
      await localFixCheck(errand);
      expect(await requestHostedSuccessor(errand)).toMatchObject({ exitCodes: [],
        result: { state: "requested", handle: { provider: "codex-pr", admission: { logicalPass: 3 } } } });
    });

  it.each([["delegated-agent", "codex-pr"], ["codex-pr", "delegated-agent"]])(
    "refuses hosted admission after material fixes with the local-pass remedy and sources %s", async (...sources) => {
      const errand = await fixedErrand({ retrigger: "full-final", maxPasses: 4, sources, hostedAdmission: true });
      const response = await requestHostedSuccessor(errand);
      expect(response).toMatchObject({ exitCodes: [1], result: {
        error: { code: "invalid-input" }, diagnostics: [expect.objectContaining({ code: "material-fix-local-review-required" })],
        remedy: { text: expect.stringContaining("delegated-agent") },
      } });
      expect(response.result.remedy.text).not.toContain("Add delegated-agent");
    });

  it("stops local prepare on an omitted local source and retries after configuration repair", async () => {
    const errand = await fixedErrand({ retrigger: "full-final" });
    const dependencies = createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec });
    const input = { repositoryId: errand.fixedReviewTarget.repositoryId, target: errand.fixedReviewTarget,
      lineage: { kind: "head-bound" as const, vehicleKind: "errand" as const,
        vehicleIdentity: errand.errand.claimId, headSha: errand.fixedReviewTarget.headSha },
      standardReview: errand.standardReview, completedPasses: 1, completePasses: 1, attempts: [], terminalResponsePerformed: false,
      predecessorOperationId: errand.firstAttemptId };
    const error = await dependencies.validatePolicyAdmission(input).catch(error => error as unknown);
    expect(error).toMatchObject({ state: "unavailable", diagnostics: [
      expect.objectContaining({ code: "material-fix-local-source-unconfigured" }),
    ] });
    expect(localPrepareAdmissionRemedy(error)?.text).toContain("Add delegated-agent to review.standard_sources");
    expect(localPrepareAdmissionRemedy(error)?.text).not.toContain("Owner's stop");
    await writeFile(join(errand.root, ".arc/system/arc-config.yml"),
      "review.standard_sources: [coderabbit-pr, codex-pr, delegated-agent]\n", "utf8");
    await git(errand.root, ["add", ".arc/system/arc-config.yml"]);
    await git(errand.root, ["commit", "-m", "configure local reviewer"]);
    const repairedTarget = errand.reviewTargetAt(await git(errand.root, ["rev-parse", "HEAD"]),
      await git(errand.root, ["rev-parse", "HEAD^{tree}"]));
    await expect(dependencies.validatePolicyAdmission({ ...input, target: repairedTarget,
      lineage: { ...input.lineage, headSha: repairedTarget.headSha }, coverageAdmission: { requestedCoverage: "complete" },
    })).resolves.toMatchObject({ state: "ready", pass: 2, coverageAdmission: { requestedCoverage: "complete" } });
  });

  it("keeps local prepare's empty-source fallback after material fixes", async () => {
    const errand = await fixedErrand({ retrigger: "full-final" });
    await writeFile(join(errand.root, ".arc/system/arc-config.yml"), "review.standard_sources: []\n", "utf8");
    await git(errand.root, ["add", ".arc/system/arc-config.yml"]);
    await git(errand.root, ["commit", "-m", "use local fallback"]);
    const target = errand.reviewTargetAt(await git(errand.root, ["rev-parse", "HEAD"]),
      await git(errand.root, ["rev-parse", "HEAD^{tree}"]));
    await expect(createLocalPrepareDependencies({ cwd: errand.root, exec: errand.exec }).validatePolicyAdmission({
      repositoryId: target.repositoryId, target,
      lineage: { kind: "head-bound", vehicleKind: "errand", vehicleIdentity: errand.errand.claimId, headSha: target.headSha },
      standardReview: errand.standardReview, completedPasses: 1, completePasses: 1, attempts: [], terminalResponsePerformed: false,
      predecessorOperationId: errand.firstAttemptId, coverageAdmission: { requestedCoverage: "complete" },
    })).resolves.toMatchObject({ state: "ready", pass: 2, coverageAdmission: { requestedCoverage: "complete" } });
  });

  it.each(["major", "minor"] as const)("derives the earlier-head %s response from the Errand claim", async severity => {
    const errand = await fixedErrand({ severity, retrigger: "full-final" });
    const request = responsePolicyRequestFixture({ headSha: errand.statusTarget.headSha, pullRequest: 42,
      sourceId: errand.provider, reviewOperationId: errand.firstAttemptId, standardReview: errand.standardReview });
    const context = await readResolveNextPassContext({ configuredSources: ["coderabbit-pr", "codex-pr"], request: { ...request, attempts: [] }, root: errand.root,
      exec: errand.exec, operationStore: errand.store, dispositionStore: errand.dispositionStore,
      resultReader: createRepositoryReviewResultReader(errand.publisher) });
    expect(context).toEqual({ completePasses: 1, convergence: severity === "major" ? "unconverged" : "converged",
      responseDue: false, incremental: severity === "major" ? { basis: "fix-check", scope: errand.expectedScope } : null });
  });

  it("reads a same-head clean terminal instead of the earlier material response", async () => {
    const errand = await fixedErrand();
    await errand.recordCorrectionPass(errand.expectedScope);
    const attempts = await errand.readAttempts();
    const terminal = attempts.at(-1);
    if (terminal === undefined) throw new Error("expected terminal correction");
    const request = responsePolicyRequestFixture({ headSha: errand.statusTarget.headSha, pullRequest: 42,
      sourceId: errand.provider, reviewOperationId: terminal.attemptId, completedPasses: 2, standardReview: errand.standardReview });
    const context = await readResolveNextPassContext({ configuredSources: ["coderabbit-pr", "codex-pr"], request: { ...request,
      attempts: [{ sourceId: errand.provider, outcome: "clean", reviewOperationId: terminal.attemptId }] }, root: errand.root,
      exec: errand.exec, operationStore: errand.store, dispositionStore: errand.dispositionStore,
      resultReader: createRepositoryReviewResultReader(errand.publisher) });
    expect(context).toEqual({ completePasses: 1, convergence: "converged", responseDue: false, incremental: null });
  });
});

describe("full Errand cadence", () => {
  it("runs a pre-PR local complete pass, fix check, and closing complete pass", async () => {
    const errand = await localFirstErrand(["delegated-agent"]);
    expect(errand.first.admission.effectiveCoverage).toBe("complete");
    const offer = await prepareErrandLocal(errand);
    expect(offer).toMatchObject({ state: "coverage-required", nextAction: "select-coverage",
      payload: { coverageSelectionAction: { choices: [
        { requestedCoverage: "incremental", correctionScope: errand.expectedScope }, { requestedCoverage: "complete" },
      ] } } });
    const checked = await localFixCheck(errand);
    expect(checked.admission.effectiveCoverage).toBe("incremental");
    await expect(resolveErrandReview(errand, checked)).resolves.toMatchObject({ exitCodes: [],
      result: { state: "ready", nextAction: "local-prepare", payload: { pass: 3 } } });
    const complete = await prepareErrandLocal(errand, { requestedCoverage: "complete" });
    expect(complete).toMatchObject({ state: "ready", nextAction: "launch-review", payload: { request: { logicalPass: 3 } } });
    if (complete.state !== "ready") throw new Error("expected the complete successor without another selection");
    const terminal = await attestErrandLocal(errand, complete);
    expect(terminal.admission.effectiveCoverage).toBe("complete");
    await expect(resolveErrandReview(errand, terminal)).resolves.toMatchObject({ exitCodes: [],
      result: { state: "pass-complete", nextAction: "none" } });
    await expect(prepareErrandLocal(errand)).resolves.toMatchObject({ state: "review-complete", nextAction: "reduce",
      payload: { operationId: terminal.producerId } });
  });

  it("waits for the PR before the hosted complete successor of a pre-PR local fix check", async () => {
    const errand = await localFirstErrand(["codex-pr", "delegated-agent"]);
    const checked = await localFixCheck(errand);
    await expect(resolveErrandReview(errand, checked)).resolves.toMatchObject({ exitCodes: [],
      result: { state: "awaiting-change-request", nextAction: "open-change-request", payload: { waitingSources: ["codex-pr"] } } });
  });

  it("runs the open-PR hosted material result through a local check to ranked hosted complete closure", async () => {
    const errand = await fixedErrand({ provider: "codex-pr", retrigger: "full-final", maxPasses: 4,
      sources: ["codex-pr", "delegated-agent"], hostedAdmission: true });
    await withErrandHost(errand, true, async () => {
      const predecessor = await createRepositoryReviewResultReader(errand.publisher).readResult(errand.firstAttemptId);
      await expect(resolveErrandReview(errand, predecessor, 42, true)).resolves.toMatchObject({ exitCodes: [1], result: {
        diagnostics: [expect.objectContaining({ code: "material-fix-local-review-required" })],
        remedy: { text: expect.stringContaining("delegated-agent") },
      } });
      await expect(prepareErrandLocal(errand)).resolves.toMatchObject({ state: "coverage-required",
        payload: { coverageSelectionAction: { choices: [
          { requestedCoverage: "incremental", correctionScope: errand.expectedScope }, { requestedCoverage: "complete" },
        ] } } });
      const checked = await localFixCheck(errand);
      await expect(resolveErrandReview(errand, checked, 42)).resolves.toMatchObject({ exitCodes: [],
        result: { state: "ready", nextAction: "hosted-request", payload: { sourceId: "codex-pr", pass: 3 } } });
      const status = await errand.readStatus();
      expect(status).toMatchObject({ state: "review-required", action: { provider: "codex-pr", coverage: "complete" } });
      const requested = await performHostedRequest(errand);
      expect(requested).toMatchObject({ exitCodes: [], result: { state: "requested" } });
      const handle = HostedRequestHandleSchema.parse(requested.result.handle);
      await recordHostedAwaitAttempt(errand.store, { repositoryId: checked.repositoryId,
        result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "clean", nextAction: "complete",
          reviewUrl: "https://example.test/complete-successor" }, now: "2026-10-18T00:03:00Z" });
      const terminal = await createRepositoryReviewResultReader(errand.publisher).readResult(hostedLaneAttemptId(handle));
      expect(terminal.admission.effectiveCoverage).toBe("complete");
      await expect(resolveErrandReview(errand, terminal, 42)).resolves.toMatchObject({ exitCodes: [],
        result: { state: "pass-complete", nextAction: "none" } });
      await expect(errand.readStatus()).resolves.toMatchObject({ state: "settled" });
    });
  });
});
