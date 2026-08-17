/** Production composition for the typed integration checkpoint. */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createCurrentBaseDriftAdapters } from "../../lib/base-drift/current-adapters.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import { getCurrentBranch, resolveIdentity, type GitExec } from "../../lib/git/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { createUserSurfaceResolver } from "../../lib/user-surfaces.js";
import { resolveComposedLifecycleIndex } from "../../lib/work-unit/composed-lifecycle-index.js";
import {
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
} from "../../lib/work-unit/candidate-attestation.js";
import { readCandidateRecord } from "../../lib/work-unit/candidate-record-store.js";
import { collectGitCandidateTarget } from "../../lib/work-unit/git-candidate-subject.js";
import { resolveSlugQuery } from "../../lib/work-unit/lifecycle-query.js";
import { readSubmissionBoundary } from "../../lib/work-unit/submission-boundary-store.js";
import { resolveChangeRequest } from "../review-gate/change-request.js";
import { lifecycleArtifactFacts, type ReviewReadinessFact } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { aggregateChecks } from "../review-gate/checks-await.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { hostedGhRunner } from "../review-gate/hosted/gh-process.js";
import {
  MergeMethodSchema,
  resolveMergeMethod,
} from "../review-gate/merge-method.js";
import {
  createHostedReservationDischargeReader,
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

interface CachedCandidate {
  record: CandidateManagedRecordV1;
  current: Awaited<ReturnType<typeof collectGitCandidateTarget>>;
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
  if (!/^[0-9a-f]{40}$/u.test(head)) throw new Error("The current integration head is invalid.");
  return { branch, head };
}

async function resolveOpenChangeRequest(exec: GitExec, cwd: string) {
  const target = await currentHead(exec, cwd);
  const result = await resolveChangeRequest(
    { headRef: target.branch, headSha: target.head },
    createGhChangeRequestResolutionPort(exec, cwd),
  );
  if (result.state !== "open") {
    throw new Error(`The exact integration head has no reusable open change request (${result.state}).`);
  }
  return result;
}

async function readHostFact(exec: GitExec, cwd: string): Promise<ReconcileHostFact> {
  try {
    const changeRequest = await resolveOpenChangeRequest(exec, cwd);
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
): Promise<ReviewReadinessFact[]> {
  if (metaPath === null) return [];
  let content: string;
  try {
    content = await readFile(resolve(cwd, metaPath), "utf8");
  } catch {
    return [{
      code: "unreadable-artifact",
      path: metaPath,
      message: "The work-unit meta could not be read, so its lifecycle artifacts are unverified.",
    }];
  }
  return lifecycleArtifactFacts(content, metaPath);
}

async function readLifecycleSummary(
  cwd: string,
  workUnit: string,
  archiveCadence: "with-integration" | "manual",
): Promise<IntegrationLifecycleSummary> {
  const { index } = await resolveComposedLifecycleIndex({ cwd });
  const query = resolveSlugQuery(index, workUnit);
  const positioned = archiveCadence === "with-integration"
    ? query.state === "shipped"
      && query.position?.phase === "Shipped"
      && query.position.location === "completed"
    : query.state === "integrating"
      && query.position?.phase === "Integrating"
      && query.position.location === "active";
  const artifactFacts = await readLifecycleArtifactFacts(cwd, index.get(workUnit)?.path ?? null);
  return IntegrationLifecycleSummarySchema.parse({
    workUnit,
    archiveCadence,
    state: query.state,
    position: query.position,
    artifactFacts,
    complete: positioned && artifactFacts.length === 0,
  });
}

/** Bind canonical repository, lifecycle, Candidate, host, and policy reads to the checkpoint reducer. */
export function createIntegrationCheckpointDependencies(input: {
  cwd: string;
  exec: GitExec;
}): IntegrationCheckpointDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return settingsPromise;
  };
  const candidates = new Map<string, Promise<CachedCandidate | null>>();
  let identityPromise: ReturnType<typeof resolveIdentity> | null = null;
  const identity = () => {
    identityPromise ??= resolveIdentity({ exec: input.exec });
    return identityPromise;
  };
  const composeLineageReview = createLineageReviewComposer(input);
  const readHostedReservationDischarge = createHostedReservationDischargeReader(input);
  const candidate = (workUnit: string): Promise<CachedCandidate | null> => {
    let value = candidates.get(workUnit);
    if (value === undefined) {
      value = (async () => {
        const record = await readCandidateRecord(input.cwd, workUnit);
        if (record === null) return null;
        const config = await settings();
        const current = await collectGitCandidateTarget({
          cwd: input.cwd,
          name: workUnit,
          baseBranch: config.settings["branch.base"],
          exec: input.exec,
        });
        return { record, current };
      })();
      candidates.set(workUnit, value);
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
    readReconcileHost: async () => readHostFact(input.exec, input.cwd),
    readLifecycle: async (workUnit) => {
      const config = await settings();
      return readLifecycleSummary(
        input.cwd,
        workUnit,
        config.settings["archive.cadence"] === "manual" ? "manual" : "with-integration",
      );
    },
    readCandidate: async (workUnit) => {
      const value = await candidate(workUnit);
      return value === null ? null : projectCandidateCurrentness(value);
    },
    resolveMergeMethod: async () => {
      const config = await settings();
      return resolveMergeMethod(
        MergeMethodSchema.parse(config.settings["merge.strategy"]),
        createGhMergeMethodPolicyPort(hostedGhRunner),
      );
    },
    composeReady: async ({ workUnit, lifecycle, candidate: currentness }) => {
      const [value, changeRequest, boundary] = await Promise.all([
        candidate(workUnit),
        resolveOpenChangeRequest(input.exec, input.cwd),
        readSubmissionBoundary(input.cwd, workUnit),
      ]);
      if (value === null) throw new Error("The managed Candidate record disappeared during checkpoint composition.");
      if (boundary === null) throw new Error("The durable publication boundary is unavailable.");
      // The boundary's own derivation decides whether a hosted review is due at this exact head;
      // the durable lane record decides whether it ran. Neither is read off the stored locus, which
      // was derived before the change request existed and no writer clears.
      const publicationLocus = projectPublicationBoundary({
        workUnit,
        branch: changeRequest.targetRef.headRef,
        candidateId: value.record.attestation.candidateId,
        candidateSubjectDigest: value.current.subject.subjectDigest,
        reservation: boundary.reservation,
        changeRequest: {
          repository: changeRequest.targetRef.repository,
          pullRequest: changeRequest.candidate.number,
        },
      });
      const discharge = await readHostedReservationDischarge({
        reservation: boundary.reservation,
        baseRevision: value.record.attestation.baseRevision,
        approvedHead: currentness.recognizedRevision,
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
      const lastResponse = value.record.responses.at(-1);
      const fromRevision = lastResponse?.newTarget.revision ?? value.record.attestation.baseRevision;
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
    createHandle: async ({ workUnit, approvedHead, settlementPlan, mergeMethod }) => {
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
          settlementPlan,
          mergeMethod: ValidatedMergeMethodSchema.parse(mergeMethod),
        },
      );
    },
  };
}
