/** Executable hosted-review progression across delivery-member targets. */

import { access, chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  responsePolicyRequest,
  responsePolicyRequestFixture,
} from "../fixtures/review-response-policy.js";
import {
  createHostedTerminalAttemptFixture,
  publishHostedTerminalProgressFixture,
} from "../fixtures/hosted-review.js";

import {
  handleCandidateApplicabilityResolve,
} from "../../src/handlers/candidate.js";
import {
  handleReviewStatus,
  handleReviewHostedAwait,
  handleReviewHostedRequest,
  handleReviewHostedSettle,
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewLocalResume,
  handleReviewResolve,
  handleReviewRespond,
  handleReviewTerminusAccept,
} from "../../src/handlers/review.js";
import { runDerivedLocusStateProbe } from "../../src/handlers/derived-locus-state-probe.js";
import { canonicalDigest, canonicalize, type CanonicalDigest } from "../../src/lib/kernel/canonical/canonical-json.js";
import { CanonicalDigestSchema } from "../../src/lib/kernel/index.js";
import {
  serializeTransientIdentityRecord,
  TransientIdentityRecordV3Schema,
} from "../../src/lib/errand/identity-record.js";
import type { DeliveryHostPort } from "../../src/lib/delivery/host.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from
  "../../src/lib/delivery/local-stores.js";
import {
  bindInitialDeliveryRef,
  deriveDeliveryMaterialization,
  materializeBoundDeliveryChain,
  publishDeliveryRequests,
} from "../../src/lib/delivery/materialization.js";
import {
  observeDeliveryLocalRef,
} from "../../src/lib/delivery/git-materialization.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { inspectDeliveryEntry } from "../../src/lib/delivery/entry-inspection.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import {
  createCandidateAttestation,
  type CandidateManagedRecordV1,
} from "../../src/lib/work-unit/candidate-attestation.js";
import {
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../../src/lib/work-unit/candidate-record-store.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import {
  readSubmissionBoundaryVersioned,
  resolveSubmissionBoundaryPath,
  writeSubmissionBoundary,
} from "../../src/lib/work-unit/submission-boundary-store.js";
import {
  createReviewRequirement,
  createReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import { ApprovedDispositionRecordSchema } from
  "../../src/scripts/review-gate/core/advisory-records.js";
import {
  LocalAttestEnvelopeSchema,
  LocalPrepareEnvelopeSchema,
  LocalResumeEnvelopeSchema,
  RespondEnvelopeSchema,
  ReviewCommandErrorEnvelopeSchema,
} from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { LaneSubjectLineageSchema } from
  "../../src/scripts/review-gate/core/lane-admission.js";
import { bindReviewSourceReference } from
  "../../src/scripts/review-gate/core/review-source-reference.js";
import {
  awaitHostedReview,
  HostedAwaitEnvelopeSchema,
  HostedAwaitResultSchema,
} from "../../src/scripts/review-gate/hosted/await.js";
import {
  createHostedAdmission,
  HostedRequestResultSchema,
  requestHostedReview,
  type HostedRequestEnvelope,
  type HostedRequestHandle,
  type HostedRequestOutcome,
  type HostedReviewCoverage,
} from "../../src/scripts/review-gate/hosted/request.js";
import { settleHostedFinding } from "../../src/scripts/review-gate/hosted/settle.js";
import {
  acknowledgeHostedRequest,
  bindHostedAttemptDisposition,
  hostedLaneAttemptId,
  laneProgressOperationId,
  recordHostedAwaitAttempt,
  recordLaneAttempt,
  recordHostedRequestAdmission,
  recordHostedRequestConclusion,
  recordLaneResponsePerformance,
  settleLaneAttempt,
  settleHostedAttemptFinding,
} from "../../src/scripts/review-gate/lane-progress.js";
import { LocalReviewOperationStateStore } from
  "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { HostedRequestOwnerIndex } from
  "../../src/scripts/review-gate/hosts/local/hosted-request-owner-index.js";
import { LocalApprovedDispositionRecordStore } from
  "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { RepositoryDeliveryMemberLookup } from
  "../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { resolveLocalReviewAuthority, resolveLocalReviewVehicle } from
  "../../src/scripts/review-gate/hosts/local/review-authority.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  createStandardReviewReservation,
  projectCorrectiveDeliveryStatusBoundary,
  projectPublicationBoundary,
} from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../src/lib/delivery/public-review-continuation.js";
import { createPrePublicationCompositionDependencies } from
  "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type {
  ReviewAdditionalPassAuthorization,
  ReviewCeilingOverride,
} from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { optionalReviewStatusJudgment } from "../../src/scripts/review-gate/status-judgment.js";
import type { DeliveryLocalReviewAdmission } from
  "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { projectLocalReviewGuidance } from
  "../../src/scripts/review-gate/policy/local-review-guidance.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from
  "../../src/scripts/review-gate/policy/standard-review.js";
import {
  DeliveryReviewTerminusAcceptanceResultSchema,
  DeliveryReviewTerminusOfferSchema,
  resolveDeliveryReviewTerminusAcceptance,
} from "../../src/scripts/review-gate/policy/delivery-review-terminus.js";
import { attestLocalReviewCommand } from
  "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createLocalAttestDependencies } from
  "../../src/scripts/review-gate/runtime/local-attest-composition.js";
import { prepareLocalReview } from
  "../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalPrepareDependencies } from
  "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { respondToReviewCommand } from
  "../../src/scripts/review-gate/runtime/respond-command.js";
import { createRespondDependencies } from
  "../../src/scripts/review-gate/runtime/respond-composition.js";
import {
  bindDeliveryReviewTerminusOffer,
  ReviewStatusCommandResultSchema,
  ReviewStatusResultSchema,
  resolveReviewStatus,
} from "../../src/scripts/review-gate/status.js";
import { readRoutedObligation } from "../../src/scripts/review-gate/status-composition.js";
import {
  deliveryStackPlanFixture,
  deliveryStackPlanWithMemberTitlesFixture,
} from "../fixtures/delivery-plan.js";
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
    rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
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

async function bindApprovedHostedFinding(
  harness: FanOutHarness,
  input: {
    operationId: string;
    handle: HostedRequestHandle;
    progress: {
      attempts: readonly {
        attemptId: string;
        hosted?: { sealedResult?: { hostedResultId: string } };
      }[];
    };
    finding: {
      findingId: string;
      locus: string;
      url: string;
      severity: "minor" | "major" | "critical";
    };
    disposition: "defer" | "reject" | "fix";
    channelAction: "record-only" | "reply-and-resolve";
    now: string;
  },
): Promise<CanonicalDigest> {
  const attemptId = hostedLaneAttemptId(input.handle);
  const hostedResultId = input.progress.attempts.find((attempt) => attempt.attemptId === attemptId)
    ?.hosted?.sealedResult?.hostedResultId;
  if (hostedResultId === undefined) throw new Error("expected sealed hosted result");
  const approvedDisposition = approveDispositionState({
    proposed: proposeDispositionSet(createDispositionSet({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      targetId: input.handle.admission.reviewTarget.targetId,
      producerId: attemptId,
      resultDigest: CanonicalDigestSchema.parse(hostedResultId),
      policyVersion: input.handle.admission.requirement.policyVersion,
      rubricVersion: input.handle.admission.requirement.rubricVersion,
      rubricDigest: input.handle.admission.requirement.rubricDigest,
      proposedBy: "arc-cli/integration-test",
      proposedVerification: "focused",
      findings: [{
        findingId: input.finding.findingId,
        sourceIdentity: input.handle.provider,
        locus: input.finding.locus,
        sourceVerification: "verified",
        verificationRefs: [input.finding.url],
        reportedSeverity: input.finding.severity,
        verifiedSeverity: input.finding.severity,
        disposition: input.disposition,
        gating: "blocking",
        rationale: "The hosted finding matches the reviewed source.",
        recommendation: "Apply the approved response.",
        openQuestions: [],
      }],
    })),
    approvedBy: "andrew",
    approvedAt: input.now,
  });
  const dispositionSetId = CanonicalDigestSchema.parse(approvedDisposition.dispositionSet.dispositionSetId);
  const attemptRef = bindReviewSourceReference({
    kind: "hosted",
    operationId: input.operationId,
    durableRef: attemptId,
  });
  const publisher = new RepositoryGitCommonStatePublisher(harness.exec, harness.root);
  await new LocalApprovedDispositionRecordStore(publisher).appendDispositionRecord(
    ApprovedDispositionRecordSchema.parse({
      schemaVersion: 1,
      semanticsVersion: "review-advisory/v1",
      repositoryId: harness.repositoryId,
      operationId: attemptId,
      candidate: null,
      errand: null,
      deliveryMember: input.handle.vehicle?.kind === "delivery-member"
        ? input.handle.vehicle
        : null,
      source: { kind: "hosted", attemptRef, hostedResultId },
      currentDispositionSetId: dispositionSetId,
      approvedDispositionLineage: [{
        approvedDisposition,
        responsePolicyRequest: responsePolicyRequestFixture({
          headSha: input.handle.admission.reviewTarget.headSha,
          pullRequest: input.handle.target.pullRequest,
          sourceId: input.handle.provider,
          reviewOperationId: attemptId,
        }),
        fixAuthorization: null,
        errandFixResponse: null,
        deliveryMemberFixResponse: null,
        predecessorDispositionSetId: null,
        successorDispositionSetId: null,
      }],
    }),
  );
  await bindHostedAttemptDisposition(harness.store, {
    operationId: input.operationId,
    attemptId,
    dispositionSetId,
    findingDispositions: [{
      findingId: input.finding.findingId,
      disposition: input.disposition,
      channelAction: input.channelAction,
    }],
    now: input.now,
  });
  return dispositionSetId;
}

