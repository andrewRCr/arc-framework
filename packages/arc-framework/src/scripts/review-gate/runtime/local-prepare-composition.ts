/** Production adapters for the local review prepare command. */
import { validateLocalDeliveryAdmission } from "./local-prepare-delivery-admission.js";
import { createNativeLocalPassJudgmentResolver } from "./native-local-pass-judgments.js";
import { bindJudgment } from "../policy/review-execution-admission.js";
import { requireNativeReviewDecisionReferences } from "../policy/review-grant-references.js";
import { readLocalReviewReceipts } from "./local-outcome-receipts.js";
import { sweepLocalReviewMaterializations } from "./local-source-sweep-composition.js";
import type { LocalReviewInvocationInput } from "./local-review-invocation.js";
import { resolveLocalPolicyTarget, createLocalContributionConfirmation } from "./local-correction-context.js";
import type { ApprovedDispositionRecordReader, ReviewOperationStateStore } from "../core/ports.js";
import { readReviewLaneHistory } from "./lane-history.js";
import { projectFixedFindingPointers } from "../core/fixed-finding-pointers.js";
import { deriveNextPassFacts } from "../policy/next-pass-facts.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import { createLocalReviewSubjectResolver, type LocalReviewCandidateReader } from "./local-review-subject.js";
import { readLocalDeltaAdmissionSurface, readReservedWorkUnitObligation } from "./local-reserved-obligation.js";
import { deriveReviewNextPassContextFromAttempts } from "../policy/review-next-pass.js";

import { createCandidateResponseHeadContinuationReader } from "./candidate-response-head-continuation.js";
import { readFile } from "node:fs/promises";

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import { createReviewCompositionContext } from "./composition-context.js";
import { resolveReviewInvocation, type ReviewInvocationInput } from "./invocation.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  resolveRepositoryIdentity,
  withRepositoryLocalReviewLock,
  withRepositoryReviewOperationLock,
} from "../hosts/local/git-common-state.js";
import { RepositoryLocalReviewSourceStore } from "../hosts/local/source-store.js";
import {
  createLocalReviewSourceDescriptor,
  ensureLocalReviewSourceMaterialized,
} from "../hosts/local/review-materialization.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTarget,
  confirmLocalReviewTarget,
} from "../hosts/local/repository-target.js";
import {
  RepositoryDeliveryMemberLookup,
} from "../hosts/local/delivery-member-lookup.js";
import {
  resolveLocalReviewAuthority,
} from "../hosts/local/review-authority.js";
import type { LocalReviewAuthority } from "../core/local-review-authority.js";
import {
  readLocalReviewLiveContext,
  type ResolvedLocalReviewLiveContext,
} from "../hosts/local/live-context.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import {
  composeWorkUnitReviewAssurance,
} from "../policy/assurance.js";
import {
  bindReviewMethodActivity,
  resolveReviewMethodActivity,
} from "../policy/activity.js";
import { projectLocalReviewGuidance } from "../policy/local-review-guidance.js";
import {
  resolveLocalReviewPolicyBinding,
  validateLocalReviewPolicySelection,
} from "../policy/local-review-policy.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import {
  confirmCurrentDispositionSet,
} from "../hosts/local/disposition-record-store.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import type { LocalPrepareDependencies } from "./local-prepare.js";
import { readCandidateRecord } from "../../../lib/store/kinds/review/candidate/access.js";
import { readRepositoryCandidateSupersessionChain } from "../../../lib/store/kinds/review/candidate/history.js";

import { createLocalFrontlineSourcePreferenceReader } from
  "../hosts/local/frontline-source-preferences.js";
import { resolveConfiguredLanePolicy } from "../policy/lane-policy-config.js";
import {
  assertEvidenceBoundReviewExecutionAdmission,
  resolveEvidenceBoundReviewPolicyContinuation,
} from "../policy/review-policy-evidence.js";
import {
  resolveLocalReviewCoverageSelection,
} from
  "../policy/local-review-coverage-selection.js";
