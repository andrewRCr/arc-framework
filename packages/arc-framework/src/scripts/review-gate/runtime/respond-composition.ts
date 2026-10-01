/** Production assembly for approved review dispositions. */

import { readFile } from "node:fs/promises";

import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
import { readConfigSettings } from "../../../lib/config/status-reader.js";
import {
  projectTransientInFlightRead,
  readTransientInFlightIndexes,
} from "../../../lib/errand/record.js";
import type { GitExec } from "../../../lib/git/exec.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import type { DeliveryReviewMemberVehicle } from "../../../lib/delivery/review-vehicle.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
  readCandidateRecord,
  readCandidateRecordVersioned,
  resolveCandidateRecordRelativePath,
  writeCandidateRecord,
} from "../../../lib/work-unit/candidate-record-store.js";
import {
  CandidateManagedRecordV1Schema,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import {
  projectGitCandidateEffectiveTarget,
  readGitCandidateTargetBase,
} from "../../../lib/work-unit/git-candidate-effective-target.js";
import {
  CandidateSubjectUncollectableError,
  collectGitCandidateSubject,
  collectUnstagedReviewablePaths,
} from "../../../lib/work-unit/git-candidate-subject.js";
import {
  confirmCurrentDispositionSet,
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import {
  bindHostedAttemptDisposition,
  captureConditionalNextPassAuthorization,
  HostedDispositionSupersessionError,
  inspectConditionalNextPassInvalidation,
  inspectHostedAttemptDispositionSupersession,
  invalidateConditionalNextPassAuthorization,
  recordLaneResponsePerformance,
  readLaneResponsePerformance,
  settleLaneAttempt,
  supersedeHostedAttemptDisposition,
  withdrawConditionalNextPassAuthorization,
} from "../lane-progress.js";
import { createRepositoryReviewResultReader } from
  "../hosts/local/review-result-reader-composition.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { LocalReviewAuthorityError } from "../hosts/local/review-authority.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import {
  composeDeliveryMemberTarget,
  confirmLocalReviewCorrectionTarget,
  deriveLocalReviewTarget,
  deriveLocalReviewTargetFromCoordinates,
  LocalTargetDerivationError,
} from "../hosts/local/repository-target.js";
import { withRepositoryReviewOperationLock } from "../hosts/local/git-common-state.js";
import { CandidateBoundMemberFixAuthoringSchema } from "../core/review-command-envelope.js";
import type { RespondCommandDependencies } from "./respond-command.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";
import {
  resolveCandidateMutationOwner,
  resolveCompletedCandidateWorkUnits,
} from "../../../handlers/candidate-mutation-owner.js";
import { resolveConfiguredLanePolicy } from "../policy/lane-policy-config.js";
import { resolveEvidenceBoundReviewPolicyContinuation } from
  "../policy/review-policy-evidence.js";
import {
  confirmDeliveryMemberIncrementalApplicability,
  confirmNonDeliveryIncrementalApplicability,
} from
  "../policy/local-review-coverage-selection.js";
import {
  confirmNoPullRequestCandidatePriorProducer,
  createPreBindingDeliveryReviewTargetDependencies,
} from
  "../policy/pre-publication-composition.js";
import { composePreBindingDeliveryReviewTargets } from
  "../policy/pre-publication-delivery-targets.js";
import type { ReviewResult } from "../core/review-result.js";
import { createLocalFrontlineSourcePreferenceReader } from
  "../hosts/local/frontline-source-preferences.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { resolveChangeRequest } from "../change-request.js";
import { confirmIncrementalPredecessorApplicability } from
  "../policy/hosted-reservation-support.js";
import type { IncrementalPredecessorApplicability } from
  "../policy/incremental-coverage-basis.js";
import { stageSingletonPublicationResponse } from "./singleton-publication-response.js";

/**
 * Report a subject the branch and its base leave uncollectable under the boundary's own precondition type.
 *
 * The projection raises this condition rather than returning it, so a caller awaiting it beside the
 * collection never reaches the collection's own arm. Naming it here keeps the reader told which repository
 * condition stopped the derivation instead of that something failed.
 */
function rethrowUncollectableSubject(error: unknown): never {
  if (error instanceof CandidateSubjectUncollectableError) {
    throw new LocalTargetDerivationError("ambiguous-merge-base", error.message);
  }
  throw error;
}

/** Bind local policy coordinates to the live branch and change request, as local admission does. */
export async function resolveRespondPolicyTarget(
  input: { exec: GitExec; cwd: string },
  current: ReviewResult,
  baseRef: string,
): Promise<{ repository: string; pullRequest: number | null } | null> {
  if (current.kind === "hosted") return current.hostedTarget;
  if (current.kind !== "attested-local") return null;
  const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: input.cwd,
  })).stdout.trim();
  if (branch === "" || branch === "HEAD") return null;
  const changeRequest = await resolveChangeRequest({
    headRef: branch,
    headSha: current.target.headSha,
    baseRef,
  }, createGhChangeRequestResolutionPort(input.exec, input.cwd));
  if (changeRequest.state === "blocked" || changeRequest.state === "ambiguous") return null;
  if (changeRequest.state === "none") {
    return { repository: `local/${current.repositoryId}`, pullRequest: null };
  }
  return {
    repository: changeRequest.targetRef.repository,
    pullRequest: changeRequest.state === "open" ? changeRequest.candidate.number : null,
  };
}