async function requestThroughHandler(
  request: HostedRequestEnvelope,
  outcome: HostedRequestOutcome,
  root: string,
  exec: GitExec,
  actorIdentity = "andrew",
) {
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const store = new LocalReviewOperationStateStore(publisher);
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup({ cwd: root, exec });
  const delivery = request.vehicle?.kind === "delivery-member"
    ? await deliveryMemberLookup.resolveMemberByVehicle(request.vehicle)
    : null;
  if (delivery !== null && delivery.status !== "resolved") {
    throw new Error("expected direct hosted request fixture to resolve its delivery member");
  }
  const reviewTarget = delivery === null
    ? createReviewTarget({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        kind: "change-set",
        repositoryId,
        baseRef: "main",
        diffBaseSha: oid("a"),
        diffBaseTree: oid("b"),
        headSha: request.target.headSha,
        headTree: oid("c"),
      })
    : targetAndRequirement({
        repositoryId,
        baseSha: delivery.member.base,
        baseTree: await git(root, ["rev-parse", `${delivery.member.base}^{tree}`]),
        headSha: delivery.member.head,
        headTree: await git(root, ["rev-parse", `${delivery.member.head}^{tree}`]),
      }).reviewTarget;
  const requirement = createReviewRequirement({
    target: reviewTarget,
    projection: {
      obligation: "required",
      reasons: ["sensitive-change-set"],
      rubricVersion: "standard-review/v1",
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final",
      count: 1,
    },
    acceptableSources: [
      { sourceKind: "hosted", qualifier: "coderabbit-pr" },
      { sourceKind: "hosted", qualifier: "codex-pr" },
    ],
    initialAdmission: "automatic",
  });
  if (requirement === null) throw new Error("expected direct hosted request requirement");
  const lineage = LaneSubjectLineageSchema.parse(delivery === null
    ? {
        kind: "head-bound" as const,
        vehicleKind: "review-target",
        vehicleIdentity: `${repositoryId}/${request.target.headSha}`,
        headSha: request.target.headSha,
      }
    : {
        kind: "delivery-member" as const,
        planId: delivery.member.planId,
        workUnitId: delivery.member.workUnitId,
        deliverableId: delivery.member.deliverableId,
      });
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
      deliveryMemberLookup,
      admitRequest: (admittedRequest, progressVehicle) => recordHostedRequestAdmission(store, {
        repositoryId,
        lineage,
        request: admittedRequest,
        ...(progressVehicle === undefined ? {} : { progressVehicle }),
        reviewTarget,
        requirement,
        actorIdentity,
        authorizeCapacity: async () => undefined,
        now: "2026-09-01T09:59:00.000Z",
      }),
      acknowledgeRequest: async (admission, handle) => {
        await acknowledgeHostedRequest(store, {
          admission,
          handle,
          now: "2026-09-01T09:59:01.000Z",
        });
      },
      concludeRequest: async (admission, result) => {
        await recordHostedRequestConclusion(store, {
          admission,
          result,
          now: "2026-09-01T09:59:01.000Z",
        });
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

async function respondThroughHandler(harness: FanOutHarness, request: unknown) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  const dependencies = createRespondDependencies({ cwd: harness.root, exec: harness.exec });
  dependencies.resolveLocalActors = async () => ({
    approverIdentity: "andrew",
    proposerIdentity: "arc-cli/integration-test",
  });
  dependencies.resolveFrontlineActors = async () => ({
    approverIdentity: "andrew",
    proposerIdentity: "arc-cli/integration-test",
  });
  await handleReviewRespond("-", {
    resolveRoot: () => harness.root,
    readText: async () => JSON.stringify(request),
    respond: (input) => respondToReviewCommand(input, dependencies),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return RespondEnvelopeSchema.parse(JSON.parse(output.join("")));
}

async function resumeLocalThroughHandler(harness: FanOutHarness, request: unknown) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewLocalResume("-", {
    resolveRoot: () => harness.root,
    readText: async () => JSON.stringify(request),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes, output.join("")).toEqual([]);
  return LocalResumeEnvelopeSchema.parse(JSON.parse(output.join("")));
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
  standardSources: readonly ("coderabbit-pr" | "codex-pr" | "delegated-agent")[];
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

function deliveryHost(
  harness: Pick<FanOutHarness, "root" | "plan" | "states">,
): Pick<DeliveryHostPort, "readRequest"> {
  return {
    readRequest: async (requestedRepository, binding) => {
      const record = await harness.states.read(harness.plan.planId);
      if (record.status !== "ok" || record.value === null) return { status: "absent" };
      const index = record.value.value.members.findIndex((member) => (
        member.changeRequest?.providerId === binding.providerId
        && member.changeRequest.changeRequestId === binding.changeRequestId
      ));
      const member = record.value.value.members[index];
      if (member?.ref === null || member?.ref === undefined) return { status: "absent" };
      const predecessorRef = index === 0
        ? record.value.value.target?.ref
        : record.value.value.members[index - 1]?.ref;
      if (predecessorRef === null || predecessorRef === undefined) return { status: "absent" };
      return {
        status: "observed",
        request: {
          binding,
          repository: requestedRepository,
          headRepository: requestedRepository,
          headRef: member.ref.replace(/^refs\/heads\//u, ""),
          headSha: await git(harness.root, ["rev-parse", member.ref]),
          baseRef: predecessorRef.replace(/^refs\/heads\//u, ""),
          state: "open",
          draft: false,
        },
      };
    },
  };
}

async function installCandidate(
  harness: FanOutHarness,
  head: string,
  expectedVersion: string | null,
  supersedes?: string,
): Promise<CandidateManagedRecordV1> {
  const target = await collectCandidateSubjectTarget({
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
      ...(supersedes === undefined ? {} : { supersedes }),
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
  expectedDeliveryStatus: "planned" | "bound",
  lifecycleOrder?: string[],
): Promise<void> {
  const current = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
  const lookup = new RepositoryDeliveryMemberLookup({ cwd: harness.root, exec: harness.exec });
  const records = await lookup.resolveReservationRecords(
    harness.plan.workUnitId,
    { status: "established", ref: "refs/heads/main" },
  );
  expect(records).toMatchObject({ status: expectedDeliveryStatus, plan: harness.plan });
  if (records.status !== "planned" && records.status !== "bound") {
    throw new Error("expected authoritative reservation records");
  }
  const composition = createPrePublicationCompositionDependencies({
    cwd: harness.root,
    exec: harness.exec,
  });
  const selected = await composition.readReservationTarget(
    harness.plan.workUnitId,
    { repository, headSha: await git(harness.root, ["rev-parse", branch]) },
  );
  expect(selected).toMatchObject({ status: "resolved", target: { kind: "delivery" } });
  if (selected.status !== "resolved") throw new Error("expected delivery reservation target");
  lifecycleOrder?.push("reservation");
  const reservation = createStandardReviewReservation({
    candidateId: candidate.attestation.candidateId,
    sourceId: harness.standardSources[0]!,
    sources: harness.standardSources,
    obligation: targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    }).projection,
    target: selected.target,
  });
  await writeSubmissionBoundary(harness.root, projectPublicationBoundary({
    workUnit: harness.plan.workUnitId,
    branch,
    candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest,
    reservation,
    changeRequest: { repository, pullRequest: 42 },
  }), current.version);
  lifecycleOrder?.push("publication-transition");
}

async function createHarness(
  standardSources: readonly ("coderabbit-pr" | "codex-pr" | "delegated-agent")[] = [
    "coderabbit-pr",
    "codex-pr",
  ],
): Promise<FanOutHarness> {
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
  const repositoryId = await resolveRepositoryIdentity(publisher);
  const harness: FanOutHarness = {
    root,
    exec,
    plan,
    plans,
    states,
    state,
    stateRevision: 0,
    store: new LocalReviewOperationStateStore(publisher),
    repositoryId,
    standardSources,
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
  const lifecycleOrder: string[] = [];
  const candidate = await installCandidate(harness, priorSecond, null);
  await writeBoundary(harness, candidate, "prior-top", "planned", lifecycleOrder);
  await expect(states.read(plan.planId)).resolves.toEqual({ status: "ok", value: null });
  lifecycleOrder.push("integration-dispatch");
  const entry = await inspectDeliveryEntry({
    workUnitId: plan.workUnitId,
    entryMode: "integrating",
  }, {
    readTaskList: async () => `# Task List\n\n${renderDeliveryPlanSection(plan)}\n`
      + "## **Phase 1:** Build\n\n### `[x]` **1.1 Work**\n",
    resolvePlan: async () => {
      const records = await plans.enumerateCurrentReadOnly();
      const matching = records.status === "ok"
        ? records.value.filter((candidate) => candidate.workUnitId === plan.workUnitId)
        : [];
      return matching.length === 1
        ? { status: "match", plan: matching[0]! }
        : { status: "indeterminate" };
    },
    resolveAuthoring: async () => ({ status: "no-match" }),
    readState: async (requestedPlanId) => {
      const record = await states.read(requestedPlanId);
      return record.status === "refused"
        ? { status: "refused" }
        : record.value === null
          ? { status: "ok", value: null, revision: null }
          : { status: "ok", value: record.value.value, revision: record.value.revision };
    },
    readIntegrationBoundary: async () => ({ status: "ok", value: null }),
    readCandidate: async () => ({ status: "ok", value: null }),
  });
  expect(entry).toMatchObject({ status: "validate-canonical", planId: plan.planId });
  expect(lifecycleOrder).toEqual(["reservation", "publication-transition", "integration-dispatch"]);
  const materialization = deriveDeliveryMaterialization(plan, {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: "refs/heads/main", head: baseHead, tree: baseTree },
    chainBase: { head: baseHead, tree: baseTree },
    predecessorRelation: { kind: "advanced", observedTip: baseHead, chainBase: baseHead },
    top: { ref: "refs/heads/prior-top", head: priorSecond, tree: priorSecondTree },
    members: [
      {
        deliverableId: plan.members[0]!.deliverableId,
        ref: "refs/heads/delivery/delivery-plan-record/first",
        head: oldFirst,
        tree: oldFirstTree,
      },
      {
        deliverableId: plan.members[1]!.deliverableId,
        ref: "refs/heads/prior-top",
        head: priorSecond,
        tree: priorSecondTree,
      },
    ],
    lifecyclePaths: [],
    regenerablePaths: [],
  });
  if (materialization.status !== "derived") throw new Error("expected delivery materialization");
  const bindingOrder: string[] = [];
  const bound = await bindInitialDeliveryRef({
    plan,
    materialization: materialization.value,
    stateStore: {
      read: (requestedPlanId) => states.read(requestedPlanId),
      publish: async (requestedPlanId, value, expectedRevision) => {
        bindingOrder.push("state-binding");
        return states.publish(requestedPlanId, value, expectedRevision);
      },
    },
    refs: {
      publish: async () => {
        bindingOrder.push("member-publication");
        return { status: "published" };
      },
      observe: async () => {
        bindingOrder.push("member-observation");
        return { status: "observed", head: oldFirst };
      },
    },
  });
  expect(bound.status).toBe("bound");
  if (bound.status !== "bound") throw new Error("expected first external event to bind delivery state");
  expect(bindingOrder).toEqual(["member-publication", "member-observation", "state-binding"]);
  const published = await states.publish(plan.planId, state, bound.state.revision);
  if (published.status !== "ok") throw new Error("expected initial delivery state");
  harness.stateRevision = published.value.revision;
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
  await writeBoundary(harness, candidate, "feat/delivery-plan-record", "bound");
}

async function bindDeliveryMembersToSharedHead(harness: FanOutHarness): Promise<void> {
  await git(harness.root, ["branch", "delivery/delivery-plan-record/shared-second", harness.oldFirst]);
  const state: DeliveryStateV1 = {
    ...harness.state,
    members: [
      harness.state.members[0]!,
      {
        ...harness.state.members[1]!,
        ref: "refs/heads/delivery/delivery-plan-record/shared-second",
        coordinates: {
          base: harness.oldFirst,
          head: harness.oldFirst,
          tree: harness.oldFirstTree,
        },
      },
    ],
  };
  const published = await harness.states.publish(harness.plan.planId, state, harness.stateRevision);
  if (published.status !== "ok") throw new Error("expected shared-head delivery state");
  harness.state = state;
  harness.stateRevision = published.value.revision;
  const current = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
  if (current.version === null) throw new Error("expected initial Candidate version");
  const candidate = await installCandidate(harness, harness.oldFirst, current.version);
  await writeBoundary(harness, candidate, "delivery/delivery-plan-record/shared-second", "bound");
}

async function statusThroughHandler(
  harness: Pick<FanOutHarness, "root" | "exec" | "baseHead" | "plan" | "states">,
  target: { repository: string; headRef: string; headSha: string },
  ceilingOverride?: ReviewCeilingOverride,
  coverage?: HostedReviewCoverage,
  sourceId?: "coderabbit-pr" | "codex-pr" | "delegated-agent",
  additionalPass?: ReviewAdditionalPassAuthorization,
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewStatus({
    target: JSON.stringify(target),
    ...(ceilingOverride === undefined ? {} : { ceilingOverride: JSON.stringify(ceilingOverride) }),
    ...(additionalPass === undefined ? {} : { additionalPass: JSON.stringify(additionalPass) }),
    ...(coverage === undefined ? {} : { coverage }),
    ...(sourceId === undefined ? {} : { source: sourceId }),
  }, undefined, {
    resolveRoot: () => harness.root,
    resolve: (root, input) => resolveReviewStatus(input, {
      observe: async (statusTarget, admittedOverride, admittedCoverage, admittedSourceId, admittedAdditional) => ({
        actualHeadSha: statusTarget.headSha,
        requiredChecks: "green",
        routedObligation: await readRoutedObligation(
          root,
          harness.exec,
          statusTarget,
          42,
          new RepositoryDeliveryMemberLookup({ cwd: root, exec: harness.exec }),
          harness.baseHead,
          optionalReviewStatusJudgment({
            ceilingOverride: admittedOverride,
            additionalPassAuthorization: admittedAdditional,
            coverage: admittedCoverage,
            sourceId: admittedSourceId,
          }),
          deliveryHost(harness),
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

async function workUnitStatusThroughHandler(
  harness: FanOutHarness,
  target: { repository: string; headRef: string; headSha: string },
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewStatus({ workUnit: harness.plan.workUnitId }, undefined, {
    resolveRoot: () => harness.root,
    resolveWorkUnit: async () => {
      const status = await statusThroughHandler(harness, target);
      const versioned = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
      if (versioned.boundary === null || versioned.version === null
        || versioned.boundary.candidateSubjectDigest === null) {
        throw new Error("expected versioned delivery review boundary");
      }
      return bindDeliveryReviewTerminusOffer(ReviewStatusResultSchema.parse(status), {
        workUnitId: harness.plan.workUnitId,
        expectedBoundaryVersion: versioned.version,
        candidateId: versioned.boundary.candidateId,
        candidateSubjectDigest: versioned.boundary.candidateSubjectDigest,
      });
    },
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  expect(exitCodes).toEqual([]);
  return ReviewStatusCommandResultSchema.parse(JSON.parse(output.join("")));
}

interface EightMemberHarness extends Pick<FanOutHarness,
  "root" | "exec" | "plan" | "states" | "store" | "repositoryId" | "baseHead" | "baseTree"> {
  readonly heads: readonly string[];
  readonly trees: readonly string[];
}

async function createEightMemberHarness(): Promise<EightMemberHarness> {
  const root = await createTempRepo("arc-review-eight-member-");
  roots.push(root);
  const exec = makeGitExec(root);
  await mkdir(join(root, ".arc", "system"), { recursive: true });
  await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch:\n  base: main\n", "utf8");
  await writeFile(join(root, "README.md"), "base\n", "utf8");
  await git(root, ["add", "README.md"]);
  await git(root, ["commit", "-m", "base"]);
  const baseHead = await git(root, ["rev-parse", "HEAD"]);
  const baseTree = await git(root, ["rev-parse", "HEAD^{tree}"]);
  const plan = deliveryStackPlanWithMemberTitlesFixture(
    Array.from({ length: 8 }, (_, index) => `Member ${String(index + 1)}`),
  );
  await git(root, ["checkout", "-b", "feat/delivery-plan-record"]);
  const heads: string[] = [];
  const trees: string[] = [];
  for (const [index, planned] of plan.members.entries()) {
    const path = `member-${String(index + 1)}.txt`;
    await writeFile(join(root, path), `member ${String(index + 1)}\n`, "utf8");
    await git(root, ["add", path]);
    await git(root, ["commit", "-m", `member ${String(index + 1)}`]);
    const head = await git(root, ["rev-parse", "HEAD"]);
    heads.push(head);
    trees.push(await git(root, ["rev-parse", "HEAD^{tree}"]));
    if (index < plan.members.length - 1) {
      await git(root, ["branch", `delivery/${plan.workUnitId}/${planned.chunkKey}`, head]);
    }
  }
  const publisher = new RepositoryGitCommonStatePublisher(exec, root);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  expect(await plans.publishCurrent(plan.planId, plan, null)).toMatchObject({ status: "ok" });
  const materialization = deriveDeliveryMaterialization(plan, {
    planId: plan.planId,
    workUnitId: plan.workUnitId,
    planRevision: plan.planRevision,
    planDigest: plan.planDigest,
    protectedBase: { ref: "refs/heads/main", head: baseHead, tree: baseTree },
    chainBase: { head: baseHead, tree: baseTree },
    predecessorRelation: { kind: "advanced", observedTip: baseHead, chainBase: baseHead },
    top: { ref: "refs/heads/feat/delivery-plan-record", head: heads.at(-1)!, tree: trees.at(-1)! },
    members: plan.members.map((planned, index) => ({
      deliverableId: planned.deliverableId,
      ref: index === plan.members.length - 1
        ? "refs/heads/feat/delivery-plan-record"
        : `refs/heads/delivery/${plan.workUnitId}/${planned.chunkKey}`,
      head: heads[index]!,
      tree: trees[index]!,
    })),
    lifecyclePaths: [],
    regenerablePaths: [],
  });
  if (materialization.status !== "derived") throw new Error("expected eight-member materialization");
  const refs = {
    observe: (ref: string) => observeDeliveryLocalRef(exec, ref),
    publish: async (ref: string, head: string) => {
      const observed = await observeDeliveryLocalRef(exec, ref);
      return observed.status === "observed" && observed.head === head
        ? { status: "adopted" as const }
        : { status: "refused" as const };
    },
  };
  const bound = await bindInitialDeliveryRef({ plan, materialization: materialization.value, stateStore: states, refs });
  if (bound.status !== "bound") throw new Error("expected eight-member initial binding");
  const materialized = await materializeBoundDeliveryChain({
    plan,
    materialization: materialization.value,
    stateStore: states,
    refs,
  });
  if (materialized.status !== "materialized") throw new Error("expected eight-member materialized chain");
  const published = await publishDeliveryRequests({
    plan,
    materialization: materialization.value,
    stateStore: states,
    host: {
      observeRequest: async (effect) => {
        const index = heads.indexOf(effect.headSha);
        if (index < 0) return { status: "refused" as const, reason: "malformed" as const };
        return {
          status: "observed" as const,
          request: {
            binding: { providerId: effect.providerId, changeRequestId: String(41 + index) },
            repository: effect.repository,
            headRepository: effect.repository,
            headRef: effect.headRef,
            headSha: effect.headSha,
            baseRef: effect.baseRef,
            state: "open" as const,
            draft: effect.draft,
          },
        };
      },
      openRequest: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
      readRequest: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
      mergeRequest: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
      observeTarget: async () => ({ status: "refused" as const, reason: "unavailable" as const }),
    },
    providerId: "github",
    repository,
    draft: false,
    terminalPresentation: { title: "Publish eight members", body: "Publish the complete eight-member work unit." },
    memberPresentation: (planned) => ({
      title: `Publish ${planned.chunkKey}`,
      body: `Publish delivery member ${planned.chunkKey}.`,
    }),
  });
  if (published.status !== "published") throw new Error("expected eight-member request publication");
  const topHead = heads.at(-1);
  if (topHead === undefined) throw new Error("missing eight-member terminal head");
  const target = await collectCandidateSubjectTarget({
    cwd: root,
    name: plan.workUnitId,
    baseBranch: "main",
    baseRevision: baseHead,
    revision: topHead,
    exec,
  });
  const candidate: CandidateManagedRecordV1 = {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: plan.workUnitId,
      subject: target.subject,
      baseRevision: baseHead,
      attestedBy: "andrew",
      attestedAt: "2026-08-30T14:00:00.000Z",
      verificationEvidenceRef: `verification://${topHead}`,
    }),
    subject: target.subject,
    transitions: [],
    lineageAttestations: [],
  };
  await writeCandidateRecord(root, plan.workUnitId, candidate, null);
  const firstHead = heads[0];
  const firstTree = trees[0];
  if (firstHead === undefined || firstTree === undefined) throw new Error("missing first eight-member target");
  const reservation = createStandardReviewReservation({
    candidateId: candidate.attestation.candidateId,
    sourceId: "coderabbit-pr",
    sources: ["coderabbit-pr", "codex-pr"],
    obligation: targetAndRequirement({
      repositoryId: await resolveRepositoryIdentity(publisher),
      baseSha: baseHead,
      baseTree,
      headSha: firstHead,
      headTree: firstTree,
    }).projection,
    target: {
      kind: "delivery",
      repository,
      workUnitId: plan.workUnitId,
      planId: plan.planId,
    },
  });
  await writeSubmissionBoundary(root, projectPublicationBoundary({
    workUnit: plan.workUnitId,
    branch: "feat/delivery-plan-record",
    candidateId: candidate.attestation.candidateId,
    candidateSubjectDigest: candidate.subject.subjectDigest,
    reservation,
    changeRequest: { repository, pullRequest: 48 },
  }), null);
  return {
    root,
    exec,
    plan,
    states,
    store: new LocalReviewOperationStateStore(publisher),
    repositoryId: await resolveRepositoryIdentity(publisher),
    baseHead,
    baseTree,
    heads,
    trees,
  };
}

async function completeLocalReviewThroughHandlers(
  harness: FanOutHarness,
  deliveryAdmission: DeliveryLocalReviewAdmission,
  result: "clean" | "findings" | "failed" = "clean",
) {
  const basePrepare = createLocalPrepareDependencies({ exec: harness.exec, cwd: harness.root });
  const memberLookup = new RepositoryDeliveryMemberLookup({ cwd: harness.root, exec: harness.exec });
  const readLiveContext = async () => ({
    activeIdentity: "andrew",
    workUnit: { identity: harness.plan.workUnitId, owner: "andrew" },
    errand: null,
  });
  const prepareDependencies = {
    ...basePrepare,
    resolveVehicle: (
      memberHeadObjectId?: string,
      admission?: DeliveryLocalReviewAdmission,
    ) => resolveLocalReviewVehicle({
      ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
      ...(admission === undefined ? {} : { deliveryAdmission: admission }),
    }, { readLiveContext, memberLookup }),
    resolveAuthority: (
      evaluatorIdentity: string,
      memberHeadObjectId?: string,
      admission?: DeliveryLocalReviewAdmission,
    ) => resolveLocalReviewAuthority({
      evaluatorIdentity,
      ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
      ...(admission === undefined ? {} : { deliveryAdmission: admission }),
    }, {
      readLiveContext,
      resolveRuntimeBinding: async () => ({ kind: "arc-cli", identity: "arc-cli/integration-test" }),
      memberLookup,
    }),
    composeAssurance: async () => ({
      status: "resolved" as const,
      assurance: { workContext: "work-unit" as const, workClass: "Heavy" as const },
      activity: { selfReview: true, frontlineReview: true },
      guidance: projectLocalReviewGuidance(),
      diagnostics: [] as const,
    }),
    validateDeliveryAdmission: async (admission: DeliveryLocalReviewAdmission) => {
      const current = await statusThroughHandler(
        harness,
        admission.statusTarget,
        admission.ceilingOverride,
        admission.requestedCoverage,
        admission.sourceId,
      );
      if (current.nextAction !== "review-local-prepare"
        || canonicalize(current.action) !== canonicalize(admission)) {
        throw new Error("local delivery admission moved before preparation");
      }
      return {
        obligation: "required" as const,
        reasons: ["sensitive-change-set" as const],
        rubricVersion: "standard-review/v1",
        rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
        retrigger: "full-final" as const,
        count: 1 as const,
      };
    },
  };
  const prepareOutput: string[] = [];
  const prepareExitCodes: number[] = [];
  await handleReviewLocalPrepare("-", {
    resolveRoot: () => harness.root,
    readText: async () => JSON.stringify({
      schemaVersion: 1,
      evaluatorIdentity: "fresh-reviewer",
      routingFacts: {
        contentKind: "code-bearing",
        reviewRisk: "sensitive",
        changeDeterminacy: "ordinary",
        ownership: "self",
        surfaceAuthority: "ordinary",
      },
      deliveryAdmission,
    }),
    prepare: (request) => prepareLocalReview(request, prepareDependencies),
    write: (text) => prepareOutput.push(text),
    setExitCode: (code) => prepareExitCodes.push(code),
  });
  expect(prepareExitCodes, prepareOutput.join("")).toEqual([]);
  const prepared = LocalPrepareEnvelopeSchema.parse(JSON.parse(prepareOutput.join("")));
  expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
  if (prepared.state !== "ready") throw new Error("expected prepared local review");
  const persisted = await harness.store.readOperation(prepared.payload.operationId);
  expect(persisted.state).toMatchObject({
    kind: "local-review",
    deliveryAdmission,
  });

  const baseAttest = createLocalAttestDependencies({ exec: harness.exec, cwd: harness.root });
  const attestDependencies = {
    ...baseAttest,
    resolveAuthority: async (
      evaluatorIdentity: string,
      memberHeadObjectId?: string,
      admission?: DeliveryLocalReviewAdmission,
    ) => (await prepareDependencies.resolveAuthority(
      evaluatorIdentity,
      memberHeadObjectId,
      admission,
    )).authority,
    resolveGuidanceDigest: async (
      authority: Awaited<ReturnType<typeof prepareDependencies.resolveAuthority>>["authority"],
      state: Extract<
        NonNullable<Awaited<ReturnType<typeof prepareDependencies.operationStore.readOperation>>["state"]>,
        { kind: "local-review" }
      >,
    ) => {
      const policy = prepareDependencies.resolvePolicy();
      if (policy.status === "unavailable") throw new Error(policy.diagnostics.join(","));
      prepareDependencies.validatePolicySelection(policy.binding, authority);
      if (policy.binding.bindingDigest !== state.policyBindingDigest) {
        throw new Error("local review policy binding changed");
      }
      const assurance = await prepareDependencies.composeAssurance();
      return assurance.guidance.guidanceDigest;
    },
  };
  const attestOutput: string[] = [];
  const attestExitCodes: number[] = [];
  await handleReviewLocalAttest("-", {
    resolveRoot: () => harness.root,
    readText: async () => JSON.stringify({
      schemaVersion: 1,
      operationId: prepared.payload.operationId,
      result: {
        status: result === "failed" ? "failed" : "complete",
        result: result === "failed" ? null : result,
        evaluatorIdentity: "fresh-reviewer",
        reviewRunId: `run-${prepared.payload.operationId}`,
        applicabilityId: null,
        findings: result === "findings"
          ? [{
              findingId: "finding-local-1",
              severity: "major",
              locus: "first.txt:1",
              evidenceUrlOrId: "review:finding-local-1",
            }]
          : [],
      },
    }),
    attest: (request) => attestLocalReviewCommand(request, attestDependencies),
    write: (text) => attestOutput.push(text),
    setExitCode: (code) => attestExitCodes.push(code),
  });
  expect(attestExitCodes, JSON.stringify(attestOutput)).toEqual([]);
  const attested = LocalAttestEnvelopeSchema.parse(JSON.parse(attestOutput.join("")));
  expect(attested).toMatchObject(result === "failed"
    ? { state: "not-attestable", nextAction: "rerun-review" }
    : { state: "attested-current", nextAction: "reduce" });
  return { prepared, attested };
}

async function advanceSecondTarget(harness: FanOutHarness): Promise<{ head: string; tree: string }> {
  await writeFile(join(harness.root, "second.txt"), "third second contribution\n", "utf8");
  await git(harness.root, ["add", "second.txt"]);
  await git(harness.root, ["commit", "-m", "advance second member again"]);
  const head = await git(harness.root, ["rev-parse", "HEAD"]);
  const tree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
  const state: DeliveryStateV1 = {
    ...harness.state,
    members: [
      harness.state.members[0]!,
      {
        ...harness.state.members[1]!,
        coordinates: { base: harness.movedFirst, head, tree },
      },
    ],
  };
  const published = await harness.states.publish(harness.plan.planId, state, harness.stateRevision);
  if (published.status !== "ok") throw new Error("expected twice-moved delivery state");
  harness.state = state;
  harness.stateRevision = published.value.revision;
  const current = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
  if (current.version === null) throw new Error("expected current Candidate version");
  const candidate = await installCandidate(harness, head, current.version);
  await writeBoundary(harness, candidate, "feat/delivery-plan-record", "bound");
  return { head, tree };
}

async function selectReviewRequiredUntilRouted(
  harness: FanOutHarness,
  target: { repository: string; headRef: string; headSha: string },
  choice: "covered" | "review-required" = "review-required",
) {
  for (let index = 0; index < 4; index += 1) {
    const status = await statusThroughHandler(harness, target);
    if (status.nextAction !== "resolve-review-applicability") return status;
    const output: string[] = [];
    const exitCodes: number[] = [];
    await handleCandidateApplicabilityResolve(harness.plan.workUnitId, "-", undefined, {
      resolveRoot: () => harness.root,
      resolveMutationOwner: async () => ({
        status: "owned",
        workUnit: harness.plan.workUnitId,
      }),
      readText: async () => JSON.stringify({
        kind: status.selectionAction.kind,
        offer: status.selectionAction,
        selection: {
          selectedBy: "andrew",
          selectedAt: `2026-08-24T04:1${String(index)}:00.000Z`,
          choice,
        },
      }),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });
    expect(exitCodes, output.join("")).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({ state: "resolved", choice });
  }
  throw new Error("review applicability selections did not reach a routed status");
}

async function installHostedRequestTestHost(
  harness: FanOutHarness,
  singletonHead?: string,
  singletonRef = "prior-top",
  firstHead = harness.oldFirst,
  firstRef = "delivery/delivery-plan-record/first",
) {
  const fakeBin = join(harness.root, "fake-bin");
  const fakeGh = join(fakeBin, "gh");
  const providerCalled = join(harness.root, "provider-called");
  const providerVerdict = join(harness.root, "provider-verdict");
  const firstPostedComment = join(harness.root, "provider-request-comment-41");
  const secondPostedComment = join(harness.root, "provider-request-comment-42");
  const firstRequest = JSON.stringify([{
    number: 41,
    url: "https://example.test/pull/41",
    state: "OPEN",
    baseRefName: "main",
    headRefName: firstRef,
    headRefOid: firstHead,
  }]);
  const laterRequest = JSON.stringify([{
    number: 42,
    url: "https://example.test/pull/42",
    state: "OPEN",
    baseRefName: singletonHead === undefined ? "delivery/delivery-plan-record/first" : "main",
    headRefName: singletonRef,
    headRefOid: singletonHead ?? harness.priorSecond,
  }]);
  const observedRequest = (
    pullRequest: number,
    headRef: string,
    headSha: string,
    baseRef: string,
  ) => JSON.stringify({
    number: pullRequest,
    state: "open",
    merged: false,
    draft: false,
    merge_commit_sha: null,
    head: { ref: headRef, sha: headSha, repo: { full_name: repository } },
    base: { ref: baseRef, repo: { full_name: repository } },
  });
  const comment = (pullRequest: number, body: string) => JSON.stringify({
    node_id: `IC_${String(pullRequest)}`,
    html_url: `https://example.test/comment/${String(pullRequest)}`,
    user: { id: 1 },
    performed_via_github_app: null,
    body,
    created_at: "2026-08-30T12:00:00.000Z",
    updated_at: "2026-08-30T12:00:00.000Z",
  });
  const cleanReview = JSON.stringify([[{
    node_id: "PRR_clean",
    html_url: "https://example.test/review/clean",
    user: { id: 136622811 },
    state: "APPROVED",
    commit_id: harness.oldFirst,
    body: "",
    submitted_at: "2026-08-30T12:01:00.000Z",
  }]]);
  const emptyThreads = JSON.stringify({
    data: {
      repository: {
        pullRequest: {
          reviewThreads: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
        },
      },
    },
  });

  await mkdir(fakeBin, { recursive: true });
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "case \"$1:$2\" in",
    "  pr:list)",
    "    case \"$8\" in",
    `      ${firstRef}) printf '%s\\n' '${firstRequest}' ;;`,
    `      ${singletonRef}) printf '%s\\n' '${laterRequest}' ;;`,
    "      *) printf '%s\\n' '[]' ;;",
    "    esac",
    "    ;;",
    "  api:repos/owner/repository/pulls/41)",
    `    printf '%s\\n' '${observedRequest(
      41,
      firstRef,
      firstHead,
      "main",
    )}'`,
    "    ;;",
    "  api:repos/owner/repository/pulls/42)",
    `    printf '%s\\n' '${observedRequest(
      42,
      singletonRef,
      singletonHead ?? harness.priorSecond,
      singletonHead === undefined ? "delivery/delivery-plan-record/first" : "main",
    )}'`,
    "    ;;",
    `  api:repos/owner/repository/commits/${harness.oldFirst}/check-runs?filter=all\\&per_page=100)`,
    "    printf '%s\\n' '[{\"check_runs\":[]}]'",
    "    ;;",
    `  api:repos/owner/repository/commits/${harness.oldFirst}/statuses?per_page=100)`,
    "    printf '%s\\n' '[[]]'",
    "    ;;",
    "  api:repos/owner/repository/pulls/41/reviews?per_page=100)",
    `    if [ -f '${providerVerdict}' ]; then printf '%s\\n' '${cleanReview}'; else printf '%s\\n' '[[]]'; fi`,
    "    ;;",
    "  api:repos/owner/repository/issues/41/comments?per_page=100)",
    `    if [ -f '${firstPostedComment}' ]; then printf '[['; cat '${firstPostedComment}'; printf ']]\\n'; else printf '%s\\n' '[[]]'; fi`,
    "    ;;",
    "  api:graphql)",
    `    printf '%s\\n' '${emptyThreads}'`,
    "    ;;",
    "  api:user)",
    "    printf '%s\\n' '{\"id\":1}'",
    "    ;;",
    "  api:repos/owner/repository/issues/41/comments)",
    `    printf 'request\\n' >> '${providerCalled}'`,
    "    case \"$*\" in",
    `      *"body=@codex review"*) printf '%s\\n' '${comment(41, "@codex review")}' > '${firstPostedComment}' ;;`,
    `      *"body=@coderabbitai review"*) printf '%s\\n' '${comment(41, "@coderabbitai review")}' > '${firstPostedComment}' ;;`,
    `      *) printf '%s\\n' '${comment(41, "@coderabbitai full review")}' > '${firstPostedComment}' ;;`,
    "    esac",
    `    cat '${firstPostedComment}'`,
    "    ;;",
    "  api:repos/owner/repository/issues/42/comments)",
    `    printf 'request\\n' >> '${providerCalled}'`,
    "    case \"$*\" in",
    `      *"body=@codex review"*) printf '%s\\n' '${comment(42, "@codex review")}' > '${secondPostedComment}' ;;`,
    `      *"body=@coderabbitai review"*) printf '%s\\n' '${comment(42, "@coderabbitai review")}' > '${secondPostedComment}' ;;`,
    `      *) printf '%s\\n' '${comment(42, "@coderabbitai full review")}' > '${secondPostedComment}' ;;`,
    "    esac",
    `    cat '${secondPostedComment}'`,
    "    ;;",
    "  *) echo \"unexpected gh invocation: $*\" >&2; exit 1 ;;",
    "esac",
    "",
  ].join("\n"), "utf8");
  await chmod(fakeGh, 0o755);
  await git(harness.root, ["config", "remote.origin.url", "https://github.com/owner/repository.git"]);
  await git(harness.root, [
    "config",
    `url.file://${harness.root}/.insteadOf`,
    "https://github.com/owner/repository.git",
  ]);
  await git(harness.root, ["checkout", "prior-top"]);
  return { fakeBin, providerCalled, providerVerdict };
}

async function requestThroughProductionHandler(
  harness: FanOutHarness,
  fakeBin: string,
  request: HostedRequestEnvelope,
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  const previousCwd = process.cwd();
  const previousPath = process.env.PATH;
  process.chdir(harness.root);
  process.env.PATH = `${fakeBin}:${previousPath ?? ""}`;
  try {
    await handleReviewHostedRequest("-", {
      readText: async () => JSON.stringify(request),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
  return { output: JSON.parse(output.join("")) as unknown, exitCodes };
}

async function resolveThroughProductionHandler(root: string, request: unknown) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewResolve("-", {
    resolveRoot: () => root,
    readText: async () => JSON.stringify(request),
    write: (text) => output.push(text),
    setExitCode: (code) => exitCodes.push(code),
  });
  return { output: JSON.parse(output.join("")) as unknown, exitCodes };
}

/** The status target an admission refusal's remedy names, after checking it names review status. */
function remedyStatusTarget(output: unknown): { repository: string; headRef: string; headSha: string } {
  const refusal = ReviewCommandErrorEnvelopeSchema.parse(output);
  if (!("remedy" in refusal)) throw new Error("expected a remedy on the admission refusal");
  expect(refusal.error.code).toBe("invalid-input");
  expect(refusal.remedy.argv.slice(0, 4)).toEqual(["arc", "review", "status", "--target"]);
  return JSON.parse(refusal.remedy.argv[4] ?? "") as { repository: string; headRef: string; headSha: string };
}

async function awaitThroughProductionHandler(
  harness: FanOutHarness,
  fakeBin: string,
  request: unknown,
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  const previousCwd = process.cwd();
  const previousPath = process.env.PATH;
  process.chdir(harness.root);
  process.env.PATH = `${fakeBin}:${previousPath ?? ""}`;
  try {
    await handleReviewHostedAwait("-", {
      readText: async () => JSON.stringify(request),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
  return { output: JSON.parse(output.join("")) as unknown, exitCodes };
}

async function settleThroughProductionHandler(
  harness: FanOutHarness,
  fakeBin: string,
  request: unknown,
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  const previousCwd = process.cwd();
  const previousPath = process.env.PATH;
  process.chdir(harness.root);
  process.env.PATH = `${fakeBin}:${previousPath ?? ""}`;
  try {
    await handleReviewHostedSettle("-", {
      readText: async () => JSON.stringify(request),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });
  } finally {
    process.chdir(previousCwd);
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
  }
  return { output: JSON.parse(output.join("")) as unknown, exitCodes };
}

/**
 * Install a fake `gh` that serves one review thread (comment 111, `THREAD_1`) on pull request 41 at `head`,
 * recording the reply and the thread resolution as files so a test can observe host mutation.
 */
async function writeSettlementGhFake(
  harness: FanOutHarness,
  input: { head: string; replyBody: string },
): Promise<{ fakeBin: string; replyPath: string; resolvedPath: string }> {
  const fakeBin = join(harness.root, "settlement-bin");
  const replyPath = join(harness.root, "settlement-reply");
  const resolvedPath = join(harness.root, "settlement-resolved");
  await mkdir(fakeBin, { recursive: true });
  await writeFile(join(fakeBin, "gh"), [
    "#!/usr/bin/env node",
    "import { existsSync, writeFileSync } from 'node:fs';",
    `const replyPath = ${JSON.stringify(replyPath)};`,
    `const resolvedPath = ${JSON.stringify(resolvedPath)};`,
    `const head = ${JSON.stringify(input.head)};`,
    `const replyBody = ${JSON.stringify(input.replyBody)};`,
    "const args = process.argv.slice(2);",
    "const route = args[1];",
    "const output = (value) => process.stdout.write(JSON.stringify(value) + '\\n');",
    "if (args[0] !== 'api') process.exit(1);",
    "if (route === 'user') output({ id: 1 });",
    "else if (route === 'repos/owner/repository/pulls/41') output({ head: { sha: head } });",
    "else if (route === 'repos/owner/repository/pulls/41/comments?per_page=100')",
    "  output([existsSync(replyPath) ? [{ id: 222, in_reply_to_id: 111, user: { id: 1 }, body: replyBody }] : []]);",
    "else if (route === 'repos/owner/repository/pulls/41/comments/111/replies') {",
    "  writeFileSync(replyPath, 'reply'); output({ id: 222 });",
    "} else if (route === 'graphql' && args.some((arg) => arg.includes('resolveReviewThread'))) {",
    "  writeFileSync(resolvedPath, 'resolved'); output({ data: { resolveReviewThread: { thread: { id: 'THREAD_1', isResolved: true } } } });",
    "} else if (route === 'graphql') output({ data: { repository: { pullRequest: { reviewThreads: {",
    "  nodes: [{ id: 'THREAD_1', isResolved: existsSync(resolvedPath), comments: {",
    "    nodes: [{ databaseId: 111, body: 'Finding', url: 'https://example.test/finding-production-settlement',",
    "      path: 'first.txt', line: 1, commit: { oid: head }, pullRequestReview: { id: 'REVIEW_1' },",
    "      replyTo: null, author: { databaseId: 2 } }],",
    "    pageInfo: { hasNextPage: false, endCursor: null } } }],",
    "  pageInfo: { hasNextPage: false, endCursor: null } } } } } });",
    "else process.exit(1);",
    "",
  ].join("\n"), "utf8");
  await chmod(join(fakeBin, "gh"), 0o755);
  return { fakeBin, replyPath, resolvedPath };
}

describe("hosted review fan-out lifecycle", () => {
  it("uses default hosted settlement wiring for approved success and stale authority refusal", async () => {
    const harness = await createHarness();
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const requested = await requestThroughHandler(status.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-production-settlement",
        url: "https://example.test/review-production-settlement",
        createdAt: "2026-08-24T04:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec, "1");
    if (requested.nextAction !== "await") throw new Error("expected hosted review handle");
    const finding = {
      findingId: "finding-production-settlement",
      origin: "review-thread" as const,
      commentId: "111",
      threadId: "THREAD_1",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "first.txt:1",
      url: "https://example.test/finding-production-settlement",
      sourceOrdinal: 1,
    };
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-production-settlement",
      findings: [finding],
    });
    const progress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: awaited,
      now: "2026-08-24T04:01:00.000Z",
    });
    if (progress === null) throw new Error("expected findings progress");
    const attemptId = hostedLaneAttemptId(requested.handle);
    const dispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId: progress.operationId,
      handle: requested.handle,
      progress,
      finding,
      disposition: "defer",
      channelAction: "reply-and-resolve",
      now: "2026-08-24T04:02:00.000Z",
    });
    const { fakeBin, replyPath, resolvedPath } = await writeSettlementGhFake(harness, {
      head: harness.oldFirst,
      replyBody: "Tracked for follow-up.",
    });
    const request = {
      schemaVersion: 1,
      response: {
        attemptRef: bindReviewSourceReference({
          kind: "hosted",
          operationId: progress.operationId,
          durableRef: attemptId,
        }),
        dispositionSetId,
        findingId: finding.findingId,
      },
      target: requested.handle.target,
      fixTarget: null,
      actorIdentity: "1",
      finding: { commentId: finding.commentId, threadId: finding.threadId },
      disposition: "defer",
      reply: "Tracked for follow-up.",
    };
    const refused = await settleThroughProductionHandler(harness, fakeBin, {
      ...request,
      actorIdentity: "2",
    });
    expect(refused.exitCodes).toEqual([1]);
    expect(refused.output).toMatchObject({ mode: "review-hosted-settle" });
    await expect(access(replyPath)).rejects.toThrow();
    const before = await harness.store.readOperation(progress.operationId);
    expect(before.state?.kind === "lane-progress"
      ? before.state.attempts.find(({ attemptId: id }) => id === attemptId)?.outcome
      : null).toBe("findings");

    const settled = await settleThroughProductionHandler(harness, fakeBin, request);
    expect(settled.exitCodes, JSON.stringify(settled.output)).toEqual([]);
    expect(settled.output).toMatchObject({ state: "settled", nextAction: "complete", replyId: "222" });
    await expect(readFile(replyPath, "utf8")).resolves.toBe("reply");
    await expect(readFile(resolvedPath, "utf8")).resolves.toBe("resolved");
    const after = await harness.store.readOperation(progress.operationId);
    expect(after.state?.kind === "lane-progress"
      ? after.state.attempts.find(({ attemptId: id }) => id === attemptId)
      : null).toMatchObject({
      outcome: "settled-findings",
      hosted: { settledFindingIds: [finding.findingId] },
    });
  });
  it("refuses a hosted fix settlement until its verified-fix response is recorded, then settles it", async () => {
    const harness = await createHarness();
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const requested = await requestThroughHandler(status.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-unperformed-fix-settlement",
        url: "https://example.test/review-unperformed-fix-settlement",
        createdAt: "2026-08-24T05:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec, "1");
    if (requested.nextAction !== "await") throw new Error("expected hosted review handle");
    const finding = {
      findingId: "finding-unperformed-fix-settlement",
      origin: "review-thread" as const,
      commentId: "111",
      threadId: "THREAD_1",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "first.txt:1",
      url: "https://example.test/finding-unperformed-fix-settlement",
      sourceOrdinal: 1,
    };
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-unperformed-fix-settlement",
      findings: [finding],
    });
    const progress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: awaited,
      now: "2026-08-24T05:01:00.000Z",
    });
    if (progress === null) throw new Error("expected findings progress");
    const attemptId = hostedLaneAttemptId(requested.handle);
    const dispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId: progress.operationId,
      handle: requested.handle,
      progress,
      finding,
      disposition: "fix",
      channelAction: "reply-and-resolve",
      now: "2026-08-24T05:02:00.000Z",
    });
    const fixedHead = harness.movedFirst;
    const { fakeBin, replyPath, resolvedPath } = await writeSettlementGhFake(harness, {
      head: fixedHead,
      replyBody: "Fixed in the current head.",
    });
    const request = {
      schemaVersion: 1,
      response: {
        attemptRef: bindReviewSourceReference({
          kind: "hosted",
          operationId: progress.operationId,
          durableRef: attemptId,
        }),
        dispositionSetId,
        findingId: finding.findingId,
      },
      target: requested.handle.target,
      fixTarget: { ...requested.handle.target, headSha: fixedHead },
      actorIdentity: "1",
      finding: { commentId: finding.commentId, threadId: finding.threadId },
      disposition: "fix",
      reply: "Fixed in the current head.",
    };

    const refused = await settleThroughProductionHandler(harness, fakeBin, request);
    expect(refused.exitCodes).toEqual([]);
    expect(refused.output).toMatchObject({
      mode: "review-hosted-settle",
      state: "fix-not-performed",
      nextAction: "complete-verified-fix",
      interactionText: expect.stringContaining("verifiedFix response"),
    });
    await expect(access(replyPath)).rejects.toThrow();
    await expect(access(resolvedPath)).rejects.toThrow();

    const unperformed = await harness.store.readOperation(progress.operationId);
    if (unperformed.state?.kind !== "lane-progress") throw new Error("expected lane progress");
    const attempt = unperformed.state.attempts.find(({ attemptId: id }) => id === attemptId);
    if (attempt === undefined) throw new Error("expected the findings attempt");
    expect(attempt.outcome).toBe("findings");
    await recordLaneResponsePerformance(harness.store, {
      lane: "standard",
      repositoryId: unperformed.state.repositoryId,
      headSha: attempt.headSha,
      lineage: unperformed.state.lineage,
      attemptId,
      dispositionSetId,
      producedHeadSha: fixedHead,
      now: "2026-08-24T05:03:00.000Z",
    });

    const settled = await settleThroughProductionHandler(harness, fakeBin, request);
    expect(settled.exitCodes, JSON.stringify(settled.output)).toEqual([]);
    expect(settled.output).toMatchObject({ state: "settled", nextAction: "complete", replyId: "222" });
    await expect(readFile(resolvedPath, "utf8")).resolves.toBe("resolved");
    const after = await harness.store.readOperation(progress.operationId);
    expect(after.state?.kind === "lane-progress"
      ? after.state.attempts.find(({ attemptId: id }) => id === attemptId)
      : null).toMatchObject({
      outcome: "settled-findings",
      hosted: { settledFindingIds: [finding.findingId] },
      responsePerformance: { dispositionSetId, producedHeadSha: fixedHead },
    });
  });
  it("lets an exact-head Owner terminus preempt moved-target applicability without provider spend", async () => {
    const harness = await createHarness();
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch:\n  base: main\nreview.standard_max_passes: 2\n",
      "utf8",
    );
    const priorFirstVehicle = member(harness.plan, 0, harness.oldFirst);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const firstStatus = await statusThroughHandler(harness, statusTarget);
    if (firstStatus.nextAction !== "review-hosted-request") throw new Error("expected initial member request");
    const requested = await requestThroughHandler(firstStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-before-owner-terminus",
        url: "https://example.test/review-before-owner-terminus",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (requested.nextAction !== "await") throw new Error("expected hosted review handle");
    const finding = {
      findingId: "finding-before-owner-terminus",
      origin: "review-thread" as const,
      commentId: "comment-before-owner-terminus",
      threadId: "thread-before-owner-terminus",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "first.txt:1",
      url: "https://example.test/finding-before-owner-terminus",
      sourceOrdinal: 1,
    };
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-before-owner-terminus",
      findings: [finding],
    });
    const progress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: awaited,
      now: "2026-09-01T10:01:00.000Z",
    });
    if (progress === null) throw new Error("expected findings progress");
    await bindHostedAttemptDisposition(harness.store, {
      operationId: progress.operationId,
      attemptId: hostedLaneAttemptId(requested.handle),
      dispositionSetId: canonicalDigest({ disposition: "owner-terminus" }),
      findingDispositions: [{
        findingId: finding.findingId,
        disposition: "reject",
        channelAction: "record-only",
      }],
      now: "2026-09-01T10:02:00.000Z",
    });
    const changedBranch = "changed-delivery";
    await git(harness.root, ["checkout", "-b", changedBranch, harness.baseHead]);
    await writeFile(join(harness.root, "first.txt"), "changed first contribution\n", "utf8");
    await git(harness.root, ["add", "first.txt"]);
    await git(harness.root, ["commit", "-m", "changed first member"]);
    const changedFirst = await git(harness.root, ["rev-parse", "HEAD"]);
    const changedFirstTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    await git(harness.root, ["branch", "delivery/delivery-plan-record/changed-first", changedFirst]);
    await writeFile(join(harness.root, "second.txt"), "current second contribution\n", "utf8");
    await git(harness.root, ["add", "second.txt"]);
    await git(harness.root, ["commit", "-m", "changed current second member"]);
    const changedSecond = await git(harness.root, ["rev-parse", "HEAD"]);
    const changedSecondTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    const changedState: DeliveryStateV1 = {
      ...harness.state,
      members: [
        {
          ...harness.state.members[0]!,
          ref: "refs/heads/delivery/delivery-plan-record/changed-first",
          coordinates: { base: harness.baseHead, head: changedFirst, tree: changedFirstTree },
        },
        {
          ...harness.state.members[1]!,
          ref: `refs/heads/${changedBranch}`,
          coordinates: { base: changedFirst, head: changedSecond, tree: changedSecondTree },
        },
      ],
    };
    const changedPublished = await harness.states.publish(
      harness.plan.planId,
      changedState,
      harness.stateRevision,
    );
    if (changedPublished.status !== "ok") throw new Error("expected changed delivery state");
    harness.state = changedState;
    harness.stateRevision = changedPublished.value.revision;
    const currentCandidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    if (currentCandidate.version === null) throw new Error("expected current Candidate version");
    const changedCandidate = await installCandidate(harness, changedSecond, currentCandidate.version);
    await writeBoundary(harness, changedCandidate, changedBranch, "bound");
    const firstVehicle = member(harness.plan, 0, changedFirst);
    const currentStatusTarget = {
      repository,
      headRef: changedBranch,
      headSha: changedSecond,
    };
    const continuation = await workUnitStatusThroughHandler(harness, currentStatusTarget);
    expect(continuation).toMatchObject({
      state: "review-required",
      nextAction: "resolve-review-applicability",
      selectionAction: {
        projection: {
          selector: {
            priorVehicle: priorFirstVehicle,
            currentVehicle: firstVehicle,
          },
        },
      },
      terminusAction: {
        schemaVersion: 1,
        offer: {
          target: { repository, pullRequest: 41, headSha: changedFirst },
          vehicle: firstVehicle,
          completedPasses: 1,
        },
      },
    });
    if (continuation.nextAction !== "resolve-review-applicability" || continuation.terminusAction === undefined) {
      throw new Error("expected exact Owner terminus offer beside moved-target applicability");
    }
    const offer = DeliveryReviewTerminusOfferSchema.parse(continuation.terminusAction.offer);
    const reviewOperationsBeforeAcceptance = await harness.store.readOperationSnapshot();
    const candidateBeforeAcceptance = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    const output: string[] = [];
    const exitCodes: number[] = [];

    await handleReviewTerminusAccept("-", undefined, {
      resolveRoot: () => harness.root,
      readText: async () => JSON.stringify({
        schemaVersion: 1,
        offer,
        judgment: { mode: "owner-accepted" },
      }),
      accept: async (request) => {
        const result = await resolveDeliveryReviewTerminusAcceptance(request, {
          readBoundary: (workUnitId) => readSubmissionBoundaryVersioned(harness.root, workUnitId),
          readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
          readCurrentOffer: async () => {
            const current = await workUnitStatusThroughHandler(harness, currentStatusTarget);
            return "terminusAction" in current ? current.terminusAction?.offer ?? null : null;
          },
          writeBoundary: async (boundary, expectedVersion) => ({
            status: "written",
            path: await writeSubmissionBoundary(harness.root, boundary, expectedVersion),
          }),
        });
        if (result.state === "recorded") {
          await harness.exec("git", ["add", "--", result.boundaryPath], { cwd: harness.root });
        }
        return result;
      },
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });

    expect(exitCodes).toEqual([]);
    expect(DeliveryReviewTerminusAcceptanceResultSchema.parse(JSON.parse(output.join("")))).toMatchObject({
      state: "recorded",
      nextAction: "commit-boundary",
      record: { vehicle: firstVehicle, terminus: { acceptedBy: "andrew", completedPasses: 1 } },
    });
    await expect(readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId)).resolves.toMatchObject({
      boundary: { deliveryReviewTermini: [{ vehicle: firstVehicle }] },
    });
    await expect(readCandidateRecordVersioned(harness.root, harness.plan.workUnitId)).resolves.toEqual(
      candidateBeforeAcceptance,
    );
    await expect(workUnitStatusThroughHandler(harness, currentStatusTarget)).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: { repository, pullRequest: 42, headSha: changedSecond },
        vehicle: member(harness.plan, 1, changedSecond),
      },
      routedObligation: {
        conjunction: { members: [{ state: "discharged" }, { state: "outstanding" }] },
      },
    });
    await expect(harness.store.readOperationSnapshot()).resolves.toEqual(reviewOperationsBeforeAcceptance);
  });

  it("settles the final member after its terminus boundary commit advances the terminal head", async () => {
    const harness = await createHarness();
    await moveDeliveryTargets(harness);
    const stateTerminalHead = harness.currentSecond;
    const sourceCandidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    if (sourceCandidate.record === null || sourceCandidate.version === null) {
      throw new Error("source Candidate must exist");
    }
    const renewedTarget = await collectCandidateSubjectTarget({
      cwd: harness.root,
      name: harness.plan.workUnitId,
      baseBranch: "main",
      baseRevision: harness.baseHead,
      revision: stateTerminalHead,
      exec: harness.exec,
    });
    const renewedCandidate: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: harness.plan.workUnitId,
        subject: renewedTarget.subject,
        baseRevision: stateTerminalHead,
        attestedBy: "andrew",
        attestedAt: "2026-09-04T19:59:00.000Z",
        verificationEvidenceRef: "verification://final-terminus",
        supersedes: sourceCandidate.record.attestation.candidateId,
      }),
      subject: renewedTarget.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(
      harness.root,
      harness.plan.workUnitId,
      renewedCandidate,
      sourceCandidate.version,
    );
    const publicContinuation = projectDeliveryPublicReviewContinuation({
      plan: harness.plan,
      state: harness.state,
      stateRevision: harness.stateRevision,
    });
    if (publicContinuation.status !== "projected") throw new Error("delivery continuation must project");
    const publishedBoundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (publishedBoundary.boundary === null) throw new Error("publication boundary must exist");
    await writeSubmissionBoundary(harness.root, projectCorrectiveDeliveryStatusBoundary({
      workUnit: harness.plan.workUnitId,
      candidateId: renewedCandidate.attestation.candidateId,
      candidateSubjectDigest: renewedCandidate.subject.subjectDigest,
      supersedesCandidateId: renewedCandidate.attestation.supersedes ?? null,
      sourceBoundary: publishedBoundary.boundary,
      deliveryContinuation: publicContinuation.continuation,
    }), publishedBoundary.version);
    const candidatePath = resolveCandidateRecordRelativePath(harness.plan.workUnitId);
    const boundaryPath = resolveSubmissionBoundaryPath(harness.plan.workUnitId);
    await git(harness.root, ["add", candidatePath, boundaryPath]);
    await git(harness.root, [
      "commit",
      "--only",
      candidatePath,
      boundaryPath,
      "-m",
      "establish public correction records",
    ]);
    const initialTerminalHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const initialTerminalTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    const reviewState: DeliveryStateV1 = {
      ...harness.state,
      members: harness.state.members.map((deliveryMember, index) => index === 1
        ? {
            ...deliveryMember,
            coordinates: {
              ...deliveryMember.coordinates!,
              head: initialTerminalHead,
              tree: initialTerminalTree,
            },
          }
        : deliveryMember),
    };
    const publishedReviewState = await harness.states.publish(
      harness.plan.planId,
      reviewState,
      harness.stateRevision,
    );
    if (publishedReviewState.status !== "ok") throw new Error("review delivery state must publish");
    harness.state = reviewState;
    harness.stateRevision = publishedReviewState.value.revision;
    const reviewContinuation = projectDeliveryPublicReviewContinuation({
      plan: harness.plan,
      state: harness.state,
      stateRevision: harness.stateRevision,
    });
    if (reviewContinuation.status !== "projected") throw new Error("review continuation must project");
    const committedBoundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (committedBoundary.boundary?.locus !== "delivery-status-required"
      || committedBoundary.boundary.nextAction.kind !== "resolve-delivery-status") {
      throw new Error("committed delivery-status boundary must exist");
    }
    await writeSubmissionBoundary(harness.root, {
      ...committedBoundary.boundary,
      deliveryContinuation: reviewContinuation.continuation,
    }, committedBoundary.version);
    const firstStatusTarget = {
      repository,
      headRef: "feat/delivery-plan-record",
      headSha: initialTerminalHead,
    };

    const firstStatus = await statusThroughHandler(harness, firstStatusTarget);
    if (firstStatus.nextAction !== "review-hosted-request") {
      throw new Error(`expected first member request: ${JSON.stringify(firstStatus)}`);
    }
    const firstRequested = await requestThroughHandler(firstStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-before-final-terminus",
        url: "https://example.test/review-before-final-terminus",
        createdAt: "2026-09-04T20:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (firstRequested.nextAction !== "await") throw new Error("expected first member review handle");
    const firstAwaited = await awaitThroughHandler(firstRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-before-final-terminus",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: firstAwaited,
      now: "2026-09-04T20:01:00.000Z",
    });

    const finalStatus = await statusThroughHandler(harness, firstStatusTarget);
    expect(finalStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        target: { headSha: initialTerminalHead },
        vehicle: member(harness.plan, 1, initialTerminalHead),
      },
    });
    if (finalStatus.nextAction !== "review-hosted-request") throw new Error("expected final member request");
    const finalRequested = await requestThroughHandler(finalStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-final-terminus",
        url: "https://example.test/review-final-terminus",
        createdAt: "2026-09-04T20:02:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (finalRequested.nextAction !== "await") throw new Error("expected final member review handle");
    const finding = {
      findingId: "finding-before-final-terminus",
      origin: "review-thread" as const,
      commentId: "comment-before-final-terminus",
      threadId: "thread-before-final-terminus",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "second.txt:1",
      url: "https://example.test/finding-before-final-terminus",
      sourceOrdinal: 1,
    };
    const finalAwaited = await awaitThroughHandler(finalRequested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-final-terminus",
      findings: [finding],
    });
    const finalProgress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: finalAwaited,
      now: "2026-09-04T20:03:00.000Z",
    });
    if (finalProgress === null) throw new Error("expected final member findings progress");
    const finalDispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId: finalProgress.operationId,
      handle: finalRequested.handle,
      progress: finalProgress,
      finding,
      disposition: "fix",
      channelAction: "record-only",
      now: "2026-09-04T20:04:00.000Z",
    });
    await recordLaneResponsePerformance(harness.store, {
      lane: "standard", repositoryId: harness.repositoryId, headSha: initialTerminalHead,
      lineage: finalRequested.handle.admission.lineage, attemptId: hostedLaneAttemptId(finalRequested.handle),
      dispositionSetId: finalDispositionSetId, producedHeadSha: initialTerminalHead,
      now: "2026-09-04T20:04:30.000Z",
    });

    const continuation = await workUnitStatusThroughHandler(harness, firstStatusTarget);
    expect(continuation).toMatchObject({
      terminusAction: {
        schemaVersion: 1,
        offer: {
          target: { headSha: initialTerminalHead },
          vehicle: member(harness.plan, 1, initialTerminalHead),
          completedPasses: 1,
        },
      },
    });
    if (!("terminusAction" in continuation) || continuation.terminusAction === undefined) {
      throw new Error("expected final member terminus offer");
    }
    const offer = DeliveryReviewTerminusOfferSchema.parse(continuation.terminusAction.offer);
    const accepted = await resolveDeliveryReviewTerminusAcceptance({
      schemaVersion: 1,
      offer,
      judgment: { mode: "owner-accepted" },
    }, {
      readBoundary: (workUnitId) => readSubmissionBoundaryVersioned(harness.root, workUnitId),
      readOwnerAuthority: async () => ({ status: "authorized", ownerIdentity: "andrew" }),
      readCurrentOffer: async () => {
        const current = await workUnitStatusThroughHandler(harness, firstStatusTarget);
        return "terminusAction" in current ? current.terminusAction?.offer ?? null : null;
      },
      writeBoundary: async (boundary, expectedVersion) => ({
        status: "written",
        path: await writeSubmissionBoundary(harness.root, boundary, expectedVersion),
      }),
    });
    expect(accepted).toMatchObject({ state: "recorded", nextAction: "commit-boundary" });
    if (accepted.state !== "recorded") throw new Error("expected recorded final member terminus");
    await git(harness.root, ["add", accepted.boundaryPath]);
    await git(harness.root, ["commit", "--only", accepted.boundaryPath, "-m", "record final terminus"]);
    const advancedTerminalHead = await git(harness.root, ["rev-parse", "HEAD"]);
    expect(advancedTerminalHead).not.toBe(initialTerminalHead);

    let capturedAdvance: { stateHead: string; currentHead: string } | undefined;
    const routedAfterCommit = await readRoutedObligation(
      harness.root,
      harness.exec,
      firstStatusTarget,
      42,
      new RepositoryDeliveryMemberLookup({ cwd: harness.root, exec: harness.exec }),
      harness.baseHead,
      undefined,
      deliveryHost(harness),
      { captureTerminalAdvance: (advance) => { capturedAdvance = advance; } },
    );
    if (routedAfterCommit.state === "blocked") {
      throw new Error(`final terminus re-entry blocked: ${JSON.stringify({ capturedAdvance, routedAfterCommit })}`);
    }

    await expect(statusThroughHandler(harness, firstStatusTarget)).resolves.toMatchObject({
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

  it("advances an eight-member conjunction through real Git and durable review stores", async () => {
    const harness = await createEightMemberHarness();
    const firstHead = harness.heads[0];
    if (firstHead === undefined) throw new Error("missing first eight-member head");
    const statusTarget = {
      repository,
      headRef: `delivery/${harness.plan.workUnitId}/${harness.plan.members[0]!.chunkKey}`,
      headSha: firstHead,
    };

    for (const [index, planned] of harness.plan.members.entries()) {
      const head = harness.heads[index];
      const tree = harness.trees[index];
      const baseSha = index === 0 ? harness.baseHead : harness.heads[index - 1];
      const baseTree = index === 0 ? harness.baseTree : harness.trees[index - 1];
      if (head === undefined || tree === undefined || baseSha === undefined || baseTree === undefined) {
        throw new Error("missing eight-member review coordinate");
      }
      const status = await statusThroughHandler(harness, {
        repository,
        headRef: index === harness.plan.members.length - 1
          ? "feat/delivery-plan-record"
          : `delivery/${harness.plan.workUnitId}/${planned.chunkKey}`,
        headSha: head,
      });
      expect(status).toMatchObject({
        state: "review-required",
        nextAction: "review-hosted-request",
        action: {
          target: { pullRequest: 41 + index, headSha: head },
          provider: "coderabbit-pr",
          coverage: "complete",
          vehicle: { deliverableId: planned.deliverableId, head },
        },
        routedObligation: {
          conjunction: {
            members: harness.plan.members.map((_member, memberIndex) => ({
              state: memberIndex < index ? "discharged" : "outstanding",
            })),
          },
        },
      });
      if (status.nextAction !== "review-hosted-request") throw new Error("expected eight-member hosted request");
      const requested = await requestThroughHandler(status.action, {
        kind: "created",
        artifact: {
          kind: "pull-request-review",
          id: `review-eight-${String(index + 1)}`,
          url: `https://example.test/review-eight-${String(index + 1)}`,
          createdAt: `2026-08-30T14:${String(index).padStart(2, "0")}:00.000Z`,
        },
        effectiveCoverage: "complete",
      }, harness.root, harness.exec);
      if (requested.nextAction !== "await") throw new Error("expected eight-member hosted handle");
      const awaited = await awaitThroughHandler(requested.handle, {
        kind: "clean",
        reviewUrl: `https://example.test/review-eight-${String(index + 1)}`,
      });
      await recordHostedAwaitAttempt(harness.store, {
        repositoryId: harness.repositoryId,
        result: awaited,
        now: `2026-08-30T15:${String(index).padStart(2, "0")}:00.000Z`,
      });
    }

    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          status: "discharged",
          members: harness.plan.members.map(() => ({ state: "discharged" })),
        },
      },
    });
  });

  it("resumes member status from a renewed Candidate and historical delivery terminal", async () => {
    const harness = await createHarness();
    const sourceCandidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    if (sourceCandidate.record === null || sourceCandidate.version === null) {
      throw new Error("source Candidate must exist");
    }
    const renewed = await installCandidate(
      harness,
      harness.currentSecond,
      sourceCandidate.version,
      sourceCandidate.record.attestation.candidateId,
    );
    const continuation = projectDeliveryPublicReviewContinuation({
      plan: harness.plan,
      state: harness.state,
      stateRevision: harness.stateRevision,
    });
    if (continuation.status !== "projected") throw new Error("delivery continuation must project");
    const sourceBoundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (sourceBoundary.boundary === null) throw new Error("source boundary must exist");
    const corrective = projectCorrectiveDeliveryStatusBoundary({
      workUnit: harness.plan.workUnitId,
      candidateId: renewed.attestation.candidateId,
      candidateSubjectDigest: renewed.subject.subjectDigest,
      supersedesCandidateId: renewed.attestation.supersedes ?? null,
      sourceBoundary: sourceBoundary.boundary,
      deliveryContinuation: continuation.continuation,
    });
    await writeSubmissionBoundary(
      harness.root,
      corrective,
      sourceBoundary.version,
    );

    await expect(inspectDeliveryEntry({
      workUnitId: harness.plan.workUnitId,
      entryMode: "integrating",
    }, {
      readTaskList: async () => `# Task List\n\n${renderDeliveryPlanSection(harness.plan)}\n`
        + "## **Phase 1:** Build\n\n### `[x]` **1.1 Work**\n",
      resolvePlan: async () => ({ status: "match", plan: harness.plan }),
      resolveAuthoring: async () => ({ status: "no-match" }),
      readState: async () => ({
        status: "ok",
        value: harness.state,
        revision: harness.stateRevision,
      }),
      readIntegrationBoundary: async () => ({ status: "ok", value: corrective }),
      readCandidate: async () => ({
        status: "ok",
        value: {
          candidateId: renewed.attestation.candidateId,
          subjectDigest: renewed.subject.subjectDigest,
        },
      }),
    })).resolves.toMatchObject({
      status: "resolve-delivery-status",
      deliveryStatusAction: { kind: "resolve-delivery-status" },
    });

    await expect(statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    })).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: { headSha: harness.oldFirst },
        coverage: "complete",
      },
    });

    const advancedState: DeliveryStateV1 = {
      ...harness.state,
      members: [
        {
          ...harness.state.members[0]!,
          changeRequest: { providerId: "github", changeRequestId: "43" },
        },
        harness.state.members[1]!,
      ],
    };
    const advanced = await harness.states.publish(harness.plan.planId, advancedState, harness.stateRevision);
    if (advanced.status !== "ok") throw new Error("expected corrective state advancement");
    harness.state = advancedState;
    harness.stateRevision = advanced.value.revision;
    await expect(statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    })).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      routedObligation: {
        state: "blocked",
        detail: "The public delivery continuation is not current.",
      },
    });
  });

  it("composes member status across a state-bound terminal below the current Candidate head", async () => {
    const harness = await createHarness();
    const current = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    if (current.record === null || current.version === null) throw new Error("source Candidate must exist");

    const baselineState: DeliveryStateV1 = {
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
    const publishedBaseline = await harness.states.publish(
      harness.plan.planId,
      baselineState,
      harness.stateRevision,
    );
    if (publishedBaseline.status !== "ok") throw new Error("expected baseline delivery state");
    harness.state = baselineState;
    harness.stateRevision = publishedBaseline.value.revision;

    const taskPath = ".arc/active/tasks-delivery-plan-record.md";
    await mkdir(join(harness.root, ".arc", "active"), { recursive: true });
    await writeFile(join(harness.root, taskPath), "# Closed task\n", "utf8");
    await git(harness.root, ["add", taskPath]);
    const staged = await collectCandidateSubjectTarget({
      cwd: harness.root,
      name: harness.plan.workUnitId,
      baseBranch: "main",
      baseRevision: harness.baseHead,
      exec: harness.exec,
    });
    const renewed: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: harness.plan.workUnitId,
        subject: staged.subject,
        baseRevision: harness.currentSecond,
        attestedBy: "andrew",
        attestedAt: "2026-09-02T20:00:00.000Z",
        verificationEvidenceRef: "verification://terminal-suffix",
        supersedes: current.record.attestation.candidateId,
      }),
      subject: staged.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(harness.root, harness.plan.workUnitId, renewed, current.version);
    const continuation = projectDeliveryPublicReviewContinuation({
      plan: harness.plan,
      state: baselineState,
      stateRevision: harness.stateRevision,
    });
    if (continuation.status !== "projected") throw new Error("delivery continuation must project");
    const sourceBoundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (sourceBoundary.boundary === null) throw new Error("source boundary must exist");
    await writeSubmissionBoundary(harness.root, projectCorrectiveDeliveryStatusBoundary({
      workUnit: harness.plan.workUnitId,
      candidateId: renewed.attestation.candidateId,
      candidateSubjectDigest: renewed.subject.subjectDigest,
      supersedesCandidateId: renewed.attestation.supersedes ?? null,
      sourceBoundary: sourceBoundary.boundary,
      deliveryContinuation: continuation.continuation,
    }), sourceBoundary.version);

    const candidatePath = resolveCandidateRecordRelativePath(harness.plan.workUnitId);
    const boundaryPath = resolveSubmissionBoundaryPath(harness.plan.workUnitId);
    await git(harness.root, ["add", candidatePath, boundaryPath]);
    await git(harness.root, ["commit", "--only", candidatePath, boundaryPath, "-m", "record terminal boundary"]);
    const stateHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const stateTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    const stateAtRecord: DeliveryStateV1 = {
      ...baselineState,
      members: baselineState.members.map((deliveryMember, index) => index === 1
        ? {
            ...deliveryMember,
            coordinates: { ...deliveryMember.coordinates!, head: stateHead, tree: stateTree },
          }
        : deliveryMember),
    };
    const publishedRecord = await harness.states.publish(
      harness.plan.planId,
      stateAtRecord,
      harness.stateRevision,
    );
    if (publishedRecord.status !== "ok") throw new Error("expected state-bound terminal record");
    harness.state = stateAtRecord;
    harness.stateRevision = publishedRecord.value.revision;
    const rerootContinuation = projectDeliveryPublicReviewContinuation({
      plan: harness.plan,
      state: stateAtRecord,
      stateRevision: harness.stateRevision,
    });
    if (rerootContinuation.status !== "projected") {
      throw new Error("fresh Candidate continuation must project");
    }

    await git(harness.root, ["commit", "-m", "close task"]);
    const verifiedHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const beforeReroot = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    if (beforeReroot.record === null || beforeReroot.version === null) {
      throw new Error("Candidate must exist before re-rooting");
    }
    const verifiedTarget = await collectCandidateSubjectTarget({
      cwd: harness.root,
      name: harness.plan.workUnitId,
      baseBranch: "main",
      baseRevision: harness.baseHead,
      revision: verifiedHead,
      exec: harness.exec,
    });
    const rerooted: CandidateManagedRecordV1 = {
      schemaVersion: 1,
      semanticsVersion: "candidate-attestation/v1",
      attestation: createCandidateAttestation({
        workUnit: harness.plan.workUnitId,
        subject: verifiedTarget.subject,
        baseRevision: verifiedHead,
        attestedBy: "andrew",
        attestedAt: "2026-09-02T21:00:00.000Z",
        verificationEvidenceRef: "verification://post-state-root",
        supersedes: beforeReroot.record.attestation.candidateId,
      }),
      subject: verifiedTarget.subject,
      transitions: [],
      lineageAttestations: [],
    };
    await writeCandidateRecord(
      harness.root,
      harness.plan.workUnitId,
      rerooted,
      beforeReroot.version,
    );
    const beforeBoundaryReroot = await readSubmissionBoundaryVersioned(
      harness.root,
      harness.plan.workUnitId,
    );
    if (beforeBoundaryReroot.boundary === null) throw new Error("boundary must exist before re-rooting");
    await writeSubmissionBoundary(harness.root, projectCorrectiveDeliveryStatusBoundary({
      workUnit: harness.plan.workUnitId,
      candidateId: rerooted.attestation.candidateId,
      candidateSubjectDigest: rerooted.subject.subjectDigest,
      supersedesCandidateId: rerooted.attestation.supersedes ?? null,
      sourceBoundary: beforeBoundaryReroot.boundary,
      deliveryContinuation: rerootContinuation.continuation,
    }), beforeBoundaryReroot.version);
    await git(harness.root, ["add", candidatePath, boundaryPath]);
    await git(harness.root, ["commit", "-m", "record fresh Candidate root"]);
    const currentHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const currentTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    harness.state = {
      ...stateAtRecord,
      members: stateAtRecord.members.map((deliveryMember, index) => index === 1
        ? {
            ...deliveryMember,
            coordinates: { ...deliveryMember.coordinates!, head: currentHead, tree: currentTree },
          }
        : deliveryMember),
    };
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/moved-first",
      headSha: harness.movedFirst,
    });
    expect(status).toMatchObject({
      state: "review-required",
      routedObligation: {
        conjunction: {
          members: [
            { target: { headSha: harness.movedFirst } },
            { target: { headSha: currentHead } },
          ],
        },
      },
    });
  });

  it("refuses a later-member hosted request before provider capacity is spent", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const laterVehicle = member(harness.plan, 1, harness.priorSecond);
    const result = await requestThroughProductionHandler(harness, fakeBin, {
      schemaVersion: 1,
      target: { repository, pullRequest: 42, headSha: harness.priorSecond },
      provider: "coderabbit-pr",
      coverage: "complete",
      vehicle: laterVehicle,
    });

    expect(result.exitCodes).toEqual([1]);
    expect(result.output).toMatchObject({
      error: { message: expect.stringContaining("first outstanding delivery member") },
    });
    await expect(access(providerCalled)).rejects.toThrow();
  });

  it("keeps public local receipts and one-pass histories separate for sibling members at one head", async () => {
    const harness = await createHarness(["delegated-agent"]);
    await bindDeliveryMembersToSharedHead(harness);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };

    const firstStatus = await statusThroughHandler(harness, statusTarget);
    expect(firstStatus).toMatchObject({
      nextAction: "review-local-prepare",
      action: {
        pass: 1,
        vehicle: member(harness.plan, 0, harness.oldFirst),
      },
    });
    if (firstStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected first shared-head local admission");
    }
    const first = await completeLocalReviewThroughHandlers(harness, firstStatus.action);

    const secondStatus = await statusThroughHandler(harness, statusTarget);
    expect(secondStatus).toMatchObject({
      nextAction: "review-local-prepare",
      action: {
        pass: 1,
        vehicle: member(harness.plan, 1, harness.oldFirst),
      },
      routedObligation: {
        conjunction: {
          members: [
            { state: "discharged", progress: { completedPasses: 1 } },
            { state: "outstanding", progress: { completedPasses: 0 } },
          ],
        },
      },
    });
    if (secondStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected second shared-head local admission");
    }
    const second = await completeLocalReviewThroughHandlers(harness, secondStatus.action);

    expect(second.prepared.payload.operationId).not.toBe(first.prepared.payload.operationId);
    const [firstOperation, secondOperation] = await Promise.all([
      harness.store.readOperation(first.prepared.payload.operationId),
      harness.store.readOperation(second.prepared.payload.operationId),
    ]);
    expect(firstOperation.state).toMatchObject({ logicalPass: 1, retryGeneration: 0 });
    expect(secondOperation.state).toMatchObject({ logicalPass: 1, retryGeneration: 0 });
    expect(firstOperation.state?.kind).toBe("local-review");
    expect(secondOperation.state?.kind).toBe("local-review");
    if (firstOperation.state?.kind !== "local-review"
      || secondOperation.state?.kind !== "local-review") {
      throw new Error("expected two persisted shared-head local operations");
    }
    expect(secondOperation.state.requestId).not.toBe(firstOperation.state.requestId);

    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      state: "settled",
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          status: "discharged",
          members: [
            { state: "discharged", progress: { completedPasses: 1 } },
            { state: "discharged", progress: { completedPasses: 1 } },
          ],
        },
      },
    });
  });

  it.each([
    {
      caseName: "all-refuted",
      judgment: {
        sourceVerification: "not-supported" as const,
        verifiedSeverity: null,
        disposition: "reject" as const,
      },
      expectedCount: 0,
      expectedMaximum: null,
    },
    {
      caseName: "minors-only",
      judgment: {
        sourceVerification: "verified" as const,
        verifiedSeverity: "minor" as const,
        disposition: "defer" as const,
      },
      expectedCount: 1,
      expectedMaximum: "minor" as const,
    },
  ])("advances a delivery member only after its $caseName local response is recorded", async ({
    judgment,
    expectedCount,
    expectedMaximum,
  }) => {
    const harness = await createHarness(["delegated-agent"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget);
    if (initial.nextAction !== "review-local-prepare") throw new Error("expected local review admission");
    await completeLocalReviewThroughHandlers(harness, initial.action, "findings");

    const pendingResume = await statusThroughHandler(harness, statusTarget);
    expect(pendingResume).toMatchObject({
      nextAction: "review-local-resume",
      routedObligation: {
        conjunction: {
          members: [{ state: "outstanding" }, { state: "outstanding" }],
        },
      },
    });
    if (pendingResume.nextAction !== "review-local-resume") {
      throw new Error("expected local result resumption");
    }
    const resumed = await resumeLocalThroughHandler(harness, pendingResume.action);
    expect(resumed).toMatchObject({
      state: "respond-to-findings",
      nextAction: "respond",
      payload: {
        responsePlan: {
          source: { kind: "attested-local" },
          findings: [{ findingId: "finding-local-1" }],
        },
      },
    });
    if (resumed.state !== "respond-to-findings") {
      throw new Error("expected local findings response source");
    }
    const responseSource = resumed.payload.responsePlan.source;
    const proposal = await respondThroughHandler(harness, {
      schemaVersion: 1,
      source: responseSource,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: "finding-local-1",
          sourceVerification: judgment.sourceVerification,
          verificationRefs: ["source:first.txt:1"],
          verifiedSeverity: judgment.verifiedSeverity,
          disposition: judgment.disposition,
          title: "Finding title",
          issue: "The reviewer's claim.",
          rationale: judgment.sourceVerification === "not-supported"
            ? "The current source does not support the reported concern."
            : "The current source supports only a non-blocking minor concern.",
          recommendation: "Record the approved disposition.",
          openQuestions: [],
        }],
      },
    });
    if (proposal.state !== "awaiting-approval") throw new Error("expected local disposition proposal");
    const dispositions = approveDispositionState({
      proposed: proposal.payload.proposal,
      approvedBy: "andrew",
      approvedAt: "2026-09-10T12:00:00.000Z",
    });
    const policyRequest = await responsePolicyRequest(
      harness.root,
      responseSource,
      repository,
    );
    await expect(respondThroughHandler(harness, {
      schemaVersion: 1,
      source: responseSource,
      policyRequest,
      dispositions,
    })).resolves.toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: {
        policy: {
          state: "pass-complete",
          nextAction: "none",
          payload: {
            verifiedTerminalSignal: {
              confirmedFindingCount: expectedCount,
              maxConfirmedSeverity: expectedMaximum,
            },
          },
        },
      },
    });

    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
  });

  it("admits hosted delivery-member review after a changed-head performed local fix", async () => {
    const harness = await createHarness(["delegated-agent", "coderabbit-pr"]);
    const statusTarget = {
      repository, headRef: "delivery/delivery-plan-record/first", headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget);
    if (initial.nextAction !== "review-local-prepare") throw new Error("expected local admission");
    const local = await completeLocalReviewThroughHandlers(harness, initial.action, "findings");
    const pending = await statusThroughHandler(harness, statusTarget);
    if (pending.nextAction !== "review-local-resume") throw new Error("expected local resumption");
    const resumed = await resumeLocalThroughHandler(harness, pending.action);
    if (resumed.state !== "respond-to-findings") throw new Error("expected local findings");
    const source = resumed.payload.responsePlan.source;
    const proposal = await respondThroughHandler(harness, {
      schemaVersion: 1, source,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: "finding-local-1", sourceVerification: "verified",
          verificationRefs: ["review:finding-local-1"], verifiedSeverity: "major",
          disposition: "fix", title: "Finding title", issue: "The reviewer's claim.",
          rationale: "The source confirms the material finding.",
          recommendation: "Apply the approved delivery-member fix.", openQuestions: [],
        }],
      },
    });
    if (proposal.state !== "awaiting-approval") throw new Error("expected local disposition proposal");
    const dispositions = approveDispositionState({
      proposed: proposal.payload.proposal,
      approvedBy: "andrew", approvedAt: "2026-09-10T12:00:00.000Z",
    });
    const policyRequest = await responsePolicyRequest(harness.root, source, repository);
    await expect(respondThroughHandler(harness, {
      schemaVersion: 1, source, policyRequest, dispositions,
    })).resolves.toMatchObject({
      state: "delivery-correction-required", nextAction: "continue-delivery-correction",
    });
    const record = await new LocalApprovedDispositionRecordStore(
      new RepositoryGitCommonStatePublisher(harness.exec, harness.root),
    ).readDispositionRecord(local.prepared.payload.operationId);
    expect(record).toMatchObject({
      approvedDispositionLineage: [expect.objectContaining({
        deliveryMemberFixResponse: null, errandFixResponse: null,
      })],
    });

    await git(harness.root, ["checkout", "delivery/delivery-plan-record/first"]);
    await writeFile(join(harness.root, "first.txt"), "fixed local finding\n", "utf8");
    await git(harness.root, ["add", "first.txt"]);
    await git(harness.root, ["commit", "-m", "fix local member finding"]);
    const fixedHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const fixedTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    expect(fixedHead).not.toBe(harness.oldFirst);
    const fixedState: DeliveryStateV1 = {
      ...harness.state,
      members: [
        {
          ...harness.state.members[0]!,
          coordinates: { base: harness.baseHead, head: fixedHead, tree: fixedTree },
        },
        harness.state.members[1]!,
      ],
    };
    const published = await harness.states.publish(harness.plan.planId, fixedState, harness.stateRevision);
    if (published.status !== "ok") throw new Error("expected fixed delivery state");
    harness.state = fixedState;
    harness.stateRevision = published.value.revision;
    await expect(respondThroughHandler(harness, {
      schemaVersion: 1, source, policyRequest, dispositions,
      verifiedFix: {
        applicability: "focused",
        verificationEvidenceRefs: ["verification://local-member-fix"],
      },
    })).resolves.toMatchObject({
      state: "delivery-member-advanced",
      payload: { currentTarget: { headSha: fixedHead } },
    });

    const correctedTarget = {
      repository, headRef: "delivery/delivery-plan-record/first", headSha: fixedHead,
    };
    await selectReviewRequiredUntilRouted(harness, correctedTarget, "covered");
    const hosted = await statusThroughHandler(
      harness, correctedTarget, undefined, "incremental", "coderabbit-pr",
    );
    expect(hosted).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        target: { headSha: fixedHead }, provider: "coderabbit-pr", coverage: "incremental",
        correctionScope: { predecessorProducerId: local.prepared.payload.operationId },
      },
    });
    if (hosted.nextAction !== "review-hosted-request") throw new Error("expected hosted continuation");
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(
      harness, undefined, "prior-top", fixedHead,
    );
    const request = await requestThroughProductionHandler(harness, fakeBin, hosted.action);
    expect(request.exitCodes, JSON.stringify(request.output)).toEqual([]);
    expect(request.output).toMatchObject({ state: "requested", nextAction: "await" });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("responds to changed-head incremental findings after a performed prior fix", async () => {
    const harness = await createHarness(["coderabbit-pr"]);
    await git(harness.root, ["checkout", "prior-top"]);
    const priorHead = harness.priorSecond;
    await git(harness.root, ["commit", "--allow-empty", "-m", "apply operational correction"]);
    const currentHead = await git(harness.root, ["rev-parse", "HEAD"]);
    expect(currentHead).not.toBe(priorHead);
    const currentTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    await rm(join(harness.root, ".arc", "system"), { recursive: true, force: true });
    const lineage = (headSha: string) => ({
      kind: "head-bound" as const,
      vehicleKind: "errand",
      vehicleIdentity: "review-response",
      headSha,
    });
    const projection = {
      obligation: "required" as const,
      reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const,
      count: 1 as const,
    };
    const makeAdmission = (
      headSha: string,
      headTree: string,
      logicalPass: number,
      requestedCoverage: "complete" | "incremental",
      correctionScope?: {
        schemaVersion: 1;
        predecessorProducerId: string;
        predecessorHeadSha: string;
        basisHeadSha: string;
        headSha: string;
        requiredFindings: { producerId: string; findingId: string; locus: string }[];
      },
    ) => {
      const reviewTarget = createReviewTarget({
        schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
        repositoryId: harness.repositoryId, baseRef: "main",
        diffBaseSha: harness.baseHead, diffBaseTree: harness.baseTree,
        headSha, headTree,
      });
      const requirement = createReviewRequirement({
        target: reviewTarget, projection,
        acceptableSources: [{ sourceKind: "hosted", qualifier: "coderabbit-pr" }],
        initialAdmission: "automatic",
      });
      if (requirement === null) throw new Error("expected hosted requirement");
      return createHostedAdmission({
        schemaVersion: 1,
        repositoryId: harness.repositoryId,
        lineage: lineage(headSha),
        logicalPass,
        sourceId: "coderabbit-pr",
        target: { repository, pullRequest: 42, headSha },
        requestedCoverage,
        ...(correctionScope === undefined ? {} : { correctionScope }),
        reviewTarget,
        requirement,
        actorIdentity: "andrew",
      });
    };
    const priorAdmission = makeAdmission(priorHead, harness.priorSecondTree, 1, "complete");
    const priorFinding = {
      findingId: "prior-finding", origin: "review-body" as const,
      reviewId: "prior-review", fingerprint: "prior-fingerprint",
      settlement: "not-applicable" as const, severity: "major" as const,
      locus: "second.txt:1", url: "https://example.test/review/prior",
      body: "The prior review identified an operational correction.", sourceOrdinal: 1,
    };
    const priorTerminal = createHostedTerminalAttemptFixture({
      admission: priorAdmission, outcome: "findings", findings: [priorFinding],
    });
    const operationId = laneProgressOperationId({
      lane: "standard", repositoryId: harness.repositoryId,
      headSha: priorHead, lineage: lineage(priorHead),
    });
    const priorProgress = await publishHostedTerminalProgressFixture(harness.store, {
      operationId, repositoryId: harness.repositoryId, lineage: lineage(priorHead),
      logicalPass: 1, changeRequestId: "42", headSha: priorHead,
      sourceId: "coderabbit-pr", outcome: "findings", terminal: priorTerminal,
      now: "2026-09-10T12:00:00.000Z",
    });
    const dispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId, handle: priorTerminal.hosted.handle!, progress: priorProgress,
      finding: priorFinding, disposition: "fix", channelAction: "record-only",
      now: "2026-09-10T12:01:00.000Z",
    });
    await recordLaneResponsePerformance(harness.store, {
      lane: "standard", repositoryId: harness.repositoryId,
      headSha: priorHead, lineage: lineage(priorHead),
      attemptId: priorTerminal.attemptId, dispositionSetId,
      producedHeadSha: currentHead, now: "2026-09-10T12:02:00.000Z",
    });

    const currentAdmission = makeAdmission(currentHead, currentTree, 2, "incremental", {
      schemaVersion: 1,
      predecessorProducerId: priorTerminal.attemptId,
      predecessorHeadSha: priorHead,
      basisHeadSha: priorHead,
      headSha: currentHead,
      requiredFindings: [{
        producerId: priorTerminal.attemptId,
        findingId: priorFinding.findingId,
        locus: priorFinding.locus,
      }],
    });
    const currentFinding = {
      findingId: "current-finding", origin: "review-body" as const,
      reviewId: "current-review", fingerprint: "current-fingerprint",
      settlement: "not-applicable" as const, severity: "minor" as const,
      locus: "first.txt:1", url: "https://example.test/review/current",
      body: "The incremental review found a minor concern.", sourceOrdinal: 1,
    };
    const currentTerminal = createHostedTerminalAttemptFixture({
      admission: currentAdmission, outcome: "findings", findings: [currentFinding],
    });
    await publishHostedTerminalProgressFixture(harness.store, {
      operationId, repositoryId: harness.repositoryId, lineage: lineage(currentHead),
      logicalPass: 2, changeRequestId: "42", headSha: currentHead,
      sourceId: "coderabbit-pr", outcome: "findings", terminal: currentTerminal,
      now: "2026-09-10T12:03:00.000Z",
    });
    const source = { kind: "hosted" as const, attemptRef: bindReviewSourceReference({
      kind: "hosted", operationId, durableRef: currentTerminal.attemptId,
    }) };
    const proposal = await respondThroughHandler(harness, {
      schemaVersion: 1, source,
      proposal: {
        proposedVerification: "focused",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: currentFinding.findingId, sourceVerification: "verified",
          verificationRefs: ["source:first.txt:1"], verifiedSeverity: "minor",
          disposition: "defer", title: "Finding title", issue: "The reviewer's claim.",
          rationale: "The source supports a minor concern.",
          recommendation: "Carry the concern to a follow-up.", openQuestions: [],
        }],
      },
    });
    if (proposal.state !== "awaiting-approval") throw new Error("expected current proposal");
    const dispositions = approveDispositionState({
      proposed: proposal.payload.proposal, approvedBy: "andrew",
      approvedAt: "2026-09-10T12:04:00.000Z",
    });
    const policyRequest = responsePolicyRequestFixture({
      headSha: currentHead, repository, pullRequest: 42,
      sourceId: "coderabbit-pr", reviewOperationId: currentTerminal.attemptId,
      completedPasses: 2, standardReview: projection,
    });
    await expect(respondThroughHandler(harness, {
      schemaVersion: 1, source, policyRequest, dispositions,
    })).resolves.toMatchObject({
      state: "settled", nextAction: "continue-review",
      payload: { policy: { state: "pass-complete", payload: {
        verifiedTerminalSignal: { coverageAdequate: true },
      } } },
    });
  });

  it("retains record-only response performance across a local disposition successor", async () => {
    const harness = await createHarness(["delegated-agent"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget);
    if (initial.nextAction !== "review-local-prepare") throw new Error("expected local review admission");
    await completeLocalReviewThroughHandlers(harness, initial.action, "findings");
    const pendingResume = await statusThroughHandler(harness, statusTarget);
    if (pendingResume.nextAction !== "review-local-resume") {
      throw new Error("expected local result resumption");
    }
    const resumed = await resumeLocalThroughHandler(harness, pendingResume.action);
    if (resumed.state !== "respond-to-findings") {
      throw new Error("expected local findings response source");
    }
    const source = resumed.payload.responsePlan.source;
    const originalProposal = await respondThroughHandler(harness, {
      schemaVersion: 1,
      source,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: "finding-local-1",
          sourceVerification: "verified",
          verificationRefs: ["source:first.txt:1"],
          verifiedSeverity: "minor",
          disposition: "defer",
          title: "Finding title",
          issue: "The reviewer's claim.",
          rationale: "The current source supports a non-blocking minor concern.",
          recommendation: "Record the approved deferral.",
          openQuestions: [],
        }],
      },
    });
    if (originalProposal.state !== "awaiting-approval") throw new Error("expected original proposal");
    const original = approveDispositionState({
      proposed: originalProposal.payload.proposal,
      approvedBy: "andrew",
      approvedAt: "2026-09-10T12:00:00.000Z",
    });
    const policyRequest = await responsePolicyRequest(harness.root, source, repository);
    await expect(respondThroughHandler(harness, {
      schemaVersion: 1,
      source,
      policyRequest,
      dispositions: original,
    })).resolves.toMatchObject({ state: "settled", nextAction: "reduce" });
    await git(harness.root, ["checkout", "delivery/delivery-plan-record/first"]);
    await rm(join(harness.root, ".arc", "system"), { recursive: true, force: true });

    const supersedes = {
      predecessorDispositionSetId: original.dispositionSet.dispositionSetId,
      expectedFixPaths: [],
    };
    const successorProposal = await respondThroughHandler(harness, {
      schemaVersion: 1,
      source,
      supersedes,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: "finding-local-1",
          sourceVerification: "not-supported",
          verificationRefs: ["source:first.txt:1"],
          verifiedSeverity: null,
          disposition: "reject",
          title: "Finding title",
          issue: "The reviewer's claim.",
          rationale: "Fresh verification refutes the non-blocking concern.",
          recommendation: "Replace the deferral with the approved rejection.",
          openQuestions: [],
        }],
      },
    });
    if (successorProposal.state !== "awaiting-approval") {
      throw new Error("expected successor proposal");
    }
    const successor = approveDispositionState({
      proposed: successorProposal.payload.proposal,
      approvedBy: "andrew",
      approvedAt: "2026-09-10T12:01:00.000Z",
    });
    const successorRequest = {
      schemaVersion: 1 as const,
      source,
      policyRequest,
      supersedes,
      dispositions: successor,
    };
    await expect(respondThroughHandler(harness, successorRequest)).resolves.toMatchObject({
      state: "settled",
      nextAction: "reduce",
      payload: { supersession: { status: "published" } },
    });
    await expect(respondThroughHandler(harness, successorRequest)).resolves.toMatchObject({
      state: "already-settled",
      nextAction: "reduce",
      payload: { supersession: { status: "replayed" } },
    });

    const snapshot = await harness.store.readOperationSnapshot();
    if (snapshot.status !== "complete") throw new Error("expected complete operation snapshot");
    const progress = snapshot.records.map(({ state }) => state).find((state) => (
      state.kind === "lane-progress" && state.lane === "standard"
    ));
    if (progress?.kind !== "lane-progress") throw new Error("expected standard lane progress");
    const attempt = progress.attempts.find(({ terminalProducer }) => terminalProducer);
    if (attempt === undefined) throw new Error("expected terminal local producer");
    expect(attempt).toMatchObject({
      outcome: "settled-findings",
      responsePerformanceHistory: [{
        producerId: attempt.attemptId,
        dispositionSetId: original.dispositionSet.dispositionSetId,
        originatingHeadSha: attempt.headSha,
        producedHeadSha: attempt.headSha,
      }],
      responsePerformance: {
        producerId: attempt.attemptId,
        dispositionSetId: successor.dispositionSet.dispositionSetId,
        originatingHeadSha: attempt.headSha,
        producedHeadSha: attempt.headSha,
      },
    });
    const beforeConflict = await harness.store.readOperation(progress.operationId);
    await expect(settleLaneAttempt(harness.store, {
      lane: "standard",
      repositoryId: progress.repositoryId,
      headSha: attempt.headSha,
      lineage: progress.lineage,
      attemptId: attempt.attemptId,
      predecessorDispositionSetId: canonicalDigest({ disposition: "not-current" }),
      dispositionSetId: canonicalDigest({ disposition: "unapproved-successor" }),
      producedHeadSha: attempt.headSha,
      now: "2026-09-10T12:02:00.000Z",
    })).rejects.toThrow("lane response performance replay conflicts");
    await expect(harness.store.readOperation(progress.operationId)).resolves.toEqual(beforeConflict);
    if (beforeConflict.state?.kind !== "lane-progress") {
      throw new Error("expected retained lane progress");
    }
    const retainedAttempt = beforeConflict.state.attempts.find(({ attemptId }) => (
      attemptId === attempt.attemptId
    ));
    if (retainedAttempt?.responsePerformanceHistory?.[0] === undefined) {
      throw new Error("expected retained predecessor response performance");
    }
    await expect(harness.store.publishOperation({
      ...beforeConflict.state,
      updatedAt: "2026-09-10T12:03:00.000Z",
      attempts: beforeConflict.state.attempts.map((candidate) => (
        candidate.attemptId !== attempt.attemptId
          ? candidate
          : {
              ...candidate,
              responsePerformanceHistory: [{
                ...retainedAttempt.responsePerformanceHistory![0]!,
                producedHeadSha: "f".repeat(40),
              }],
            }
      )),
    }, beforeConflict.version)).rejects.toThrow("immutable-response-performance-transition");
    await expect(harness.store.readOperation(progress.operationId)).resolves.toEqual(beforeConflict);
  });

  it("keeps prospective next-pass consent out of the terminal response policy", async () => {
    const harness = await createHarness(["delegated-agent"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget);
    if (initial.nextAction !== "review-local-prepare") throw new Error("expected local review admission");
    await completeLocalReviewThroughHandlers(harness, initial.action, "findings");

    const pendingResume = await statusThroughHandler(harness, statusTarget);
    if (pendingResume.nextAction !== "review-local-resume") {
      throw new Error("expected local result resumption");
    }
    const resumed = await resumeLocalThroughHandler(harness, pendingResume.action);
    if (resumed.state !== "respond-to-findings") {
      throw new Error("expected local findings response source");
    }
    const responseSource = resumed.payload.responsePlan.source;
    const proposal = await respondThroughHandler(harness, {
      schemaVersion: 1,
      source: responseSource,
      proposal: {
        proposedVerification: "full",
        severityGatingPolicy: { minorGating: "record-only" },
        findings: [{
          findingId: "finding-local-1",
          sourceVerification: "verified",
          verificationRefs: ["source:first.txt:1"],
          verifiedSeverity: "major",
          disposition: "defer",
          title: "Finding title",
          issue: "The reviewer's claim.",
          rationale: "The current source supports the material concern.",
          recommendation: "Carry the approved response before opening another pass.",
          openQuestions: [],
        }],
      },
    });
    if (proposal.state !== "awaiting-approval") throw new Error("expected local disposition proposal");
    const dispositions = approveDispositionState({
      proposed: proposal.payload.proposal,
      approvedBy: "andrew",
      approvedAt: "2026-09-10T12:00:00.000Z",
    });
    const policyRequest = await responsePolicyRequest(harness.root, responseSource, repository);
    const ceilingOverride = {
      target: policyRequest.target,
      lane: "standard" as const,
      exhaustedPassCount: 1,
      nextPass: 2,
    };
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch:\n  base: main\nreview.standard_max_passes: 1\n",
      "utf8",
    );

    const approvedRequest = {
      schemaVersion: 1,
      source: responseSource,
      policyRequest: { ...policyRequest, ceilingOverride },
      conditionalNextPassAuthorization: {
        authorizedBy: "andrew",
        exhaustedPassCount: 1,
        nextPass: 2,
      },
      dispositions,
    } as const;
    const result = await respondThroughHandler(harness, approvedRequest);
    if (result.state !== "settled") throw new Error("expected settled response");
    const authorizationId = result.payload.conditionalPassAuthorizationId;
    expect(authorizationId).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(result.payload).toMatchObject({
      policy: { state: "pass-complete", nextAction: "none" },
      policyRequest: {
        ceilingOverride: {
          ...ceilingOverride,
          conditionalPassAuthorizationId: authorizationId,
        },
      },
    });

    const withdrawalRequest = {
      schemaVersion: 1,
      source: responseSource,
      conditionalNextPassWithdrawal: {
        conditionalPassAuthorizationId: authorizationId!,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        withdrawnBy: "andrew",
      },
    } as const;
    await expect(respondThroughHandler(harness, withdrawalRequest)).resolves.toMatchObject({
      state: "conditional-authority-withdrawn",
      nextAction: "stop",
      payload: { replayed: false },
    });
    await expect(respondThroughHandler(harness, withdrawalRequest)).resolves.toMatchObject({
      state: "conditional-authority-withdrawn",
      payload: { replayed: true },
    });

    const replayDependencies = createRespondDependencies({ cwd: harness.root, exec: harness.exec });
    replayDependencies.resolveLocalActors = async () => ({
      approverIdentity: "andrew",
      proposerIdentity: "arc-cli/integration-test",
    });
    const replay = await respondToReviewCommand(approvedRequest, replayDependencies);
    expect(replay).toMatchObject({
      state: "already-settled",
      nextAction: "reduce",
      payload: {
        conditionalPassAuthorizationId: authorizationId,
        policyRequest: {
          ceilingOverride: {
            ...ceilingOverride,
            conditionalPassAuthorizationId: authorizationId,
          },
        },
      },
    });
    const snapshot = await harness.store.readOperationSnapshot();
    if (snapshot.status !== "complete") throw new Error("expected complete lane progress snapshot");
    const owner = snapshot.records.map(({ state }) => state).find((state) => (
      state.kind === "lane-progress" && state.attempts.some((attempt) =>
        attempt.conditionalPassAuthorizations?.authorizations.some((authorization) =>
          authorization.authorizationId === authorizationId))
    ));
    if (owner?.kind !== "lane-progress") throw new Error("expected conditional pass owner");
    const authorization = owner.attempts.flatMap((attempt) =>
      attempt.conditionalPassAuthorizations?.authorizations ?? []).find((candidate) =>
      candidate.authorizationId === authorizationId);
    expect(authorization).toMatchObject({ status: "invalidated", reason: "withdrawn" });
    const { recordLaneAttempt } = await import(
      "../../src/scripts/review-gate/lane-progress.js"
    );
    await expect(recordLaneAttempt(harness.store, {
      repositoryId: owner.repositoryId,
      lane: owner.lane,
      lineage: owner.lineage,
      changeRequestId: null,
      headSha: policyRequest.target.headSha,
      logicalPass: 2,
      attemptId: "prospective-pass-2",
      sourceId: "review-command",
      outcome: "pending",
      consumedPass: false,
      now: "2026-09-10T12:03:00.000Z",
      conditionalPendingAdmission: {
        authorizationId: authorizationId!,
        repositoryId: owner.repositoryId,
        lane: owner.lane,
        lineage: owner.lineage,
        producedHeadSha: policyRequest.target.headSha,
        nextPass: 2,
        admissionId: "prospective-pass-2",
        now: "2026-09-10T12:03:00.000Z",
        confirmDispositionSetCurrent: async () => true,
      },
    })).rejects.toThrow("conditional pass authorization is invalidated");
    await expect(respondThroughHandler(harness, withdrawalRequest)).resolves.toMatchObject({
      state: "conditional-authority-withdrawn",
      payload: { replayed: true },
    });
  });

  it("keeps public hosted admissions separate for sibling members at one head", async () => {
    const harness = await createHarness(["coderabbit-pr"]);
    await bindDeliveryMembersToSharedHead(harness);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };

    const firstStatus = await statusThroughHandler(harness, statusTarget);
    if (firstStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected first shared-head hosted admission");
    }
    const first = await requestThroughHandler(firstStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-shared-head-first",
        url: "https://example.test/review-shared-head-first",
        createdAt: "2026-09-02T22:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (first.nextAction !== "await") throw new Error("expected first shared-head await action");
    const firstAwait = await awaitThroughHandler(first.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-shared-head-first",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: firstAwait,
      now: "2026-09-02T22:01:00.000Z",
    });

    const secondStatus = await statusThroughHandler(harness, statusTarget);
    expect(secondStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        vehicle: member(harness.plan, 1, harness.oldFirst),
      },
    });
    if (secondStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected second shared-head hosted admission");
    }
    const second = await requestThroughHandler(secondStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-shared-head-second",
        url: "https://example.test/review-shared-head-second",
        createdAt: "2026-09-02T22:02:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (second.nextAction !== "await") throw new Error("expected second shared-head await action");

    expect(second.handle.admission.admissionId).not.toBe(first.handle.admission.admissionId);
    expect(first.handle.admission).toMatchObject({
      logicalPass: 1,
      lineage: {
        kind: "delivery-member",
        deliverableId: harness.plan.members[0]!.deliverableId,
      },
    });
    expect(second.handle.admission).toMatchObject({
      logicalPass: 1,
      lineage: {
        kind: "delivery-member",
        deliverableId: harness.plan.members[1]!.deliverableId,
      },
    });
  });

  it("completes a failed public local rerun once under a new native generation", async () => {
    const harness = await createHarness(["delegated-agent"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const initialStatus = await statusThroughHandler(harness, statusTarget);
    if (initialStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected initial local admission");
    }

    const failed = await completeLocalReviewThroughHandlers(harness, initialStatus.action, "failed");
    const retryStatus = await statusThroughHandler(harness, statusTarget);
    expect(retryStatus).toMatchObject({
      nextAction: "review-local-prepare",
      action: {
        pass: 1,
        vehicle: initialStatus.action.vehicle,
      },
      routedObligation: {
        conjunction: {
          members: [
            { state: "outstanding", progress: { completedPasses: 0 } },
            { state: "outstanding", progress: { completedPasses: 0 } },
          ],
        },
      },
    });
    if (retryStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected retry local admission");
    }

    const completed = await completeLocalReviewThroughHandlers(harness, retryStatus.action);
    expect(completed.prepared.payload.operationId).not.toBe(failed.prepared.payload.operationId);
    const [failedOperation, completedOperation] = await Promise.all([
      harness.store.readOperation(failed.prepared.payload.operationId),
      harness.store.readOperation(completed.prepared.payload.operationId),
    ]);
    expect(failedOperation.state).toMatchObject({ logicalPass: 1, retryGeneration: 0 });
    expect(completedOperation.state).toMatchObject({ logicalPass: 1, retryGeneration: 1 });

    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          members: [
            { state: "discharged", progress: { completedPasses: 1 } },
            { state: "outstanding", progress: { completedPasses: 0 } },
          ],
        },
      },
    });
  });

  it("preserves one production hosted request through restart, pending await, and terminal await", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled, providerVerdict } = await installHostedRequestTestHost(harness);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const status = await statusThroughHandler(harness, statusTarget);
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes, JSON.stringify(result.output)).toEqual([]);
    const requested = HostedRequestResultSchema.parse(result.output);
    expect(requested).toMatchObject({
      state: "requested",
      handle: { target: status.action.target, vehicle: status.action.vehicle },
    });
    if (requested.nextAction !== "await") throw new Error("expected hosted await handle");

    const resumed = await statusThroughHandler(harness, statusTarget);
    expect(resumed).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-await",
      action: { schemaVersion: 1, handle: requested.handle },
    });
    if (resumed.nextAction !== "review-hosted-await") throw new Error("expected durable hosted await");

    const pending = await awaitThroughProductionHandler(harness, fakeBin, {
      ...resumed.action,
      timeoutSeconds: 1,
      initialPollIntervalSeconds: 1,
    });
    expect(pending.exitCodes).toEqual([]);
    expect(pending.output).toMatchObject({
      state: "pending",
      handle: requested.handle,
    });
    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-await",
      action: { handle: requested.handle },
    });

    await writeFile(providerVerdict, "clean\n", "utf8");
    const terminal = await awaitThroughProductionHandler(harness, fakeBin, resumed.action);
    expect(terminal.exitCodes).toEqual([]);
    expect(terminal.output).toMatchObject({
      state: "clean",
      handle: requested.handle,
      responseSourceRef: expect.stringMatching(/^arc-review-source:v1:hosted:/u),
      hostedResultId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
    });
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch:\n  base: main\nreview.hosted_await_timeout_seconds: not-a-number\n",
      "utf8",
    );
    const replay = await awaitThroughProductionHandler(harness, fakeBin, resumed.action);
    expect(replay.exitCodes).toEqual([]);
    expect(replay.output).toEqual(terminal.output);
    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      state: "member-discharged",
      nextAction: "continue-reconcile",
      deliveryCursor: { completedMemberCount: 1 },
    });
    await expect(access(providerCalled)).resolves.toBeUndefined();
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("admits a moved-head Candidate request with exact authority at the pass ceiling", async () => {
    const harness = await createHarness();
    await git(harness.root, ["checkout", "prior-top"]);
    await writeFile(
      join(harness.root, ".git", "info", "exclude"),
      ".arc/\nfake-bin/\nprovider-called\nprovider-verdict\n",
      "utf8",
    );
    await mkdir(join(harness.root, ".arc", "active"), { recursive: true });
    await writeFile(join(harness.root, ".arc", "active", `meta-${harness.plan.workUnitId}.md`),
      makeMetaFixture(harness.plan.workUnitId, {
        owner: "andrew", branch: "prior-top", workClass: "Heavy", priority: "P1",
        taskList: `tasks-${harness.plan.workUnitId}.md`, lastCompleted: "verification",
        nextAction: "integration",
      }), "utf8");
    const candidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    const boundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (candidate.record === null || boundary.boundary?.reservation === null
      || boundary.boundary?.reservation === undefined) {
      throw new Error("expected Candidate and publication reservation");
    }
    const pinnedReservation = createStandardReviewReservation({
      candidateId: candidate.record.attestation.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository,
      headSha: harness.priorSecond,
      obligation: boundary.boundary.reservation.obligation,
    });
    await writeSubmissionBoundary(harness.root, projectPublicationBoundary({
      workUnit: harness.plan.workUnitId,
      branch: "prior-top",
      candidateId: candidate.record.attestation.candidateId,
      candidateSubjectDigest: candidate.record.subject.subjectDigest,
      reservation: pinnedReservation,
      changeRequest: { repository, pullRequest: 42 },
    }), boundary.version);
    const lineage = {
      kind: "candidate" as const,
      candidateId: candidate.record.attestation.candidateId,
    };
    for (const [index, sourceId] of ["coderabbit-pr", "codex-pr"].entries()) {
      await recordLaneAttempt(harness.store, {
        lane: "standard",
        repositoryId: harness.repositoryId,
        changeRequestId: "pull/42",
        headSha: harness.oldFirst,
        lineage,
        logicalPass: index + 1,
        retryGeneration: 0,
        attemptId: `prior-head-clean-${String(index + 1)}`,
        sourceId,
        outcome: "clean",
        consumedPass: true,
        now: `2026-09-01T11:0${String(index)}:00.000Z`,
      });
    }
    const target = { repository, pullRequest: 42, headSha: harness.priorSecond };
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness, harness.priorSecond);
    expect(await git(harness.root, ["status", "--porcelain"])).toBe("");

    const refused = await requestThroughProductionHandler(harness, fakeBin, {
      schemaVersion: 1, target, provider: "coderabbit-pr", coverage: "complete",
    });
    expect(refused.exitCodes).toEqual([1]);
    expect(JSON.stringify(refused.output)).toContain("driver admission (approval-required/obtain-ceiling-override)");
    const statusTarget = remedyStatusTarget(refused.output);
    expect(statusTarget).toEqual({ repository, headRef: "prior-top", headSha: harness.priorSecond });
    const ceiling = await selectReviewRequiredUntilRouted(harness, statusTarget);
    expect(ceiling).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: { target, lane: "standard", exhaustedPassCount: 2, nextPass: 3 },
    });
    if (ceiling.nextAction !== "obtain-ceiling-override") throw new Error("expected exact ceiling consequence");

    const result = await requestThroughProductionHandler(harness, fakeBin, {
      schemaVersion: 1,
      target,
      provider: "coderabbit-pr",
      coverage: "complete",
      ceilingOverride: ceiling.consequence,
    });

    expect(result.exitCodes, JSON.stringify(result.output)).toEqual([]);
    expect(result.output).toMatchObject({
      state: "requested",
      handle: { admission: { lineage, logicalPass: 3 } },
    });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("rotates a keyed same-head source after another source completes the pass", async () => {
    const harness = await createHarness();
    await git(harness.root, ["checkout", "prior-top"]);
    await writeFile(join(harness.root, ".git", "info", "exclude"),
      ".arc/\nfake-bin/\nprovider-called\nprovider-verdict\n", "utf8");
    await mkdir(join(harness.root, ".arc", "active"), { recursive: true });
    await writeFile(join(harness.root, ".arc", "active", `meta-${harness.plan.workUnitId}.md`),
      makeMetaFixture(harness.plan.workUnitId, {
        owner: "andrew", branch: "prior-top", workClass: "Heavy", priority: "P1",
        taskList: `tasks-${harness.plan.workUnitId}.md`, lastCompleted: "verification",
        nextAction: "integration",
      }), "utf8");
    const candidate = await readCandidateRecordVersioned(harness.root, harness.plan.workUnitId);
    const boundary = await readSubmissionBoundaryVersioned(harness.root, harness.plan.workUnitId);
    if (candidate.record === null || boundary.boundary?.reservation == null) {
      throw new Error("expected Candidate and publication reservation");
    }
    const reservation = createStandardReviewReservation({
      candidateId: candidate.record.attestation.candidateId,
      sourceId: "coderabbit-pr",
      sources: ["coderabbit-pr", "codex-pr"],
      repository,
      headSha: harness.priorSecond,
      obligation: boundary.boundary.reservation.obligation,
    });
    await writeSubmissionBoundary(harness.root, projectPublicationBoundary({
      workUnit: harness.plan.workUnitId,
      branch: "prior-top",
      candidateId: candidate.record.attestation.candidateId,
      candidateSubjectDigest: candidate.record.subject.subjectDigest,
      reservation,
      changeRequest: { repository, pullRequest: 42 },
    }), boundary.version);
    const lineage = { kind: "candidate" as const, candidateId: candidate.record.attestation.candidateId };
    const target = { repository, pullRequest: 42, headSha: harness.priorSecond };
    const reviewTarget = createReviewTarget({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId: harness.repositoryId,
      baseRef: "main",
      diffBaseSha: harness.baseHead,
      diffBaseTree: harness.baseTree,
      headSha: harness.priorSecond,
      headTree: harness.priorSecondTree,
    });
    const requirement = createReviewRequirement({
      target: reviewTarget,
      projection: reservation.obligation,
      acceptableSources: [
        { sourceKind: "hosted", qualifier: "coderabbit-pr" },
        { sourceKind: "hosted", qualifier: "codex-pr" },
      ],
      initialAdmission: "automatic",
    });
    if (requirement === null) throw new Error("expected Candidate review requirement");
    const coderabbitRequest = { schemaVersion: 1 as const, target, provider: "coderabbit-pr" as const,
      coverage: "complete" as const };
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    await index.reserve({ repositoryId: harness.repositoryId, request: coderabbitRequest, lineage,
      logicalPass: 1, completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true, oldPassCompleted: async () => false });
    const unavailable = await recordHostedRequestAdmission(harness.store, {
      repositoryId: harness.repositoryId, lineage, request: coderabbitRequest,
      reviewTarget, requirement, actorIdentity: "1", authorizeCapacity: async () => undefined,
      now: "2026-09-01T10:00:00.000Z",
    });
    if (unavailable.state !== "admitted") throw new Error("expected first source admission");
    await index.markAdmitted({ repositoryId: harness.repositoryId, request: coderabbitRequest,
      lineage, logicalPass: 1 });
    await recordHostedRequestConclusion(harness.store, {
      admission: unavailable.admission,
      result: { schemaVersion: 1, mode: "review-hosted-request", state: "rate-limited",
        nextAction: "try-next-source", provider: "coderabbit-pr", requestedCoverage: "complete",
        attemptedProviders: ["coderabbit-pr"] },
      now: "2026-09-01T10:01:00.000Z",
    });
    const codexRequest = { ...coderabbitRequest, provider: "codex-pr" as const };
    const codex = await recordHostedRequestAdmission(harness.store, {
      repositoryId: harness.repositoryId, lineage, request: codexRequest,
      reviewTarget, requirement, actorIdentity: "1", authorizeCapacity: async () => undefined,
      now: "2026-09-01T10:02:00.000Z",
    });
    if (codex.state !== "admitted") throw new Error("expected fallback admission");
    const handle: HostedRequestHandle = {
      schemaVersion: 1, provider: "codex-pr", requestedCoverage: "complete", effectiveCoverage: "complete",
      target, admission: codex.admission,
      artifact: { kind: "issue-comment", id: "codex-finding", url: "https://example.test/codex-finding",
        createdAt: "2026-09-01T10:02:00.000Z" },
    };
    await acknowledgeHostedRequest(harness.store, { admission: codex.admission, handle,
      now: "2026-09-01T10:03:00.000Z" });
    const finding = { findingId: "codex-record-only", origin: "review-thread" as const,
      commentId: "codex-comment", threadId: "codex-thread", settlement: "reply-and-resolve" as const,
      severity: "major" as const, locus: "second.txt:1", url: "https://example.test/codex-finding",
      sourceOrdinal: 1 };
    const progress = await recordHostedAwaitAttempt(harness.store, { repositoryId: harness.repositoryId,
      result: { schemaVersion: 1, mode: "review-hosted-await", handle, state: "findings",
        nextAction: "triage", reviewUrl: "https://example.test/codex-finding",
        findings: [finding] }, now: "2026-09-01T10:04:00.000Z" });
    if (progress === null) throw new Error("expected fallback findings");
    const dispositionSetId = await bindApprovedHostedFinding(harness, { operationId: progress.operationId, handle, progress,
      finding, disposition: "fix", channelAction: "record-only", now: "2026-09-01T10:05:00.000Z" });
    await recordLaneResponsePerformance(harness.store, {
      lane: "standard", repositoryId: harness.repositoryId, headSha: target.headSha, lineage,
      attemptId: hostedLaneAttemptId(handle), dispositionSetId,
      producedHeadSha: target.headSha, now: "2026-09-01T10:06:00.000Z",
    });
    const settled = await harness.store.readOperation(progress.operationId);
    expect(settled.state).toMatchObject({ kind: "lane-progress", completedPasses: 1 });

    const nextStatus = await statusThroughHandler(harness, {
      repository, headRef: "prior-top", headSha: harness.priorSecond,
    }, undefined, "complete", "coderabbit-pr");
    expect(nextStatus).toMatchObject({ state: "review-required" });

    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness, harness.priorSecond);
    const fresh = await requestThroughProductionHandler(harness, fakeBin, coderabbitRequest);
    expect(fresh.exitCodes).toEqual([1]);
    expect(fresh.output).toMatchObject({ mode: "review-hosted-request" });
    expect(JSON.stringify(fresh.output)).toContain("not admissible");
    await expect(access(providerCalled)).rejects.toThrow();
    expect((await index.read(harness.repositoryId, coderabbitRequest))?.logicalPass).toBe(1);

    const nextPassInput = {
      repositoryId: harness.repositoryId, lineage, request: coderabbitRequest,
      reviewTarget, requirement, actorIdentity: "1", now: "2026-09-01T10:07:00.000Z",
    };
    await expect(recordHostedRequestAdmission(harness.store, {
      ...nextPassInput,
      authorizeCapacity: async () => { throw new Error("pass ceiling requires approval"); },
    })).rejects.toThrow("pass ceiling requires approval");
    expect((await index.read(harness.repositoryId, coderabbitRequest))?.logicalPass).toBe(1);
    const second = await recordHostedRequestAdmission(harness.store, {
      ...nextPassInput,
      authorizeCapacity: async ({ progress: current, logicalPass }) => {
        expect(logicalPass).toBe(2);
        expect(await index.reserve({
          repositoryId: harness.repositoryId, request: coderabbitRequest, lineage,
          logicalPass,
          completedPassesAtAdmission: current?.completedPasses ?? 0,
          oldAdmissionAbsent: async () => false,
          oldPassCompleted: async () => true,
        })).toBe("reserved");
      },
    });
    expect(second).toMatchObject({ state: "admitted", admission: { logicalPass: 2 } });
    if (second.state !== "admitted") throw new Error("expected second pass admission");
    await index.markAdmitted({ repositoryId: harness.repositoryId, request: coderabbitRequest,
      lineage, logicalPass: 2 });
    expect((await index.read(harness.repositoryId, coderabbitRequest))).toMatchObject({
      logicalPass: 2, completedPassesAtAdmission: 1, phase: "admitted",
    });
  });

  it("does not admit a second same-head Errand pass after a rejected major", async () => {
    const harness = await createHarness(["codex-pr"]);
    const slug = "review-pass-two";
    const claimId = "0123456789abcdef0123456789abcdef";
    await git(harness.root, ["config", "arc.identity", "andrew"]);
    await git(harness.root, ["checkout", "main"]);
    await writeFile(join(harness.root, ".git", "info", "exclude"),
      ".arc/\nfake-bin/\nprovider-called\nprovider-verdict\n", "utf8");
    const identity = TransientIdentityRecordV3Schema.parse({
      version: 3, kind: "errand", slug, claimId, purpose: "errand", origin: "description",
      originEntry: null, intent: "Review the same head twice", branch: `chore/${slug}`,
      state: "open", savedHead: null, changeRequest: null,
      createdAt: "2026-09-01T09:00:00.000Z", updatedAt: "2026-09-01T09:00:00.000Z",
    });
    await writeFile(join(harness.root, slug), serializeTransientIdentityRecord(identity), "utf8");
    await git(harness.root, ["rm", "README.md"]);
    await git(harness.root, ["add", slug]);
    await git(harness.root, ["commit", "-m", "Errand identity snapshot"]);
    await git(harness.root, ["update-ref", "refs/arc/user/andrew/errands", "HEAD"]);
    const errandRoot = `${harness.root}-errand`;
    await git(harness.root, ["worktree", "add", "-b", `chore/${slug}`, errandRoot, "HEAD"]);
    roots.push(errandRoot);
    await writeWorktreeMarker(errandRoot, {
      spawnedByArc: true,
      createdFor: { kind: "errand", slug, claimId },
      spawningIdentity: "andrew",
      createdAt: "2026-09-01T09:00:00.000Z",
      provisioning: "ready",
    });
    await mkdir(join(errandRoot, ".arc", "system"), { recursive: true });
    await writeFile(join(errandRoot, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nreview.standard_sources: [codex-pr]\n", "utf8");
    await writeFile(join(errandRoot, "errand-change.txt"), "reviewed Errand change\n", "utf8");
    await git(errandRoot, ["add", "errand-change.txt"]);
    await git(errandRoot, ["commit", "-m", "Errand review change"]);
    const errandHead = await git(errandRoot, ["rev-parse", "HEAD"]);
    await git(harness.root, ["update-ref", `refs/remotes/origin/chore/${slug}`, errandHead]);
    await writeFile(join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nreview.standard_sources: [codex-pr]\n", "utf8");
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(
      harness, errandHead, `chore/${slug}`,
    );
    await git(harness.root, ["checkout", "main"]);
    const frame = await runDerivedLocusStateProbe({
      cwd: errandRoot, identity: "andrew", baseBranch: "main", exec: makeGitExec(errandRoot),
    });
    expect(frame.entering, JSON.stringify(frame)).toMatchObject({
      kind: "selected",
      row: { kind: "transient", subject: { kind: "errand", key: slug, claimId },
        diagnostics: [], checkout: { branch: `chore/${slug}`, detached: false },
        identity: { kind: "errand", purpose: "errand", state: "open", key: slug,
          claimId, branch: `chore/${slug}` } },
    });
    const standardReview = {
      obligation: "required" as const, reasons: ["sensitive-change-set" as const],
      rubricVersion: STANDARD_REVIEW_RUBRIC_IDENTITY.version,
      rubricDigest: STANDARD_REVIEW_RUBRIC_IDENTITY.digest,
      retrigger: "full-final" as const, count: 1 as const,
    };
    const request = { schemaVersion: 1 as const,
      target: { repository, pullRequest: 42, headSha: errandHead },
      provider: "codex-pr" as const, coverage: "complete" as const,
      vehicle: { kind: "errand" as const, standardReview } };

    const errandHarness = { ...harness, root: errandRoot };
    const first = await requestThroughProductionHandler(errandHarness, fakeBin, request);
    expect(first.exitCodes, JSON.stringify(first.output)).toEqual([]);
    const requested = HostedRequestResultSchema.parse(first.output);
    if (requested.nextAction !== "await") throw new Error("expected first Errand hosted handle");
    const finding = { findingId: "errand-record-only", origin: "review-thread" as const,
      commentId: "errand-comment", threadId: "errand-thread", settlement: "reply-and-resolve" as const,
      severity: "major" as const, locus: "second.txt:1", url: "https://example.test/errand-finding",
      sourceOrdinal: 1 };
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "findings", reviewUrl: "https://example.test/errand-finding", findings: [finding],
    });
    const progress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId, result: awaited, now: "2026-09-01T10:01:00.000Z",
    });
    if (progress === null) throw new Error("expected first Errand findings progress");
    const dispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId: progress.operationId, handle: requested.handle, progress, finding,
      disposition: "reject", channelAction: "record-only", now: "2026-09-01T10:02:00.000Z",
    });
    await recordLaneResponsePerformance(harness.store, {
      lane: "standard", repositoryId: harness.repositoryId,
      headSha: request.target.headSha, lineage: requested.handle.admission.lineage,
      attemptId: hostedLaneAttemptId(requested.handle), dispositionSetId,
      producedHeadSha: request.target.headSha, now: "2026-09-01T10:03:00.000Z",
    });
    await expect(readRoutedObligation(
      errandRoot, makeGitExec(errandRoot),
      { repository, headRef: `chore/${slug}`, headSha: errandHead },
      42, undefined, await git(errandRoot, ["rev-parse", "main"]),
    )).resolves.toMatchObject({ state: "settled" });
    const second = await requestThroughProductionHandler(errandHarness, fakeBin, request);
    expect(second.exitCodes).toEqual([1]);
    expect(JSON.stringify(second.output)).toContain("driver admission (pass-complete/none)");
    expect(JSON.stringify(second.output)).toContain("The lane is complete for this head");
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    expect((await index.read(harness.repositoryId, request))?.logicalPass).toBe(1);
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");

    const statusTarget = remedyStatusTarget(second.output);
    expect(statusTarget).toEqual({ repository, headRef: `chore/${slug}`, headSha: errandHead });
    await expect(statusThroughHandler({
      ...errandHarness, exec: makeGitExec(errandRoot), baseHead: await git(errandRoot, ["rev-parse", "main"]),
    }, statusTarget)).resolves.toMatchObject({ routedObligation: { state: "settled" } });

    await writeFile(join(errandRoot, "errand-change.txt"), "reviewed Errand change\nfollow-up\n", "utf8");
    await git(errandRoot, ["commit", "-am", "Errand follow-up"]);
    const followUpHead = await git(errandRoot, ["rev-parse", "HEAD"]);
    const staleResolve = {
      schemaVersion: 1, target: { ...request.target, headSha: followUpHead }, lane: "standard",
      frontlineActive: false, standardReview, completedPasses: 1,
      attempts: [{ sourceId: "codex-pr", outcome: "findings", reviewOperationId: hostedLaneAttemptId(requested.handle) }],
    };
    const stale = await resolveThroughProductionHandler(errandRoot, staleResolve);
    expect(stale.exitCodes, JSON.stringify(stale.output)).toEqual([1]);
    expect(stale.output).toMatchObject({
      mode: "review-resolve",
      error: { code: "invalid-input", message: expect.stringContaining(errandHead) },
      remedy: { argv: ["arc", "review", "resolve", "-"], stdin: { ...staleResolve, attempts: [] } },
    });
    const replayed = await resolveThroughProductionHandler(
      errandRoot, (stale.output as { remedy: { stdin: unknown } }).remedy.stdin,
    );
    expect(replayed.exitCodes, JSON.stringify(replayed.output)).toEqual([]);
    expect(replayed.output).toMatchObject({
      state: "ready", nextAction: "hosted-request", payload: { pass: 2, sourceId: "codex-pr" },
    });
  });

  it("replays an acknowledged production request after its current target context disappears", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");

    const first = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(first.exitCodes, JSON.stringify(first.output)).toEqual([]);
    const requested = HostedRequestResultSchema.parse(first.output);
    if (requested.nextAction !== "await") throw new Error("expected hosted await handle");
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch:\n  base: missing-base\nreview.standard_sources: [codex-pr]\n",
      "utf8",
    );

    const replay = await requestThroughProductionHandler(harness, fakeBin, status.action);

    expect(replay.exitCodes, JSON.stringify(replay.output)).toEqual([]);
    expect(replay.output).toEqual(requested);
    const fresh = await requestThroughProductionHandler(harness, fakeBin, {
      ...status.action,
      provider: "codex-pr",
    });
    expect(fresh.exitCodes).toEqual([]);
    expect(fresh.output).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("recovers a reserved owner with no lane and transfers an old unadmitted owner", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    const oldLineage = LaneSubjectLineageSchema.parse({
      kind: "candidate",
      candidateId: `sha256:${"1".repeat(64)}`,
    });
    expect(await index.reserve({
      repositoryId: harness.repositoryId,
      request: status.action,
      lineage: oldLineage,
      logicalPass: 1,
      completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true,
      oldPassCompleted: async () => false,
    })).toBe("reserved");

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes, JSON.stringify(result.output)).toEqual([]);
    expect(result.output).toMatchObject({ state: "requested", nextAction: "await" });
    expect((await index.read(harness.repositoryId, status.action))).toMatchObject({
      phase: "admitted",
      lineage: { kind: "delivery-member", planId: harness.plan.planId },
    });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("transfers a reserved owner when its lane has only another safe-unavailable source", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository, headRef: "delivery/delivery-plan-record/first", headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const oldLineage = LaneSubjectLineageSchema.parse({
      kind: "candidate", candidateId: `sha256:${"1".repeat(64)}`,
    });
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    await index.reserve({ repositoryId: harness.repositoryId, request: status.action,
      lineage: oldLineage, logicalPass: 1, completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true, oldPassCompleted: async () => false });
    await recordLaneAttempt(harness.store, {
      lane: "standard", repositoryId: harness.repositoryId, lineage: oldLineage,
      changeRequestId: "pull/41", headSha: harness.oldFirst,
      attemptId: "prior-safe-unavailable", sourceId: "codex-pr",
      outcome: "rate-limited", consumedPass: false, now: "2026-09-01T10:00:00.000Z",
    });

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes, JSON.stringify(result.output)).toEqual([]);
    expect(result.output).toMatchObject({ state: "requested", nextAction: "await" });
    expect((await index.read(harness.repositoryId, status.action))?.lineage).toMatchObject({
      kind: "delivery-member", planId: harness.plan.planId,
    });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("transfers a reserved owner when its lane has only an unrelated clean source", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const oldLineage = LaneSubjectLineageSchema.parse({
      kind: "candidate",
      candidateId: `sha256:${"1".repeat(64)}`,
    });
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    await index.reserve({
      repositoryId: harness.repositoryId,
      request: status.action,
      lineage: oldLineage,
      logicalPass: 1,
      completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true,
      oldPassCompleted: async () => false,
    });
    await recordLaneAttempt(harness.store, {
      lane: "standard",
      repositoryId: harness.repositoryId,
      lineage: oldLineage,
      changeRequestId: "pull/41",
      headSha: harness.oldFirst,
      attemptId: "prior-owner-attempt",
      sourceId: "delegated-agent",
      outcome: "clean",
      consumedPass: true,
      now: "2026-09-01T10:00:00.000Z",
    });

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes).toEqual([]);
    expect(result.output).toMatchObject({ state: "requested", nextAction: "await" });
    expect((await index.read(harness.repositoryId, status.action))?.lineage).toMatchObject({
      kind: "delivery-member", planId: harness.plan.planId,
    });
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("continues a reserved pending admission before any provider effect", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const vehicle = status.action.vehicle;
    if (vehicle?.kind !== "delivery-member") throw new Error("expected delivery vehicle");
    const lineage = LaneSubjectLineageSchema.parse({
      kind: "delivery-member",
      planId: vehicle.planId,
      workUnitId: vehicle.workUnitId,
      deliverableId: vehicle.deliverableId,
    });
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    expect(await index.reserve({
      repositoryId: harness.repositoryId,
      request: status.action,
      lineage,
      logicalPass: 1,
      completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true,
      oldPassCompleted: async () => false,
    })).toBe("reserved");
    const { reviewTarget, requirement } = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });
    const admitted = await recordHostedRequestAdmission(harness.store, {
      repositoryId: harness.repositoryId,
      lineage,
      request: status.action,
      progressVehicle: vehicle,
      reviewTarget,
      requirement,
      actorIdentity: "1",
      authorizeCapacity: async () => undefined,
      now: "2026-09-01T10:00:00.000Z",
    });
    expect(admitted.state).toBe("admitted");

    await git(harness.root, ["branch", "-f", "delivery/delivery-plan-record/first", harness.movedFirst]);
    const stale = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(stale.exitCodes).toEqual([]);
    expect(stale.output).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
    await expect(access(providerCalled)).rejects.toThrow();
    await git(harness.root, ["branch", "-f", "delivery/delivery-plan-record/first", harness.oldFirst]);

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes, JSON.stringify(result.output)).toEqual([]);
    expect(result.output).toMatchObject({ state: "requested", nextAction: "await" });
    expect((await index.read(harness.repositoryId, status.action))?.phase).toBe("admitted");
    await expect(readFile(providerCalled, "utf8")).resolves.toBe("request\n");
  });

  it("stops an admitted index whose lane is missing before provider dispatch", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const vehicle = status.action.vehicle;
    if (vehicle?.kind !== "delivery-member") throw new Error("expected delivery vehicle");
    const lineage = LaneSubjectLineageSchema.parse({
      kind: "delivery-member",
      planId: vehicle.planId,
      workUnitId: vehicle.workUnitId,
      deliverableId: vehicle.deliverableId,
    });
    const index = new HostedRequestOwnerIndex(new RepositoryGitCommonStatePublisher(harness.exec, harness.root));
    await index.reserve({
      repositoryId: harness.repositoryId,
      request: status.action,
      lineage,
      logicalPass: 1,
      completedPassesAtAdmission: 0,
      oldAdmissionAbsent: async () => true,
      oldPassCompleted: async () => false,
    });
    await index.markAdmitted({ repositoryId: harness.repositoryId, request: status.action, lineage, logicalPass: 1 });

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(result.exitCodes).toEqual([]);
    expect(result.output).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
    await expect(access(providerCalled)).rejects.toThrow();

    const { reviewTarget, requirement } = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });
    const pending = await recordHostedRequestAdmission(harness.store, {
      repositoryId: harness.repositoryId,
      lineage,
      request: status.action,
      progressVehicle: vehicle,
      reviewTarget,
      requirement,
      actorIdentity: "1",
      authorizeCapacity: async () => undefined,
      now: "2026-09-01T10:00:00.000Z",
    });
    expect(pending.state).toBe("admitted");
    const ambiguous = await requestThroughProductionHandler(harness, fakeBin, status.action);
    expect(ambiguous.exitCodes).toEqual([]);
    expect(ambiguous.output).toMatchObject({ state: "ambiguous-delivery", nextAction: "stop" });
    await expect(access(providerCalled)).rejects.toThrow();
  });

  it("blocks unscoped CodeRabbit incremental coverage before the production request boundary", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const status = await statusThroughHandler(harness, statusTarget, undefined, "incremental");
    expect(status).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "coverage-unsupported",
      remedy: { argv: [
        "arc", "review", "status", "--work-unit", harness.plan.workUnitId,
        "--coverage", "complete",
      ] },
    });
    await expect(access(providerCalled)).rejects.toThrow();
    await expect(access(fakeBin)).resolves.toBeUndefined();
    await expect(statusThroughHandler(harness, statusTarget, undefined, "complete"))
      .resolves.toMatchObject({ state: "review-required", nextAction: "review-hosted-request" });
  });

  it("requires a predecessor scope before Codex can upgrade incremental coverage", async () => {
    const harness = await createHarness(["codex-pr"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget, undefined, "incremental");
    expect(initial).toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "coverage-unsupported",
    });
  });

  it("refuses local incremental coverage when no complete predecessor basis exists", async () => {
    const harness = await createHarness(["delegated-agent"]);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    await expect(statusThroughHandler(
      harness,
      statusTarget,
      undefined,
      "incremental",
      "delegated-agent",
    )).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "coverage-unsupported",
      routedObligation: {
        state: "blocked",
        detail: "The selected local review carrier cannot preserve explicit incremental coverage.",
      },
    });
  });

  it("keeps a five-pass material-fix member outstanding without re-reviewing its clean sibling", async () => {
    const harness = await createHarness(["coderabbit-pr"]);
    const firstStatusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const firstStatus = await statusThroughHandler(harness, firstStatusTarget);
    if (firstStatus.nextAction !== "review-hosted-request") throw new Error("expected first member request");
    const firstRequested = await requestThroughHandler(firstStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-clean-sibling",
        url: "https://example.test/review-clean-sibling",
        createdAt: "2026-09-10T14:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (firstRequested.nextAction !== "await") throw new Error("expected first member await");
    const firstAwaited = await awaitThroughHandler(firstRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-clean-sibling",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: firstAwaited,
      now: "2026-09-10T14:00:30.000Z",
    });

    const materialCounts = [6, 7, 5, 2, 3] as const;
    const secondStatusTarget = { repository, headRef: "prior-top", headSha: harness.priorSecond };
    let nextStatus = await statusThroughHandler(harness, secondStatusTarget);
    for (const [passIndex, findingCount] of materialCounts.entries()) {
      const pass = passIndex + 1;
      if (nextStatus.nextAction === "obtain-ceiling-override") {
        expect(nextStatus.consequence).toMatchObject({
          target: { repository, pullRequest: 42, headSha: harness.priorSecond },
          exhaustedPassCount: pass - 1,
          nextPass: pass,
        });
        nextStatus = await statusThroughHandler(harness, secondStatusTarget, nextStatus.consequence);
      }
      expect(nextStatus).toMatchObject({
        state: "review-required",
        nextAction: "review-hosted-request",
        action: {
          provider: "coderabbit-pr",
          vehicle: member(harness.plan, 1, harness.priorSecond),
          ...(pass < 3 ? {} : { ceilingOverride: expect.objectContaining({ nextPass: pass }) }),
        },
        routedObligation: {
          conjunction: {
            members: [
              { state: "discharged", progress: { completedPasses: 1, completePasses: 1 } },
              { state: "outstanding", progress: { completedPasses: pass - 1 } },
            ],
          },
        },
      });
      if (nextStatus.nextAction !== "review-hosted-request") {
        throw new Error(`expected material pass ${String(pass)} request`);
      }
      const findings = Array.from({ length: findingCount }, (_, findingIndex) => ({
        findingId: `material-${String(pass)}-${String(findingIndex + 1)}`,
        origin: "review-body" as const,
        reviewId: `review-material-${String(pass)}`,
        fingerprint: `material-${String(pass)}-${String(findingIndex + 1)}`,
        settlement: "not-applicable" as const,
        severity: "major" as const,
        locus: `second.txt:${String(findingIndex + 1)}`,
        url: `https://example.test/material-${String(pass)}-${String(findingIndex + 1)}`,
        body: `Material finding ${String(findingIndex + 1)} in pass ${String(pass)}.`,
        sourceOrdinal: findingIndex + 1,
      }));
      const requested = await requestThroughHandler(nextStatus.action, {
        kind: "created",
        artifact: {
          kind: "pull-request-review",
          id: `review-material-${String(pass)}`,
          url: `https://example.test/review-material-${String(pass)}`,
          createdAt: `2026-09-10T14:${String(pass).padStart(2, "0")}:00.000Z`,
        },
        effectiveCoverage: "complete",
      }, harness.root, harness.exec);
      if (requested.nextAction !== "await") throw new Error("expected material member await");
      const awaited = await awaitThroughHandler(requested.handle, {
        kind: "findings",
        reviewUrl: `https://example.test/review-material-${String(pass)}`,
        findings,
      });
      await recordHostedAwaitAttempt(harness.store, {
        repositoryId: harness.repositoryId,
        result: awaited,
        now: `2026-09-10T14:${String(pass).padStart(2, "0")}:30.000Z`,
      });
      const responseStatus = await statusThroughHandler(harness, secondStatusTarget);
      expect(responseStatus).toMatchObject({
        nextAction: "respond-to-findings",
        responsePlan: { findings: findings.map(({ findingId }) => ({ findingId })) },
      });
      if (responseStatus.nextAction !== "respond-to-findings"
        || responseStatus.responsePlan.source.kind !== "hosted") {
        throw new Error("expected material findings response action");
      }
      const source = responseStatus.responsePlan.source;
      const proposal = await respondThroughHandler(harness, {
        schemaVersion: 1,
        source,
        proposal: {
          proposedVerification: "focused",
          severityGatingPolicy: { minorGating: "record-only" },
          findings: findings.map((finding) => ({
            findingId: finding.findingId,
            sourceVerification: "verified" as const,
            verificationRefs: [finding.url],
            verifiedSeverity: "major" as const,
            disposition: "fix" as const,
            title: "Finding title",
            issue: "The reviewer's claim.",
            rationale: "The material signal remains present in the reviewed source.",
            recommendation: "Fix the material finding, then review the member again.",
            openQuestions: [],
          })),
        },
      });
      if (proposal.state !== "awaiting-approval") throw new Error("expected material disposition proposal");
      const dispositions = approveDispositionState({
        proposed: proposal.payload.proposal,
        approvedBy: "andrew",
        approvedAt: `2026-09-10T14:${String(pass).padStart(2, "0")}:45.000Z`,
      });
      const policyRequest = await responsePolicyRequest(harness.root, source, repository);
      await expect(respondThroughHandler(harness, {
        schemaVersion: 1,
        source,
        policyRequest,
        dispositions,
      })).resolves.toMatchObject({ state: "delivery-correction-required", nextAction: "continue-delivery-correction" });
      await recordLaneResponsePerformance(harness.store, {
        lane: "standard", repositoryId: harness.repositoryId, headSha: harness.priorSecond,
        lineage: requested.handle.admission.lineage, attemptId: hostedLaneAttemptId(requested.handle),
        dispositionSetId: CanonicalDigestSchema.parse(dispositions.dispositionSet.dispositionSetId),
        producedHeadSha: harness.priorSecond,
        now: `2026-09-10T14:${String(pass).padStart(2, "0")}:50.000Z`,
      });
      nextStatus = await statusThroughHandler(harness, secondStatusTarget);
    }

    expect(nextStatus).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: { exhaustedPassCount: 5, nextPass: 6 },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [
            { state: "discharged", progress: { completedPasses: 1, completePasses: 1 } },
            { state: "outstanding", progress: { completedPasses: 5, completePasses: 5 } },
          ],
        },
      },
    });
  });

  it("keeps one invocation-selected hosted source pending before returning to configured ordering", async () => {
    const harness = await createHarness();
    const target = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const memberLookup = new RepositoryDeliveryMemberLookup({ cwd: harness.root, exec: harness.exec });
    const selected = await readRoutedObligation(
      harness.root,
      harness.exec,
      target,
      42,
      memberLookup,
      harness.baseHead,
      { sourceId: "codex-pr" },
      deliveryHost(harness),
    );
    expect(selected).toMatchObject({
      state: "review-required",
      action: {
        provider: "codex-pr",
        target: { headSha: harness.oldFirst },
      },
    });
    if (!("action" in selected)) throw new Error("expected selected hosted action");

    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const requested = await requestThroughProductionHandler(harness, fakeBin, selected.action);
    expect(requested.exitCodes, JSON.stringify(requested.output)).toEqual([]);
    expect(requested.output).toMatchObject({
      state: "requested",
      handle: { provider: "codex-pr", target: selected.action.target },
    });
    await expect(access(providerCalled)).resolves.toBeUndefined();

    await expect(readRoutedObligation(
      harness.root,
      harness.exec,
      target,
      42,
      memberLookup,
      harness.baseHead,
      undefined,
      deliveryHost(harness),
    )).resolves.toMatchObject({
      state: "review-required",
      awaitAction: { handle: { provider: "codex-pr" } },
    });
  });

  it("settles a verified member fix and advances only after scoped local correction", async () => {
    const harness = await createHarness(["coderabbit-pr", "delegated-agent"]);
    const actorIdentity = "44483269";
    const first = member(harness.plan, 0, harness.oldFirst);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const status = await statusThroughHandler(harness, statusTarget);
    expect(status).toMatchObject({ action: { vehicle: first } });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");
    const requested = await requestThroughHandler(status.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-member-fix",
        url: "https://example.test/review-member-fix",
        createdAt: "2026-08-24T04:00:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec, actorIdentity);
    if (requested.nextAction !== "await") throw new Error("expected hosted review handle");
    const finding = {
      findingId: "finding-member-fix",
      origin: "review-thread" as const,
      commentId: "comment-member-fix",
      threadId: "thread-member-fix",
      settlement: "reply-and-resolve" as const,
      severity: "major" as const,
      locus: "first.txt:1",
      url: "https://example.test/finding-member-fix",
      sourceOrdinal: 1,
    };
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-member-fix",
      findings: [finding],
    });
    const review = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });
    const progress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: awaited,
      now: "2026-08-24T04:01:00.000Z",
    });
    if (progress === null) throw new Error("expected findings progress");
    const attemptId = hostedLaneAttemptId(requested.handle);
    const operationId = progress.operationId;
    const hostedResultId = progress.attempts.find(({ attemptId: candidate }) => candidate === attemptId)
      ?.hosted?.sealedResult?.hostedResultId;
    if (hostedResultId === undefined) throw new Error("expected sealed hosted result");
    const findingsStatus = await statusThroughHandler(harness, statusTarget);
    expect(findingsStatus).toMatchObject({
      nextAction: "respond-to-findings",
      responsePlan: { findings: [{ findingId: finding.findingId }] },
    });
    if (findingsStatus.nextAction !== "respond-to-findings"
      || findingsStatus.responsePlan.source.kind !== "hosted") {
      throw new Error("expected hosted findings response plan");
    }
    const attemptRef = findingsStatus.responsePlan.source.attemptRef;
    expect(attemptRef).toBe(bindReviewSourceReference({
      kind: "hosted",
      operationId,
      durableRef: attemptId,
    }));
    const dispositions = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: review.reviewTarget.targetId,
        producerId: attemptId,
        resultDigest: hostedResultId,
        policyVersion: review.requirement.policyVersion,
        rubricVersion: review.requirement.rubricVersion,
        rubricDigest: review.requirement.rubricDigest,
        proposedBy: "arc-cli/integration-test",
        proposedVerification: "focused",
        findings: [{
          findingId: finding.findingId,
          sourceIdentity: "coderabbit-pr",
          locus: finding.locus,
          sourceVerification: "verified",
          verificationRefs: [finding.url],
          reportedSeverity: finding.severity,
          verifiedSeverity: finding.severity,
          disposition: "fix",
          gating: "blocking",
          rationale: "The hosted finding matches the reviewed source.",
          recommendation: "Apply the approved member fix.",
          openQuestions: [],
        }],
      })),
      approvedBy: "andrew",
      approvedAt: "2026-08-24T04:02:00.000Z",
    });
    const request = {
      schemaVersion: 1 as const,
      source: { kind: "hosted" as const, attemptRef },
      policyRequest: {
        schemaVersion: 1 as const,
        target: {
          repository,
          pullRequest: requested.handle.target.pullRequest,
          headSha: review.reviewTarget.headSha,
        },
        lane: "standard" as const,
        frontlineActive: false,
        standardReview: {
          obligation: review.requirement.obligation,
          reasons: review.requirement.reasons,
          rubricVersion: review.requirement.rubricVersion,
          rubricDigest: review.requirement.rubricDigest,
          retrigger: review.requirement.retrigger,
          count: review.requirement.count,
        },
        completedPasses: 1,
        attempts: [{
          sourceId: "coderabbit-pr",
          outcome: "findings" as const,
          reviewOperationId: attemptId,
        }],
      },
      dispositions,
    };
    const prepared = await respondThroughHandler(harness, request);
    expect(prepared).toMatchObject({
      state: "delivery-correction-required",
      nextAction: "continue-delivery-correction",
      payload: {
        deliveryMember: first,
        correctionAction: {
          argv: ["arc", "delivery", "review-fix", "continue", "-"],
          input: { repository, remote: "origin" },
        },
        hostedSettlementPlan: {
          actorIdentity,
          beforeFixFindingIds: [],
          afterFixFindingIds: [finding.findingId],
        },
      },
    });
    if (prepared.state !== "delivery-correction-required"
      || prepared.payload.hostedSettlementPlan === undefined) {
      throw new Error("expected public hosted settlement plan");
    }
    const returnedSettlementPlan = JSON.parse(JSON.stringify(prepared.payload.hostedSettlementPlan)) as {
      actorIdentity: string;
    };

    await git(harness.root, ["checkout", "delivery/delivery-plan-record/first"]);
    await writeFile(join(harness.root, "first.txt"), "fixed first contribution\n", "utf8");
    await git(harness.root, ["add", "first.txt"]);
    await git(harness.root, ["commit", "-m", "fix first member"]);
    const fixedHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const fixedTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    const fixedState: DeliveryStateV1 = {
      ...harness.state,
      members: [
        {
          ...harness.state.members[0]!,
          coordinates: { base: harness.baseHead, head: fixedHead, tree: fixedTree },
        },
        harness.state.members[1]!,
      ],
    };
    const published = await harness.states.publish(harness.plan.planId, fixedState, harness.stateRevision);
    if (published.status !== "ok") throw new Error("expected fixed delivery state");
    harness.state = fixedState;
    harness.stateRevision = published.value.revision;

    const verifiedRequest = {
      ...request,
      verifiedFix: {
        applicability: "focused" as const,
        verificationEvidenceRefs: ["verification://member-fix"],
      },
    };
    const advanced = await respondThroughHandler(harness, verifiedRequest);
    expect(advanced).toMatchObject({
      state: "delivery-member-advanced",
      nextAction: "continue-review",
      payload: {
        currentTarget: {
          kind: "delivery-member",
          diffBaseSha: harness.baseHead,
          headSha: fixedHead,
        },
        hostedFixTarget: { repository, pullRequest: 41, headSha: fixedHead },
        hostedSettlementPlan: {
          beforeFixFindingIds: [],
          afterFixFindingIds: [finding.findingId],
        },
      },
    });
    if (advanced.state !== "delivery-member-advanced") throw new Error("expected advanced member response");
    const performedProgress = await harness.store.readOperation(operationId);
    if (performedProgress.state?.kind !== "lane-progress") {
      throw new Error("expected performed lane progress");
    }
    expect(performedProgress.state.attempts.find((attempt) => attempt.attemptId === attemptId)).toMatchObject({
      attemptId,
      outcome: "findings",
      responsePerformance: {
        producerId: attemptId,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        originatingHeadSha: review.reviewTarget.headSha,
        producedHeadSha: fixedHead,
      },
    });
    const replayed = await respondThroughHandler(harness, verifiedRequest);
    expect(replayed).toMatchObject({
      state: "delivery-member-current",
      nextAction: "continue-review",
      payload: {
        currentTarget: { headSha: fixedHead },
        hostedFixTarget: { repository, pullRequest: 41, headSha: fixedHead },
      },
    });
    if (replayed.state !== "delivery-member-current") throw new Error("expected current member response");

    let resolved = false;
    let reply: { id: string; actorIdentity: string; body: string; inReplyToId: string } | null = null;
    const settlementRequest = {
      schemaVersion: 1 as const,
      response: {
        attemptRef,
        dispositionSetId: dispositions.dispositionSet.dispositionSetId,
        findingId: finding.findingId,
      },
      target: status.action.target,
      fixTarget: advanced.payload.hostedFixTarget,
      actorIdentity: returnedSettlementPlan.actorIdentity,
      finding: { commentId: finding.commentId, threadId: finding.threadId },
      disposition: "fix" as const,
      reply: "Fixed in the current delivery-member head.",
    };
    const settleThroughHandler = async () => {
      const output: string[] = [];
      const exitCodes: number[] = [];
      await handleReviewHostedSettle("-", {
        readText: async () => JSON.stringify(settlementRequest),
        settle: async (input) => {
          const result = await settleHostedFinding(input, { port: {
            currentActorIdentity: async () => actorIdentity,
            readHead: async () => fixedHead,
            readThread: async () => ({
              kind: "present",
              isResolved: resolved,
              commentIds: [finding.commentId],
            }),
            findReplies: async () => reply === null ? [] : [reply],
            postReply: async (post) => {
              reply = {
                id: "reply-member-fix",
                actorIdentity,
                body: post.body,
                inReplyToId: post.commentId,
              };
              return { kind: "created", id: "reply-member-fix" };
            },
            resolveThread: async () => {
              resolved = true;
              return { kind: "resolved" };
            },
          } });
          if (result.state === "settled" || result.state === "already-settled") {
            await settleHostedAttemptFinding(harness.store, {
              operationId,
              attemptId,
              dispositionSetId: dispositions.dispositionSet.dispositionSetId,
              findingId: finding.findingId,
              disposition: settlementRequest.disposition,
              actorIdentity: settlementRequest.actorIdentity,
              target: settlementRequest.target,
              fixTarget: settlementRequest.fixTarget,
              commentId: settlementRequest.finding.commentId,
              threadId: settlementRequest.finding.threadId,
              replyDigest: canonicalDigest({
                domain: "arc.review.hosted-settlement-reply/v1",
                body: settlementRequest.reply,
              }),
              replyId: result.replyId,
              now: "2026-08-24T04:03:00.000Z",
            });
          }
          return result;
        },
        write: (text) => output.push(text),
        setExitCode: (code) => exitCodes.push(code),
      });
      expect(exitCodes).toEqual([]);
      return JSON.parse(output.join("")) as unknown;
    };
    await expect(settleThroughHandler()).resolves.toMatchObject({ state: "settled", nextAction: "complete" });
    await expect(settleThroughHandler()).resolves.toMatchObject({ state: "already-settled", nextAction: "complete" });
    const settledProgress = await harness.store.readOperation(operationId);
    if (settledProgress.state?.kind !== "lane-progress") {
      throw new Error("expected settled lane progress");
    }
    expect(settledProgress.state.attempts.find((attempt) => attempt.attemptId === attemptId)).toMatchObject({
      attemptId,
      outcome: "settled-findings",
      hosted: { settledFindingIds: [finding.findingId] },
    });

    await git(harness.root, ["checkout", "-b", "delivery/delivery-plan-record/correction-first", harness.baseHead]);
    await writeFile(
      join(harness.root, "first.txt"),
      "fixed first contribution\ncorrection follow-up\n",
      "utf8",
    );
    await git(harness.root, ["add", "first.txt"]);
    await git(harness.root, ["commit", "-m", "correct fixed first member"]);
    const correctionHead = await git(harness.root, ["rev-parse", "HEAD"]);
    const correctionTree = await git(harness.root, ["rev-parse", "HEAD^{tree}"]);
    await expect(harness.exec("git", ["merge-base", "--is-ancestor", harness.oldFirst, correctionHead], {
      cwd: harness.root,
    })).rejects.toThrow();
    const correctedState: DeliveryStateV1 = {
      ...harness.state,
      members: [
        {
          ...harness.state.members[0]!,
          ref: "refs/heads/delivery/delivery-plan-record/correction-first",
          coordinates: { base: harness.baseHead, head: correctionHead, tree: correctionTree },
        },
        harness.state.members[1]!,
      ],
    };
    const correctedPublish = await harness.states.publish(
      harness.plan.planId,
      correctedState,
      harness.stateRevision,
    );
    if (correctedPublish.status !== "ok") throw new Error("expected corrected delivery state");
    harness.state = correctedState;
    harness.stateRevision = correctedPublish.value.revision;
    const correctionStatusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/correction-first",
      headSha: correctionHead,
    };
    await selectReviewRequiredUntilRouted(harness, correctionStatusTarget, "covered");

    const completeCorrectionStatus = await statusThroughHandler(
      harness,
      correctionStatusTarget,
      undefined,
      "complete",
      "delegated-agent",
    );
    expect(completeCorrectionStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: { requestedCoverage: "complete" },
    });
    expect(completeCorrectionStatus).not.toHaveProperty("action.correctionScope");

    const hostedCorrectionStatus = await statusThroughHandler(
      harness,
      correctionStatusTarget,
      undefined,
      "incremental",
      "coderabbit-pr",
    );
    expect(hostedCorrectionStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        provider: "coderabbit-pr",
        coverage: "incremental",
        correctionScope: {
          predecessorProducerId: attemptId,
          predecessorHeadSha: harness.oldFirst,
          basisHeadSha: harness.oldFirst,
          headSha: correctionHead,
        },
      },
    });
    if (hostedCorrectionStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected native hosted correction request");
    }
    await writeFile(join(harness.root, ".git", "info", "exclude"),
      ".arc/\nfake-bin/\nprovider-called\nprovider-verdict\n", "utf8");
    const { fakeBin } = await installHostedRequestTestHost(
      harness, undefined, "prior-top", correctionHead, "delivery/delivery-plan-record/correction-first",
    );
    const fakeGh = join(fakeBin, "gh");
    const ghScript = await readFile(fakeGh, "utf8");
    const commentRoute = "  api:repos/owner/repository/issues/41/comments)\n";
    const commentStart = ghScript.indexOf(commentRoute);
    const commentEnd = ghScript.indexOf("    ;;\n", commentStart);
    if (commentStart < 0 || commentEnd < 0) throw new Error("expected fake hosted request route");
    await writeFile(fakeGh, ghScript.slice(0, commentStart)
      + `${commentRoute}    echo 'HTTP 429' >&2\n    exit 1\n`
      + ghScript.slice(commentEnd), "utf8");
    const publicRequest = await requestThroughProductionHandler(harness, fakeBin, hostedCorrectionStatus.action);
    expect(publicRequest.exitCodes, JSON.stringify(publicRequest.output)).toEqual([]);
    expect(publicRequest.output).toMatchObject({
      state: "rate-limited",
      nextAction: "try-next-source",
      requestedCoverage: "incremental",
    });

    const correctionStatus = await statusThroughHandler(
      harness,
      correctionStatusTarget,
      undefined,
      "incremental",
      "delegated-agent",
    );
    expect(correctionStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        target: { repository, pullRequest: 41, headSha: correctionHead },
        vehicle: member(harness.plan, 0, correctionHead),
        pass: 2,
        requestedCoverage: "incremental",
        correctionScope: {
          predecessorProducerId: attemptId,
          predecessorHeadSha: harness.oldFirst,
          basisHeadSha: harness.oldFirst,
          headSha: correctionHead,
          requiredFindings: [{
            producerId: attemptId,
            findingId: finding.findingId,
            locus: finding.locus,
          }],
        },
      },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [
            { state: "outstanding", progress: { completedPasses: 1, completePasses: 1 } },
            { state: "outstanding", progress: { completedPasses: 0 } },
          ],
        },
      },
    });
    if (correctionStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected scoped local correction review");
    }
    const correction = await completeLocalReviewThroughHandlers(harness, correctionStatus.action);
    expect(correction.prepared).toMatchObject({
      state: "ready",
      payload: {
        reviewerPayload: {
          correctionScope: correctionStatus.action.correctionScope,
        },
      },
    });
    if (correction.prepared.state !== "ready") throw new Error("expected local correction materialization");
    expect(correction.prepared.payload.reviewerPayload.reviewerInstructions).toContain(finding.findingId);
    expect(correction.prepared.payload.reviewerPayload.reviewerInstructions).toContain(
      `${harness.oldFirst}..${correctionHead}`,
    );
    await expect(harness.store.readOperationSnapshot()).resolves.toMatchObject({
      status: "complete",
      records: expect.arrayContaining([
        expect.objectContaining({
          state: expect.objectContaining({
            kind: "lane-progress",
            completedPasses: 2,
            attempts: expect.arrayContaining([
              expect.objectContaining({
                attemptId: correction.prepared.payload.operationId,
                local: expect.objectContaining({
                  requestedCoverage: "incremental",
                  effectiveCoverage: "incremental",
                }),
              }),
            ]),
          }),
        }),
      ]),
    });
    const firstDischargedStatus = await statusThroughHandler(
      harness,
      correctionStatusTarget,
      undefined,
      undefined,
      "coderabbit-pr",
    );
    expect(firstDischargedStatus).toMatchObject({
      nextAction: "continue-reconcile",
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [
            { state: "discharged", progress: { completedPasses: 2, completePasses: 1 } },
            { state: "outstanding", progress: { completedPasses: 0 } },
          ],
        },
      },
    });
    const secondStatus = await statusThroughHandler(
      harness,
      { repository, headRef: "prior-top", headSha: harness.priorSecond },
      undefined,
      undefined,
      "coderabbit-pr",
    );
    expect(secondStatus).toMatchObject({ nextAction: "review-hosted-request" });
    if (secondStatus.nextAction !== "review-hosted-request") throw new Error("expected second member request");
    const secondRequested = await requestThroughHandler(secondStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-second-after-member-fix",
        url: "https://example.test/review-second-after-member-fix",
        createdAt: "2026-08-24T04:06:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (secondRequested.nextAction !== "await") throw new Error("expected second hosted review handle");
    const secondAwait = await awaitThroughHandler(secondRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-second-after-member-fix",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: secondAwait,
      now: "2026-08-24T04:07:00.000Z",
    });

    await expect(statusThroughHandler(harness, {
      repository,
      headRef: correctionStatusTarget.headRef,
      headSha: correctionHead,
    })).resolves.toMatchObject({
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

  it("surfaces the driver's delegated-agent fallback through production member status", async () => {
    const harness = await createHarness(["coderabbit-pr", "codex-pr", "delegated-agent"]);
    const first = member(harness.plan, 0, harness.oldFirst);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const firstHosted = await statusThroughHandler(harness, statusTarget);
    expect(firstHosted).toMatchObject({
      nextAction: "review-hosted-request",
      action: { provider: "coderabbit-pr", vehicle: first },
    });
    if (firstHosted.nextAction !== "review-hosted-request") throw new Error("expected first hosted source");
    const firstUnavailable = await requestThroughHandler(
      firstHosted.action,
      { kind: "rate-limited" },
      harness.root,
      harness.exec,
    );
    if (firstUnavailable.nextAction !== "try-next-source") throw new Error("expected first source fallback");

    const secondHosted = await statusThroughHandler(harness, statusTarget);
    expect(secondHosted).toMatchObject({
      nextAction: "review-hosted-request",
      action: { provider: "codex-pr", vehicle: first },
    });
    if (secondHosted.nextAction !== "review-hosted-request") throw new Error("expected second hosted source");
    const secondUnavailable = await requestThroughHandler(
      secondHosted.action,
      { kind: "transient-unavailable" },
      harness.root,
      harness.exec,
    );
    if (secondUnavailable.nextAction !== "try-next-source") throw new Error("expected second source fallback");

    const localStatus = await statusThroughHandler(harness, statusTarget);
    expect(localStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        statusTarget,
        target: firstHosted.action.target,
        vehicle: first,
        pass: 1,
      },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [{ state: "outstanding" }, { state: "outstanding" }],
        },
      },
    });
    if (localStatus.nextAction !== "review-local-prepare") throw new Error("expected local fallback");

    await completeLocalReviewThroughHandlers(harness, localStatus.action);
    const finalStatusTarget = {
      repository,
      headRef: "prior-top",
      headSha: harness.priorSecond,
    };
    const finalVehicle = member(harness.plan, 1, harness.priorSecond);
    const finalFirstHosted = await statusThroughHandler(harness, finalStatusTarget);
    expect(finalFirstHosted).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        provider: "coderabbit-pr",
        vehicle: finalVehicle,
      },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
    if (finalFirstHosted.nextAction !== "review-hosted-request") throw new Error("expected final hosted source");
    const finalFirstUnavailable = await requestThroughHandler(
      finalFirstHosted.action,
      { kind: "rate-limited" },
      harness.root,
      harness.exec,
    );
    if (finalFirstUnavailable.nextAction !== "try-next-source") throw new Error("expected final source fallback");

    const finalSecondHosted = await statusThroughHandler(harness, finalStatusTarget);
    expect(finalSecondHosted).toMatchObject({
      nextAction: "review-hosted-request",
      action: { provider: "codex-pr", vehicle: finalVehicle },
    });
    if (finalSecondHosted.nextAction !== "review-hosted-request") throw new Error("expected final second source");
    const finalSecondUnavailable = await requestThroughHandler(
      finalSecondHosted.action,
      { kind: "transient-unavailable" },
      harness.root,
      harness.exec,
    );
    if (finalSecondUnavailable.nextAction !== "try-next-source") {
      throw new Error("expected final second-source fallback");
    }

    const finalLocal = await statusThroughHandler(harness, finalStatusTarget);
    expect(finalLocal).toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        statusTarget: finalStatusTarget,
        target: finalFirstHosted.action.target,
        vehicle: finalVehicle,
        pass: 1,
      },
    });
    if (finalLocal.nextAction !== "review-local-prepare") throw new Error("expected final local fallback");
    await completeLocalReviewThroughHandlers(harness, finalLocal.action);

    await expect(statusThroughHandler(harness, finalStatusTarget)).resolves.toMatchObject({
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

  it("refuses incremental broadening before routing an oversized member through complete local review", async () => {
    const harness = await createHarness(["coderabbit-pr", "codex-pr", "delegated-agent"]);
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nchangeset.advisory_threshold_lines: 1\n"
        + "changeset.advisory_threshold_files: 0\n",
      "utf8",
    );
    const first = member(harness.plan, 0, harness.oldFirst);
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };

    await expect(statusThroughHandler(harness, statusTarget, undefined, "incremental")).resolves.toMatchObject({
      state: "blocked",
      nextAction: "stop",
      reason: "coverage-unsupported",
      deliveryCursor: {
        currentMember: {
          vehicle: first,
          progress: { completedPasses: 0 },
        },
      },
    });

    const localStatus = await statusThroughHandler(harness, statusTarget);
    expect(localStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-local-prepare",
      action: {
        sourceId: "delegated-agent",
        statusTarget,
        target: {
          repository,
          pullRequest: 41,
          headSha: harness.oldFirst,
        },
        vehicle: first,
        pass: 1,
        scopeSelection: {
          mode: "chunked",
          target: {
            repository,
            pullRequest: 41,
            headSha: harness.oldFirst,
          },
        },
      },
    });
    if (localStatus.nextAction !== "review-local-prepare") {
      throw new Error("expected chunked local member review");
    }

    await completeLocalReviewThroughHandlers(harness, localStatus.action);
    await expect(statusThroughHandler(harness, {
      repository,
      headRef: "prior-top",
      headSha: harness.priorSecond,
    })).resolves.toMatchObject({
      routedObligation: {
        conjunction: {
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
  });

  it("preserves an explicit hosted source as whole-target review for an oversized member", async () => {
    const harness = await createHarness(["coderabbit-pr", "codex-pr", "delegated-agent"]);
    await writeFile(
      join(harness.root, ".arc", "system", "arc-config.yml"),
      "branch.base: main\nchangeset.advisory_threshold_lines: 1\n"
        + "changeset.advisory_threshold_files: 0\n",
      "utf8",
    );
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    await expect(statusThroughHandler(
      harness,
      statusTarget,
      undefined,
      undefined,
      "codex-pr",
    )).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        provider: "codex-pr",
        target: { headSha: harness.oldFirst },
        invocation: { mode: "force", sourceId: "codex-pr" },
      },
    });
  });

  it("drives production composition through fallback, carry, selection, settlement, and conjunction", async () => {
    const harness = await createHarness();
    const first = member(harness.plan, 0, harness.oldFirst);
    const priorSecond = member(harness.plan, 1, harness.priorSecond);
    const firstTarget = { repository, pullRequest: 41, headSha: harness.oldFirst };
    const priorSecondTarget = { repository, pullRequest: 42, headSha: harness.priorSecond };
    const firstStatusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const priorStatusTarget = { repository, headRef: "prior-top", headSha: harness.priorSecond };
    const initial = await statusThroughHandler(harness, firstStatusTarget);
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

    const fallback = await statusThroughHandler(harness, firstStatusTarget);
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
    const priorFinding = {
      findingId: "finding-prior",
      origin: "review-thread",
      commentId: "comment-prior",
      threadId: "thread-prior",
      settlement: "reply-and-resolve",
      severity: "major" as const,
      locus: "src/prior.ts:1",
      url: "https://example.test/finding-prior",
      sourceOrdinal: 1,
    };
    const priorSecondAwait = await awaitThroughHandler(priorSecondRequested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-second-prior",
      findings: [priorFinding],
    });
    const priorProgress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: priorSecondAwait,
      now: "2026-08-24T04:05:00.000Z",
    });
    if (priorProgress === null) throw new Error("expected prior findings progress");
    const priorResponse = await statusThroughHandler(harness, priorStatusTarget);
    expect(priorResponse).toMatchObject({
      nextAction: "respond-to-findings",
      responsePlan: { findings: [{ findingId: priorFinding.findingId }] },
    });
    await expect(statusThroughHandler(harness, priorStatusTarget)).resolves.toMatchObject({
      nextAction: "respond-to-findings",
      responsePlan: { findings: [{ findingId: priorFinding.findingId }] },
    });
    await bindApprovedHostedFinding(harness, {
      operationId: priorProgress.operationId,
      handle: priorSecondRequested.handle,
      progress: priorProgress,
      finding: priorFinding,
      disposition: "reject",
      channelAction: "record-only",
      now: "2026-08-24T04:05:30.000Z",
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
      resolveMutationOwner: async () => ({
        status: "owned",
        workUnit: harness.plan.workUnitId,
      }),
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
      severity: "major" as const,
      locus: "src/example.ts:1",
      url: "https://example.test/finding-1",
      sourceOrdinal: 1,
    };
    const secondAwait = await awaitThroughHandler(secondRequested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-second",
      findings: [finding],
    });
    const secondProgress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: secondAwait,
      now: "2026-08-24T04:08:00.000Z",
    });
    if (secondProgress === null) throw new Error("expected findings attempt");
    const attemptId = hostedLaneAttemptId(secondRequested.handle);
    const operationId = secondProgress.operationId;
    const dispositionSetId = await bindApprovedHostedFinding(harness, {
      operationId,
      handle: secondRequested.handle,
      progress: secondProgress,
      finding,
      disposition: "defer",
      channelAction: "reply-and-resolve",
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
      disposition: "defer",
      actorIdentity: "andrew",
      target: currentSecondTarget,
      fixTarget: null,
      commentId: finding.commentId,
      threadId: finding.threadId,
      replyDigest: canonicalDigest({
        domain: "arc.review.hosted-settlement-reply/v1",
        body: "Tracked for follow-up.",
      }),
      replyId: "reply-1",
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

    const third = await advanceSecondTarget(harness);
    const thirdVehicle = member(harness.plan, 1, third.head);
    const thirdStatusTarget = {
      repository,
      headRef: "feat/delivery-plan-record",
      headSha: third.head,
    };
    const ceiling = await selectReviewRequiredUntilRouted(harness, thirdStatusTarget);
    expect(ceiling).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: {
        target: { repository, pullRequest: 42, headSha: third.head },
        lane: "standard",
        exhaustedPassCount: 2,
        nextPass: 3,
      },
      routedObligation: {
        conjunction: {
          members: [{ state: "discharged" }, { state: "outstanding", vehicle: thirdVehicle }],
        },
      },
    });
    if (ceiling.nextAction !== "obtain-ceiling-override") throw new Error("expected exact ceiling consequence");
    const overridden = await statusThroughHandler(harness, thirdStatusTarget, ceiling.consequence);
    expect(overridden).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: ceiling.consequence.target,
        provider: "coderabbit-pr",
        vehicle: thirdVehicle,
        ceilingOverride: ceiling.consequence,
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
