/** Production composition for the typed pre-publication review procedure. */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseMetaRecord, toMetaRecord } from "../../../lib/active/meta-reader.js";
import { workUnitPathTreatmentContext } from "../../../lib/base-drift/current-adapters.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../../../lib/delivery/git-eligibility.js";
import {
  readGitDeliveryLifecycleArtifactsAtRef,
  revalidateDeliveryLifecycleContribution,
} from "../../../lib/delivery/git-lifecycle-contribution.js";
import { CurrentDeliveryLifecycleContributionPathSource } from "../../../lib/delivery/lifecycle-contribution.js";
import { RepositoryDeliveryPlanStore, RepositoryDeliveryStateStore } from "../../../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../../lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { RawGitExec } from "../../../lib/change-facts.js";
import { resolveSoleMergeBase } from "../../../lib/git/base-overlap.js";
import { analyzeRevisionOverlap, getCurrentBranch, type GitExec } from "../../../lib/git/index.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import { SlugSchema, validateManagedPath } from "../../../lib/kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../../../lib/layout/index.js";
import { resolveActiveWu } from "../../../lib/release/wu-resolution.js";
import { resolveGitCommonDir } from "../../../lib/user-sync/repo-shared-paths.js";
import {
  CandidateConvergenceProjectionSchema,
  candidateReviewResponses,
  reduceCandidateDurableBaseline,
  type CandidateSupersessionAncestor,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import type { CandidateEffectiveTargetProjection } from
  "../../../lib/work-unit/candidate-effective-target.js";
import {
  readCandidateRecord,
  readRepositoryCandidateSupersessionChain,
} from "../../../lib/work-unit/candidate-record-store.js";
import { readAncestry } from "../../../lib/work-unit/git-decomposition-object-readers.js";
import { projectGitCandidateEffectiveTarget } from "../../../lib/work-unit/git-candidate-effective-target.js";
import { resolveChangeRequest } from "../change-request.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import type { ReviewOperationStateStore } from "../core/ports.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { ReviewResult } from "../core/review-result.js";
import { resolveAcceptableDeliveryBaseRefs } from "../core/delivery-member-lookup.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import { LocalApprovedDispositionRecordStore } from "../hosts/local/disposition-record-store.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import { createLocalFrontlineSourcePreferenceReader } from "../hosts/local/frontline-source-preferences.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTargetFromCoordinates,
  LocalTargetDerivationError,
} from "../hosts/local/repository-target.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import {
  readLaneProgressAcrossLineage,
  readCandidateInheritedLaneProgress,
  readLaneProgressOwner,
  readLaneResponsePerformance,
} from "../lane-progress.js";
import { readSingletonFrontlinePhaseClosure } from "./frontline-phase.js";
import { projectFrontlineFollowUpAdvice, type FrontlineFollowUpAdvice } from "./frontline-follow-up.js";
import { composeWorkUnitReviewAssurance } from "./assurance.js";
import { resolveConfiguredLanePolicy } from "./lane-policy-config.js";
import {
  confirmDeliveryMemberIncrementalApplicability,
  confirmNonDeliveryIncrementalApplicability,
} from "./local-review-coverage-selection.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import {
  composePreBindingDeliveryReviewTargets,
  type PreBindingDeliveryReviewTargetDependencies,
} from "./pre-publication-delivery-targets.js";
import type {
  AssuranceRead,
  CandidateRead,
  ImmutableTargetRead,
  PrePublicationCompositionDependencies,
  ReservationTargetRead,
  TargetRead,
} from "./pre-publication-request.js";
import {
  readPendingCandidateReviewFixAuthority,
  type PendingCandidateReviewFixAuthority,
} from "./candidate-review-fix-continuation.js";

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface NoPullRequestCandidateApplicabilityInput {
  predecessor: ReviewResult;
  currentTarget: ReviewTarget;
  currentLineage: Parameters<PrePublicationCompositionDependencies["confirmPriorProducerApplicability"]>[3];
  candidateId: string;
  prior: CandidateEffectiveTargetProjection;
  current: CandidateEffectiveTargetProjection;
  observedCurrentTarget: ReviewTarget;
}