/** Select only the unique managed Candidate that owns the immutable producer lineage. */
async function readRespondCandidate(
  input: { exec: GitExec; cwd: string },
  current: ReviewResult,
): Promise<{ workUnit: string; record: CandidateManagedRecordV1 } | null> {
  const lineage = current.admission.lineage;
  if (lineage.kind !== "candidate") return null;
  const owner = await resolveCandidateMutationOwner(input);
  const workUnits = owner.status === "owned"
    ? [owner.workUnit]
    : owner.status === "unowned" ? await resolveCompletedCandidateWorkUnits(input.cwd) : [];
  const candidates = await Promise.all(workUnits.map(async (workUnit) => ({
    workUnit,
    record: await readCandidateRecord(input.cwd, workUnit),
  })));
  const matching = candidates.filter(({ record }) =>
    record?.attestation.candidateId === lineage.candidateId);
  const selected = matching.length === 1 ? matching[0] : undefined;
  return selected?.record == null ? null : { workUnit: selected.workUnit, record: selected.record };
}

/** Observe the exact planned or bound member while D4 reads both contribution endpoints. */
async function confirmRespondDeliveryMemberApplicability(input: {
  readonly repository: { exec: GitExec; cwd: string };
  readonly predecessor: ReviewResult;
  readonly current: ReviewResult;
  readonly lineage: Extract<ReviewResult["admission"]["lineage"], { kind: "delivery-member" }>;
  readonly pullRequest: number | null;
  readonly baseRef: string;
  readonly rawGit: RawGitExec;
  readonly deliveryMembers: RepositoryDeliveryMemberLookup;
  readonly privateDeliveryTargets: ReturnType<typeof createPreBindingDeliveryReviewTargetDependencies>;
}): Promise<IncrementalPredecessorApplicability> {
  const observeTarget = async () => {
    const { lineage } = input;
    if (input.pullRequest === null) {
      // Private members have no PR selector; verify their current planned member directly.
      const read = await composePreBindingDeliveryReviewTargets({
        workUnitId: lineage.workUnitId,
        baseRef: input.baseRef,
      }, input.privateDeliveryTargets);
      const matches = read.status === "composed" ? read.targets.filter(({ vehicle }) => (
        vehicle.planId === lineage.planId
        && vehicle.deliverableId === lineage.deliverableId
        && vehicle.workUnitId === lineage.workUnitId
      )) : [];
      const match = matches.length === 1 ? matches[0] : undefined;
      if (match === undefined) throw new Error("The private delivery member moved.");
      return match.target;
    }
    const read = await input.deliveryMembers.resolveDischargeTargets(lineage.workUnitId);
    const matches = read.status === "resolved" ? read.targets.filter((member) => (
      member.planId === lineage.planId
      && member.deliverableId === lineage.deliverableId
      && member.workUnitId === lineage.workUnitId
      && member.changeRequestId === String(input.pullRequest)
    )) : [];
    const match = matches.length === 1 ? matches[0] : undefined;
    if (match === undefined) throw new Error("The hosted delivery member moved.");
    return composeDeliveryMemberTarget({
      exec: input.repository.exec,
      cwd: input.repository.cwd,
      baseRef: input.baseRef,
      repositoryId: input.current.target.repositoryId,
      member: match,
    });
  };
  return confirmDeliveryMemberIncrementalApplicability({
    predecessor: input.predecessor,
    currentTarget: input.current.target,
    currentLineage: input.lineage,
    exec: input.rawGit,
    observeTarget,
  });
}

