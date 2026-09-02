/** Production composition for the typed integration checkpoint. */

import { resolve } from "node:path";

import { createCurrentBaseDriftAdapters } from "../../lib/base-drift/current-adapters.js";
import type { RawGitExec } from "../../lib/change-facts.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import { getCurrentBranch, resolveIdentity, type GitExec } from "../../lib/git/index.js";
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
import { readCandidateRecordVersioned } from "../../lib/work-unit/candidate-record-store.js";
import {
  projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase,
} from "../../lib/work-unit/git-candidate-effective-target.js";
import { collectGitCandidateTarget } from "../../lib/work-unit/git-candidate-subject.js";
import { proveGitDeliveryContribution } from "../../lib/delivery/git-contribution-proof.js";
import { classifyDeliveryTerminalDrift } from "../../lib/delivery/terminal-integration.js";
import { resolveSlugQuery } from "../../lib/work-unit/lifecycle-query.js";
import { readSubmissionBoundary } from "../../lib/work-unit/submission-boundary-store.js";
import { GhDeliveryHostPort } from "../delivery/hosts/github.js";
import { resolveChangeRequest } from "../review-gate/change-request.js";
import { lifecycleArtifactFacts, type ReviewReadinessFact } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { aggregateChecks } from "../review-gate/checks-await.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { GitObjectIdSchema } from "../review-gate/core/gate-contract-v2-schema.js";
import { resolveAcceptableDeliveryBaseRefs } from
  "../review-gate/core/delivery-member-lookup.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { createGitTreeReadFs } from "../review-gate/hosts/local/git-tree-fs.js";
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
} from "../review-gate/policy/hosted-reservation-discharge.js";
import { projectPublicationBoundary } from "../review-gate/policy/integration-boundary-locus.js";
import {
  CheckpointReadyCompositionSchema,
  HOSTED_REVIEW_REQUIREMENT_ID,
  IntegrationLifecycleSummarySchema,
  ReconcileHostFactSchema,
  ValidatedMergeMethodSchema,
  type IntegrationCheckpointDependencies,
  type IntegrationLifecycleSummary,
  type ReconcileHostFact,
} from "./checkpoint.js";
import { persistIntegrationCheckpointComposition } from "./checkpoint-store.js";
import { createLineageReviewComposer } from "./lineage-review-composition.js";
import { composeCanonicalSettlementPlan } from "./settlement-plan.js";
import { composeDeliveryCheckpointArm } from "./delivery-checkpoint.js";