import {
  laneContinuationOperationId,
  readLaneResponsePerformance,
} from "../lane-progress.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewResult } from "../core/review-result.js";

const LOCAL_STANDARD_SOURCE = {
  sourceKind: "agent",
  qualifier: "standard-review/v1",
} as const;

function createLocalPolicyRequest(
  request: Parameters<LocalPrepareDependencies["validatePolicyAdmission"]>[0],
  policyTarget: { repository: string; pullRequest: number | null; headSha: string },
  sources: readonly string[],
  native: boolean,
) {
  requireNativeReviewDecisionReferences(native, request.judgment);
  const { standardReview, completedPasses, attempts } = request;
  const { judgment, ceilingOverride, additionalPassAuthorization } = bindJudgment({ target: policyTarget, judgment: request.judgment });
  const invocation = judgment?.invocation ?? (sources.length === 0 || sources.includes("delegated-agent")
    ? { mode: "force" as const, sourceId: "delegated-agent" } : undefined);
      const policyRequest = {
        schemaVersion: 1,
        target: policyTarget,
        lane: "standard",
        frontlineActive: false,
        standardReview,
        completedPasses,
        attempts,
        ...(judgment?.scopeMode === undefined
          ? {}
          : { scopeSelection: { mode: judgment.scopeMode, target: policyTarget } }),
        ...(invocation === undefined ? {} : { invocation }),
        ...(ceilingOverride === undefined ? {} : { ceilingOverride }),
        ...(additionalPassAuthorization === undefined ? {} : { additionalPassAuthorization }),
        ...(judgment?.terminus === undefined ? {} : { terminus: judgment.terminus }),
      };
  return policyRequest;
}

