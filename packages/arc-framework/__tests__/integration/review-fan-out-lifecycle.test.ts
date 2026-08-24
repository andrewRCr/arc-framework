/** Executable hosted-review progression across delivery-member targets. */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleCandidateApplicabilityResolve,
} from "../../src/handlers/candidate.js";
import {
  handleReviewHostedAwait,
  handleReviewHostedRequest,
  handleReviewHostedSettle,
} from "../../src/handlers/review.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  CandidateRecordVersionConflictError,
  readCandidateRecordVersioned,
  writeCandidateRecord,
} from "../../src/lib/work-unit/candidate-record-store.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { bindReviewSourceReference } from
  "../../src/scripts/review-gate/core/review-source-reference.js";
import {
  awaitHostedReview,
  HostedAwaitEnvelopeSchema,
  HostedAwaitResultSchema,
} from "../../src/scripts/review-gate/hosted/await.js";
import {
  HostedRequestResultSchema,
  requestHostedReview,
  type HostedRequestEnvelope,
  type HostedRequestOutcome,
} from "../../src/scripts/review-gate/hosted/request.js";
import { settleHostedFinding } from "../../src/scripts/review-gate/hosted/settle.js";
import {
  bindHostedAttemptDisposition,
  hostedLaneAttemptId,
  laneProgressOperationId,
  readLaneProgress,
  recordHostedAwaitAttempt,
  recordHostedRequestUnavailableAttempt,
  settleHostedAttemptFinding,
} from "../../src/scripts/review-gate/lane-progress.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import {
  projectHostedReservationDischarge,
} from "../../src/scripts/review-gate/policy/hosted-reservation-discharge.js";
import { createStandardReviewReservation } from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  resolveReviewApplicability,
  reviewApplicabilityResolutionInputFromCommand,
} from "../../src/scripts/review-gate/policy/review-applicability-resolution.js";
import { classifyReviewContributionApplicability } from
  "../../src/scripts/review-gate/policy/review-contribution-applicability.js";
import {
  composeDeliveryReviewObligation,
  resolveReviewStatus,
} from "../../src/scripts/review-gate/status.js";

const oid = (character: string): string => character.repeat(40);
const repositoryId = "repository-1";
const repository = "owner/repository";
const planId = "123e4567-e89b-42d3-a456-426614174000";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function operationStore(): Promise<LocalReviewOperationStateStore> {
  const root = await mkdtemp(join(tmpdir(), "arc-review-fan-out-"));
  roots.push(root);
  const commonDir = join(root, "common.git");
  await mkdir(commonDir, { recursive: true });
  const exec: GitExec = async () => ({ stdout: `${commonDir}\n` });
  return new LocalReviewOperationStateStore(new RepositoryGitCommonStatePublisher(exec, root));
}

function member(deliverable: string, head: string) {
  return DeliveryReviewMemberVehicleSchema.parse({
    kind: "delivery-member",
    planId,
    deliverableId: canonicalDigest({ deliverable }),
    workUnitId: "example",
    head,
  });
}

function targetAndRequirement(headSha: string) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId,
    baseRef: "main",
    diffBaseSha: oid("0"),
    diffBaseTree: oid("1"),
    headSha,
    headTree: oid("2"),
  });
  const projection = {
    obligation: "required" as const,
    reasons: ["sensitive-change-set" as const],
    rubricVersion: "standard-review/v1",
    rubricDigest: canonicalDigest({ rubric: 1 }),
    retrigger: "full-final" as const,
    count: 1 as const,
  };
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection,
    acceptableSources: [
      { sourceKind: "hosted", qualifier: "coderabbit-pr" },
      { sourceKind: "hosted", qualifier: "codex-pr" },
    ],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected hosted review requirement");
  return { reviewTarget, requirement, projection };
}

