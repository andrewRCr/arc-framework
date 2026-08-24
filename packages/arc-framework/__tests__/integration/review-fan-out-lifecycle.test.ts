/** Executable hosted-review progression across delivery-member targets. */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleCandidateApplicabilityResolve,
} from "../../src/handlers/candidate.js";
import {
  handleReviewStatus,
  handleReviewHostedAwait,
  handleReviewHostedRequest,
  handleReviewHostedSettle,
} from "../../src/handlers/review.js";
import { canonicalDigest } from "../../src/lib/canonical/canonical-json.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from
  "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import {
  createCandidateAttestation,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecordVersioned,
  writeCandidateRecord,
} from "../../src/lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../src/lib/work-unit/git-candidate-subject.js";
import {
  readSubmissionBoundaryVersioned,
  writeSubmissionBoundary,
} from "../../src/lib/work-unit/submission-boundary-store.js";
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
  recordHostedAwaitAttempt,
  recordHostedRequestUnavailableAttempt,
  settleHostedAttemptFinding,
} from "../../src/scripts/review-gate/lane-progress.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { RepositoryDeliveryMemberLookup } from
  "../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  createStandardReviewReservation,
  projectPublicationBoundary,
} from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import {
  ReviewStatusCommandResultSchema,
  resolveReviewStatus,
} from "../../src/scripts/review-gate/status.js";
import { readRoutedObligation } from "../../src/scripts/review-gate/status-composition.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../fixtures/delivery-state.js";
import { cleanupTempDir, createTempRepo, makeGitExec } from "../helpers/integration.js";

const oid = (character: string): string => character.repeat(40);
const repository = "owner/repository";
const planId = "123e4567-e89b-42d3-a456-426614174000";
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function git(root: string, args: string[]): Promise<string> {
  return (await makeGitExec(root)("git", args, { cwd: root })).stdout.trim();
}

function member(plan: DeliveryPlanV1, index: number, head: string) {
  const deliverable = plan.members[index];
  if (deliverable === undefined) throw new Error(`missing delivery member ${index}`);
  return DeliveryReviewMemberVehicleSchema.parse({
    kind: "delivery-member",
    planId: plan.planId,
    deliverableId: deliverable.deliverableId,
    workUnitId: plan.workUnitId,
    head,
  });
}

function targetAndRequirement(input: {
  repositoryId: string;
  baseSha: string;
  baseTree: string;
  headSha: string;
  headTree: string;
}) {
  const reviewTarget = createReviewTarget({
    schemaVersion: 2,
    semanticsVersion: "review-gate/v2",
    kind: "delivery-member",
    repositoryId: input.repositoryId,
    baseRef: "main",
    diffBaseSha: input.baseSha,
    diffBaseTree: input.baseTree,
    headSha: input.headSha,
    headTree: input.headTree,
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
  root: string,
  exec: GitExec,
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
      deliveryMemberLookup: new RepositoryDeliveryMemberLookup({ cwd: root, exec }),
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

interface FanOutHarness {
  root: string;
  exec: GitExec;
  plan: DeliveryPlanV1;
  plans: RepositoryDeliveryPlanStore<DeliveryPlanV1>;
  states: RepositoryDeliveryStateStore;
  state: DeliveryStateV1;
  stateRevision: number;
  store: LocalReviewOperationStateStore;
  repositoryId: string;
  baseHead: string;
  baseTree: string;
  oldFirst: string;
  oldFirstTree: string;
  priorSecond: string;
  priorSecondTree: string;
  movedFirst: string;
  movedFirstTree: string;
  currentSecond: string;
  currentSecondTree: string;
}

async function installCandidate(
  harness: FanOutHarness,
  head: string,
  expectedVersion: string | null,
): Promise<CandidateManagedRecordV1> {
  const target = await collectGitCandidateTarget({
    cwd: harness.root,
    name: harness.plan.workUnitId,
    baseBranch: "main",
    baseRevision: harness.baseHead,
    revision: head,
    exec: harness.exec,
  });
  const record: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: harness.plan.workUnitId,
      subject: target.subject,
      baseRevision: harness.baseHead,
      attestedBy: "andrew",
      attestedAt: "2026-08-24T04:00:00.000Z",
      verificationEvidenceRef: `verification://${head}`,
    }),
    subject: target.subject,
    transitions: [],
    lineageAttestations: [],
  };
  await writeCandidateRecord(harness.root, harness.plan.workUnitId, record, expectedVersion);
  return record;
}

