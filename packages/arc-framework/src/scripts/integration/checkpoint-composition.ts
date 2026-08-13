/** Production composition for the typed integration checkpoint. */

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
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { hostedGhRunner } from "../review-gate/hosted/gh-process.js";
import {
  MergeMethodSchema,
  resolveMergeMethod,
} from "../review-gate/merge-method.js";
import {
  CheckpointReadyCompositionSchema,
  IntegrationLifecycleSummarySchema,
  ReconcileHostFactSchema,
  ValidatedMergeMethodSchema,
  type IntegrationCheckpointDependencies,
  type IntegrationLifecycleSummary,
  type ReconcileHostFact,
} from "./checkpoint.js";
import { persistIntegrationCheckpointComposition } from "./checkpoint-store.js";
import { composeCanonicalSettlementPlan } from "./settlement-plan.js";

interface CachedCandidate {
  record: CandidateManagedRecordV1;
  current: Awaited<ReturnType<typeof collectGitCandidateTarget>>;
}

function aggregateChecks(checks: Awaited<ReturnType<ReturnType<typeof createGhRequiredChecksPort>["readRequiredChecks"]>>) {
  if (checks.length === 0) return "not-required" as const;
  if (checks.some(({ state }) => state === "failed")) return "failed" as const;
  if (checks.every(({ state }) => state === "green")) return "green" as const;
  return "pending" as const;
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

function parseArray(text: string, path: string): unknown[] {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path}: malformed JSON`, { cause: error });
  }
  if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
  return value;
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
    const files = parseArray(
      (await hostedGhRunner.run(["api", `repos/${repository}/pulls/${pullRequest}/files`, "--paginate"])).stdout,
      "pull-request-files",
    );
    const conflictingPaths = files.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const filename = (entry as Record<string, unknown>).filename;
      return typeof filename === "string" && filename !== "" ? [filename] : [];
    });
    return ReconcileHostFactSchema.parse({ state: "conflicting", conflictingPaths });
  } catch (error) {
    return ReconcileHostFactSchema.parse({
      state: "unavailable",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readLifecycleSummary(
  cwd: string,
  workUnit: string,
  archiveCadence: "with-integration" | "manual",
): Promise<IntegrationLifecycleSummary> {
  const query = resolveSlugQuery((await resolveComposedLifecycleIndex({ cwd })).index, workUnit);
  const complete = archiveCadence === "with-integration"
    ? query.state === "shipped"
      && query.position?.phase === "Shipped"
      && query.position.location === "completed"
    : query.state === "integrating"
      && query.position?.phase === "Integrating"
      && query.position.location === "active";
  return IntegrationLifecycleSummarySchema.parse({
    workUnit,
    archiveCadence,
    state: query.state,
    position: query.position,
    complete,
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
      if (boundary.locus === "hosted-review-pending") {
        throw new Error("The reserved hosted review obligation is still pending.");
      }
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
      const dispositionIds = [...new Set(value.record.responses.map(({ dispositionId }) => dispositionId))];
      return CheckpointReadyCompositionSchema.parse({
        approvedHead: currentness.recognizedRevision,
        candidateTailDiff: {
          fromRevision,
          throughRevision: currentness.recognizedRevision,
          reference: `${fromRevision}..${currentness.recognizedRevision}`,
        },
        requirementSummary: {
          conclusion: "satisfied",
          requirements: [
            {
              id: "candidate-convergence",
              state: "satisfied",
              detail: "The current Candidate lineage carries every required convergence attestation.",
            },
            {
              id: "hosted-review-reservation",
              state: "satisfied",
              detail: "No pending hosted-review reservation remains at the publication boundary.",
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
        reviewRecord: { markdown: null, dispositionIds },
      });
    },
    composeSettlementPlan: () => Promise.resolve(composeCanonicalSettlementPlan([])),
    createHandle: async ({ workUnit, approvedHead, settlementPlan, reviewRecord, mergeMethod }) => {
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
          reviewRecord,
          mergeMethod: ValidatedMergeMethodSchema.parse(mergeMethod),
        },
      );
    },
  };
}