async function requestThroughHandler(
  request: HostedRequestEnvelope,
  outcome: HostedRequestOutcome,
  vehicles: readonly ReturnType<typeof member>[],
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewHostedRequest("-", {
    readText: async () => JSON.stringify(request),
    request: (parsed) => requestHostedReview(parsed, {
      adapters: [{
        id: request.provider,
        identities: { botUserId: `${request.provider}-bot` },
        request: async () => outcome,
      }],
      deliveryMemberLookup: {
        resolveMemberByHead: async (head) => {
          const vehicle = vehicles.find((candidate) => candidate.head === head);
          return vehicle === undefined
            ? { status: "unbound" as const }
            : {
                status: "resolved" as const,
                member: {
                  planId: vehicle.planId,
                  deliverableId: vehicle.deliverableId,
                  workUnitId: vehicle.workUnitId,
                  base: oid("0"),
                  baseRef: "main",
                  headRef: `review/${vehicle.deliverableId.slice(-8)}`,
                  head: vehicle.head,
                  isFinalMember: vehicle.deliverableId === vehicles.at(-1)?.deliverableId,
                },
              };
        },
      },
    }),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes).toEqual([]);
  return HostedRequestResultSchema.parse(JSON.parse(output.join("")));
}

async function awaitThroughHandler(handle: unknown, observation: unknown) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewHostedAwait("-", {
    readText: async () => JSON.stringify({ schemaVersion: 1, handle }),
    awaitResult: (input) => {
      const parsed = HostedAwaitEnvelopeSchema.parse(input);
      return awaitHostedReview({
        schemaVersion: 1,
        handle: parsed.handle,
        timeoutMs: 100,
        pollIntervalMs: 10,
      }, {
        observers: [{
          id: parsed.handle.provider,
          readHead: async () => parsed.handle.target.headSha,
          observe: async () => observation,
        }],
        clock: { now: () => 0, sleep: async () => undefined },
        attentionAfterMs: 1_000,
      });
    },
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes).toEqual([]);
  return HostedAwaitResultSchema.parse(JSON.parse(output.join("")));
}

function statusFor(routedObligation: ReturnType<typeof composeDeliveryReviewObligation>) {
  const statusTarget = { repository, headRef: "feat/example", headSha: oid("b") };
  return resolveReviewStatus({ target: statusTarget }, {
    observe: async () => ({
      actualHeadSha: statusTarget.headSha,
      requiredChecks: "green",
      routedObligation,
      currentBaseOid: oid("0"),
      baseContained: true,
    }),
  });
}

async function candidateHarness() {
  const subject = createCandidateSubjectSnapshot([{
    path: "src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source: "root" }),
    treatment: "reviewable",
  }]);
  const attestation = createCandidateAttestation({
    workUnit: "example",
    subject,
    baseRevision: oid("0"),
    attestedBy: "andrew",
    attestedAt: "2026-08-24T04:00:00.000Z",
    verificationEvidenceRef: "verification://root",
  });
  const record: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation,
    subject,
    transitions: [],
    lineageAttestations: [],
  };
  const root = await mkdtemp(join(tmpdir(), "arc-review-candidate-"));
  roots.push(root);
  await writeCandidateRecord(root, "example", record, null);
  const initial = await readCandidateRecordVersioned(root, "example");
  if (initial.record === null || initial.version === null) throw new Error("expected Candidate fixture");
  return {
    attestation,
    initialVersion: initial.version,
    root,
    read: () => readCandidateRecordVersioned(root, "example"),
    write: async (next: CandidateManagedRecordV1, expectedVersion: string) => {
      try {
        await writeCandidateRecord(root, "example", next, expectedVersion);
        return "written" as const;
      } catch (error) {
        if (error instanceof CandidateRecordVersionConflictError) return "version-conflict" as const;
        throw error;
      }
    },
  };
}

