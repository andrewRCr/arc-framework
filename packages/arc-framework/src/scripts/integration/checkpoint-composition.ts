/** Production composition for the typed integration checkpoint. */

import { resolve } from "node:path";

import { resolveTaskListPath } from "../../commands/active/status.js";
import { parseMetaRecord } from "../../lib/active/meta-reader.js";
import {
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../../lib/base-drift/current-adapters.js";
import type { RawGitExec } from "../../lib/change-facts.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import {
  analyzeRevisionOverlap,
  observeGitMergeFeasibility,
  resolveIdentity,
  type GitExec,
} from "../../lib/git/index.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { createUserSurfaceResolver } from "../../lib/user-surfaces.js";
import { resolveComposedLifecycleIndex } from "../../lib/work-unit/composed-lifecycle-index.js";
import {
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../lib/work-unit/candidate-attestation.js";
import {
  projectEffectiveCandidateCurrentness,
  type CandidateEffectiveCurrentnessProjection,
  type CandidateEffectiveTargetProjection,
} from "../../lib/work-unit/candidate-effective-target.js";
import {
  readCandidateRecordVersion,
  readCandidateRecordVersioned,
  type VersionedCandidateRecord,
} from "../../lib/work-unit/candidate-record-store.js";
import {
  projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase,
} from "../../lib/work-unit/git-candidate-effective-target.js";
import { collectGitCandidateTarget } from "../../lib/work-unit/git-candidate-subject.js";
import { proveGitDeliveryContribution } from "../../lib/delivery/git-contribution-proof.js";
import { inspectRepositoryDeliveryCandidateRenewal } from "../../lib/delivery/repository-entry.js";
import {
  projectGitDeliveryTerminalCoordinateAdvance,
  projectGitDeliveryTerminalRecordAdvance,
} from "../../lib/delivery/public-review-continuation-git.js";
import { validateDeliveryPublicReviewContinuation } from
  "../../lib/delivery/public-review-continuation.js";
import {
  sameDeliveryReviewMemberIdentity,
  type DeliveryReviewMemberVehicle,
} from "../../lib/delivery/review-vehicle.js";
import {
  assessDeliveryTerminalTop,
  classifyDeliveryTerminalDrift,
} from "../../lib/delivery/terminal-integration.js";
import { RepositoryGitCommonStatePublisher } from "../../lib/git-common-state.js";
import { canonicalize } from "../../lib/kernel/index.js";
import { resolveSlugQuery } from "../../lib/work-unit/lifecycle-query.js";
import {
  readSubmissionBoundary,
  resolveSubmissionBoundaryPath,
} from "../../lib/work-unit/submission-boundary-store.js";
import { GhDeliveryHostPort } from "../delivery/hosts/github.js";
import {
  observeChangeRequestMergeAdmission,
  resolveChangeRequest,
} from "../review-gate/change-request.js";
import { lifecycleArtifactFacts, type ReviewReadinessFact } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { createGhChangeRequestMergeObservationPort } from
  "../review-gate/hosts/github/merge-observation.js";
import { aggregateChecks } from "../review-gate/checks-await.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { GitObjectIdSchema } from "../review-gate/core/gate-contract-v2-schema.js";
import { resolveAcceptableDeliveryBaseRefs } from
  "../review-gate/core/delivery-member-lookup.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { resolveRepositoryIdentity } from "../review-gate/hosts/local/git-common-state.js";
import { createGitTreeReadFs } from "../review-gate/hosts/local/git-tree-fs.js";
import { LocalReviewOperationStateStore } from
  "../review-gate/hosts/local/operation-state-store.js";
import { RepositoryDeliveryMemberLookup } from
  "../review-gate/hosts/local/delivery-member-lookup.js";
import { hostedGhRunner } from "../review-gate/hosted/gh-process.js";
import {
  MergeMethodSchema,
  resolveMergeMethod,
} from "../review-gate/merge-method.js";
import {
  createHostedReservationDischargeReader,
  resolveHostedReservationTargets,
  type HostedReservationDischarge,
} from "../review-gate/policy/hosted-reservation-discharge.js";
import type { DeliveryReviewMemberTerminus } from
  "../review-gate/policy/review-terminus.js";
import {
  projectHostedReservationPolicyProgress,
  type HostedReservationPolicyProgress,
} from "../review-gate/policy/hosted-reservation-admission.js";
import {
  isDeliveryReviewMemberDischargedByOwnerTerminus,
  type DeliveryReviewOwnerTerminusAdvance,
} from "../review-gate/status.js";
import {
  parseIntegrationBoundaryLocus,
  projectCorrectiveDeliveryStatusBoundary,
  projectPublicationBoundary,
} from "../review-gate/policy/integration-boundary-locus.js";
import {
  CheckpointReadyCompositionSchema,
  HOSTED_REVIEW_REQUIREMENT_ID,
  IntegrationLifecycleSummarySchema,
  ValidatedMergeMethodSchema,
  type IntegrationCheckpointDependencies,
  type IntegrationLifecycleSummary,
  type DeliveryDriftClassificationEvidence,
} from "./checkpoint.js";
import { persistIntegrationCheckpointComposition } from "./checkpoint-store.js";
import { createLineageReviewComposer } from "./lineage-review-composition.js";
import { composeCanonicalSettlementPlan } from "./settlement-plan.js";
import { composeDeliveryCheckpointArm } from "./delivery-checkpoint.js";

export interface CachedCandidate {
  record: CandidateManagedRecordV1;
  recordVersion: string;
  effective: CandidateEffectiveTargetProjection;
  currentness: CandidateEffectiveCurrentnessProjection;
}

export interface CheckpointCandidateContext {
  readRecord(workUnit: string): Promise<VersionedCandidateRecord>;
  readEffective(workUnit: string, baseRevision: string): Promise<CachedCandidate | null>;
  assertRecordVersion(workUnit: string): Promise<
    | { readonly status: "unchanged"; readonly recordVersion: string }
    | {
        readonly status: "moved";
        readonly expectedRecordVersion: string;
        readonly observedRecordVersion: string | null;
      }
  >;
}

/** Bind managed Candidate bytes and explicit-base projections to one checkpoint invocation. */
export function createCheckpointCandidateContext(input: {
  readRecord(workUnit: string): Promise<VersionedCandidateRecord>;
  readVersion(workUnit: string): Promise<string | null>;
  project(input: {
    workUnit: string;
    baseRevision: string;
    record: CandidateManagedRecordV1;
    recordVersion: string;
  }): Promise<{
    effective: CandidateEffectiveTargetProjection;
    currentness: CandidateEffectiveCurrentnessProjection;
  }>;
}): CheckpointCandidateContext {
  const records = new Map<string, Promise<VersionedCandidateRecord>>();
  const effective = new Map<string, Promise<CachedCandidate | null>>();
  const readRecord = (workUnit: string): Promise<VersionedCandidateRecord> => {
    let record = records.get(workUnit);
    if (record === undefined) {
      record = input.readRecord(workUnit);
      records.set(workUnit, record);
    }
    return record;
  };
  return {
    readRecord,
    readEffective: (workUnit, baseRevision) => {
      const cacheKey = `${workUnit}\0${baseRevision}`;
      let value = effective.get(cacheKey);
      if (value === undefined) {
        value = (async () => {
          const versioned = await readRecord(workUnit);
          if (versioned.record === null || versioned.version === null) return null;
          const projected = await input.project({
            workUnit,
            baseRevision,
            record: versioned.record,
            recordVersion: versioned.version,
          });
          return {
            record: versioned.record,
            recordVersion: versioned.version,
            ...projected,
          };
        })();
        effective.set(cacheKey, value);
      }
      return value;
    },
    assertRecordVersion: async (workUnit) => {
      const expected = await readRecord(workUnit);
      if (expected.record === null || expected.version === null) {
        throw new Error("The managed Candidate record was not established before checkpoint persistence.");
      }
      const observedVersion = await input.readVersion(workUnit);
      return observedVersion === expected.version
        ? { status: "unchanged", recordVersion: expected.version }
        : {
            status: "moved",
            expectedRecordVersion: expected.version,
            observedRecordVersion: observedVersion,
          };
    },
  };
}

/**
 * Decide whether every exact delivery target has terminal checkpoint review evidence.
 *
 * @param input - Exact targets, raw discharges, policy progress, and retained Owner termini.
 * @returns Whether every member is discharged by raw evidence or an exact applicable Owner terminus.
 */
export function deliveryCheckpointReviewIsDischarged(input: {
  readonly targets: readonly { readonly vehicle: DeliveryReviewMemberVehicle }[];
  readonly discharges: readonly HostedReservationDischarge[];
  readonly progress: readonly HostedReservationPolicyProgress[];
  readonly ownerTermini?: readonly DeliveryReviewMemberTerminus[];
  readonly ownerTerminusAdvances?: readonly DeliveryReviewOwnerTerminusAdvance[];
}): boolean {
  return input.targets.length === input.discharges.length
    && input.targets.length === input.progress.length
    && input.targets.every((target, index) => {
      const discharge = input.discharges[index];
      const progress = input.progress[index];
      if (discharge === undefined || progress?.status !== "complete") return false;
      return discharge.discharged || isDeliveryReviewMemberDischargedByOwnerTerminus({
        target,
        discharge: { ...discharge, completedPasses: progress.completedPasses },
        ownerTermini: input.ownerTermini,
        ownerTerminusAdvances: input.ownerTerminusAdvances,
      });
    });
}

/**
 * Decide whether the open request targets the configured base or its validated delivery predecessor.
 *
 * @param input - Observed request base plus the two authoritative admitted-base sources.
 * @returns True only when one authority admits the observed base.
 */
export function checkpointBaseIsAccepted(input: {
  candidateBaseRef: string;
  configuredBaseRef: string;
  acceptableDeliveryBaseRefs: readonly string[];
}): boolean {
  return input.candidateBaseRef === input.configuredBaseRef
    || input.acceptableDeliveryBaseRefs.includes(input.candidateBaseRef);
}

export type IntegrationLifecycleReadFs = NonNullable<
  Parameters<typeof resolveComposedLifecycleIndex>[0]["fs"]
>;

export interface IntegrationLifecycleStorageSnapshot {
  version: string;
  fs: IntegrationLifecycleReadFs;
}

export interface IntegrationLifecycleStoragePort {
  readSnapshot(): Promise<IntegrationLifecycleStorageSnapshot>;
}

function parseRecord(text: string, path: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path}: malformed JSON`, { cause: error });
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path}: expected an object`);
  }
  return value as Record<string, unknown>;
}