function samePinnedMember(
  member: { planId: string; deliverableId: string; workUnitId: string; head: string },
  vehicle: DeliveryReviewMemberVehicle,
): boolean {
  return member.planId === vehicle.planId
    && member.deliverableId === vehicle.deliverableId
    && member.workUnitId === vehicle.workUnitId
    && member.head === vehicle.head;
}

async function observePrivatePinnedMember(input: {
  result: ReviewResult;
  vehicle: DeliveryReviewMemberVehicle;
  privateDeliveryTargets: ReturnType<typeof createPreBindingDeliveryReviewTargetDependencies>;
}): Promise<ReviewResult["target"] | null> {
  const read = await composePreBindingDeliveryReviewTargets({
    workUnitId: input.vehicle.workUnitId,
    baseRef: input.result.target.baseRef,
  }, input.privateDeliveryTargets);
  const matches = read.status === "composed" ? read.targets.filter(({ vehicle: member }) =>
    samePinnedMember(member, input.vehicle)) : [];
  return matches.length === 1 ? matches[0]?.target ?? null : null;
}

async function observePublicPinnedMember(input: {
  result: ReviewResult;
  vehicle: DeliveryReviewMemberVehicle;
  pullRequest: number;
  exec: GitExec;
  cwd: string;
  deliveryMembers: RepositoryDeliveryMemberLookup;
}): Promise<ReviewResult["target"] | null> {
  const read = await input.deliveryMembers.resolveDischargeTargets(input.vehicle.workUnitId);
  const matches = read.status === "resolved" ? read.targets.filter((member) =>
    samePinnedMember(member, input.vehicle)
    && member.changeRequestId === String(input.pullRequest)) : [];
  if (matches.length !== 1 || matches[0] === undefined) return null;
  return await composeDeliveryMemberTarget({
    exec: input.exec,
    cwd: input.cwd,
    baseRef: input.result.target.baseRef,
    repositoryId: input.result.target.repositoryId,
    member: matches[0],
  });
}

function pinnedCorrectionVehicle(result: ReviewResult): DeliveryReviewMemberVehicle | null {
  const lineage = result.admission.lineage;
  if (result.target.kind !== "delivery-member" || lineage.kind !== "delivery-member") return null;
  const vehicle = result.kind === "hosted" ? result.vehicle
    : result.kind === "attested-local" ? result.deliveryAdmission?.vehicle
      : result.responseBinding?.deliveryMember;
  return vehicle !== undefined
    && vehicle.planId === lineage.planId
    && vehicle.deliverableId === lineage.deliverableId
    && vehicle.workUnitId === lineage.workUnitId
    && vehicle.head === result.target.headSha ? vehicle : null;
}

/** Re-observe the planned member itself; a successor checkout may have a different HEAD. */
async function observePinnedCorrectionMember(input: {
  readonly result: ReviewResult;
  readonly exec: GitExec;
  readonly cwd: string;
  readonly deliveryMembers: RepositoryDeliveryMemberLookup;
  readonly privateDeliveryTargets: ReturnType<typeof createPreBindingDeliveryReviewTargetDependencies>;
}): Promise<ReviewResult["target"] | null> {
  const { result } = input;
  const vehicle = pinnedCorrectionVehicle(result);
  if (vehicle === null) return null;
  const pullRequest = result.kind === "hosted" ? result.hostedTarget.pullRequest
    : result.kind === "attested-local" ? result.deliveryAdmission?.target.pullRequest : null;
  try {
    if (pullRequest === null || pullRequest === undefined) {
      return await observePrivatePinnedMember({
        result,
        vehicle,
        privateDeliveryTargets: input.privateDeliveryTargets,
      });
    }
    return await observePublicPinnedMember({
      result,
      vehicle,
      pullRequest,
      exec: input.exec,
      cwd: input.cwd,
      deliveryMembers: input.deliveryMembers,
    });
  } catch {
    return null;
  }
}