function sameLocalCandidateOwner(input: Pick<NoPullRequestCandidateApplicabilityInput,
  "predecessor" | "currentTarget" | "currentLineage" | "candidateId">): boolean {
  return input.predecessor.kind === "attested-local"
    && input.predecessor.target.kind === "change-set"
    && input.currentTarget.kind === "change-set"
    && input.currentLineage.kind === "candidate"
    && input.predecessor.repositoryId === input.currentTarget.repositoryId
    && laneSubjectOwnerMatches(input.predecessor.admission.lineage, input.currentLineage)
    && input.candidateId === input.currentLineage.candidateId;
}

/** Retain a local prior-head producer only when both exact heads carry one recognized Candidate subject. */
export function noPullRequestCandidatePriorApplicability(
  input: NoPullRequestCandidateApplicabilityInput,
): IncrementalPredecessorApplicability {
  if (!sameLocalCandidateOwner(input)
    || input.observedCurrentTarget.targetId !== input.currentTarget.targetId
    || input.prior.state !== "current"
    || input.current.state !== "current"
    || input.prior.candidateId !== input.candidateId
    || input.current.candidateId !== input.candidateId
    || input.prior.recognizedTarget.revision !== input.predecessor.target.headSha
    || input.current.recognizedTarget.revision !== input.currentTarget.headSha) {
    return "unavailable";
  }
  return input.prior.recognizedTarget.subject.subjectDigest
    === input.current.recognizedTarget.subject.subjectDigest
    ? "applicable" : "review-required";
}

/** Read both pinned Candidate subjects and refuse reuse unless their live review target is unchanged. */
export async function confirmNoPullRequestCandidatePriorProducer(input: {
  cwd: string;
  workUnit: string;
  baseBranch: string;
  candidate: CandidateManagedRecordV1;
  predecessor: ReviewResult;
  currentTarget: ReviewTarget;
  currentLineage: Parameters<PrePublicationCompositionDependencies["confirmPriorProducerApplicability"]>[3];
  exec: GitExec;
  rawExec: RawGitExec;
  observeTarget: () => Promise<ReviewTarget>;
}): Promise<IncrementalPredecessorApplicability> {
  if (input.predecessor.kind !== "attested-local"
    || input.predecessor.target.kind !== "change-set"
    || input.currentTarget.kind !== "change-set"
    || input.currentLineage.kind !== "candidate"
    || input.candidate.attestation.candidateId !== input.currentLineage.candidateId
    || !laneSubjectOwnerMatches(input.predecessor.admission.lineage, input.currentLineage)) {
    return "unavailable";
  }
  try {
    const readAt = (revision: string, currentBase: string) =>
      projectGitCandidateEffectiveTarget({
        cwd: input.cwd,
        name: SlugSchema.parse(input.workUnit),
        baseBranch: input.baseBranch,
        record: input.candidate,
        exec: input.exec,
        rawExec: input.rawExec,
        target: { revision, currentBase },
      });
    const [prior, current] = await Promise.all([
      readAt(input.predecessor.target.headSha, input.predecessor.target.diffBaseSha),
      readAt(input.currentTarget.headSha, input.currentTarget.diffBaseSha),
    ]);
    const observedCurrentTarget = await input.observeTarget();
    return noPullRequestCandidatePriorApplicability({
      predecessor: input.predecessor,
      currentTarget: input.currentTarget,
      currentLineage: input.currentLineage,
      candidateId: input.candidate.attestation.candidateId,
      prior,
      current,
      observedCurrentTarget,
    });
  } catch {
    return "unavailable";
  }
}