async function writeBoundary(
  harness: FanOutHarness,
  candidate: CandidateManagedRecordV1,
  branch: string,
): Promise<void> {
  const current = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
  const reservation = createStandardReviewReservation({
    candidateId: candidate.attestation.candidateId,
    sourceId: "coderabbit-pr",
    sources: ["coderabbit-pr", "codex-pr"],
    obligation: targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    }).projection,
    target: {
      kind: "delivery",
      repository,
      workUnitId: harness.plan.workUnitId,
      planId: harness.plan.planId,
    },
  });
  await writeSubmissionBoundary(harness.root, projectPublicationBoundary({
    workUnit: harness.plan.workUnitId,
    branch,
    candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest,
    reservation,
    changeRequest: { repository, pullRequest: 42 },
  }), current.version);
}

async function createHarness(): Promise<FanOutHarness> {
  const root = await createTempRepo("arc-review-fan-out-");
  roots.push(root);
  const exec = makeGitExec(root);
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch:\n  base: main\n", "utf8");
  await writeFile(join(root, "README.md"), "base\n", "utf8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "base"]);
  const baseHead = await git(root, ["rev-parse", "HEAD"]);
  const baseTree = await git(root, ["rev-parse", "HEAD^{tree}"]);

  await git(root, ["checkout", "-b", "prior-top"]);
  await writeFile(join(root, "first.txt"), "same first contribution\n", "utf8");
  await git(root, ["add", "first.txt"]);
  await git(root, ["commit", "-m", "old first member"]);
  const oldFirst = await git(root, ["rev-parse", "HEAD"]);
  const oldFirstTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(root, "second.txt"), "prior second contribution\n", "utf8");
  await git(root, ["add", "second.txt"]);
  await git(root, ["commit", "-m", "prior second member"]);
  const priorSecond = await git(root, ["rev-parse", "HEAD"]);
  const priorSecondTree = await git(root, ["rev-parse", "HEAD^{tree}"]);

  await git(root, ["checkout", "-b", "feat/delivery-plan-record", baseHead]);
  await writeFile(join(root, "first.txt"), "same first contribution\n", "utf8");
  await git(root, ["add", "first.txt"]);
  await git(root, ["commit", "-m", "moved first member"]);
  const movedFirst = await git(root, ["rev-parse", "HEAD"]);
  const movedFirstTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  await writeFile(join(root, "second.txt"), "current second contribution\n", "utf8");
  await git(root, ["add", "second.txt"]);
  await git(root, ["commit", "-m", "current second member"]);
  const currentSecond = await git(root, ["rev-parse", "HEAD"]);
  const currentSecondTree = await git(root, ["rev-parse", "HEAD^{tree}"]);

  await git(root, ["branch", "delivery/delivery-plan-record/first", oldFirst]);
  await git(root, ["branch", "delivery/delivery-plan-record/moved-first", movedFirst]);
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  const plan = deliveryStackPlanFixture(planId);
  const fixture = deliveryStateFixture(plan);
  const state: DeliveryStateV1 = {
    ...fixture,
    target: {
      ref: "refs/heads/main",
      coordinates: { head: baseHead, tree: baseTree },
    },
    members: [
      {
        ...fixture.members[0]!,
        ref: "refs/heads/delivery/delivery-plan-record/first",
        changeRequest: { providerId: "github", changeRequestId: "41" },
        coordinates: { base: baseHead, head: oldFirst, tree: oldFirstTree },
      },
      {
        ...fixture.members[1]!,
        ref: "refs/heads/prior-top",
        changeRequest: { providerId: "github", changeRequestId: "42" },
        coordinates: { base: oldFirst, head: priorSecond, tree: priorSecondTree },
      },
    ],
  };
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  const published = await states.publish(plan.planId, state, 0);
  if (published.status !== "ok") throw new Error("expected initial delivery state");
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const harness: FanOutHarness = {
    root,
    exec,
    plan,
    plans,
    states,
    state,
    stateRevision: published.value.revision,
    store: new LocalReviewOperationStateStore(publisher),
    repositoryId,
    baseHead,
    baseTree,
    oldFirst,
    oldFirstTree,
    priorSecond,
    priorSecondTree,
    movedFirst,
    movedFirstTree,
    currentSecond,
    currentSecondTree,
  };
  const candidate = await installCandidate(harness, priorSecond, null);
  await writeBoundary(harness, candidate, "prior-top");
  return harness;
}