interface CachedCandidate {
  record: CandidateManagedRecordV1;
  recordVersion: string;
  effective: CandidateEffectiveTargetProjection;
  currentness: CandidateEffectiveCurrentnessProjection;
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
  const branch = await getCurrentBranch(exec);
  if (branch === null) throw new Error("The integration checkpoint requires an attached branch.");
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

async function readHostFact(exec: GitExec, cwd: string): Promise<ReconcileHostFact> {
  try {
    const { changeRequest } = await resolveOpenChangeRequest(exec, cwd);
    const repository = changeRequest.targetRef.repository;
    const pullRequest = changeRequest.candidate.number;
    const live = parseRecord(
      (await hostedGhRunner.run(["api", `repos/${repository}/pulls/${pullRequest}`])).stdout,
      "pull-request",
    );
    if (live.mergeable === true) return ReconcileHostFactSchema.parse({ state: "mergeable" });
    if (live.mergeable !== false) {
      return ReconcileHostFactSchema.parse({
        state: "unavailable",
        detail: "The host has not resolved pull-request mergeability.",
      });
    }
    return ReconcileHostFactSchema.parse({ state: "conflicting" });
  } catch (error) {
    return ReconcileHostFactSchema.parse({
      state: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
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
  const candidates = new Map<string, Promise<CachedCandidate | null>>();
  const candidateBaseRevisions = new Map<string, string>();
  const rawExec = input.rawExec ?? createRawGitExec(input.cwd);
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
  const lifecycleStorage = input.lifecycleStorage ?? {
    readSnapshot: async () => {
      const { head } = await currentHead(input.exec, input.cwd);
      return {
        version: head,
        fs: createGitTreeReadFs({ cwd: input.cwd, revision: head, exec: input.exec }),
      };
    },
  };
  const candidate = (workUnit: string, baseRevision?: string): Promise<CachedCandidate | null> => {
    const boundBase = candidateBaseRevisions.get(workUnit);
    if (baseRevision !== undefined) {
      if (boundBase !== undefined && boundBase !== baseRevision) {
        throw new Error("The authoritative Candidate base changed during checkpoint composition.");
      }
      candidateBaseRevisions.set(workUnit, baseRevision);
    }
    const effectiveBase = baseRevision ?? boundBase;
    const cacheKey = `${workUnit}\0${effectiveBase ?? "materialized"}`;
    let value = candidates.get(cacheKey);
    if (value === undefined) {
      value = (async () => {
        const versioned = await readCandidateRecordVersioned(input.cwd, workUnit);
        if (versioned.record === null || versioned.version === null) return null;
        const record = versioned.record;
        const config = await settings();
        const effective = await projectGitCandidateEffectiveTarget({
          cwd: input.cwd,
          name: workUnit,
          baseBranch: config.settings["branch.base"],
          baseRevision: effectiveBase,
          record,
          exec: input.exec,
          rawExec,
        });
        return {
          record,
          recordVersion: versioned.version,
          effective,
          currentness: projectEffectiveCandidateCurrentness(effective),
        };
      })();
      candidates.set(cacheKey, value);
    }
    return value;
  };
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
    readDrift: async () => {
      const config = await settings();
      return runBaseDrift({
        exec: input.exec,
        baseBranch: config.settings["branch.base"],
        mode: "authoritative",
        ...createCurrentBaseDriftAdapters(input.exec),
      });
    },
    classifyDeliveryDrift: async (workUnit, drift) => {
      const records = await deliveryLookup.resolveTerminalRecords(workUnit);
      if (records.status === "unbound") return { status: "not-applicable" };
      if (records.status === "unavailable") {
        return { status: "unavailable", detail: "The delivery terminal records are unavailable." };
      }
      if (drift.overlap?.status !== "available") {
        return { status: "unavailable", detail: "The delivery drift overlap is unavailable." };
      }
      try {
        const value = await candidate(workUnit, drift.baseOid ?? undefined);
        const currentness = value?.currentness ?? null;
        if (currentness === null || !("status" in currentness) || currentness.status !== "current") {
          return { status: "unavailable", detail: "The current delivery Candidate is unavailable." };
        }
        const terminal = records.state.members.at(-1);
        if (terminal === undefined) {
          return { status: "unavailable", detail: "The delivery terminal member is unavailable." };
        }
        const nonTerminal = records.state.members.slice(0, -1);
        const highestCoordinate = nonTerminal.at(-1)?.coordinates
          ?? records.state.target?.coordinates
          ?? null;
        if (highestCoordinate === null) {
          return { status: "unavailable", detail: "The delivery predecessor coordinate is unavailable." };
        }
        const residualPaths = await readDiffPaths(
          rawExec,
          highestCoordinate.head,
          currentness.recognizedRevision,
        );
        const firstCoordinate = nonTerminal[0]?.coordinates;
        const predecessorPaths = firstCoordinate == null
          ? []
          : await readDiffPaths(rawExec, firstCoordinate.base, highestCoordinate.head);
        const classified = classifyDeliveryTerminalDrift({
          substantivePaths: drift.overlap.substantivePaths,
          regenerablePaths: drift.overlap.regenerablePaths,
          residualPaths,
          predecessorPaths,
        });
        return classified;
      } catch (error) {
        return {
          status: "unavailable",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },
    readReconcileHost: async () => readHostFact(input.exec, input.cwd),
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
        || publicationBoundary?.locus === "hosted-review-pending";
      return publicationBoundary !== null
        && publicLocus
        && publicationBoundary.candidateId === value.effective.candidateId
        && publicationBoundary.candidateSubjectDigest
          === value.effective.recognizedTarget.subject.subjectDigest
        ? { status: "current" }
        : { status: "refresh-required" };
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
      const reviewTargets = members.map((member, index) => {
        const target = targetResolution.targets[index];
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
      const firstTarget = targetResolution.targets[0];
      if (firstTarget === undefined) throw new Error("The delivery member review targets are unavailable.");
      const discharge = await readHostedReservationDischarge({
        workUnitId: workUnit,
        reservation: publicationBoundary.reservation,
        baseRevision: firstTarget.baseRevision,
        approvedHead: firstTarget.headSha,
        changeRequest: { repository: firstTarget.repository, pullRequest: firstTarget.pullRequest },
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
          status: discharge.discharged ? "discharged" : "outstanding",
          targets: reviewTargets,
        },
        readCandidateCoordinate: (head) => readCoordinate(input.exec, input.cwd, head),
        proveResidual: (endpoints) => proveGitDeliveryContribution({
          exec: rawExec,
          ...endpoints,
        }),
      });
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
    composeReady: async ({ workUnit, lifecycle, candidate: currentness, delivery }) => {
      const [value, resolvedChangeRequest, publicationBoundary] = await Promise.all([
        candidate(workUnit),
        resolveOpenChangeRequest(input.exec, input.cwd),
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
        && publicationBoundary.locus !== "hosted-review-pending") {
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
            workUnitId: workUnit,
            reservation: publicationBoundary.reservation,
            baseRevision: value.record.attestation.baseRevision,
            approvedHead: currentness.recognizedRevision,
            changeRequest: {
              repository: changeRequest.targetRef.repository,
              pullRequest: changeRequest.candidate.number,
            },
          });
      const hostedReviewPending = publicationLocus.locus === "hosted-review-pending"
        && !discharge.discharged;
      const checksPort = createGhRequiredChecksPort(hostedGhRunner);
      const repository = await checksPort.resolveRepository();
      if (repository.toLowerCase() !== changeRequest.targetRef.repository.toLowerCase()) {
        throw new Error("The required-check repository does not match the change request.");
      }
      const signal = new AbortController().signal;
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
    composeSettlementPlan: async ({ workUnit, composition }) => composeCanonicalSettlementPlan(
      (await composeLineageReview(workUnit, composition.approvedHead)).actions,
    ),
    createHandle: async ({ workUnit, approvedHead, statusSummary, settlementPlan, mergeMethod }) => {
      const resolvedIdentity = await identity();
      if (resolvedIdentity === null) {
        throw new Error("An ARC identity is required to persist the integration checkpoint.");
      }
      const surfaces = createUserSurfaceResolver({ cwd: input.cwd, identity: resolvedIdentity });
      return persistIntegrationCheckpointComposition(
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
    },
  };
}