/** Require the same sole best ancestor that canonical local review targets require. */
export async function resolvePrePublicationDiffBase(input: {
  exec: GitExec;
  cwd: string;
  baseRef: string;
  headSha: string;
}): Promise<string> {
  const base = await resolveSoleMergeBase({
    exec: (command, args) => input.exec(command, args, { cwd: input.cwd }),
    leftRevision: `refs/heads/${input.baseRef}`,
    rightRevision: input.headSha,
  });
  if (base.status === "ambiguous") throw new LocalTargetDerivationError("ambiguous-merge-base");
  if (base.status !== "resolved") throw new LocalTargetDerivationError("no-merge-base");
  return base.mergeBase;
}

/**
 * Project the Candidate read used by prepublication, including an authorized pending fix re-entry.
 *
 * @param input - Managed Candidate, effective target, and pending fix authority.
 * @returns A current Candidate projection or a fail-closed blocked read.
 */
export function projectPrePublicationCandidateRead(input: {
  record: CandidateManagedRecordV1;
  effective: CandidateEffectiveTargetProjection;
  pending: PendingCandidateReviewFixAuthority;
  supersessionAncestors?: readonly CandidateSupersessionAncestor[];
}): CandidateRead {
  const baseline = reduceCandidateDurableBaseline(input.record);
  if (input.effective.state === "current") {
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: input.effective.convergenceVerification,
      convergenceScope: input.effective.convergenceScope,
    });
    return {
      status: "current",
      candidateId: input.effective.candidateId,
      headSha: input.effective.recognizedTarget.revision,
      subjectDigest: input.effective.recognizedTarget.subject.subjectDigest,
      implementationChanged: input.effective.implementationChanged,
      ...convergence,
      lineageHeadShas: [...new Set([
        input.record.attestation.baseRevision,
        ...candidateReviewResponses(input.record)
          .flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
        ...input.record.lineageAttestations.map((attestation) => attestation.target.revision),
        input.effective.recognizedTarget.revision,
      ])],
      supersessionAncestors: input.supersessionAncestors ?? [],
    };
  }
  const authorizedPendingFix = input.effective.state === "changed"
    || input.effective.state === "decision-required";
  if (authorizedPendingFix && input.pending.status === "selected"
    && input.pending.candidateId === baseline.candidateId) {
    const convergence = CandidateConvergenceProjectionSchema.parse({
      convergenceVerification: baseline.convergenceVerification,
      convergenceScope: baseline.convergenceScope,
    });
    return {
      status: "current",
      candidateId: baseline.candidateId,
      headSha: input.pending.reviewedHead,
      subjectDigest: baseline.target.subject.subjectDigest,
      implementationChanged: baseline.implementationChanged,
      ...convergence,
      pendingReviewTarget: input.pending.reviewedTarget,
      lineageHeadShas: [...new Set([
        input.record.attestation.baseRevision,
        ...candidateReviewResponses(input.record)
          .flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
        ...input.record.lineageAttestations.map((attestation) => attestation.target.revision),
        input.pending.reviewedHead,
      ])],
      supersessionAncestors: input.supersessionAncestors ?? [],
    };
  }
  if (input.pending.status === "refused") {
    return {
      status: "blocked",
      reason: `Candidate review-fix authority is unavailable (${input.pending.reason}).`,
    };
  }
  const reason = input.effective.state === "changed" || input.effective.state === "staged-change"
    ? "Run full work-unit verification to establish a new Candidate lineage root."
    : input.effective.state === "decision-required"
      ? `${input.effective.selectionOfferText}\n${input.effective.recommendedActionText}`
      : `Candidate applicability could not recognize the current target (${input.effective.nextAction}).`;
  return { status: "blocked", reason };
}

/**
 * Bind canonical delivery, Git eligibility, and exact review-target reads for private member projection.
 *
 * @param input - The originating work-unit checkout and its Git boundary.
 * @returns The production dependencies for `composePreBindingDeliveryReviewTargets`.
 */
