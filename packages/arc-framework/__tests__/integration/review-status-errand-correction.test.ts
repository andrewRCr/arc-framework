/** The hosted pass an Errand head offers after an approved fix, and the correction its admission accepts. */

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import { ApprovedDispositionRecordSchema } from "../../src/scripts/review-gate/core/advisory-records.js";
import { createDispositionSet, proposeDispositionSet, approveDispositionState } from
  "../../src/scripts/review-gate/core/dispositions.js";
import { bindReviewSourceReference } from "../../src/scripts/review-gate/core/review-source-reference.js";
import { createHostedAdmission, type HostedRequestHandle } from "../../src/scripts/review-gate/hosted/request.js";
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
  recordHostedAwaitAttempt,
  recordHostedRequestAdmission,
  recordLaneResponsePerformance,
} from "../../src/scripts/review-gate/lane-progress.js";
import { responsePolicyRequestFixture } from "../fixtures/review-response-policy.js";
import {
  assertErrandHostedCorrectionRequest,
  readErrandRoutedObligation,
} from "../../src/scripts/review-gate/status-errand.js";
import { RoutedReviewObligationSchema } from "../../src/scripts/review-gate/status.js";
import { HostedErrandCorrectionError } from "../../src/scripts/review-gate/runtime/review-policy-remedy.js";
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
}

/** One Errand whose first hosted pass found one verified finding, fixed by an approved commit. */
async function fixedErrand(options: FixedErrandOptions = {}) {
  const provider = options.provider ?? "coderabbit-pr";
  const severity = options.severity ?? "major";
  const root = await createTempRepoCore({ prefix: "arc-review-errand-correction-", identity: "andrew" });
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
  await git(root, ["switch", "-c", branch]);
  await mkdir(join(root, ".arc/system"), { recursive: true });
  await writeFile(join(root, ".arc/system/arc-config.yml"),
    "review.standard_sources: [coderabbit-pr, codex-pr]\nreview.standard_max_passes: 2\n", "utf8");
  await writeFile(join(root, "change.txt"), "reviewed change\n", "utf8");
  await git(root, ["add", "change.txt"]);
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
    reasons: ["sensitive-change-set" as const],
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
    publisher, store, provider, standardReview, statusTarget,
    errand: { slug, claimId, branch },
    fixedReviewTarget: reviewTargetAt(fixedHead, fixedTree),
    readStatus: (withBaseRef = true) => readErrandRoutedObligation({
      cwd: root, exec, rawExec, target: statusTarget, pullRequest: 42, currentBaseOid: base,
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

function admitCorrection(
  errand: FixedErrand,
  request: { coverage: "complete" } | { coverage: "incremental"; correctionScope: FixedErrand["expectedScope"] },
  provider: "coderabbit-pr" | "codex-pr" = errand.provider,
) {
  return errand.readAttempts().then((attempts) => assertErrandHostedCorrectionRequest({
    publisher: errand.publisher,
    store: errand.store,
    errand: errand.errand,
    request: {
      target: { repository: "owner/repo", pullRequest: 42, headSha: errand.statusTarget.headSha },
      provider,
      ...request,
    },
    standardReview: errand.standardReview,
    attempts,
    reviewTarget: errand.fixedReviewTarget,
    statusTarget: errand.statusTarget,
  }));
}

describe("Errand hosted correction pass", () => {
  it.each([
    { severity: "major" as const, findings: 1 },
    { severity: "minor" as const, findings: 0 },
  ])("offers CodeRabbit the fix range after a $severity finding with $findings required findings",
    async ({ severity }) => {
      const errand = await fixedErrand({ severity });
      const offer = await errand.readStatus();

      expect(offer).toEqual({
        state: "review-required",
        scope: "errand",
        detail: expect.stringMatching(
          new RegExp(`1 of 2 configured.*\`coderabbit-pr\` reviews only the fix since ${
            errand.expectedScope.predecessorHeadSha.slice(0, 12)}`, "u"),
        ),
        action: {
          schemaVersion: 1,
          target: { repository: "owner/repo", pullRequest: 42, headSha: errand.statusTarget.headSha },
          provider: "coderabbit-pr",
          coverage: "incremental",
          correctionScope: errand.expectedScope,
          vehicle: { kind: "errand", standardReview: errand.standardReview },
        },
      });
      expect(RoutedReviewObligationSchema.parse(offer)).toEqual(offer);
      await expect(admitCorrection(errand, { coverage: "incremental", correctionScope: errand.expectedScope }))
        .resolves.toBeUndefined();
      await expect(admitCorrection(errand, { coverage: "complete" })).resolves.toBeUndefined();

      if (offer?.state !== "review-required" || !("action" in offer) || offer.action.correctionScope === undefined) {
        throw new Error("the offer must carry its correction scope");
      }
      await errand.recordCorrectionPass(offer.action.correctionScope);
      await expect(errand.readStatus()).resolves.toEqual({
        state: "settled",
        detail: "The exact Errand standard-review lane is settled by verified convergence.",
      });
    });

  it("refuses an incremental request whose scope differs from the offered one", async () => {
    const errand = await fixedErrand();
    const drifted = { ...errand.expectedScope, requiredFindings: [] };

    const refusal = admitCorrection(errand, { coverage: "incremental", correctionScope: drifted });
    await expect(refusal).rejects.toBeInstanceOf(HostedErrandCorrectionError);
    await expect(refusal).rejects.toMatchObject({
      code: "invalid-input",
      statusTarget: errand.statusTarget,
      message: expect.stringContaining("differs from the correction scope the lane offers"),
    });
  });

  it.each([
    { name: "a provider without native incremental review", options: { provider: "codex-pr" as const },
      reason: "`codex-pr` has no native incremental review" },
    { name: "a fix with no recorded performance", options: { responsePerformed: false },
      reason: "no performed fix leads from the earlier pass to this head" },
    { name: "routing that requires a full final review", options: { retrigger: "full-final" as const },
      reason: "routing requires a complete review (full-final)" },
  ])("offers complete coverage after $name", async ({ options, reason }) => {
    const errand = await fixedErrand(options);
    const offer = await errand.readStatus();

    expect(offer).toMatchObject({
      state: "review-required",
      scope: "errand",
      detail: expect.stringContaining(`The next pass reviews complete coverage: ${reason}.`),
      action: { provider: errand.provider, coverage: "complete" },
    });
    expect(offer).not.toHaveProperty("action.correctionScope");
    await expect(admitCorrection(errand, { coverage: "incremental", correctionScope: errand.expectedScope }))
      .rejects.toMatchObject({ code: "invalid-input", message: expect.stringContaining(reason) });
    await expect(admitCorrection(errand, { coverage: "complete" })).resolves.toBeUndefined();
  });

  it("offers complete coverage when the change request's base ref is unknown", async () => {
    const errand = await fixedErrand();

    await expect(errand.readStatus(false)).resolves.toMatchObject({
      scope: "errand",
      detail: expect.stringContaining("the current diff base is unknown"),
      action: { provider: "coderabbit-pr", coverage: "complete" },
    });
  });

  it("refuses CodeRabbit an incremental pass over a fix another source reviewed", async () => {
    const errand = await fixedErrand({ provider: "codex-pr" });

    await expect(admitCorrection(
      errand, { coverage: "incremental", correctionScope: errand.expectedScope }, "coderabbit-pr",
    )).rejects.toMatchObject({
      code: "invalid-input",
      message: expect.stringContaining("the earlier pass was a `codex-pr` review"),
    });
  });
});