/** Bind respond to repository-common records and trusted local/runtime identities. */
export function createRespondDependencies(input: {
  exec: GitExec;
  cwd: string;
}): RespondCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const rawGit = createRawGitExec(input.cwd);
  const prepare = createLocalPrepareDependencies(input);
  const dispositionStore = new LocalApprovedDispositionRecordStore(publisher);
  const deliveryMembers = new RepositoryDeliveryMemberLookup(input);
  const privateDeliveryTargets = createPreBindingDeliveryReviewTargetDependencies(input);
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = async () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return (await settingsPromise).settings;
  };
  const readConfiguredLanePolicy: RespondCommandDependencies["readConfiguredLanePolicy"] = async (lane) =>
    resolveConfiguredLanePolicy({
      lane,
      settings: await settings(),
      preferences: createLocalFrontlineSourcePreferenceReader({
        cwd: input.cwd,
        exec: input.exec,
        readFile: (path) => readFile(path, "utf8"),
      }),
    });
  const transitionPrefixes = (record: CandidateManagedRecordV1): CandidateManagedRecordV1[] =>
    Array.from({ length: record.transitions.length + 1 }, (_, length) =>
      CandidateManagedRecordV1Schema.parse({
        ...record,
        transitions: record.transitions.slice(0, length),
        lineageAttestations: [],
      }));
  const completedWorkUnits = (): Promise<readonly string[]> =>
    resolveCompletedCandidateWorkUnits(input.cwd);
  const candidateMutationOwner = () => resolveCandidateMutationOwner({
    cwd: input.cwd,
    exec: input.exec,
  });
  const requireCandidateMutationOwner = async (workUnit: string): Promise<void> => {
    const owner = await candidateMutationOwner();
    if (owner.status === "owned" && owner.workUnit === workUnit) return;
    if (owner.status === "unowned" && (await completedWorkUnits()).includes(workUnit)) return;
    throw new Error("Candidate mutation is not owned by the entering checkout.");
  };
  return {
    withOperationLock: (operationId, action) => withRepositoryReviewOperationLock(
      input.exec,
      input.cwd,
      operationId,
      10_000,
      action,
    ),
    resultReader: createRepositoryReviewResultReader(publisher),
    dispositionStore,
    confirmTarget: (target) => prepare.confirmTarget(target),
    confirmCorrectionTarget: (target, expectedFixPaths) => confirmLocalReviewCorrectionTarget({
      exec: input.exec,
      cwd: input.cwd,
      attemptedTarget: target,
      expectedFixPaths,
    }),
    confirmPinnedDeliveryMemberTarget: (result) => observePinnedCorrectionMember({
      result,
      exec: input.exec,
      cwd: input.cwd,
      deliveryMembers,
      privateDeliveryTargets,
    }),
    resolveLocalActors: async (evaluatorIdentity, admittedAuthorIdentity) => {
      try {
        const { authority } = await prepare.resolveAuthority(evaluatorIdentity);
        return {
          approverIdentity: authority.authorIdentity,
          proposerIdentity: authority.runtimeIdentity,
        };
      } catch (error) {
        if (!(error instanceof LocalReviewAuthorityError)
          || error.reason !== "vehicle-unresolved"
          || admittedAuthorIdentity === undefined) throw error;
        const live = await readLocalReviewLiveContext(input);
        if (live.context.activeIdentity !== admittedAuthorIdentity) {
          throw new LocalReviewAuthorityError("active-identity-owner-mismatch");
        }
        return {
          approverIdentity: admittedAuthorIdentity,
          proposerIdentity: `arc-cli/${getFrameworkVersion()}`,
        };
      }
    },
    resolveFrontlineActors: async () => {
      const live = await readLocalReviewLiveContext(input);
      if (live.context.activeIdentity === null) throw new Error("active-identity-missing");
      return {
        approverIdentity: live.context.activeIdentity,
        proposerIdentity: `arc-cli/${getFrameworkVersion()}`,
      };
    },
    resolveActiveErrand: async () => {
      const live = await readLocalReviewLiveContext(input);
      if (live.context.activeIdentity === null || live.context.errand === null) return null;
      const branch = (await input.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: input.cwd,
      })).stdout.trim();
      const projected = projectTransientInFlightRead(await readTransientInFlightIndexes({
        exec: input.exec,
        identity: live.context.activeIdentity,
      }));
      if (!projected.complete) throw new Error(projected.degraded ?? "Transient identity authority is incomplete.");
      const matching = projected.indexes.records.filter((record) => (
        record.kind === "errand"
        && record.purpose === "errand"
        && record.state === "open"
        && record.slug === live.context.errand?.identity
        && record.branch === branch
      ));
      const record = matching.length === 1 ? matching[0] : undefined;
      return record?.kind === "errand" && record.purpose === "errand"
        ? { key: record.slug, claimId: record.claimId, branch: record.branch }
        : null;
    },
    resolveDeliveryMemberFixTarget: async ({ vehicle, originatingTarget, hostedTarget }) => {
      try {
        if (originatingTarget.kind !== "delivery-member"
          || originatingTarget.headSha !== vehicle.head
          || hostedTarget.headSha !== vehicle.head) return null;
        const resolution = await deliveryMembers.resolveDischargeTargets(vehicle.workUnitId);
        if (resolution.status !== "resolved") return null;
        const matching = resolution.targets.filter((target) => (
          target.planId === vehicle.planId
          && target.deliverableId === vehicle.deliverableId
          && target.workUnitId === vehicle.workUnitId
          && target.changeRequestId === String(hostedTarget.pullRequest)
        ));
        const member = matching.length === 1 ? matching[0] : undefined;
        if (member === undefined) return null;
        const currentTarget = await composeDeliveryMemberTarget({
          exec: input.exec,
          cwd: input.cwd,
          baseRef: originatingTarget.baseRef,
          repositoryId: originatingTarget.repositoryId,
          member,
        });
        return {
          currentTarget,
          hostedFixTarget: { ...hostedTarget, headSha: member.head },
        };
      } catch {
        return null;
      }
    },
    resolveCandidateFixAuthoring: async ({ workUnit, expectedHead }) => {
      const owner = await candidateMutationOwner();
      if (owner.status !== "owned" || owner.workUnit !== workUnit) return null;
      let ref: string;
      try {
        ref = (await input.exec("git", ["symbolic-ref", "--quiet", "HEAD"], {
          cwd: input.cwd,
        })).stdout.trim();
      } catch {
        return null;
      }
      if (!ref.startsWith("refs/heads/") || ref === "refs/heads/") return null;
      const head = (await input.exec("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
        cwd: input.cwd,
      })).stdout.trim();
      if (head !== expectedHead) return null;
      return CandidateBoundMemberFixAuthoringSchema.parse({
        kind: "candidate",
        workUnit,
        head,
        ref,
        checkoutPath: input.cwd,
        deliverySuffixReconstruction: "after-candidate-advance",
      });
    },
    now: () => new Date().toISOString(),
    readCandidateLineage: async (target) => {
      const owner = await candidateMutationOwner();
      const candidates = owner.status === "owned"
        ? [owner.workUnit]
        : owner.status === "unowned"
          ? await completedWorkUnits()
          : [];
      const matching = [] as Array<{
        workUnit: string;
        record: NonNullable<Awaited<ReturnType<typeof readCandidateRecordVersioned>>["record"]>;
        version: string;
        reviewed: Awaited<ReturnType<typeof projectGitCandidateEffectiveTarget>> & { state: "current" };
      }>;
      const baseBranch = (await settings())["branch.base"];
      const reviewedBase = await readGitCandidateTargetBase({
        cwd: input.cwd,
        revision: target.headSha,
        baseBranch,
        exec: input.exec,
      });
      if (reviewedBase.status !== "resolved") {
        // Under the boundary's own precondition type, not an anonymous failure: a history leaving two equally
        // good ancestors is a fact about the repository the operator can act on, and reporting it as an
        // unexplained error tells them the respond failed and nothing about what stopped it.
        throw new LocalTargetDerivationError(
          "ambiguous-merge-base",
          "The reviewed Candidate target's base is not a single coordinate.",
        );
      }
      for (const workUnit of candidates) {
        const { record, version } = await readCandidateRecordVersioned(input.cwd, workUnit);
        if (record === null || version === null) continue;
        const projections = await Promise.all(transitionPrefixes(record).map(async (prefix) =>
          projectGitCandidateEffectiveTarget({
            cwd: input.cwd,
            name: workUnit,
            baseBranch,
            record: prefix,
            exec: input.exec,
            rawExec: rawGit,
            target: { revision: target.headSha, currentBase: reviewedBase.base },
          })));
        const reviewed = [...projections].reverse().find((projection) =>
          projection.state === "current" && projection.recognizedTarget.revision === target.headSha);
        if (reviewed?.state === "current") {
          matching.push({ workUnit, record, version, reviewed });
        }
      }
      if (matching.length !== 1) return null;
      const selected = matching[0];
      if (selected === undefined) return null;
      const currentSettings = await settings();
      const [effective, collected, unstagedReviewablePaths] = await Promise.all([
        projectGitCandidateEffectiveTarget({
          cwd: input.cwd,
          name: selected.workUnit,
          baseBranch: currentSettings["branch.base"],
          record: selected.record,
          exec: input.exec,
          rawExec: rawGit,
        }),
        collectGitCandidateSubject({
          cwd: input.cwd,
          name: selected.workUnit,
          baseBranch: currentSettings["branch.base"],
          exec: input.exec,
        }),
        collectUnstagedReviewablePaths({
          cwd: input.cwd,
          name: selected.workUnit,
          exec: input.exec,
        }),
      ]).catch(rethrowUncollectableSubject);
      if (collected.status !== "collected") {
        throw new LocalTargetDerivationError(
          "ambiguous-merge-base",
          "The Candidate fix target's subject could not be collected.",
        );
      }
      const current = collected.target;
      const candidateFixTarget = await deriveLocalReviewTargetFromCoordinates({
        exec: input.exec,
        cwd: input.cwd,
        repositoryId: target.repositoryId,
        coordinates: {
          kind: target.kind,
          baseRef: target.baseRef,
          diffBaseSha: target.diffBaseSha,
          headSha: current.revision,
        },
      });
      return {
        workUnit: selected.workUnit,
        record: selected.record,
        recordVersion: selected.version,
        reviewed: selected.reviewed,
        effective,
        current,
        candidateFixTarget,
        unstagedReviewablePaths,
      };
    },
    // Staged like the record `attest` publishes: the Candidate's own projection never enters the
    // reviewable subject, so staging it advances the lineage without disturbing what review sees.
    appendCandidateResponse: async ({ workUnit, record, expectedRecordVersion }) => {
      await requireCandidateMutationOwner(workUnit);
      const recordPath = await writeCandidateRecord(input.cwd, workUnit, record, expectedRecordVersion);
      await input.exec("git", ["add", "--", recordPath], { cwd: input.cwd });
      return { recordPath };
    },
    stageCandidateResponse: async (workUnit) => {
      await requireCandidateMutationOwner(workUnit);
      const recordPath = resolveCandidateRecordRelativePath(workUnit);
      await input.exec("git", ["add", "--", recordPath], { cwd: input.cwd });
      return { recordPath };
    },
    rebindSingletonPublicationResponse: async ({ workUnit, response, requirePublished }) => {
      await requireCandidateMutationOwner(workUnit);
      await stageSingletonPublicationResponse({
        cwd: input.cwd,
        exec: input.exec,
        workUnit,
        response,
        requirePublished,
      });
    },
    settleLaneFindings: async (settlement) => {
      await settleLaneAttempt(prepare.operationStore, {
        ...settlement,
        now: new Date().toISOString(),
      });
    },
    recordResponsePerformance: async (performance) => {
      await recordLaneResponsePerformance(prepare.operationStore, {
        ...performance,
        now: new Date().toISOString(),
      });
    },
    readResponsePerformance: (result) => readLaneResponsePerformance(prepare.operationStore, result),
    bindHostedDisposition: async (binding) => {
      await bindHostedAttemptDisposition(prepare.operationStore, {
        ...binding,
        now: new Date().toISOString(),
      });
    },
    readConfiguredLanePolicy,
    resolvePolicy: async (request, confirmedProducerTarget) => {
      const configured = await readConfiguredLanePolicy(request.lane);
      const currentSettings = await settings();
      const retainedSources = configured.sources.length === 0
        ? [...new Set(request.attempts.map(({ sourceId }) => sourceId))]
        : configured.sources;
      const confirmIncrementalApplicability = async (
        predecessor: ReviewResult,
        current: ReviewResult,
      ) => {
        if (current.target.kind === "delivery-member"
          && canonicalize(predecessor.target) === canonicalize(current.target)) {
          return confirmIncrementalPredecessorApplicability({ predecessor, current });
        }
        const policyTarget = await resolveRespondPolicyTarget(
          input, current, currentSettings["branch.base"],
        );
        if (policyTarget === null
          || policyTarget.repository.toLowerCase() !== request.target.repository.toLowerCase()
          || policyTarget.pullRequest !== request.target.pullRequest) return "unavailable";
        const lineage = current.admission.lineage;
        if (current.target.kind === "delivery-member" && lineage.kind === "delivery-member") {
          return confirmRespondDeliveryMemberApplicability({
            repository: input,
            predecessor,
            current,
            lineage,
            pullRequest: policyTarget.pullRequest,
            baseRef: currentSettings["branch.base"],
            rawGit,
            deliveryMembers,
            privateDeliveryTargets,
          });
        }
        const selected = await readRespondCandidate(input, current);
        const observeTarget = () => deriveLocalReviewTarget({
          exec: input.exec,
          cwd: input.cwd,
          baseRef: currentSettings["branch.base"],
          repositoryId: current.target.repositoryId,
        });
        if (policyTarget.pullRequest === null && selected !== null) {
          return confirmNoPullRequestCandidatePriorProducer({
            cwd: input.cwd,
            workUnit: selected.workUnit,
            baseBranch: currentSettings["branch.base"],
            candidate: selected.record,
            predecessor,
            currentTarget: current.target,
            currentLineage: lineage,
            exec: input.exec,
            rawExec: rawGit,
            observeTarget,
          });
        }
        return confirmNonDeliveryIncrementalApplicability({
          predecessor,
          currentTarget: current.target,
          currentLineage: lineage,
          repository: policyTarget.repository,
          pullRequest: policyTarget.pullRequest,
          candidate: selected?.record ?? null,
          exec: rawGit,
          observeTarget,
        });
      };
      return resolveEvidenceBoundReviewPolicyContinuation(request, {
        terminalResponsePerformed: false,
      }, {
        ...configured,
        sources: retainedSources,
        resultReader: createRepositoryReviewResultReader(publisher),
        dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
        readResponsePerformance: (predecessor) => readLaneResponsePerformance(
          prepare.operationStore,
          predecessor,
        ),
        confirmIncrementalApplicability,
        confirmTarget: (attemptedTarget) => {
          if (canonicalize(attemptedTarget) !== canonicalize(confirmedProducerTarget)) {
            throw new Error("review producer target does not match the confirmed response target");
          }
          return Promise.resolve(confirmedProducerTarget);
        },
      });
    },
    captureConditionalNextPass: async (authorization) => {
      const captured = await captureConditionalNextPassAuthorization(prepare.operationStore, {
        ...authorization,
        now: new Date().toISOString(),
      });
      return { authorizationId: captured.authorizationId };
    },
    withdrawConditionalNextPass: async (withdrawal) => {
      const result = await withdrawConditionalNextPassAuthorization(
        prepare.operationStore,
        { ...withdrawal, now: new Date().toISOString() },
        (producerId, dispositionSetId) => confirmCurrentDispositionSet(
          dispositionStore,
          producerId,
          dispositionSetId,
        ),
      );
      if (result.state === "refused") return result;
      return {
        state: result.state,
        authorizationId: result.authorizationId,
        dispositionSetId: result.dispositionSetId,
      };
    },
    invalidateConditionalNextPass: async (authorization) => {
      await invalidateConditionalNextPassAuthorization(prepare.operationStore, {
        ...authorization,
        now: new Date().toISOString(),
      });
    },
    preflightConditionalNextPassInvalidation: async (authorization) =>
      inspectConditionalNextPassInvalidation(prepare.operationStore, authorization),
    preflightHostedDisposition: async (supersession) => {
      try {
        await inspectHostedAttemptDispositionSupersession(prepare.operationStore, {
          ...supersession,
          now: new Date().toISOString(),
        });
        return { state: "ready" as const };
      } catch (error) {
        if (error instanceof HostedDispositionSupersessionError) {
          return {
            state: "refused" as const,
            reason: "hosted-settlement-conflict" as const,
            detail: error.message,
          };
        }
        throw error;
      }
    },
    supersedeHostedDisposition: async (supersession) => {
      try {
        const result = await supersedeHostedAttemptDisposition(prepare.operationStore, {
          ...supersession,
          now: new Date().toISOString(),
        });
        return {
          state: "advanced" as const,
          carriedFindingIds: result.carriedFindingIds,
          reopenedFindingIds: result.reopenedFindingIds,
        };
      } catch (error) {
        if (error instanceof HostedDispositionSupersessionError) {
          return {
            state: "refused" as const,
            reason: "hosted-settlement-conflict" as const,
            detail: error.message,
          };
        }
        throw error;
      }
    },
  };
}