async function moveDeliveryTargets(harness: FanOutHarness): Promise<void> {
  const state: DeliveryStateV1 = {
    ...harness.state,
    members: [
      {
        ...harness.state.members[0]!,
        ref: "refs/heads/delivery/delivery-plan-record/moved-first",
        coordinates: {
          base: harness.baseHead,
          head: harness.movedFirst,
          tree: harness.movedFirstTree,
        },
      },
      {
        ...harness.state.members[1]!,
        ref: "refs/heads/feat/delivery-plan-record",
        coordinates: {
          base: harness.movedFirst,
          head: harness.currentSecond,
          tree: harness.currentSecondTree,
        },
      },
    ],
  };
  const published = await harness.states.publish(harness.plan.planId, state, harness.stateRevision);
  if (published.status !== "ok") throw new Error("expected moved delivery state");
  harness.state = state;
  harness.stateRevision = published.value.revision;
  const current = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
  if (current.version === null) throw new Error("expected initial Candidate version");
  const candidate = await installCandidate(harness, harness.currentSecond, current.version);
  await writeBoundary(harness, candidate, "feat/delivery-plan-record");
}

async function statusThroughHandler(
  harness: FanOutHarness,
  target: { repository: string; headRef: string; headSha: string },
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewStatus({ target: JSON.stringify(target), json: true }, undefined, {
    resolveRoot: () => harness.root,
    resolve: (root, input) => resolveReviewStatus(input, {
      observe: async (statusTarget) => ({
        actualHeadSha: statusTarget.headSha,
        requiredChecks: "green",
        routedObligation: await readRoutedObligation(
          root,
          harness.exec,
          statusTarget,
          42,
          new RepositoryDeliveryMemberLookup({ cwd: root, exec: harness.exec }),
          harness.baseHead,
        ),
        currentBaseOid: harness.baseHead,
        baseContained: true,
      }),
    }),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes).toEqual([]);
  return ReviewStatusCommandResultSchema.parse(JSON.parse(output.join("")));
}

describe("hosted review fan-out lifecycle", () => {
  it("drives production composition through fallback, carry, selection, settlement, and conjunction", async () => {
    const harness = await createHarness();
    const first = member(harness.plan, 0, harness.oldFirst);
    const priorSecond = member(harness.plan, 1, harness.priorSecond);
    const firstTarget = { repository, pullRequest: 41, headSha: harness.oldFirst };
    const priorSecondTarget = { repository, pullRequest: 42, headSha: harness.priorSecond };
    const priorStatusTarget = { repository, headRef: "prior-top", headSha: harness.priorSecond };
    const firstReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });
    const priorSecondReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.oldFirst,
      baseTree: harness.oldFirstTree,
      headSha: harness.priorSecond,
      headTree: harness.priorSecondTree,
    });

    const initial = await statusThroughHandler(harness, priorStatusTarget);
    expect(initial).toMatchObject({
      nextAction: "review-hosted-request",
      action: { target: firstTarget, provider: "coderabbit-pr", vehicle: first },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [{ state: "outstanding" }, { state: "outstanding" }],
        },
      },
    });
    if (initial.nextAction !== "review-hosted-request") throw new Error("expected initial hosted request");

    const unavailable = await requestThroughHandler(initial.action, { kind: "rate-limited" }, harness.root, harness.exec);
    expect(unavailable).toMatchObject({ state: "rate-limited", nextAction: "try-next-source" });
    if (unavailable.nextAction !== "try-next-source") throw new Error("expected unavailable request result");
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: initial.action,
      result: unavailable,
      reviewTarget: firstReview.reviewTarget,
      requirement: firstReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:01:00.000Z",
    });

    const fallback = await statusThroughHandler(harness, priorStatusTarget);
    expect(fallback).toMatchObject({
      nextAction: "review-hosted-request",
      action: { target: firstTarget, provider: "codex-pr", vehicle: first },
    });
    if (fallback.nextAction !== "review-hosted-request") throw new Error("expected fallback request action");

    const requested = await requestThroughHandler(fallback.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-first",
        url: "https://example.test/review-first",
        createdAt: "2026-08-24T04:02:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    expect(requested).toMatchObject({ state: "requested", handle: { vehicle: first } });
    if (requested.nextAction !== "await") throw new Error("expected requested review handle");
    const firstAwait = await awaitThroughHandler(requested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-first",
    });
    expect(firstAwait).toMatchObject({ state: "clean", handle: { vehicle: first } });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: firstAwait,
      reviewTarget: firstReview.reviewTarget,
      requirement: firstReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:03:00.000Z",
    });

    const priorSecondStatus = await statusThroughHandler(harness, priorStatusTarget);
    expect(priorSecondStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: { target: priorSecondTarget, provider: "coderabbit-pr", vehicle: priorSecond },
      routedObligation: {
        conjunction: {
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
    if (priorSecondStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected prior second-member request");
    }
    const priorSecondRequested = await requestThroughHandler(priorSecondStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-second-prior",
        url: "https://example.test/review-second-prior",
        createdAt: "2026-08-24T04:04:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (priorSecondRequested.nextAction !== "await") throw new Error("expected prior second review handle");
    const priorSecondAwait = await awaitThroughHandler(priorSecondRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-second-prior",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: priorSecondAwait,
      reviewTarget: priorSecondReview.reviewTarget,
      requirement: priorSecondReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:05:00.000Z",
    });

    await moveDeliveryTargets(harness);
    const movedFirst = member(harness.plan, 0, harness.movedFirst);
    const currentSecond = member(harness.plan, 1, harness.currentSecond);
    const currentSecondTarget = { repository, pullRequest: 42, headSha: harness.currentSecond };
    const currentStatusTarget = {
      repository,
      headRef: "feat/delivery-plan-record",
      headSha: harness.currentSecond,
    };
    const decisionStatus = await statusThroughHandler(harness, currentStatusTarget);
    expect(decisionStatus).toMatchObject({
      nextAction: "resolve-review-applicability",
      selectionAction: {
        projection: {
          state: "decision-required",
          selector: { priorVehicle: priorSecond, currentVehicle: currentSecond },
        },
      },
      routedObligation: {
        conjunction: {
          members: [
            { state: "discharged", vehicle: movedFirst },
            { state: "outstanding", vehicle: currentSecond },
          ],
        },
      },
    });
    if (decisionStatus.nextAction !== "resolve-review-applicability") {
      throw new Error("expected production applicability selection");
    }

    const selectionOutput: string[] = [];
    const selectionExitCodes: number[] = [];
    await handleCandidateApplicabilityResolve(harness.plan.workUnitId, "-", undefined, {
      resolveRoot: () => harness.root,
      readText: async () => JSON.stringify({
        kind: "review-applicability-selection",
        offer: decisionStatus.selectionAction,
        selection: {
          selectedBy: "andrew",
          selectedAt: "2026-08-24T04:06:00.000Z",
          choice: "review-required",
        },
      }),
      write: (text) => selectionOutput.push(text),
      setExitCode: (code) => selectionExitCodes.push(code),
    });
    expect(selectionExitCodes).toEqual([]);
    expect(JSON.parse(selectionOutput.join(""))).toMatchObject({
      state: "resolved",
      nextAction: "commit-selection",
      choice: "review-required",
    });
    const selectedCandidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    expect(selectedCandidate.record?.transitions).toEqual([
      expect.objectContaining({
        transitionKind: "review-applicability-selection",
        choice: "review-required",
      }),
    ]);

    const secondStatus = await statusThroughHandler(harness, currentStatusTarget);
    expect(secondStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        target: currentSecondTarget,
        provider: "coderabbit-pr",
        vehicle: currentSecond,
      },
      routedObligation: {
        conjunction: {
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
    if (secondStatus.nextAction !== "review-hosted-request") throw new Error("expected current second request");

    const secondRequested = await requestThroughHandler(secondStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-second",
        url: "https://example.test/review-second",
        createdAt: "2026-08-24T04:07:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
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
    const currentSecondReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.movedFirst,
      baseTree: harness.movedFirstTree,
      headSha: harness.currentSecond,
      headTree: harness.currentSecondTree,
    });
    const secondProgress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: secondAwait,
      reviewTarget: currentSecondReview.reviewTarget,
      requirement: currentSecondReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:08:00.000Z",
    });
    if (secondProgress === null) throw new Error("expected findings attempt");
    const attemptId = hostedLaneAttemptId(secondRequested.handle);
    const operationId = laneProgressOperationId({
      lane: "standard",
      repositoryId: harness.repositoryId,
      headSha: harness.currentSecond,
    });
    const dispositionSetId = canonicalDigest({ disposition: "second" });
    await bindHostedAttemptDisposition(harness.store, {
      operationId,
      attemptId,
      dispositionSetId,
      findingIds: [finding.findingId],
      noHostSettlementFindingIds: [],
      now: "2026-08-24T04:09:00.000Z",
    });

    let resolved = false;
    let reply: { id: string; actorIdentity: string; body: string; inReplyToId: string } | null = null;
    const settlementOutput: string[] = [];
    await handleReviewHostedSettle("-", {
      readText: async () => JSON.stringify({
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
        target: currentSecondTarget,
        fixTarget: null,
        actorIdentity: "andrew",
        finding: { commentId: finding.commentId, threadId: finding.threadId },
        disposition: "defer",
        reply: "Tracked for follow-up.",
      }),
      settle: (input) => settleHostedFinding(input, { port: {
        currentActorIdentity: async () => "andrew",
        readHead: async () => harness.currentSecond,
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
    await settleHostedAttemptFinding(harness.store, {
      operationId,
      attemptId,
      dispositionSetId,
      findingId: finding.findingId,
      now: "2026-08-24T04:10:00.000Z",
    });

    const terminal = await statusThroughHandler(harness, currentStatusTarget);
    expect(terminal).toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          status: "discharged",
          members: [
            { state: "discharged", vehicle: movedFirst },
            { state: "discharged", vehicle: currentSecond },
          ],
        },
      },
    });
  });

  it("keeps the existing hosted progression compatible with a singleton target", async () => {
    const root = await createTempRepo("arc-review-singleton-");
    roots.push(root);
    const exec = makeGitExec(root);
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
    }, root, exec);
    expect(result).toMatchObject({ state: "requested" });
    if (result.nextAction !== "await") throw new Error("expected singleton review handle");
    expect(result.handle).not.toHaveProperty("vehicle");
    await expect(awaitThroughHandler(result.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-singleton",
    })).resolves.toMatchObject({ state: "clean" });
  });
});