export function createPreBindingDeliveryReviewTargetDependencies(input: {
  cwd: string;
  exec: GitExec;
}): PreBindingDeliveryReviewTargetDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
  const states = new RepositoryDeliveryStateStore(publisher);
  const lookup = new RepositoryDeliveryMemberLookup(input);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };
  return {
    resolveDelivery: (workUnitId, protectedBaseRef) => lookup.resolveReservationRecords(
      workUnitId,
      { status: "established", ref: protectedBaseRef },
    ),
    resolveGitCommonDir: () => resolveGitCommonDir(input.exec, input.cwd),
    resolveOriginatingTop: async (plan) => {
      const [active, branch] = await Promise.all([
        resolveActiveWu({ cwd: input.cwd }),
        getCurrentBranch(input.exec),
      ]);
      return active.status === "resolved" && active.name === plan.workUnitId
        && active.branch !== null && active.branch === branch
        ? `refs/heads/${active.branch}`
        : null;
    },
    resolveLifecyclePaths: async ({ plan, protectedBaseRef, topRef }) => {
      const active = await resolveActiveWu({ cwd: input.cwd });
      if (active.status !== "resolved" || active.name !== plan.workUnitId) return null;
      const paths = await new CurrentDeliveryLifecycleContributionPathSource({
        readDirectory: (path) => readdir(resolve(input.cwd, path)),
        readArtifactsAtRef: (ref, workUnitId) => readGitDeliveryLifecycleArtifactsAtRef(
          input.exec,
          ref,
          workUnitId,
        ),
      }).resolve({
        workUnitId: plan.workUnitId,
        activeMetaPath: validateManagedPath(active.path),
        protectedBaseRef,
        topRef,
      });
      return paths.paths;
    },
    eligibility: {
      observeRef: (ref) => observeDeliveryEligibilityRef(input.exec, ref),
      readAncestry: (ancestor, descendant) => readAncestry(input.exec, ancestor, descendant),
      readOverlap: (coordinates) => analyzeRevisionOverlap({
        exec: input.exec,
        leftRevision: coordinates.leftRevision,
        rightRevision: coordinates.rightRevision,
        treatmentContext: workUnitPathTreatmentContext(coordinates.workUnitId),
      }),
      revalidateLifecycleContribution: (candidate) => revalidateDeliveryLifecycleContribution({
        exec: input.exec,
        ...candidate,
      }),
      compareNormalizedCompleteness: async (candidate) => {
        const compared = await compareGitNormalizedDeliveryTrees({
          exec: input.exec,
          protectedBaseTree: candidate.protectedBase.tree,
          chainBaseTree: candidate.chainBase.tree,
          topTree: candidate.top.tree,
          finalCandidateTree: candidate.finalCandidate.tree,
          lifecyclePaths: candidate.lifecyclePaths,
          regenerablePaths: candidate.regenerablePaths,
        });
        if (compared.status === "unavailable") {
          return { status: "refused" as const, reason: "unavailable" as const };
        }
        if (compared.status === "match") return compared;
        const reason = compared.droppedPaths.length > 0
          ? "dropped" as const
          : compared.inventedPaths.length > 0 ? "invented" as const : "mismatched" as const;
        return { status: "refused" as const, reason };
      },
      readCurrentPlan: async (planId) => {
        const current = await plans.readCurrent(planId);
        return current.status === "ok" ? current.value : null;
      },
      resolveMember: (head) => states.resolveMemberReadOnly({ selector: { kind: "head", objectId: head } }),
      inspectCheckout: (path) => inspectDeliveryCandidateCheckout(input.exec, path),
    },
    composeTarget: async ({ baseRef, base, head }) => composeDeliveryMemberTarget({
      exec: input.exec,
      cwd: input.cwd,
      baseRef,
      repositoryId: await repositoryId(),
      member: { base, head },
    }),
  };
}