describe("hosted review fan-out lifecycle", () => {
  it("drives ordered member review through fallback, canonical selection, settlement, and conjunction", async () => {
    const first = member("first", oid("a"));
    const second = member("second", oid("b"));
    const movedFirst = member("first", oid("c"));
    const vehicles = [first, second];
    const store = await operationStore();
    const candidate = await candidateHarness();
    const candidateVersion = candidate.initialVersion;
    const firstTarget = { repository, pullRequest: 41, headSha: first.head };
    const secondTarget = { repository, pullRequest: 42, headSha: second.head };
    const firstReview = targetAndRequirement(first.head);
    const secondReview = targetAndRequirement(second.head);
    const reservation = createStandardReviewReservation({
      candidateId: candidate.attestation.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      obligation: firstReview.projection,
      target: { kind: "delivery", repository, workUnitId: "example", planId },
    });

    const unavailableRequest = { schemaVersion: 1 as const, target: firstTarget, provider: "coderabbit-pr" as const,
      coverage: "complete" as const, vehicle: first };
    const unavailable = await requestThroughHandler(unavailableRequest, { kind: "rate-limited" }, vehicles);
    expect(unavailable).toMatchObject({ state: "rate-limited", nextAction: "try-next-source" });
    if (unavailable.nextAction !== "try-next-source") throw new Error("expected unavailable request result");
    await recordHostedRequestUnavailableAttempt(store, {
      repositoryId,
      request: unavailableRequest,
      result: unavailable,
      reviewTarget: firstReview.reviewTarget,
      requirement: firstReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:01:00.000Z",
    });

    const beforeFallback = await projectHostedReservationDischarge({
      reservation,
      span: [first.head],
      target: { ...firstTarget, vehicle: first },
      readLaneProgress: (headSha) => readLaneProgress(store, { lane: "standard", repositoryId, headSha }),
    });
    const firstStatus = await statusFor(composeDeliveryReviewObligation({
      targets: [
        { ...firstTarget, vehicle: first },
        { ...secondTarget, vehicle: second },
      ],
      discharges: [
        beforeFallback,
        { discharged: false, detail: "Second member outstanding.", nextSource: "coderabbit-pr" },
      ],
    }));
    expect(firstStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: { provider: "codex-pr", vehicle: first },
    });
    if (firstStatus.nextAction !== "review-hosted-request") throw new Error("expected fallback request action");

    const requested = await requestThroughHandler(firstStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-first",
        url: "https://example.test/review-first",
        createdAt: "2026-08-24T04:02:00.000Z",
      },
      effectiveCoverage: "complete",
    }, vehicles);
    expect(requested).toMatchObject({ state: "requested", handle: { vehicle: first } });
    if (requested.nextAction !== "await") throw new Error("expected requested review handle");
    const firstAwait = await awaitThroughHandler(requested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-first",
    });
    expect(firstAwait).toMatchObject({ state: "clean", handle: { vehicle: first } });
    await recordHostedAwaitAttempt(store, {
      repositoryId,
      result: firstAwait,
      reviewTarget: firstReview.reviewTarget,
      requirement: firstReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:03:00.000Z",
    });

    const carriedFirst = await projectHostedReservationDischarge({
      reservation,
      span: [movedFirst.head],
      target: { ...firstTarget, headSha: movedFirst.head, vehicle: movedFirst },
      readLaneProgress: (headSha) => readLaneProgress(store, { lane: "standard", repositoryId, headSha }),
      readEarlierAttemptApplicability: async (sourceId) => ({
        status: "complete",
        attempts: [{
          sourceId,
          outcome: sourceId === "coderabbit-pr" ? "rate-limited" : "clean",
          applicability: "retain-prior-attempt",
        }],
      }),
    });
    expect(carriedFirst).toMatchObject({ discharged: true, detail: expect.stringContaining("applicability") });

    const priorSecond = member("second", oid("d"));
    const applicability = classifyReviewContributionApplicability({
      schemaVersion: 1,
      repositoryId,
      repository,
      pullRequest: secondTarget.pullRequest,
      lane: "standard",
      sourceId: "coderabbit-pr",
      priorAttemptId: "attempt-second-prior",
      priorHead: priorSecond.head,
      currentHead: second.head,
      priorBase: oid("0"),
      currentBase: oid("1"),
      priorVehicle: priorSecond,
      currentVehicle: second,
    }, {
      endpoints: {
        before: {
          predecessor: { head: oid("0"), tree: oid("2") },
          member: { head: priorSecond.head, tree: oid("3") },
        },
        after: {
          predecessor: { head: oid("1"), tree: oid("4") },
          member: { head: second.head, tree: oid("5") },
        },
      },
      proof: { status: "refused", reason: "contribution-diverged", paths: ["src/example.ts"] },
    });
    if (applicability.state !== "decision-required") throw new Error("expected residual selection");
    const decisionStatus = await statusFor(composeDeliveryReviewObligation({
      targets: [
        { ...firstTarget, headSha: movedFirst.head, vehicle: movedFirst },
        { ...secondTarget, vehicle: second },
      ],
      discharges: [
        carriedFirst,
        { discharged: false, detail: "Second member residual.", nextSource: null, applicability },
      ],
      applicabilityContext: {
        workUnitId: "example",
        expectedRecordVersion: candidateVersion,
        candidateId: candidate.attestation.candidateId,
      },
    }));
    expect(decisionStatus).toMatchObject({ nextAction: "resolve-review-applicability" });
    if (decisionStatus.nextAction !== "resolve-review-applicability") throw new Error("expected selection action");

    const selectionOutput: string[] = [];
    await handleCandidateApplicabilityResolve("example", "-", undefined, {
      resolveRoot: () => candidate.root,
      readText: async () => JSON.stringify({
        kind: "review-applicability-selection",
        offer: decisionStatus.selectionAction,
        selection: {
          selectedBy: "andrew",
          selectedAt: "2026-08-24T04:04:00.000Z",
          choice: "review-required",
        },
      }),
      execute: async (_root, _name, input) => {
        if (!("kind" in input)) throw new Error("expected review applicability input");
        return resolveReviewApplicability({
          readRecord: candidate.read,
          projectApplicability: async () => applicability,
          writeRecord: candidate.write,
        }, reviewApplicabilityResolutionInputFromCommand(input));
      },
      write: (text) => selectionOutput.push(text),
      setExitCode: () => undefined,
    });
    expect(JSON.parse(selectionOutput.join(""))).toMatchObject({
      state: "resolved",
      nextAction: "request-review",
    });
    const selectedCandidate = await candidate.read();
    expect(selectedCandidate.record?.transitions).toEqual([
      expect.objectContaining({ transitionKind: "review-applicability-selection", choice: "review-required" }),
    ]);

    const secondStatus = await statusFor(composeDeliveryReviewObligation({
      targets: [
        { ...firstTarget, headSha: movedFirst.head, vehicle: movedFirst },
        { ...secondTarget, vehicle: second },
      ],
      discharges: [
        carriedFirst,
        { discharged: false, detail: "Second member needs review.", nextSource: "coderabbit-pr" },
      ],
    }));
    expect(secondStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: { target: secondTarget, provider: "coderabbit-pr", vehicle: second },
    });
    if (secondStatus.nextAction !== "review-hosted-request") throw new Error("expected second request action");

    const secondRequested = await requestThroughHandler(secondStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-second",
        url: "https://example.test/review-second",
        createdAt: "2026-08-24T04:05:00.000Z",
      },
      effectiveCoverage: "complete",
    }, vehicles);
    if (secondRequested.nextAction !== "await") throw new Error("expected second review handle");
    const finding = {
      findingId: "finding-1",
      origin: "review-thread",
      commentId: "comment-1",
      threadId: "thread-1",
      settlement: "reply-and-resolve",
      severity: "major",
      locus: "src/example.ts:1",
      url: "https://example.test/finding-1",
    };
    const secondAwait = await awaitThroughHandler(secondRequested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-second",
      findings: [finding],
    });
    const secondProgress = await recordHostedAwaitAttempt(store, {
      repositoryId,
      result: secondAwait,
      reviewTarget: secondReview.reviewTarget,
      requirement: secondReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:06:00.000Z",
    });
    if (secondProgress === null) throw new Error("expected findings attempt");
    const attemptId = hostedLaneAttemptId(secondRequested.handle);
    const operationId = laneProgressOperationId({ lane: "standard", repositoryId, headSha: second.head });
    const dispositionSetId = canonicalDigest({ disposition: "second" });
    await bindHostedAttemptDisposition(store, {
      operationId,
      attemptId,
      dispositionSetId,
      findingIds: [finding.findingId],
      noHostSettlementFindingIds: [],
      now: "2026-08-24T04:07:00.000Z",
    });

    let resolved = false;
    let reply: { id: string; actorIdentity: string; body: string; inReplyToId: string } | null = null;
    const settlementRequest = {
      schemaVersion: 1,
      response: {
        attemptRef: bindReviewSourceReference({
          kind: "hosted",
          operationId,
          durableRef: attemptId,
        }),
        dispositionSetId,
        findingId: finding.findingId,
      },
      target: secondTarget,
      fixTarget: null,
      actorIdentity: "andrew",
      finding: { commentId: finding.commentId, threadId: finding.threadId },
      disposition: "defer",
      reply: "Tracked for follow-up.",
    };
    const settlementOutput: string[] = [];
    await handleReviewHostedSettle("-", {
      readText: async () => JSON.stringify(settlementRequest),
      settle: (input) => settleHostedFinding(input, { port: {
        currentActorIdentity: async () => "andrew",
        readHead: async () => second.head,
        readThread: async () => ({
          kind: "present",
          isResolved: resolved,
          commentIds: [finding.commentId],
        }),
        findReplies: async () => reply === null ? [] : [reply],
        postReply: async (input) => {
          reply = { id: "reply-1", actorIdentity: "andrew", body: input.body, inReplyToId: input.commentId };
          return { kind: "created", id: "reply-1" };
        },
        resolveThread: async () => {
          resolved = true;
          return { kind: "resolved" };
        },
      } }),
      write: (text) => settlementOutput.push(text),
      setExitCode: () => undefined,
    });
    expect(JSON.parse(settlementOutput.join(""))).toMatchObject({ state: "settled", nextAction: "complete" });
    await settleHostedAttemptFinding(store, {
      operationId,
      attemptId,
      dispositionSetId,
      findingId: finding.findingId,
      now: "2026-08-24T04:08:00.000Z",
    });

    const secondDischarge = await projectHostedReservationDischarge({
      reservation,
      span: [second.head],
      target: { ...secondTarget, vehicle: second },
      readLaneProgress: (headSha) => readLaneProgress(store, { lane: "standard", repositoryId, headSha }),
    });
    const terminal = await statusFor(composeDeliveryReviewObligation({
      targets: [
        { ...firstTarget, headSha: movedFirst.head, vehicle: movedFirst },
        { ...secondTarget, vehicle: second },
      ],
      discharges: [carriedFirst, secondDischarge],
    }));
    expect(terminal).toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          status: "discharged",
          members: [{ state: "discharged" }, { state: "discharged" }],
        },
      },
    });
  });

  it("keeps the existing hosted progression compatible with a singleton target", async () => {
    const request = {
      schemaVersion: 1 as const,
      target: { repository, pullRequest: 51, headSha: oid("e") },
      provider: "codex-pr" as const,
      coverage: "complete" as const,
    };
    const result = await requestThroughHandler(request, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-singleton",
        url: "https://example.test/review-singleton",
        createdAt: "2026-08-24T04:10:00.000Z",
      },
      effectiveCoverage: "complete",
    }, []);
    expect(result).toMatchObject({ state: "requested" });
    if (result.nextAction !== "await") throw new Error("expected singleton review handle");
    expect(result.handle).not.toHaveProperty("vehicle");
    await expect(awaitThroughHandler(result.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-singleton",
    })).resolves.toMatchObject({ state: "clean" });
  });
});
