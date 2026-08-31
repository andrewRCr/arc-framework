/** Executable hosted-review progression across delivery-member targets. */

import { access, chmod, mkdir, writeFile } from "node:fs/promises";
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
  handleReviewLocalAttest,
  handleReviewLocalPrepare,
  handleReviewRespond,
} from "../../src/handlers/review.js";
import { canonicalDigest, canonicalize } from "../../src/lib/canonical/canonical-json.js";
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
import {
  approveDispositionState,
  createDispositionSet,
  proposeDispositionSet,
} from "../../src/scripts/review-gate/core/dispositions.js";
import {
  LocalAttestEnvelopeSchema,
  LocalPrepareEnvelopeSchema,
  RespondEnvelopeSchema,
} from "../../src/scripts/review-gate/core/review-command-envelope.js";
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
  type HostedReviewCoverage,
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
import { resolveLocalReviewAuthority } from
  "../../src/scripts/review-gate/hosts/local/review-authority.js";
import { resolveRepositoryIdentity } from
  "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import {
  createStandardReviewReservation,
  projectCorrectiveDeliveryReviewBoundary,
  projectPublicationBoundary,
} from
  "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../src/lib/delivery/public-review-continuation.js";
import { createPrePublicationCompositionDependencies } from
  "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type { ReviewCeilingOverride } from
  "../../src/scripts/review-gate/policy/review-policy-driver.js";
import type { DeliveryLocalReviewAdmission } from
  "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { projectLocalReviewGuidance } from
  "../../src/scripts/review-gate/policy/local-review-guidance.js";
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
  ReviewStatusCommandResultSchema,
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
      ...(request.vehicle?.kind !== "delivery-member"
        ? {}
        : { admitDeliveryMemberRequest: async () => undefined }),
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
  expect(exitCodes).toEqual([]);
  return RespondEnvelopeSchema.parse(JSON.parse(output.join("")));
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