/** Select the carried reservation marker from one coherent delivery-record read. */
export function selectPrePublicationReservationTarget(input: {
  workUnit: string;
  singleton: { repository: string; headSha: string };
  delivery:
    | { status: "absent" }
    | { status: "unavailable" }
    | { status: "planned" | "bound"; planId: string; workUnitId: string };
}): ReservationTargetRead {
  const workUnit = SlugSchema.parse(input.workUnit);
  if (input.delivery.status === "unavailable") {
    return {
      status: "refused",
      reason: "The pre-publication reservation target could not be resolved from delivery records.",
    };
  }
  if (input.delivery.status !== "absent" && input.delivery.workUnitId !== workUnit) {
    return {
      status: "refused",
      reason: "The resolved delivery plan does not belong to the requested work unit.",
    };
  }
  if (input.delivery.status !== "absent") {
    return {
      status: "resolved",
      target: {
        kind: "delivery",
        repository: input.singleton.repository,
        planId: input.delivery.planId,
        workUnitId: workUnit,
      },
    };
  }
  return {
    status: "resolved",
    target: { kind: "pinned-head", ...input.singleton },
  };
}

/** Close singleton frontline after an accepted skip or a terminal frontline/standard admission. */
export async function singletonFrontlinePhaseClosed(
  store: Pick<ReviewOperationStateStore, "readOperation">,
  input: {
    repositoryId: string;
    candidateIds: readonly string[];
    readSettledFindingsAdvice?: (producerId: string) => Promise<FrontlineFollowUpAdvice>;
  },
): Promise<boolean> {
  if (await readSingletonFrontlinePhaseClosure(store, input) !== null) return true;
  for (const id of input.candidateIds) {
    const standardOwner = await readLaneProgressOwner(store, {
      lane: "standard", repositoryId: input.repositoryId, headSha: "",
      lineage: { kind: "candidate", candidateId: id },
    });
    if (standardOwner?.attempts.length) return true;
    const frontlineOwner = await readLaneProgressOwner(store, {
      lane: "frontline", repositoryId: input.repositoryId, headSha: "",
      lineage: { kind: "candidate", candidateId: id },
    });
    for (const attempt of frontlineOwner?.attempts ?? []) {
      if (!attempt.terminalProducer) continue;
      if (attempt.outcome === "clean") return true;
      if (attempt.outcome === "settled-findings" && input.readSettledFindingsAdvice !== undefined
        && (await input.readSettledFindingsAdvice(attempt.attemptId)).action === "stop") return true;
    }
  }
  return false;
}

/** Bind private-member applicability to the live planned member, which has no PR selector. */
function createPrivateMemberApplicability(input: {
  settings: () => Promise<Awaited<ReturnType<typeof readConfigSettings>>["settings"]>;
  rawGit: RawGitExec;
  targetDependencies: PreBindingDeliveryReviewTargetDependencies;
}) {
  const readDeliveryTargets = async (workUnit: string) => composePreBindingDeliveryReviewTargets({
    workUnitId: workUnit,
    baseRef: (await input.settings())["branch.base"],
  }, input.targetDependencies);
  const confirm = async (
    workUnit: string,
    predecessor: ReviewResult,
    currentTarget: ReviewTarget,
    currentLineage: Extract<Parameters<PrePublicationCompositionDependencies["confirmPriorProducerApplicability"]>[3],
      { kind: "delivery-member" }>,
  ): Promise<IncrementalPredecessorApplicability> => confirmDeliveryMemberIncrementalApplicability({
    predecessor,
    currentTarget,
    currentLineage,
    exec: input.rawGit,
    observeTarget: async () => {
      const read = await readDeliveryTargets(workUnit);
      const matches = read.status === "composed" ? read.targets.filter(({ vehicle }) => (
        vehicle.planId === currentLineage.planId
        && vehicle.deliverableId === currentLineage.deliverableId
        && vehicle.workUnitId === currentLineage.workUnitId
      )) : [];
      const match = matches.length === 1 ? matches[0] : undefined;
      if (match === undefined) throw new Error("The current delivery-member target is unavailable.");
      return match.target;
    },
  });
  return { readDeliveryTargets, confirm };
}