async function validateLocalPolicyAdmission(
  request: Parameters<LocalPrepareDependencies["validatePolicyAdmission"]>[0],
  context: {
    input: LocalReviewInvocationInput;
    resultReader: ReturnType<typeof createRepositoryReviewResultReader>;
    dispositionStore: ApprovedDispositionRecordReader;
    operationStore: ReviewOperationStateStore;
  },
): ReturnType<LocalPrepareDependencies["validatePolicyAdmission"]> {
  const {
    repositoryId, target, lineage, standardReview, workUnitId,
    terminalResponsePerformed, predecessorOperationId, coverageAdmission,
  } = request;

      const settings = (await readConfigSettings(context.input.cwd)).settings;
      const policy = await resolveConfiguredLanePolicy({
        lane: "standard",
        settings,
        preferences: createLocalFrontlineSourcePreferenceReader({
          cwd: context.input.cwd,
          exec: context.input.exec,
          readFile: (path) => readFile(path, "utf8"),
        }),
      });
      const policyTarget = await resolveLocalPolicyTarget(
        context.input, repositoryId, target, settings["branch.base"],
      );
      const policyRequest = createLocalPolicyRequest(request, policyTarget, policy.sources, context.operationStore.stateOffBranch === true);
      const candidate = lineage.kind === "candidate" && workUnitId !== undefined
        ? await readCandidateRecord(context.input.cwd, workUnitId, { store: context.input.store, exec: context.input.exec, owner: context.input.workItem })
        : null;
      const confirmContribution = createLocalContributionConfirmation({
        context, repositoryId, baseRef: settings["branch.base"], policyTarget, candidate,
      });
      const evidenceDependencies = {
        sources: policy.sources.length === 0 ? ["delegated-agent"] : policy.sources,
        maxPasses: policy.maxPasses,
        resultReader: context.resultReader,
        dispositionStore: context.dispositionStore,
        readResponsePerformance: (predecessor: ReviewResult) => readLaneResponsePerformance(
          context.operationStore,
          predecessor,
        ),
        confirmIncrementalApplicability: (predecessor: ReviewResult, current: ReviewResult) =>
          confirmContribution(predecessor, current.target, current.admission.lineage, current),
        confirmTarget: (attemptedTarget: ReviewTarget) => Promise.resolve(attemptedTarget),
      };
      const nextPassContext = await deriveReviewNextPassContextFromAttempts({
        attempts: policyRequest.attempts, predecessorOperationId, completedPasses: request.completedPasses, completePasses: request.completePasses,
        currentTarget: target, currentLineage: lineage, standardReview, rangeProof: context.input,
        deltaAdmission: { sources: evidenceDependencies.sources,
          surface: await readLocalDeltaAdmissionSurface({ ...context.input, lineage, workUnitId,
            pullRequest: policyTarget.pullRequest }) },
        resultReader: context.resultReader, dispositionStore: context.dispositionStore,
        readResponsePerformance: evidenceDependencies.readResponsePerformance,
        confirmApplicability: evidenceDependencies.confirmIncrementalApplicability,
        confirmCurrentApplicability: predecessor => confirmContribution(predecessor, target, lineage),
        candidateProof: { candidate, cwd: context.input.cwd, baseRef: settings["branch.base"], exec: context.input.exec,
          observeTarget: () => deriveLocalReviewTarget({ ...context.input, repositoryId, baseRef: settings["branch.base"] }) },
      });
      const policyDependencies = { ...evidenceDependencies, selectionSources: evidenceDependencies.sources, nextPassContext,
        chosenCoverage: coverageAdmission?.requestedCoverage };
      const unresolved = await resolveEvidenceBoundReviewPolicyContinuation(policyRequest, {
        terminalResponsePerformed,
      }, policyDependencies);
      const history = await readReviewLaneHistory({ store: context.operationStore,
        dispositionStore: context.dispositionStore, repositoryId, headSha: target.headSha, lineage, workUnitId,
        resolveSupersessionAncestors: createLocalReviewCandidateReader(context.input).readSupersessionAncestors });
      const facts = await deriveNextPassFacts({ ...history, nextPassContext, target, ceiling: policy.maxPasses,
        exec: context.input.rawGit ?? createRawGitExec(context.input.cwd) });
      const coverage = resolveLocalReviewCoverageSelection({
        policy: unresolved, target, sourceId: "delegated-agent", standardReview, nextPassContext, facts,
        ...(predecessorOperationId === undefined ? {} : { predecessorOperationId }),
        ...(coverageAdmission === undefined ? {} : { coverageAdmission }),
      });
      if (coverage.state === "coverage-required") return coverage;
      const resolution = await assertEvidenceBoundReviewExecutionAdmission(policyRequest, {
        terminalResponsePerformed,
        ...(coverage.coverageSelected ? { coverageSelected: true } : {}),
      }, {
        sourceId: "delegated-agent",
        nextAction: "local-prepare",
      }, { ...policyDependencies, chosenCoverage: coverage.coverageAdmission.requestedCoverage });
      return { state: "ready", pass: resolution.payload.pass, coverageAdmission: coverage.coverageAdmission,
        incrementalBasis: nextPassContext.incremental?.basis };
}

/** Bind Candidate reads to the invocation's selected store. */
export function createLocalReviewCandidateReader(options: ReviewInvocationInput): LocalReviewCandidateReader {
  const input = { ...options, ...resolveReviewInvocation(options) };
  const reviewRecordStore = input.store;
  return {
    read: workUnitId => readCandidateRecord(input.cwd, workUnitId, { store: reviewRecordStore, owner: input.workItem }),
    readSupersessionAncestors: async (workUnitId, candidateId) => {
      const record = await readCandidateRecord(input.cwd, workUnitId, { store: reviewRecordStore, owner: input.workItem });
      if (record === null || record.attestation.candidateId !== candidateId) {
        throw new Error("Candidate supersession authority is unavailable for local review");
      }
      return readRepositoryCandidateSupersessionChain({ ...input, workUnit: workUnitId, record });
    },
  };
}