async function currentHead(exec: GitExec, cwd: string): Promise<{ branch: string; head: string }> {
  let branch: string;
  try {
    branch = (await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      objectAccess: "local-only",
    })).stdout.trim();
  } catch {
    throw new Error("The integration checkpoint requires an attached branch.");
  }
  if (branch === "HEAD" || branch === "") {
    throw new Error("The integration checkpoint requires an attached branch.");
  }
  const head = (await exec("git", ["rev-parse", "HEAD"], { cwd, objectAccess: "local-only" })).stdout.trim();
  if (!GitObjectIdSchema.safeParse(head).success) throw new Error("The current integration head is invalid.");
  return { branch, head };
}

function branchName(ref: string): string {
  return ref.replace(/^refs\/heads\//u, "");
}

async function readCoordinate(exec: GitExec, cwd: string, head: string): Promise<{
  readonly head: string;
  readonly tree: string;
} | null> {
  try {
    const [commit, tree] = await Promise.all([
      exec("git", ["rev-parse", "--verify", `${head}^{commit}`], { cwd, objectAccess: "local-only" }),
      exec("git", ["rev-parse", `${head}^{tree}`], { cwd, objectAccess: "local-only" }),
    ]);
    const resolvedHead = commit.stdout.trim();
    const resolvedTree = tree.stdout.trim();
    return resolvedHead === head
      && GitObjectIdSchema.safeParse(resolvedTree).success
      ? { head: resolvedHead, tree: resolvedTree }
      : null;
  } catch {
    return null;
  }
}

async function readDiffPaths(
  rawExec: RawGitExec,
  fromRevision: string,
  throughRevision: string,
): Promise<string[]> {
  const result = await rawExec([
    "diff", "--name-only", "-z", "--no-renames", fromRevision, throughRevision, "--",
  ], { objectAccess: "local-only" });
  const output = new TextDecoder("utf-8", { fatal: true }).decode(result.stdout);
  if (output === "") return [];
  if (!output.endsWith("\0")) throw new Error("Git returned an unterminated path list.");
  return output.slice(0, -1).split("\0");
}

function unavailableDeliveryDrift(
  workUnit: string,
  detail: string,
  evidence: DeliveryDriftClassificationEvidence,
) {
  return {
    status: "unavailable" as const,
    detail,
    evidence,
    nextAction: { command: "rerun-checkpoint" as const, workUnit },
  };
}

async function readGitPaths(exec: GitExec, cwd: string, args: string[]): Promise<string[]> {
  return (await exec("git", args, { cwd, objectAccess: "local-only" })).stdout
    .split("\0")
    .filter((path) => path !== "")
    .sort();
}

async function resolveOpenChangeRequest(exec: GitExec, cwd: string) {
  const target = await currentHead(exec, cwd);
  const baseRef = (await readConfigSettings(cwd)).settings["branch.base"];
  const memberLookup = new RepositoryDeliveryMemberLookup({ exec, cwd });
  const acceptableBaseRefs = await resolveAcceptableDeliveryBaseRefs(memberLookup, target.head);
  const result = await resolveChangeRequest(
    {
      headRef: target.branch,
      headSha: target.head,
      baseRef,
      acceptableBaseRefs,
    },
    createGhChangeRequestResolutionPort(exec, cwd),
  );
  if (result.state !== "open") {
    throw new Error(`The exact integration head has no reusable open change request (${result.state}).`);
  }
  return { changeRequest: result, acceptableBaseRefs };
}

/**
 * Read the lifecycle artifacts the work unit owes before merge. The meta is the only
 * source: an absent index entry leaves the positional read to refuse on its own terms
 * rather than manufacturing an artifact verdict from a work unit that is in no tier.
 */
async function readLifecycleArtifactFacts(
  cwd: string,
  metaPath: string | null,
  fs: { readFile(path: string): Promise<string> },
): Promise<ReviewReadinessFact[]> {
  if (metaPath === null) return [];
  let content: string;
  try {
    content = await fs.readFile(resolve(cwd, metaPath));
  } catch {
    return [{
      code: "unreadable-artifact",
      path: metaPath,
      message: "The work-unit meta could not be read, so its lifecycle artifacts are unverified.",
    }];
  }
  return lifecycleArtifactFacts(content, metaPath);
}

/**
 * Read the exact-tree lifecycle position and required archive products for one checkpoint.
 *
 * @param cwd - Repository root used to resolve managed artifact paths.
 * @param workUnit - Work-unit slug whose lifecycle is being checked.
 * @param archiveCadence - Cadence selecting the required pre-merge lifecycle position.
 * @param storageVersion - Immutable version identifying the supplied filesystem view.
 * @param fs - Exact-version filesystem projection.
 * @returns A typed summary bound to the supplied storage version.
 */
export async function readLifecycleSummary(
  cwd: string,
  workUnit: string,
  archiveCadence: "with-integration" | "manual",
  storageVersion: string,
  fs: IntegrationLifecycleReadFs,
): Promise<IntegrationLifecycleSummary> {
  const { index } = await resolveComposedLifecycleIndex({ cwd, fs });
  const query = resolveSlugQuery(index, workUnit);
  const positioned = archiveCadence === "with-integration"
    ? query.state === "shipped"
      && query.position?.phase === "Shipped"
      && query.position.location === "completed"
    : query.state === "integrating"
      && query.position?.phase === "Integrating"
      && query.position.location === "active";
  const artifactFacts = await readLifecycleArtifactFacts(cwd, index.get(workUnit)?.path ?? null, fs);
  return IntegrationLifecycleSummarySchema.parse({
    workUnit,
    storageVersion,
    archiveCadence,
    state: query.state,
    position: query.position,
    artifactFacts,
    complete: positioned && artifactFacts.length === 0,
  });
}

/**
 * Bind canonical repository, lifecycle, Candidate, host, and policy reads to the checkpoint reducer.
 *
 * @param input - Repository root, Git adapter, and optional exact-version lifecycle storage.
 * @returns Production dependencies for checkpoint composition.
 */
export function createIntegrationCheckpointDependencies(input: {
  cwd: string;
  exec: GitExec;
  rawExec?: RawGitExec;
  lifecycleStorage?: IntegrationLifecycleStoragePort;
}): IntegrationCheckpointDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return settingsPromise;
  };
  const rawExec = input.rawExec ?? createRawGitExec(input.cwd);
  const candidateContext = createCheckpointCandidateContext({
    readRecord: (workUnit) => readCandidateRecordVersioned(input.cwd, workUnit),
    readVersion: (workUnit) => readCandidateRecordVersion(input.cwd, workUnit),
    project: async ({ workUnit, baseRevision, record }) => {
      const config = await settings();
      const effective = await projectGitCandidateEffectiveTarget({
        cwd: input.cwd,
        name: workUnit,
        baseBranch: config.settings["branch.base"],
        baseRevision,
        record,
        exec: input.exec,
        rawExec,
      });
      return {
        effective,
        currentness: projectEffectiveCandidateCurrentness(effective),
      };
    },
  });
  let identityPromise: ReturnType<typeof resolveIdentity> | null = null;
  const identity = () => {
    identityPromise ??= resolveIdentity({ exec: input.exec });
    return identityPromise;
  };
  const composeLineageReview = createLineageReviewComposer(input);
  const deliveryLookup = new RepositoryDeliveryMemberLookup({ exec: input.exec, cwd: input.cwd });
  const deliveryHost = new GhDeliveryHostPort(hostedGhRunner);
  const readHostedReservationDischarge = createHostedReservationDischargeReader({
    ...input,
    delivery: deliveryLookup,
    host: deliveryHost,
  });
  const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd);
  const mergeObservationPort = createGhChangeRequestMergeObservationPort(hostedGhRunner);
  let openChangeRequestPromise: ReturnType<typeof resolveOpenChangeRequest> | null = null;
  const openChangeRequest = () => {
    openChangeRequestPromise ??= resolveOpenChangeRequest(input.exec, input.cwd);
    return openChangeRequestPromise;
  };
  const lifecycleStorage = input.lifecycleStorage ?? {
    readSnapshot: async () => {
      const { head } = await currentHead(input.exec, input.cwd);
      return {
        version: head,
        fs: createGitTreeReadFs({ cwd: input.cwd, revision: head, exec: input.exec }),
      };
    },
  };
  const candidate = (workUnit: string, baseRevision: string): Promise<CachedCandidate | null> =>
    candidateContext.readEffective(workUnit, baseRevision);
  const boundaries = new Map<string, ReturnType<typeof readSubmissionBoundary>>();
  const boundary = (workUnit: string) => {
    let value = boundaries.get(workUnit);
    if (value === undefined) {
      value = readSubmissionBoundary(input.cwd, workUnit);
      boundaries.set(workUnit, value);
    }
    return value;
  };

  return {
    readDrift: async (workUnit) => {
      const config = await settings();
      return runBaseDrift({
        exec: input.exec,
        baseBranch: config.settings["branch.base"],
        mode: "authoritative",
        ...createCurrentBaseDriftAdapters(input.exec, workUnitPathTreatmentContext(workUnit)),
      });
    },
    classifyDeliveryDrift: async (workUnit, drift) => {
      const records = await deliveryLookup.resolveTerminalRecords(workUnit);
      if (records.status === "unbound") return { status: "not-applicable" };
      if (records.status === "unavailable") {
        return unavailableDeliveryDrift(
          workUnit,
          "The delivery terminal records are unavailable.",
          drift.baseOid === null ? {} : { baseRevision: drift.baseOid },
        );
      }
      if (drift.overlap?.status !== "available") {
        return unavailableDeliveryDrift(
          workUnit,
          "The delivery drift overlap is unavailable.",
          drift.baseOid === null ? {} : { baseRevision: drift.baseOid },
        );
      }
      if (drift.baseOid === null) {
        return unavailableDeliveryDrift(workUnit, "The delivery drift base revision is unavailable.", {});
      }
      const baseRevision = drift.baseOid;
      let managed: VersionedCandidateRecord;
      try {
        managed = await candidateContext.readRecord(workUnit);
      } catch {
        return unavailableDeliveryDrift(
          workUnit,
          "The managed delivery Candidate record could not be read or validated.",
          { baseRevision },
        );
      }
      if (managed.record === null || managed.version === null) {
        return unavailableDeliveryDrift(
          workUnit,
          "The managed delivery Candidate record is unavailable.",
          { baseRevision },
        );
      }
      let baselineRevision: string;
      try {
        baselineRevision = reduceCandidateDurableBaseline(managed.record).target.revision;
      } catch {
        return unavailableDeliveryDrift(
          workUnit,
          "The managed delivery Candidate baseline is malformed.",
          { baseRevision },
        );
      }
      const terminal = records.state.members.at(-1);
      if (terminal === undefined) {
        return unavailableDeliveryDrift(workUnit, "The delivery terminal member is unavailable.", {
          baseRevision,
          baselineRevision,
        });
      }
      const nonTerminal = records.state.members.slice(0, -1);
      const highestCoordinate = nonTerminal.at(-1)?.coordinates
        ?? records.state.target?.coordinates
        ?? null;
      if (highestCoordinate === null) {
        return unavailableDeliveryDrift(workUnit, "The delivery predecessor coordinate is unavailable.", {
          baseRevision,
          baselineRevision,
        });
      }
      let overlap;
      try {
        overlap = await analyzeRevisionOverlap({
          exec: input.exec,
          leftRevision: baselineRevision,
          rightRevision: baseRevision,
          treatmentContext: workUnitPathTreatmentContext(workUnit),
        });
      } catch {
        return unavailableDeliveryDrift(workUnit, "The exact delivery overlap could not be read.", {
          baseRevision,
          baselineRevision,
        });
      }
      if (overlap.status !== "available") {
        return unavailableDeliveryDrift(workUnit, overlap.detail, {
          baseRevision,
          baselineRevision,
        });
      }
      const evidence = {
        baseRevision,
        baselineRevision,
        mergeBase: overlap.mergeBase,
        substantivePaths: overlap.overlap.substantivePaths,
        regenerablePaths: overlap.overlap.regenerablePaths,
      };
      if (overlap.overlap.substantivePaths.length === 0) {
        return { status: "disjoint", nextAction: "continue", evidence };
      }
      let residualPaths: string[];
      try {
        residualPaths = await readDiffPaths(
          rawExec,
          highestCoordinate.head,
          baselineRevision,
        );
      } catch {
        return unavailableDeliveryDrift(workUnit, "The delivery residual diff could not be read.", evidence);
      }
      const firstCoordinate = nonTerminal[0]?.coordinates;
      let predecessorPaths: string[];
      try {
        predecessorPaths = firstCoordinate == null
          ? []
          : await readDiffPaths(rawExec, firstCoordinate.base, highestCoordinate.head);
      } catch {
        return unavailableDeliveryDrift(workUnit, "The delivery predecessor diff could not be read.", {
          ...evidence,
          residualPaths,
        });
      }
      const classified = classifyDeliveryTerminalDrift({
        substantivePaths: overlap.overlap.substantivePaths,
        regenerablePaths: overlap.overlap.regenerablePaths,
        residualPaths,
        predecessorPaths,
      });
      const completeEvidence = { ...evidence, residualPaths, predecessorPaths };
      return classified.status === "refused"
        ? {
            ...classified,
            evidence: completeEvidence,
            explanation: "Protected-base movement overlaps the retained delivery predecessor contribution.",
          }
        : { ...classified, evidence: completeEvidence };
    },
    readMovementObservation: async (workUnit, drift) => {
      if (drift.baseOid === null) throw new Error("The base drift reading has no exact base.");
      const { changeRequest } = await openChangeRequest();
      const coordinates = {
        repository: changeRequest.targetRef.repository,
        changeRequest: changeRequest.candidate.number,
        baseRef: changeRequest.candidate.baseRefName,
        base: drift.baseOid,
        head: changeRequest.targetRef.headSha,
      };
      const feasibility = await observeGitMergeFeasibility({
        exec: rawExec,
        base: coordinates.base,
        head: coordinates.head,
        classify: createCurrentBaseDriftAdapters(
          input.exec,
          workUnitPathTreatmentContext(workUnit),
        ).classifyReconciliation,
      });
      const admission = await observeChangeRequestMergeAdmission(coordinates, mergeObservationPort, {
        baseContained: drift.behind === 0,
      });
      if (
        feasibility.base !== coordinates.base
        || feasibility.head !== coordinates.head
        || admission.repository !== coordinates.repository
        || admission.changeRequest !== coordinates.changeRequest
        || admission.baseRef !== coordinates.baseRef
        || admission.base !== coordinates.base
        || admission.head !== coordinates.head
      ) {
        throw new Error("Checkpoint merge observations do not share the exact request coordinates.");
      }
      return { feasibility, admission };
    },
    readLifecycle: async (workUnit) => {
      const config = await settings();
      const snapshot = await lifecycleStorage.readSnapshot();
      return readLifecycleSummary(
        input.cwd,
        workUnit,
        config.settings["archive.cadence"] === "manual" ? "manual" : "with-integration",
        snapshot.version,
        snapshot.fs,
      );
    },
    readCandidate: async (workUnit, baseRevision) => {
      const value = await candidate(workUnit, baseRevision);
      return value?.currentness ?? null;
    },
    composeCandidateApplicabilityResolutionSelector: async (workUnit, decision) => {
      const value = await candidate(workUnit, decision.currentBase);
      if (value === null || value.effective.state !== "decision-required") {
        throw new Error("The Candidate applicability decision is no longer current.");
      }
      const config = await settings();
      const currentTarget = await collectGitCandidateTarget({
        cwd: input.cwd,
        name: workUnit,
        baseBranch: config.settings["branch.base"],
        baseRevision: decision.currentBase,
        exec: input.exec,
        revision: decision.currentTarget.revision,
      });
      const priorTarget = reduceCandidateDurableBaseline(value.record).target;
      if (priorTarget.revision !== decision.baselineTarget.revision
        || priorTarget.subject.subjectDigest !== decision.baselineTarget.subjectDigest
        || currentTarget.subject.subjectDigest !== decision.currentTarget.subjectDigest) {
        throw new Error("The Candidate applicability selector changed during checkpoint composition.");
      }
      return {
        schemaVersion: 1,
        expectedRecordVersion: value.recordVersion,
        candidateId: decision.candidateId,
        priorTarget,
        currentTarget,
        currentBase: decision.currentBase,
        projectionDigest: decision.projectionDigest,
        residualDigest: decision.residualDigest,
      };
    },
    readCandidatePublication: async (workUnit, baseRevision) => {
      const [value, publicationBoundary] = await Promise.all([
        candidate(workUnit, baseRevision),
        boundary(workUnit),
      ]);
      if (value === null || value.effective.state !== "current") {
        throw new Error("The current Candidate publication subject is unavailable.");
      }
      const publicLocus = publicationBoundary?.locus === "publication-pending"
        || publicationBoundary?.locus === "hosted-review-pending"
        || publicationBoundary?.locus === "delivery-status-required";
      return publicationBoundary !== null
        && publicLocus
        && publicationBoundary.candidateId === value.effective.candidateId
        && publicationBoundary.candidateSubjectDigest
          === value.effective.recognizedTarget.subject.subjectDigest
        ? { status: "current" }
        : {
            status: "refresh-required",
            kind: publicationBoundary?.reservation?.target.kind === "delivery" ? "delivery" : "singleton",
          };
    },
    readDeliveryTerminalRemedy: async ({ workUnit, candidate: currentness }) => {
      const records = await deliveryLookup.resolveTerminalRecords(workUnit);
      if (records.status === "unbound") return null;
      if (records.status === "unavailable") throw new Error("The delivery terminal records are unavailable.");
      const config = await settings();
      const configuredBase = config.settings["branch.base"];
      const terminal = records.state.members.at(-1);
      if (terminal?.ref === null || terminal?.ref === undefined
        || terminal.changeRequest === null || terminal.coordinates === null) {
        throw new Error("The delivery top has no exact retained binding.");
      }
      const predecessorRef = records.state.members.at(-2)?.ref;
      const currentHead = currentness.recognizedRevision;
      const frozenHead = terminal.coordinates.head;
      const resolved = await resolveChangeRequest({
        headRef: branchName(terminal.ref),
        headSha: currentHead,
        baseRef: configuredBase,
        acceptableBaseRefs: predecessorRef === null || predecessorRef === undefined
          ? []
          : [branchName(predecessorRef)],
      }, changeRequestPort);
      if (resolved.state !== "open" && resolved.state !== "closed-unmerged") return null;
      if (String(resolved.candidate.number) !== terminal.changeRequest.changeRequestId
        || resolved.candidate.headRefName !== branchName(terminal.ref)
        || resolved.candidate.headRefOid !== frozenHead) {
        return null;
      }
      if (currentHead !== frozenHead && resolved.state !== "closed-unmerged") return null;
      const top = assessDeliveryTerminalTop({
        terminal: true,
        protectedBaseRef: configuredBase,
        publicationHead: frozenHead,
        request: {
          binding: terminal.changeRequest,
          repository: resolved.targetRef.repository,
          headRef: resolved.candidate.headRefName,
          headSha: resolved.candidate.headRefOid,
          baseRef: resolved.candidate.baseRefName,
          state: resolved.state === "open" ? "open" : "closed",
        },
      });
      return top.status === "refused" && top.reason === "top-target-mismatch"
        ? {
            status: "blocked",
            nextAction: top.remedy.nextAction,
            reason: top.reason,
            planId: records.plan.planId,
            remedy: top.remedy,
          }
        : null;
    },
    composeDelivery: async ({ workUnit, candidate: currentness, baseRevision }) => {
      const records = await deliveryLookup.resolveTerminalRecords(workUnit);
      if (records.status === "unbound") return { status: "not-applicable" };
      if (records.status === "unavailable") throw new Error("The delivery terminal records are unavailable.");
      const [value, publicationBoundary, config] = await Promise.all([
        candidate(workUnit, baseRevision),
        boundary(workUnit),
        settings(),
      ]);
      if (value === null || publicationBoundary === null) {
        throw new Error("The delivery Candidate publication boundary is unavailable.");
      }
      if (value.effective.state !== "current"
        || value.effective.recognizedTarget.revision !== currentness.recognizedRevision) {
        throw new Error("The delivery Candidate effective target changed during checkpoint composition.");
      }
      if (publicationBoundary.candidateId !== currentness.candidateId
        || publicationBoundary.candidateSubjectDigest
          !== value.effective.recognizedTarget.subject.subjectDigest) {
        throw new Error("The delivery publication boundary belongs to a different Candidate.");
      }
      const configuredBase = config.settings["branch.base"];
      const members = records.state.members;
      const terminal = members.at(-1);
      if (terminal?.ref === null || terminal?.ref === undefined
        || terminal.changeRequest === null || terminal.coordinates === null) {
        throw new Error("The delivery top has no exact retained binding.");
      }
      const predecessorRef = members.at(-2)?.ref;
      if (terminal.coordinates.head !== currentness.recognizedRevision) {
        const currentTop = await resolveChangeRequest({
          headRef: branchName(terminal.ref),
          headSha: currentness.recognizedRevision,
          baseRef: configuredBase,
          acceptableBaseRefs: predecessorRef === null || predecessorRef === undefined
            ? []
            : [branchName(predecessorRef)],
        }, changeRequestPort);
        if (currentTop.state !== "open"
          || String(currentTop.candidate.number) !== terminal.changeRequest.changeRequestId) {
          if (currentTop.state === "closed-unmerged"
            && String(currentTop.candidate.number) === terminal.changeRequest.changeRequestId
            && currentTop.candidate.headRefName === branchName(terminal.ref)
            && currentTop.candidate.headRefOid === terminal.coordinates.head) {
            const top = assessDeliveryTerminalTop({
              terminal: true,
              protectedBaseRef: configuredBase,
              publicationHead: terminal.coordinates.head,
              request: {
                binding: terminal.changeRequest,
                repository: currentTop.targetRef.repository,
                headRef: currentTop.candidate.headRefName,
                headSha: currentTop.candidate.headRefOid,
                baseRef: currentTop.candidate.baseRefName,
                state: "closed",
              },
            });
            if (top.status === "refused" && top.reason === "top-target-mismatch") {
              return {
                status: "blocked",
                nextAction: top.remedy.nextAction,
                reason: top.reason,
                planId: records.plan.planId,
                remedy: top.remedy,
              };
            }
          }
          throw new Error("The current delivery top request does not match its retained binding.");
        }
        return {
          status: "terminal-rebind-required",
          nextAction: "reconcile-delivery-state",
          planId: records.plan.planId,
          repository: currentTop.targetRef.repository,
        };
      }
      const landings: Array<{ deliverableId: string; head: string }> = [];
      for (const [index, member] of members.slice(0, -1).entries()) {
        if (member.ref === null || member.changeRequest === null || member.coordinates === null) {
          throw new Error(`Delivery member ${member.deliverableId} has no exact retained binding.`);
        }
        const predecessorRef = index === 0 ? records.state.target?.ref : members[index - 1]?.ref;
        const resolved = await resolveChangeRequest({
          headRef: branchName(member.ref),
          headSha: member.coordinates.head,
          baseRef: configuredBase,
          acceptableBaseRefs: predecessorRef === null || predecessorRef === undefined
            ? []
            : [branchName(predecessorRef)],
        }, changeRequestPort);
        if (resolved.state !== "merged-at-head"
          || String(resolved.candidate.number) !== member.changeRequest.changeRequestId) {
          throw new Error(`Delivery member ${member.deliverableId} is not merged at its exact bound head.`);
        }
        landings.push({ deliverableId: member.deliverableId, head: member.coordinates.head });
      }
      const topResolution = await resolveChangeRequest({
        headRef: branchName(terminal.ref),
        headSha: terminal.coordinates.head,
        baseRef: configuredBase,
        acceptableBaseRefs: predecessorRef === null || predecessorRef === undefined
          ? []
          : [branchName(predecessorRef)],
      }, changeRequestPort);
      if (topResolution.targetRef === null
        || (topResolution.state !== "open"
          && topResolution.state !== "closed-unmerged"
          && topResolution.state !== "merged-at-head")) {
        throw new Error("The delivery top request cannot be resolved at its exact bound head.");
      }
      if (String(topResolution.candidate.number) !== terminal.changeRequest.changeRequestId) {
        throw new Error("The delivery top request does not match its retained binding.");
      }
      const top = {
        binding: terminal.changeRequest,
        repository: topResolution.targetRef.repository,
        headRef: topResolution.candidate.headRefName,
        headSha: topResolution.candidate.headRefOid,
        baseRef: topResolution.candidate.baseRefName,
        state: topResolution.state === "open"
          ? "open" as const
          : topResolution.state === "merged-at-head"
            ? "merged" as const
            : "closed" as const,
      };
      const targetResolution = await resolveHostedReservationTargets({
        workUnitId: workUnit,
        reservation: publicationBoundary.reservation,
        singleton: {
          repository: top.repository,
          pullRequest: topResolution.candidate.number,
          headSha: terminal.coordinates.head,
          baseRevision: terminal.coordinates.base,
        },
        delivery: deliveryLookup,
        host: deliveryHost,
      });
      if (targetResolution.status !== "resolved" || targetResolution.kind !== "delivery"
        || targetResolution.targets.length !== members.length) {
        throw new Error("The delivery member review targets are unavailable.");
      }
      const deliveryTargets = targetResolution.targets.map((target) => {
        if (target.vehicle === undefined) {
          throw new Error("The delivery member review selectors are unavailable.");
        }
        return { ...target, vehicle: target.vehicle };
      });
      const reviewTargets = members.map((member, index) => {
        const target = deliveryTargets[index];
        if (target === undefined || member.changeRequest === null || member.coordinates === null
          || target.pullRequest !== Number(member.changeRequest.changeRequestId)
          || target.headSha !== member.coordinates.head) {
          throw new Error(`Delivery member ${member.deliverableId} has a mismatched review target.`);
        }
        return {
          deliverableId: member.deliverableId,
          providerId: member.changeRequest.providerId,
          changeRequestId: member.changeRequest.changeRequestId,
          head: member.coordinates.head,
        };
      });
      const terminalTarget = deliveryTargets.at(-1);
      const ownerTerminusAdvances: DeliveryReviewOwnerTerminusAdvance[] = terminalTarget === undefined
        || terminalTarget.position !== terminalTarget.memberCount
        ? []
        : (await Promise.all(publicationBoundary.deliveryReviewTermini.map(async (record) => {
            if (!sameDeliveryReviewMemberIdentity(record.vehicle, terminalTarget.vehicle)
              || record.vehicle.head === terminalTarget.vehicle.head) return [];
            const proof = await projectGitDeliveryTerminalRecordAdvance({
              cwd: input.cwd,
              exec: input.exec,
              workUnitId: workUnit,
              baseBranch: configuredBase,
              priorHead: record.vehicle.head,
              currentHead: terminalTarget.vehicle.head,
            });
            return proof === undefined
              ? []
              : [{
                  priorVehicle: record.vehicle,
                  currentVehicle: terminalTarget.vehicle,
                  proof,
                }];
          }))).flat();
      const discharges = await Promise.all(deliveryTargets.map((target) => readHostedReservationDischarge({
        reservation: publicationBoundary.reservation,
        baseRevision: target.baseRevision,
        approvedHead: target.headSha,
        changeRequest: { repository: target.repository, pullRequest: target.pullRequest },
        vehicle: target.vehicle,
        candidate: value.record,
      })));
      const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
      const operationSnapshot = await new LocalReviewOperationStateStore(publisher).readOperationSnapshot();
      const repositoryId = await resolveRepositoryIdentity(publisher);
      const progress = deliveryTargets.map((target) => projectHostedReservationPolicyProgress({
        snapshot: operationSnapshot,
        repositoryId,
        target: {
          repository: target.repository,
          pullRequest: target.pullRequest,
          headSha: target.headSha,
        },
        vehicle: target.vehicle,
      }));
      const reviewDischarged = deliveryCheckpointReviewIsDischarged({
        targets: deliveryTargets,
        discharges,
        progress,
        ownerTermini: publicationBoundary.deliveryReviewTermini,
        ownerTerminusAdvances,
      });
      const candidateCoordinate = await readCoordinate(input.exec, input.cwd, currentness.recognizedRevision);
      const mergeBase = await resolveGitCandidateTargetBase({
        cwd: input.cwd,
        revision: currentness.recognizedRevision,
        baseBranch: configuredBase,
        baseRevision,
        exec: input.exec,
      });
      const predecessorCoordinate = await readCoordinate(input.exec, input.cwd, mergeBase);
      if (candidateCoordinate === null || predecessorCoordinate === null) {
        throw new Error("The delivery terminal delta coordinates are unavailable.");
      }
      return composeDeliveryCheckpointArm({
        record: value.record,
        candidate: currentness,
        plan: records.plan,
        state: records.state,
        landings,
        terminalDelta: { predecessor: predecessorCoordinate, member: candidateCoordinate },
        protectedBaseRef: configuredBase,
        publication: { candidateId: publicationBoundary.candidateId, head: currentness.recognizedRevision },
        top,
        review: {
          status: reviewDischarged ? "discharged" : "outstanding",
          targets: reviewTargets,
        },
        readCandidateCoordinate: (head) => readCoordinate(input.exec, input.cwd, head),
        proveResidual: (endpoints) => proveGitDeliveryContribution({
          exec: rawExec,
          ...endpoints,
        }),
      });
    },
    readShippedDeliveryPublicationCommit: async (workUnit, baseRevision) => {
      const boundaryPath = resolveSubmissionBoundaryPath(workUnit);
      const [stagedPaths, unstagedPaths, untrackedPaths] = await Promise.all([
        readGitPaths(input.exec, input.cwd, ["diff", "--cached", "--name-only", "-z", "--"]),
        readGitPaths(input.exec, input.cwd, ["diff", "--name-only", "-z", "--"]),
        readGitPaths(input.exec, input.cwd, ["ls-files", "--others", "--exclude-standard", "-z"]),
      ]);
      const clean = stagedPaths.length === 0 && unstagedPaths.length === 0 && untrackedPaths.length === 0;
      if (!clean && (canonicalize(stagedPaths) !== canonicalize([boundaryPath])
        || unstagedPaths.length > 0
        || untrackedPaths.length > 0)) {
        return {
          status: "blocked",
          detail: "The worktree contains changes beyond the exact staged publication boundary.",
        };
      }

      const { head } = await currentHead(input.exec, input.cwd);
      const [headBoundaryText, stagedBoundaryText] = await Promise.all([
        input.exec("git", ["show", `HEAD:${boundaryPath}`], {
          cwd: input.cwd,
          objectAccess: "local-only",
        }).then(({ stdout }) => stdout),
        input.exec("git", ["show", `:${boundaryPath}`], {
          cwd: input.cwd,
          objectAccess: "local-only",
        }).then(({ stdout }) => stdout),
      ]);
      const headBoundary = parseIntegrationBoundaryLocus(parseRecord(headBoundaryText, boundaryPath));
      const stagedBoundary = parseIntegrationBoundaryLocus(parseRecord(stagedBoundaryText, boundaryPath));
      const value = await candidate(workUnit, baseRevision);
      if (value === null || value.effective.state !== "current") {
        throw new Error("The current shipped delivery Candidate is unavailable.");
      }

      const headFs = createGitTreeReadFs({ cwd: input.cwd, revision: head, exec: input.exec });
      const { index } = await resolveComposedLifecycleIndex({ cwd: input.cwd, fs: headFs });
      const metaPath = index.get(workUnit)?.path ?? null;
      if (metaPath === null) throw new Error("The shipped delivery lifecycle record is unavailable.");
      const meta = parseMetaRecord(await headFs.readFile(resolve(input.cwd, metaPath)));
      const taskListPath = resolveTaskListPath(metaPath, meta.taskList);
      if (taskListPath === null) throw new Error("The shipped delivery task-list binding is unavailable.");

      const renewal = await inspectRepositoryDeliveryCandidateRenewal({
        cwd: input.cwd,
        taskListPath,
        workUnitId: workUnit,
        baseBranch: (await settings()).settings["branch.base"],
        exec: input.exec,
        sourceBoundary: headBoundary,
      });
      if (renewal.status !== "ready") {
        throw new Error(`The shipped delivery publication renewal is ${renewal.status}.`);
      }
      const expectedBoundary = projectCorrectiveDeliveryStatusBoundary({
        workUnit,
        candidateId: value.effective.candidateId,
        candidateSubjectDigest: value.effective.recognizedTarget.subject.subjectDigest,
        supersedesCandidateId: value.record.attestation.supersedes ?? null,
        sourceBoundary: headBoundary,
        deliveryContinuation: renewal.deliveryContinuation,
      });
      if (expectedBoundary.locus !== "delivery-status-required"
        || expectedBoundary.deliveryContinuation === undefined) {
        throw new Error("The shipped delivery publication renewal could not be projected.");
      }
      if (clean) {
        if (canonicalize(headBoundary) === canonicalize(expectedBoundary)) return { status: "none" };
        const headDeliveryContinuation = headBoundary.locus === "delivery-status-required"
          ? headBoundary.deliveryContinuation
          : undefined;
        const refreshedContinuation = {
          ...headBoundary,
          deliveryContinuation: expectedBoundary.deliveryContinuation,
        };
        if (canonicalize(refreshedContinuation) !== canonicalize(expectedBoundary)
          || headDeliveryContinuation === undefined) {
          return { status: "refresh-required" };
        }
        const records = await deliveryLookup.resolveTerminalRecords(workUnit);
        if (records.status !== "resolved") {
          throw new Error("The shipped delivery terminal records are unavailable.");
        }
        const terminalCoordinates = records.state.members.at(-1)?.coordinates ?? null;
        if (terminalCoordinates === null) {
          throw new Error("The shipped delivery terminal coordinates are unavailable.");
        }
        const terminalCoordinateAdvance = await projectGitDeliveryTerminalCoordinateAdvance({
          cwd: input.cwd,
          exec: input.exec,
          candidate: value.effective,
          workUnitId: workUnit,
          baseBranch: (await settings()).settings["branch.base"],
          terminalCoordinates,
        });
        const continuation = validateDeliveryPublicReviewContinuation({
          continuation: headDeliveryContinuation,
          plan: records.plan,
          state: records.state,
          stateRevision: records.stateRevision,
          ...(terminalCoordinateAdvance === undefined ? {} : { terminalCoordinateAdvance }),
        });
        return continuation.status === "current"
          ? { status: "none" }
          : { status: "refresh-required" };
      }
      if (canonicalize(stagedBoundary) !== canonicalize(expectedBoundary)) {
        const refreshedContinuation = {
          ...stagedBoundary,
          deliveryContinuation: expectedBoundary.deliveryContinuation,
        };
        if (canonicalize(refreshedContinuation) === canonicalize(expectedBoundary)) {
          return { status: "refresh-required" };
        }
        return {
          status: "blocked",
          detail: "The staged publication boundary is not the exact shipped delivery renewal.",
        };
      }
      return { status: "commit-required", boundaryPath };
    },
    resolveMergeMethod: async (repository, stackPosition) => {
      const config = await settings();
      return resolveMergeMethod(
        MergeMethodSchema.parse(config.settings["merge.strategy"]),
        createGhMergeMethodPolicyPort(hostedGhRunner),
        repository,
        stackPosition,
      );
    },
    composeReady: async ({ workUnit, lifecycle, candidate: currentness, delivery, baseRevision }) => {
      const [value, resolvedChangeRequest, publicationBoundary] = await Promise.all([
        candidate(workUnit, baseRevision),
        openChangeRequest(),
        boundary(workUnit),
      ]);
      if (value === null) throw new Error("The managed Candidate record disappeared during checkpoint composition.");
      if (value.effective.state !== "current"
        || value.effective.recognizedTarget.revision !== currentness.recognizedRevision) {
        throw new Error("The effective Candidate target changed during checkpoint composition.");
      }
      if (publicationBoundary === null) throw new Error("The durable publication boundary is unavailable.");
      const { changeRequest, acceptableBaseRefs } = resolvedChangeRequest;
      if (publicationBoundary.candidateId !== value.record.attestation.candidateId
        || publicationBoundary.candidateSubjectDigest
          !== value.effective.recognizedTarget.subject.subjectDigest) {
        throw new Error("The durable publication boundary belongs to a different Candidate subject.");
      }
      if (publicationBoundary.locus !== "publication-pending"
        && publicationBoundary.locus !== "hosted-review-pending"
        && publicationBoundary.locus !== "delivery-status-required") {
        throw new Error("The durable publication boundary has not entered public integration.");
      }
      const configuredBase = (await settings()).settings["branch.base"];
      if (!checkpointBaseIsAccepted({
        candidateBaseRef: changeRequest.candidate.baseRefName,
        configuredBaseRef: configuredBase,
        acceptableDeliveryBaseRefs: acceptableBaseRefs,
      })) {
        throw new Error("The open change request targets a different branch than the configured base.");
      }
      // The boundary's own derivation decides whether a hosted review is due at this exact head;
      // the durable lane record decides whether it ran. Neither is read off the stored locus, which
      // was derived before the change request existed and no writer clears.
      const publicationLocus = projectPublicationBoundary({
        workUnit,
        branch: changeRequest.targetRef.headRef,
        candidateId: value.record.attestation.candidateId,
        candidateSubjectDigest: value.effective.recognizedTarget.subject.subjectDigest,
        reservation: publicationBoundary.reservation,
        terminus: publicationBoundary.terminus,
        changeRequest: {
          repository: changeRequest.targetRef.repository,
          pullRequest: changeRequest.candidate.number,
        },
      });
      const discharge = delivery.status === "ready"
        ? {
            discharged: true,
            detail: `Every derived delivery-member review is discharged (${delivery.checks.targets.length} checked).`,
          }
        : await readHostedReservationDischarge({
            reservation: publicationBoundary.reservation,
            baseRevision: value.record.attestation.baseRevision,
            approvedHead: currentness.recognizedRevision,
            changeRequest: {
              repository: changeRequest.targetRef.repository,
              pullRequest: changeRequest.candidate.number,
            },
            candidate: value.record,
          });
      const hostedReviewPending = publicationLocus.locus === "hosted-review-pending"
        && !discharge.discharged;
      const checksPort = createGhRequiredChecksPort(hostedGhRunner);
      const signal = new AbortController().signal;
      const repository = await checksPort.resolveRepository(signal);
      if (repository.toLowerCase() !== changeRequest.targetRef.repository.toLowerCase()) {
        throw new Error("The required-check repository does not match the change request.");
      }
      const observedHead = await checksPort.readHead(repository, changeRequest.candidate.number, signal);
      if (observedHead !== currentness.recognizedRevision) {
        throw new Error("The required-check observation belongs to a different head.");
      }
      const checks = aggregateChecks(
        await checksPort.readRequiredChecks(repository, changeRequest.candidate.number, signal),
      );
      const fromRevision = value.effective.durableBaselineTarget.revision;
      return CheckpointReadyCompositionSchema.parse({
        approvedHead: currentness.recognizedRevision,
        candidateTailDiff: {
          fromRevision,
          throughRevision: currentness.recognizedRevision,
          reference: `${fromRevision}..${currentness.recognizedRevision}`,
        },
        requirementSummary: {
          conclusion: hostedReviewPending ? "pending" : "satisfied",
          requirements: [
            {
              id: "candidate-convergence",
              state: "satisfied",
              detail: "The current Candidate lineage carries every required convergence attestation.",
            },
            {
              id: HOSTED_REVIEW_REQUIREMENT_ID,
              state: hostedReviewPending ? "pending" : "satisfied",
              detail: discharge.detail,
            },
          ],
        },
        statusSummary: {
          lifecycle,
          changeRequest: {
            repository: changeRequest.targetRef.repository,
            pullRequest: changeRequest.candidate.number,
            baseRef: changeRequest.candidate.baseRefName,
            headRef: changeRequest.targetRef.headRef,
            headSha: changeRequest.targetRef.headSha,
            state: "open",
          },
          requiredChecks: checks,
        },
      });
    },
    composeSettlementPlan: async ({ workUnit, baseRevision, composition }) => composeCanonicalSettlementPlan(
      (await composeLineageReview(workUnit, composition.approvedHead, baseRevision)).actions,
    ),
    createHandle: async ({ workUnit, approvedHead, statusSummary, settlementPlan, mergeMethod }) => {
      const recordVersion = await candidateContext.assertRecordVersion(workUnit);
      if (recordVersion.status === "moved") {
        return {
          status: "recompose-required",
          expectedRecordVersion: recordVersion.expectedRecordVersion,
          observedRecordVersion: recordVersion.observedRecordVersion,
        };
      }
      const resolvedIdentity = await identity();
      if (resolvedIdentity === null) {
        throw new Error("An ARC identity is required to persist the integration checkpoint.");
      }
      const surfaces = createUserSurfaceResolver({ cwd: input.cwd, identity: resolvedIdentity });
      const handle = await persistIntegrationCheckpointComposition(
        surfaces.workUnitRoot(SlugSchema.parse(workUnit)),
        {
          workUnit,
          approvedHead,
          target: {
            repository: statusSummary.changeRequest.repository,
            pullRequest: statusSummary.changeRequest.pullRequest,
            baseRef: statusSummary.changeRequest.baseRef,
            headRef: statusSummary.changeRequest.headRef,
            headSha: statusSummary.changeRequest.headSha,
          },
          lifecycleVersion: statusSummary.lifecycle.storageVersion,
          settlementPlan,
          mergeMethod: ValidatedMergeMethodSchema.parse(mergeMethod),
        },
      );
      return { status: "created", handle };
    },
  };
}