async function installCandidate(
  harness: FanOutHarness,
  head: string,
  expectedVersion: string | null,
  supersedes?: string,
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

async function statusThroughHandler(
  harness: Pick<FanOutHarness, "root" | "exec" | "baseHead">,
  target: { repository: string; headRef: string; headSha: string },
  ceilingOverride?: ReviewCeilingOverride,
  coverage?: HostedReviewCoverage,
) {
  const output: string[] = [];
  const exitCodes: number[] = [];
  await handleReviewStatus({
    target: JSON.stringify(target),
    ...(ceilingOverride === undefined ? {} : { ceilingOverride: JSON.stringify(ceilingOverride) }),
    ...(coverage === undefined ? {} : { coverage }),
    json: true,
  }, undefined, {
    resolveRoot: () => harness.root,
    resolve: (root, input) => resolveReviewStatus(input, {
      observe: async (statusTarget, admittedOverride, admittedCoverage) => ({
        actualHeadSha: statusTarget.headSha,
        requiredChecks: "green",
        routedObligation: await readRoutedObligation(
          root,
          harness.exec,
          statusTarget,
          42,
          new RepositoryDeliveryMemberLookup({ cwd: root, exec: harness.exec }),
          harness.baseHead,
          admittedOverride === undefined && admittedCoverage === undefined
            ? undefined
            : {
                ...(admittedOverride === undefined ? {} : { ceilingOverride: admittedOverride }),
                ...(admittedCoverage === undefined ? {} : { coverage: admittedCoverage }),
              },
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
  await git(root, ["checkout", "-b", "feat/eight-member"]);
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
    top: { ref: "refs/heads/feat/eight-member", head: heads.at(-1)!, tree: trees.at(-1)! },
    members: plan.members.map((planned, index) => ({
      deliverableId: planned.deliverableId,
      ref: index === plan.members.length - 1
        ? "refs/heads/feat/eight-member"
        : `refs/heads/delivery/${plan.workUnitId}/${planned.chunkKey}`,
      head: heads[index]!,
      tree: trees[index]!,
    })),
    lifecyclePaths: [],
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
  const target = await collectGitCandidateTarget({
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
    branch: "feat/eight-member",
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
) {
  const basePrepare = createLocalPrepareDependencies({ exec: harness.exec, cwd: harness.root });
  const memberLookup = new RepositoryDeliveryMemberLookup({ cwd: harness.root, exec: harness.exec });
  const prepareDependencies = {
    ...basePrepare,
    resolveAuthority: (
      evaluatorIdentity: string,
      memberHeadObjectId?: string,
      admission?: DeliveryLocalReviewAdmission,
    ) => resolveLocalReviewAuthority({
      evaluatorIdentity,
      ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
      ...(admission === undefined ? {} : { deliveryAdmission: admission }),
    }, {
      readLiveContext: async () => ({
        activeIdentity: "andrew",
        workUnit: { identity: harness.plan.workUnitId, owner: "andrew" },
        errand: null,
      }),
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
      );
      if (current.nextAction !== "review-local-prepare"
        || canonicalize(current.action) !== canonicalize(admission)) {
        throw new Error("local delivery admission moved before preparation");
      }
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
        reviewRisk: "routine",
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
  expect(prepareExitCodes).toEqual([]);
  const prepared = LocalPrepareEnvelopeSchema.parse(JSON.parse(prepareOutput.join("")));
  expect(prepared).toMatchObject({ state: "ready", nextAction: "launch-review" });
  if (prepared.state !== "ready") throw new Error("expected prepared local review");

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
        status: "complete",
        result: "clean",
        evaluatorIdentity: "fresh-reviewer",
        reviewRunId: `run-${prepared.payload.operationId}`,
        applicabilityId: null,
        findings: [],
      },
    }),
    attest: (request) => attestLocalReviewCommand(request, attestDependencies),
    write: (text) => attestOutput.push(text),
    setExitCode: (code) => attestExitCodes.push(code),
  });
  expect(attestExitCodes).toEqual([]);
  const attested = LocalAttestEnvelopeSchema.parse(JSON.parse(attestOutput.join("")));
  expect(attested).toMatchObject({ state: "attested-current", nextAction: "reduce" });
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
        kind: "review-applicability-selection",
        offer: status.selectionAction,
        selection: {
          selectedBy: "andrew",
          selectedAt: `2026-08-24T04:1${String(index)}:00.000Z`,
          choice: "review-required",
        },
      }),
      write: (text) => output.push(text),
      setExitCode: (code) => exitCodes.push(code),
    });
    expect(exitCodes).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({ state: "resolved", choice: "review-required" });
  }
  throw new Error("review applicability selections did not reach a routed status");
}

async function installHostedRequestTestHost(harness: FanOutHarness) {
  const fakeBin = join(harness.root, "fake-bin");
  const fakeGh = join(fakeBin, "gh");
  const providerCalled = join(harness.root, "provider-called");
  const firstRequest = JSON.stringify([{
    number: 41,
    url: "https://example.test/pull/41",
    state: "OPEN",
    baseRefName: "main",
    headRefName: "delivery/delivery-plan-record/first",
    headRefOid: harness.oldFirst,
  }]);
  const laterRequest = JSON.stringify([{
    number: 42,
    url: "https://example.test/pull/42",
    state: "OPEN",
    baseRefName: "delivery/delivery-plan-record/first",
    headRefName: "prior-top",
    headRefOid: harness.priorSecond,
  }]);
  const comment = (pullRequest: number, body: string) => JSON.stringify({
    node_id: `IC_${String(pullRequest)}`,
    html_url: `https://example.test/comment/${String(pullRequest)}`,
    user: { id: 1 },
    performed_via_github_app: null,
    body,
    created_at: "2026-08-30T12:00:00.000Z",
    updated_at: "2026-08-30T12:00:00.000Z",
  });

  await mkdir(fakeBin, { recursive: true });
  await writeFile(fakeGh, [
    "#!/bin/sh",
    "case \"$1:$2\" in",
    "  pr:list)",
    "    case \"$*\" in",
    `      *"--head delivery/delivery-plan-record/first"*) printf '%s\\n' '${firstRequest}' ;;`,
    `      *"--head prior-top"*) printf '%s\\n' '${laterRequest}' ;;`,
    "      *) printf '%s\\n' '[]' ;;",
    "    esac",
    "    ;;",
    "  api:repos/owner/repository/pulls/41)",
    `    : > '${providerCalled}'`,
    `    printf '%s\\n' '${JSON.stringify({ head: { sha: harness.oldFirst } })}'`,
    "    ;;",
    "  api:repos/owner/repository/pulls/42)",
    `    : > '${providerCalled}'`,
    `    printf '%s\\n' '${JSON.stringify({ head: { sha: harness.priorSecond } })}'`,
    "    ;;",
    "  api:user)",
    `    : > '${providerCalled}'`,
    "    printf '%s\\n' '{\"id\":1}'",
    "    ;;",
    "  api:repos/owner/repository/issues/41/comments)",
    `    : > '${providerCalled}'`,
    "    case \"$*\" in",
    `      *"body=@coderabbitai review"*) printf '%s\\n' '${comment(41, "@coderabbitai review")}' ;;`,
    `      *) printf '%s\\n' '${comment(41, "@coderabbitai full review")}' ;;`,
    "    esac",
    "    ;;",
    "  api:repos/owner/repository/issues/42/comments)",
    `    : > '${providerCalled}'`,
    "    case \"$*\" in",
    `      *"body=@coderabbitai review"*) printf '%s\\n' '${comment(42, "@coderabbitai review")}' ;;`,
    `      *) printf '%s\\n' '${comment(42, "@coderabbitai full review")}' ;;`,
    "    esac",
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
  return { fakeBin, providerCalled };
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

describe("hosted review fan-out lifecycle", () => {
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
      const status = await statusThroughHandler(harness, statusTarget);
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
      const review = targetAndRequirement({
        repositoryId: harness.repositoryId,
        baseSha,
        baseTree,
        headSha: head,
        headTree: tree,
      });
      await recordHostedAwaitAttempt(harness.store, {
        repositoryId: harness.repositoryId,
        result: awaited,
        reviewTarget: review.reviewTarget,
        requirement: review.requirement,
        actorIdentity: "andrew",
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
    const corrective = projectCorrectiveDeliveryReviewBoundary({
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
      status: "continue-hosted-review",
      hostedReviewAction: { kind: "continue-hosted-review" },
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

  it("admits the exact first-outstanding status action at the production request boundary", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected hosted request");

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);

    expect(result.exitCodes).toEqual([]);
    expect(result.output).toMatchObject({
      state: "requested",
      handle: { target: status.action.target, vehicle: status.action.vehicle },
    });
    await expect(access(providerCalled)).resolves.toBeUndefined();
  });

  it("admits an explicitly incremental first-outstanding action at the production request boundary", async () => {
    const harness = await createHarness();
    const { fakeBin, providerCalled } = await installHostedRequestTestHost(harness);
    const status = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    }, undefined, "incremental");
    expect(status).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: { headSha: harness.oldFirst },
        coverage: "incremental",
      },
    });
    if (status.nextAction !== "review-hosted-request") throw new Error("expected incremental hosted request");

    const result = await requestThroughProductionHandler(harness, fakeBin, status.action);

    expect(result.exitCodes).toEqual([]);
    expect(result.output).toMatchObject({
      state: "requested",
      requestedCoverage: "incremental",
      handle: { effectiveCoverage: "incremental" },
    });
    await expect(access(providerCalled)).resolves.toBeUndefined();
  });

  it("re-enters the complete member lane after an incremental clean result", async () => {
    const harness = await createHarness();
    const statusTarget = {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: harness.oldFirst,
    };
    const incremental = await statusThroughHandler(harness, statusTarget, undefined, "incremental");
    if (incremental.nextAction !== "review-hosted-request") {
      throw new Error("expected incremental hosted request");
    }
    const requested = await requestThroughHandler(incremental.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-incremental-clean",
        url: "https://example.test/review-incremental-clean",
        createdAt: "2026-08-30T13:00:00.000Z",
      },
      effectiveCoverage: "incremental",
    }, harness.root, harness.exec);
    if (requested.nextAction !== "await") throw new Error("expected incremental hosted review handle");
    const awaited = await awaitThroughHandler(requested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-incremental-clean",
    });
    const review = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: awaited,
      reviewTarget: review.reviewTarget,
      requirement: review.requirement,
      actorIdentity: "andrew",
      now: "2026-08-30T13:01:00.000Z",
    });

    await expect(statusThroughHandler(harness, statusTarget)).resolves.toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: { headSha: harness.oldFirst },
        provider: "coderabbit-pr",
        coverage: "complete",
      },
    });
  });

  it("settles a verified member fix at the current repository-backed delivery target", async () => {
    const harness = await createHarness();
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
    }, harness.root, harness.exec);
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
      reviewTarget: review.reviewTarget,
      requirement: review.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:01:00.000Z",
    });
    if (progress === null) throw new Error("expected findings progress");
    const attemptId = hostedLaneAttemptId(requested.handle);
    const operationId = laneProgressOperationId({
      lane: "standard",
      repositoryId: harness.repositoryId,
      headSha: harness.oldFirst,
    });
    const attemptRef = bindReviewSourceReference({
      kind: "hosted",
      operationId,
      durableRef: attemptId,
    });
    const dispositions = approveDispositionState({
      proposed: proposeDispositionSet(createDispositionSet({
        schemaVersion: 2,
        semanticsVersion: "review-gate/v2",
        targetId: review.reviewTarget.targetId,
        policyVersion: review.requirement.policyVersion,
        rubricVersion: review.requirement.rubricVersion,
        rubricDigest: review.requirement.rubricDigest,
        proposedBy: "arc-cli/integration-test",
        findings: [{
          findingId: finding.findingId,
          sourceIdentity: "coderabbit-pr",
          locus: finding.locus,
          sourceVerification: "verified",
          verificationRefs: [finding.url],
          severity: finding.severity,
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
      dispositions,
    };
    await expect(respondThroughHandler(harness, request)).resolves.toMatchObject({
      state: "ready-to-fix",
      payload: {
        hostedSettlementPlan: {
          beforeFixFindingIds: [],
          afterFixFindingIds: [finding.findingId],
        },
      },
    });

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
      actorIdentity: "andrew",
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
            currentActorIdentity: async () => "andrew",
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
                actorIdentity: "andrew",
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

    const fixedMemberStatus = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: fixedHead,
    });
    expect(fixedMemberStatus).toMatchObject({
      nextAction: "review-hosted-request",
      action: {
        target: { repository, pullRequest: 41, headSha: fixedHead },
        vehicle: member(harness.plan, 0, fixedHead),
      },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [
            { state: "outstanding", progress: { completedPasses: 1 } },
            { state: "outstanding" },
          ],
        },
      },
    });
    if (fixedMemberStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected fixed member follow-up request");
    }
    const fixedMemberRequested = await requestThroughHandler(fixedMemberStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-fixed-member-clean",
        url: "https://example.test/review-fixed-member-clean",
        createdAt: "2026-08-24T04:04:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (fixedMemberRequested.nextAction !== "await") throw new Error("expected fixed member review handle");
    const fixedMemberAwait = await awaitThroughHandler(fixedMemberRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-fixed-member-clean",
    });
    const fixedMemberReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: fixedHead,
      headTree: fixedTree,
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: fixedMemberAwait,
      reviewTarget: fixedMemberReview.reviewTarget,
      requirement: fixedMemberReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:05:00.000Z",
    });

    const secondStatus = await statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: fixedHead,
    });
    expect(secondStatus).toMatchObject({
      nextAction: "review-hosted-request",
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [{ state: "discharged" }, { state: "outstanding" }],
        },
      },
    });
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
    const secondReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.oldFirst,
      baseTree: harness.oldFirstTree,
      headSha: harness.priorSecond,
      headTree: harness.priorSecondTree,
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: secondAwait,
      reviewTarget: secondReview.reviewTarget,
      requirement: secondReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:07:00.000Z",
    });

    await expect(statusThroughHandler(harness, {
      repository,
      headRef: "delivery/delivery-plan-record/first",
      headSha: fixedHead,
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
    const review = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.baseHead,
      baseTree: harness.baseTree,
      headSha: harness.oldFirst,
      headTree: harness.oldFirstTree,
    });

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
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: firstHosted.action,
      result: firstUnavailable,
      reviewTarget: review.reviewTarget,
      requirement: review.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:00:00.000Z",
    });

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
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: secondHosted.action,
      result: secondUnavailable,
      reviewTarget: review.reviewTarget,
      requirement: review.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:01:00.000Z",
    });

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
    const finalReview = targetAndRequirement({
      repositoryId: harness.repositoryId,
      baseSha: harness.oldFirst,
      baseTree: harness.oldFirstTree,
      headSha: harness.priorSecond,
      headTree: harness.priorSecondTree,
    });
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
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: finalFirstHosted.action,
      result: finalFirstUnavailable,
      reviewTarget: finalReview.reviewTarget,
      requirement: finalReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:03:00.000Z",
    });

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
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: finalSecondHosted.action,
      result: finalSecondUnavailable,
      reviewTarget: finalReview.reviewTarget,
      requirement: finalReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:04:00.000Z",
    });

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
    await recordHostedRequestUnavailableAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      request: initial.action,
      result: unavailable,
      reviewTarget: firstReview.reviewTarget,
      requirement: firstReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:01:00.000Z",
    });

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
    const priorFinding = {
      findingId: "finding-prior",
      origin: "review-thread",
      commentId: "comment-prior",
      threadId: "thread-prior",
      settlement: "reply-and-resolve",
      severity: "major",
      locus: "src/prior.ts:1",
      url: "https://example.test/finding-prior",
    };
    const priorSecondAwait = await awaitThroughHandler(priorSecondRequested.handle, {
      kind: "findings",
      reviewUrl: "https://example.test/review-second-prior",
      findings: [priorFinding],
    });
    const priorProgress = await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: priorSecondAwait,
      reviewTarget: priorSecondReview.reviewTarget,
      requirement: priorSecondReview.requirement,
      actorIdentity: "andrew",
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
    await bindHostedAttemptDisposition(harness.store, {
      operationId: laneProgressOperationId({
        lane: "standard",
        repositoryId: harness.repositoryId,
        headSha: harness.priorSecond,
      }),
      attemptId: hostedLaneAttemptId(priorSecondRequested.handle),
      dispositionSetId: canonicalDigest({ disposition: "prior" }),
      findingIds: [priorFinding.findingId],
      noHostSettlementFindingIds: [priorFinding.findingId],
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

    const thirdPassCeiling = await statusThroughHandler(harness, currentStatusTarget);
    expect(thirdPassCeiling).toMatchObject({
      state: "approval-required",
      nextAction: "obtain-ceiling-override",
      consequence: {
        target: currentSecondTarget,
        exhaustedPassCount: 2,
        nextPass: 3,
      },
      routedObligation: {
        conjunction: {
          status: "outstanding",
          members: [
            { state: "discharged", vehicle: movedFirst },
            { state: "outstanding", vehicle: currentSecond },
          ],
        },
      },
    });
    if (thirdPassCeiling.nextAction !== "obtain-ceiling-override") {
      throw new Error("expected a third-pass ceiling override");
    }
    const thirdPassStatus = await statusThroughHandler(
      harness,
      currentStatusTarget,
      thirdPassCeiling.consequence,
    );
    expect(thirdPassStatus).toMatchObject({
      state: "review-required",
      nextAction: "review-hosted-request",
      action: {
        target: currentSecondTarget,
        vehicle: currentSecond,
        ceilingOverride: thirdPassCeiling.consequence,
      },
    });
    if (thirdPassStatus.nextAction !== "review-hosted-request") {
      throw new Error("expected overridden third-pass request");
    }
    const thirdPassRequested = await requestThroughHandler(thirdPassStatus.action, {
      kind: "created",
      artifact: {
        kind: "pull-request-review",
        id: "review-second-pass-three",
        url: "https://example.test/review-second-pass-three",
        createdAt: "2026-08-24T04:11:00.000Z",
      },
      effectiveCoverage: "complete",
    }, harness.root, harness.exec);
    if (thirdPassRequested.nextAction !== "await") throw new Error("expected third-pass review handle");
    const thirdPassAwait = await awaitThroughHandler(thirdPassRequested.handle, {
      kind: "clean",
      reviewUrl: "https://example.test/review-second-pass-three",
    });
    await recordHostedAwaitAttempt(harness.store, {
      repositoryId: harness.repositoryId,
      result: thirdPassAwait,
      reviewTarget: currentSecondReview.reviewTarget,
      requirement: currentSecondReview.requirement,
      actorIdentity: "andrew",
      now: "2026-08-24T04:12:00.000Z",
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
        exhaustedPassCount: 3,
        nextPass: 4,
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
