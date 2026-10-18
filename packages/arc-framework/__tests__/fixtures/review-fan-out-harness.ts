/** Real delivery review repository, publication bindings, and handler adapters shared by integration scenarios. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "vitest";
import { approveDispositionState } from "../../src/scripts/review-gate/core/dispositions.js";
import { LocalApprovedDispositionRecordStore } from "../../src/scripts/review-gate/hosts/local/disposition-record-store.js";
import { responsePolicyRequest } from "./review-response-policy.js";
import { handleCandidateApplicabilityResolve } from "../../src/handlers/candidate.js";
import { handleReviewStatus, handleReviewLocalAttest, handleReviewLocalPrepare, handleReviewLocalResume, handleReviewRespond } from "../../src/handlers/review.js";
import { canonicalize } from "../../src/lib/kernel/canonical/canonical-json.js";
import type { DeliveryHostPort } from "../../src/lib/delivery/host.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../src/lib/delivery/local-stores.js";
import { bindInitialDeliveryRef, deriveDeliveryMaterialization } from "../../src/lib/delivery/materialization.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { inspectDeliveryEntry } from "../../src/lib/delivery/entry-inspection.js";
import { DeliveryReviewMemberVehicleSchema } from "../../src/lib/delivery/review-vehicle.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../src/lib/delivery/schema.js";
import { renderDeliveryPlanSection } from "../../src/lib/delivery/task-list-render.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import { createCandidateAttestation, type CandidateManagedRecordV1 } from "../../src/lib/work-unit/candidate-attestation.js";
import { writeCandidateRecord } from "../../src/lib/work-unit/candidate-record-store.js";
import { collectCandidateSubjectTarget } from "../helpers/candidate-subject.js";
import { readSubmissionBoundaryVersioned, writeSubmissionBoundary } from "../../src/lib/work-unit/submission-boundary-store.js";
import { createReviewRequirement, createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { LocalAttestEnvelopeSchema, LocalPrepareEnvelopeSchema, LocalResumeEnvelopeSchema, RespondEnvelopeSchema } from "../../src/scripts/review-gate/core/review-command-envelope.js";
import { type HostedReviewCoverage } from "../../src/scripts/review-gate/hosted/request.js";
import { LocalReviewOperationStateStore } from "../../src/scripts/review-gate/hosts/local/operation-state-store.js";
import { RepositoryDeliveryMemberLookup } from "../../src/scripts/review-gate/hosts/local/delivery-member-lookup.js";
import { resolveLocalReviewAuthority, resolveLocalReviewVehicle } from "../../src/scripts/review-gate/hosts/local/review-authority.js";
import { resolveRepositoryIdentity } from "../../src/scripts/review-gate/hosts/local/git-common-state.js";
import { createStandardReviewReservation, projectPublicationBoundary } from "../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { createPrePublicationCompositionDependencies } from "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import type { ReviewAdditionalPassAuthorization, ReviewCeilingOverride } from "../../src/scripts/review-gate/policy/review-policy-driver.js";
import { optionalReviewStatusJudgment } from "../../src/scripts/review-gate/status-judgment.js";
import type { DeliveryLocalReviewAdmission } from "../../src/scripts/review-gate/policy/delivery-local-review-admission.js";
import { projectLocalReviewGuidance } from "../../src/scripts/review-gate/policy/local-review-guidance.js";
import { STANDARD_REVIEW_RUBRIC_IDENTITY } from "../../src/scripts/review-gate/policy/standard-review.js";
import { attestLocalReviewCommand } from "../../src/scripts/review-gate/runtime/local-attest-command.js";
import { createLocalAttestDependencies } from "../../src/scripts/review-gate/runtime/local-attest-composition.js";
import { prepareLocalReview } from "../../src/scripts/review-gate/runtime/local-prepare.js";
import { createLocalPrepareDependencies } from "../../src/scripts/review-gate/runtime/local-prepare-composition.js";
import { respondToReviewCommand } from "../../src/scripts/review-gate/runtime/respond-command.js";
import { createRespondDependencies } from "../../src/scripts/review-gate/runtime/respond-composition.js";
import { ReviewStatusCommandResultSchema, resolveReviewStatus } from "../../src/scripts/review-gate/status.js";
import { readRoutedObligation } from "../../src/scripts/review-gate/status-composition.js";
import { deliveryStackPlanFixture } from "./delivery-plan.js";
import { deliveryStateFixture } from "./delivery-state.js";
import { createTempRepo, makeGitExec } from "../helpers/integration.js";

export const repository = "owner/repository";

export const planId = "123e4567-e89b-42d3-a456-426614174000";

export const roots: string[] = [];

export async function git(root: string, args: string[]): Promise<string> {
  return (await makeGitExec(root)("git", args, { cwd: root })).stdout.trim();
}

export function member(plan: DeliveryPlanV1, index: number, head: string) {
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

export function targetAndRequirement(input: {
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

export async function respondThroughHandler(harness: FanOutHarness, request: unknown) {
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

export async function resumeLocalThroughHandler(harness: FanOutHarness, request: unknown) {
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

export interface FanOutHarness {
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

export function deliveryHost(
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

export async function installCandidate(
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

export async function writeBoundary(
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

export async function createHarness(
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

export async function statusThroughHandler(
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

export async function completeLocalReviewThroughHandlers(
  harness: FanOutHarness,
  deliveryAdmission: DeliveryLocalReviewAdmission,
  result: "clean" | "findings" | "failed" = "clean",
  productionHostBin?: string,
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
    validateDeliveryAdmission: productionHostBin === undefined ? async (admission: DeliveryLocalReviewAdmission) => {
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
    } : async (admission: DeliveryLocalReviewAdmission) => {
      const previousPath = process.env.PATH;
      process.env.PATH = `${productionHostBin}:${previousPath ?? ""}`;
      try { return await basePrepare.validateDeliveryAdmission(admission); }
      finally {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
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

export async function selectReviewRequiredUntilRouted(
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

/** Create the performed local material fix and retained member authority for successor scenarios. */
export async function createFixedLocalMemberReview(maxPasses?: number) {
    const harness = await createHarness(["delegated-agent", "coderabbit-pr"]);
    if (maxPasses !== undefined) await writeFile(join(harness.root, ".arc/system/arc-config.yml"),
      `branch.base: main\nreview.standard_max_passes: ${maxPasses}\n`);
    const statusTarget = {
      repository, headRef: "delivery/delivery-plan-record/first", headSha: harness.oldFirst,
    };
    const initial = await statusThroughHandler(harness, statusTarget);
    if (initial.nextAction !== "review-local-prepare") throw new Error("expected local admission");
    const local = await completeLocalReviewThroughHandlers(harness, initial.action, "findings");
    return fixLocalMemberReview(harness, statusTarget, local);
}

/** Approve and perform one material local member repair through its actual response protocol. */
export async function fixLocalMemberReview(
  harness: FanOutHarness,
  statusTarget: Parameters<typeof statusThroughHandler>[1],
  local: Awaited<ReturnType<typeof completeLocalReviewThroughHandlers>>,
  fixContent = "fixed local finding\n",
) {
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
    await writeFile(join(harness.root, "first.txt"), fixContent, "utf8");
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
    return { harness, correctedTarget, local, fixedHead, assessment: proposal.payload.provisionalPassAssessment };
}