/**
 * Bind the canonical Candidate, meta, host, identity, and durable-progress reads to the composition.
 *
 * @param input - The repository root and its Git boundary.
 * @returns The dependency bundle `composePrePublicationReviewRequest` consumes.
 */
export function createPrePublicationCompositionDependencies(input: {
  cwd: string;
  exec: GitExec;
}): PrePublicationCompositionDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = async () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return (await settingsPromise).settings;
  };
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const rawGit = createRawGitExec(input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  const resultReader = createRepositoryReviewResultReader(publisher);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup(input);
  const deliveryReviewTargetDependencies = createPreBindingDeliveryReviewTargetDependencies(input);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };
  const observeTarget = async (): Promise<ReviewTarget> => {
    const baseRef = (await settings())["branch.base"].trim();
    const headSha = (await input.exec(
      "git", ["rev-parse", "HEAD"], { cwd: input.cwd },
    )).stdout.trim();
    const diffBaseSha = await resolvePrePublicationDiffBase({
      exec: input.exec, cwd: input.cwd, baseRef, headSha,
    });
    return deriveLocalReviewTargetFromCoordinates({
      exec: input.exec,
      cwd: input.cwd,
      repositoryId: await repositoryId(),
      coordinates: { kind: "change-set", baseRef, diffBaseSha, headSha },
    });
  };
  const { readDeliveryTargets, confirm: confirmPrivateMemberApplicability } = createPrivateMemberApplicability({
    settings, rawGit,
    targetDependencies: deliveryReviewTargetDependencies,
  });
  const confirmPriorProducerApplicability:
    PrePublicationCompositionDependencies["confirmPriorProducerApplicability"] = async (
      workUnit, predecessor, currentTarget, currentLineage, policyTarget,
    ) => {
      if (currentLineage.kind === "delivery-member") {
        return confirmPrivateMemberApplicability(workUnit, predecessor, currentTarget, currentLineage);
      }
      const candidate = await readCandidateRecord(input.cwd, SlugSchema.parse(workUnit));
      if (policyTarget.pullRequest === null) {
        if (candidate === null) return "unavailable";
        return confirmNoPullRequestCandidatePriorProducer({
          cwd: input.cwd,
          workUnit,
          baseBranch: (await settings())["branch.base"],
          candidate,
          predecessor,
          currentTarget,
          currentLineage,
          exec: input.exec,
          rawExec: rawGit,
          observeTarget,
        });
      }
      return confirmNonDeliveryIncrementalApplicability({
        predecessor,
        currentTarget,
        currentLineage,
        repository: policyTarget.repository,
        pullRequest: policyTarget.pullRequest,
        candidate,
        exec: rawGit,
        observeTarget,
      });
    };

  return {
    resultReader,
    dispositionStore,
    readResponsePerformance: (predecessor) => readLaneResponsePerformance(store, predecessor),
    confirmIncrementalApplicability: (workUnit, predecessor, current, policyTarget) =>
      confirmPriorProducerApplicability(
        workUnit, predecessor, current.target, current.admission.lineage, policyTarget,
      ),
    confirmPriorProducerApplicability,
    readCandidate: async (workUnit): Promise<CandidateRead> => {
      const name = SlugSchema.parse(workUnit);
      const record = await readCandidateRecord(input.cwd, name);
      if (record === null) return { status: "missing" };
      let supersessionAncestors: readonly CandidateSupersessionAncestor[];
      try {
        supersessionAncestors = await readRepositoryCandidateSupersessionChain({
          cwd: input.cwd, workUnit: name, record, exec: input.exec,
        });
      } catch (error) {
        return { status: "blocked", reason: `Candidate supersession cannot be validated (${describe(error)}).` };
      }
      const effective = await projectGitCandidateEffectiveTarget({
        cwd: input.cwd,
        name,
        baseBranch: (await settings())["branch.base"],
        record,
        exec: input.exec,
        rawExec: rawGit,
      });
      let pending: PendingCandidateReviewFixAuthority = { status: "none" };
      if (effective.state === "changed" || effective.state === "decision-required") {
        try {
          pending = await readPendingCandidateReviewFixAuthority({
            cwd: input.cwd,
            exec: input.exec,
            workUnitId: name,
            candidate: record,
          });
        } catch (error) {
          return {
            status: "blocked",
            reason: `Candidate review-fix authority could not be read (${describe(error)}).`,
          };
        }
      }
      return projectPrePublicationCandidateRead({ record, effective, pending, supersessionAncestors });
    },

    readAssurance: async (workUnit): Promise<AssuranceRead> => {
      const metaPath = materializeArcPath(input.cwd, resolveArcPath({
        kind: "work-unit-artifact",
        placement: { kind: "active", scope: { kind: "project" } },
        slug: SlugSchema.parse(workUnit),
        artifact: "meta",
      }));
      let content: string;
      try {
        content = await readFile(metaPath, "utf8");
      } catch {
        return { status: "refused", reason: `No active meta record exists for \`${workUnit}\`.` };
      }
      const meta = toMetaRecord(parseMetaRecord(content));
      if (meta === null) {
        return { status: "refused", reason: `The active meta record for \`${workUnit}\` is incomplete.` };
      }
      const composed = composeWorkUnitReviewAssurance(
        meta,
        createLocalReviewMethodFilePort({ cwd: input.cwd }),
        createLocalReviewRubricBindingPort({ cwd: input.cwd }),
      );
      if (composed.status === "refused") {
        return {
          status: "refused",
          reason: `The work unit's review rubric could not be bound: ${composed.diagnostics.join("; ")}`,
        };
      }
      return {
        status: "resolved",
        assurance: composed.assurance.assurance,
        activity: composed.assurance.activity,
      };
    },

    resolveTarget: async (headSha): Promise<TargetRead> => {
      const port = createGhChangeRequestResolutionPort(input.exec, input.cwd);
      let repository: string;
      try {
        repository = await port.resolveRepository();
      } catch (error) {
        return {
          status: "refused",
          reason: `The origin repository coordinates could not be resolved: ${describe(error)}`,
        };
      }
      const headRef = await getCurrentBranch(input.exec);
      if (headRef === null) {
        return { status: "refused", reason: "Pre-publication review requires an attached branch." };
      }
      // Only an open change request at this exact head binds a pull request. Every other
      // disposition — including a host the resolver could not reach — leaves the target unbound,
      // which reserves the hosted source rather than letting a lower-ranked local carrier take its
      // place.
      const changeRequest = await resolveChangeRequest({
        headRef,
        headSha,
        baseRef: (await settings())["branch.base"],
        acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(deliveryMemberLookup, headSha),
      }, port);
      return {
        status: "resolved",
        target: {
          repository,
          pullRequest: changeRequest.state === "open" ? changeRequest.candidate.number : null,
          headSha,
        },
      };
    },

    readReservationTarget: async (workUnit, singleton): Promise<ReservationTargetRead> => {
      const base = (await settings())["branch.base"].trim();
      const delivery = await deliveryMemberLookup.resolveReservationRecords(
        workUnit,
        base === ""
          ? { status: "unestablished" }
          : { status: "established", ref: `refs/heads/${base}` },
      );
      return selectPrePublicationReservationTarget({
        workUnit,
        singleton,
        delivery: delivery.status === "planned" || delivery.status === "bound"
          ? {
              status: delivery.status,
              planId: delivery.plan.planId,
              workUnitId: delivery.plan.workUnitId,
            }
          : delivery,
      });
    },

    readDeliveryReviewTargets: readDeliveryTargets,

    deriveImmutableTarget: async (headSha): Promise<ImmutableTargetRead> => {
      try {
        const baseRef = (await settings())["branch.base"].trim();
        // Publication may intentionally keep operational projections staged. Pin the immutable
        // review target to the Candidate commit instead of requiring a clean checkout around it.
        const diffBaseSha = await resolvePrePublicationDiffBase({
          exec: input.exec, cwd: input.cwd, baseRef, headSha,
        });
        return {
          status: "resolved",
          target: await deriveLocalReviewTargetFromCoordinates({
            exec: input.exec,
            cwd: input.cwd,
            repositoryId: await repositoryId(),
            coordinates: { kind: "change-set", baseRef, diffBaseSha, headSha },
          }),
        };
      } catch (error) {
        return { status: "unavailable", reason: describe(error) };
      }
    },

    readOwnerTerminusAuthority: async (workUnit) => {
      const name = SlugSchema.parse(workUnit);
      let live: Awaited<ReturnType<typeof readLocalReviewLiveContext>>;
      try {
        live = await readLocalReviewLiveContext({ exec: input.exec, cwd: input.cwd });
      } catch (error) {
        return { status: "refused", reason: `The Work Unit Owner could not be resolved: ${describe(error)}` };
      }
      if (live.context.workUnit?.identity !== name) {
        return { status: "refused", reason: "The current checkout does not resolve the requested work unit." };
      }
      if (live.context.activeIdentity === null) {
        return { status: "refused", reason: "No active ARC identity is configured for Owner authorization." };
      }
      if (live.context.activeIdentity !== live.context.workUnit.owner) {
        return { status: "refused", reason: "The active identity does not match the Work Unit Owner." };
      }
      return { status: "authorized", ownerIdentity: live.context.workUnit.owner };
    },

    readLaneProgress: async (lane, headSha, lineageHeadShas, lineage, supersessionAncestors = []) => {
      const repository = await repositoryId();
      const current = await readLaneProgressAcrossLineage(store, {
        lane, repositoryId: repository, headSha, lineageHeadShas,
        ...(lineage === undefined ? {} : { lineage }),
      });
      if (lineage?.kind !== "candidate" || supersessionAncestors.length === 0) return current;
      const inherited = await readCandidateInheritedLaneProgress(store, {
        lane, repositoryId: repository, headSha, ancestors: supersessionAncestors,
      });
      if (current.status === "unrecorded") {
        return inherited.inheritedCompletedPasses === 0 && inherited.inheritedCompletePasses === 0
          ? current
          : {
              status: "recorded", completedPasses: inherited.inheritedCompletedPasses,
              completePasses: inherited.inheritedCompletePasses, attempts: [],
            };
      }
      return {
        ...current,
        completedPasses: current.completedPasses + inherited.inheritedCompletedPasses,
        completePasses: current.completePasses + inherited.inheritedCompletePasses,
      };
    },
    readSingletonFrontlinePhaseClosed: async (candidateId, ancestors) => {
      const repository = await repositoryId();
      const candidateIds = [candidateId, ...ancestors.map(({ candidateId: id }) => id)];
      return singletonFrontlinePhaseClosed(store, {
        repositoryId: repository, candidateIds,
        readSettledFindingsAdvice: async (producerId) => {
          const result = await resultReader.readResult(producerId);
          if (result.kind !== "frontline") {
            throw new Error("settled frontline owner does not match its immutable result");
          }
          const dispositions = await dispositionStore.readDispositionRecord(producerId);
          if (dispositions === null) {
            throw new Error("settled frontline findings lack an approved disposition record");
          }
          return projectFrontlineFollowUpAdvice({
            outcome: result.outcome,
            dispositionState: currentApprovedDispositionNode(dispositions).approvedDisposition,
          });
        },
      });
    },

    readLanePolicy: async (lane) => resolveConfiguredLanePolicy({
      lane,
      settings: await settings(),
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: input.cwd,
        exec: input.exec,
        readFile: (path) => readFile(path, "utf8"),
      }),
    }),
  };
}