function localHistoryDependencies(context: Parameters<typeof validateLocalPolicyAdmission>[1]):
  Pick<LocalPrepareDependencies, "validatePolicyAdmission" | "readFixedFindingPointers"> {
  return {
    validatePolicyAdmission: request => validateLocalPolicyAdmission(request, context),
    readFixedFindingPointers: async request => projectFixedFindingPointers((await readReviewLaneHistory({ ...request,
      store: context.operationStore, dispositionStore: context.dispositionStore,
      resolveSupersessionAncestors: createLocalReviewCandidateReader(context.input).readSupersessionAncestors })).dispositions),
  };
}

/** Bind local prepare to the current repository, managed methods, and Git-common stores. */
export function createLocalPrepareDependencies(input: LocalReviewInvocationInput): LocalPrepareDependencies {
  return createBoundLocalPrepareDependencies({ ...input, ...createReviewCompositionContext(input) });
}

/** Retain one operational store throughout local admission and its nested Candidate reads. */
function createBoundLocalPrepareDependencies(input: LocalReviewInvocationInput & ReturnType<typeof createReviewCompositionContext>): LocalPrepareDependencies {
  const { publisher, family } = input;
  const operationStore = family.ports.inFlight;
  const sourceStore = new RepositoryLocalReviewSourceStore(publisher);
  const dispositionStore = family.ports.dispositions;
  const resultReader = createRepositoryReviewResultReader(publisher, input);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher, undefined, input)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  let liveContext: Promise<ResolvedLocalReviewLiveContext> | null = input.localLiveContext ?? null;
  const readLive = () => {
    liveContext ??= readLocalReviewLiveContext(input);
    return liveContext;
  };
  const memberLookup = new RepositoryDeliveryMemberLookup(input);
  const methodFiles = createLocalReviewMethodFilePort({ cwd: input.cwd });
  const rubricPort = createLocalReviewRubricBindingPort({ cwd: input.cwd });
  const subjects = createLocalReviewSubjectResolver({ ...input, readLive, candidateReader: createLocalReviewCandidateReader(input) });
  const deriveTarget: LocalPrepareDependencies["deriveTarget"] = async (repositoryId, member) => {
    const config = await readConfigSettings(input.cwd);
    const boundary = {
      exec: input.exec,
      cwd: input.cwd,
      baseRef: config.settings["branch.base"],
      repositoryId,
    };
    return member === undefined
      ? deriveLocalReviewTarget(boundary)
      : composeDeliveryMemberTarget({ ...boundary, member });
  };
  const validateDeliveryAdmission: LocalPrepareDependencies["validateDeliveryAdmission"] =
    admission => validateLocalDeliveryAdmission(input, admission);

  return {
    laneSourceId: "delegated-agent",
    operationStore,
    ...(family.mode === "stored" ? { outcomes: family.ports.outcomes } : {}),
    sourceStore,
    now: () => new Date().toISOString(),
    withLaneOperationLock: (coordinates, action) => withRepositoryReviewOperationLock(
      input.exec,
      input.cwd,
      laneContinuationOperationId(coordinates),
      10_000,
      action,
    ),
    confirmResponseHeadContinuation: createCandidateResponseHeadContinuationReader({ ...input, dispositionStore, operationStore }),
    confirmDispositionSetCurrent: (producerId, dispositionSetId) => confirmCurrentDispositionSet(
      dispositionStore,
      producerId,
      dispositionSetId,
    ),
    withLocalReviewLock: (action) => withRepositoryLocalReviewLock(input.exec, input.cwd, action),
    sweep: () => sweepLocalReviewMaterializations(input, { publisher, operationStore,
      readReceipts: async targetId => (await receipts()).readReceipts(targetId), now: () => new Date().toISOString() }),
    readReceipts: async (targetId) => readLocalReviewReceipts({ receiptStore: await receipts(),
      ...(family.mode === "stored" ? { outcomes: family.ports.outcomes } : {}) }, targetId),
    resolveRepositoryId: () => resolveRepositoryIdentity(publisher, undefined, input),
    readCurrentHeadSha: async () => (await input.exec("git", ["rev-parse", "HEAD"], {
      cwd: input.cwd,
    })).stdout.trim(),
    deriveTarget,
    confirmTarget: (target) => confirmLocalReviewTarget({
      exec: input.exec,
      cwd: input.cwd,
      attemptedTarget: target,
    }),
    resolveAuthority: (evaluatorIdentity, memberHeadObjectId, deliveryAdmission) => resolveLocalReviewAuthority(
      {
        evaluatorIdentity,
        ...(memberHeadObjectId === undefined ? {} : { memberHeadObjectId }),
        ...(deliveryAdmission === undefined ? {} : { deliveryAdmission }),
      },
      {
        readLiveContext: async () => (await readLive()).context,
        resolveRuntimeBinding: () => Promise.resolve({
          kind: "arc-cli",
          identity: `arc-cli/${getFrameworkVersion()}`,
        }),
        memberLookup,
      },
    ),
    ...subjects,
    resolvePassJudgments: createNativeLocalPassJudgmentResolver({ input, operationStore, subjects, deriveTarget, validateDeliveryAdmission }),
    composeAssurance: async (authority: LocalReviewAuthority) => {
      const live = await readLive();
      // A member's assurance is its owning work unit's: same meta, same work
      // class, same rubric. Left unrouted it would fall to the Errand arm below
      // and compose an assurance with no work class at all.
      if (authority.vehicle.kind === "work-unit" || authority.vehicle.kind === "delivery-member") {
        if (live.meta === null) return { status: "refused", diagnostics: ["work-unit meta unavailable"] };
        const composed = composeWorkUnitReviewAssurance(live.meta, methodFiles, rubricPort);
        if (composed.status === "refused") {
          return { status: "refused", diagnostics: [...composed.diagnostics] };
        }
        return {
          status: "resolved",
          assurance: composed.assurance.assurance,
          activity: composed.assurance.activity,
          guidance: projectLocalReviewGuidance(
            composed.guidance.projectAugmentation ?? undefined,
          ),
          diagnostics: [...composed.diagnostics],
        };
      }
      const activity = resolveReviewMethodActivity(bindReviewMethodActivity(methodFiles).activityPort);
      return {
        status: "resolved",
        assurance: { workContext: "errand", workClass: "none" },
        activity: activity.activity,
        guidance: projectLocalReviewGuidance(),
        diagnostics: activity.diagnostics,
      };
    },
    resolvePolicy: () => resolveLocalReviewPolicyBinding(null, [LOCAL_STANDARD_SOURCE]),
    validatePolicySelection: (binding, authority) => {
      validateLocalReviewPolicySelection(binding, {
        source: LOCAL_STANDARD_SOURCE,
        runtimeKind: authority.attestationRuntimeKind,
      });
    },
    ...localHistoryDependencies({ input, resultReader, dispositionStore, operationStore }),
    readReservedWorkUnitObligation: (vehicle, lineage) => readReservedWorkUnitObligation(input.cwd, vehicle, lineage, { store: input.store, exec: input.exec, owner: input.workItem }),
    validateDeliveryAdmission,
    describeSource: (operationId, target, coverageAdmission) => createLocalReviewSourceDescriptor({
      exec: input.exec,
      cwd: input.cwd,
      operationId,
      target,
      ...(coverageAdmission.correctionScope === undefined
        ? {}
        : { correctionScope: coverageAdmission.correctionScope }),
    }),
    materialize: (source) => ensureLocalReviewSourceMaterialized({ exec: input.exec, source }),
  };
}
