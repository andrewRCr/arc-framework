/** Production boundaries for the exact-checkpoint integration merge. */

import { z } from "zod";

import { readConfigSettings } from "../../lib/config/status-reader.js";
import {
  createCurrentBaseDriftAdapters,
  workUnitPathTreatmentContext,
} from "../../lib/base-drift/current-adapters.js";
import { runBaseDrift, type BaseDriftResult } from "../../lib/git/base-distance.js";
import {
  getCurrentBranch,
  observeGitMergeFeasibility,
  resolveIdentity,
  type GitExec,
  type GitMergeFeasibility,
} from "../../lib/git/index.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { createUserSurfaceResolver } from "../../lib/user-surfaces.js";
import {
  ChangeRequestMergeObservationSchema,
  observeChangeRequestMergeAdmission,
  resolveChangeRequest,
  type ChangeRequestMergeObservation,
  type ChangeRequestResolutionPort,
} from "../review-gate/change-request.js";
import { observeRequiredChecks } from "../review-gate/checks-await.js";
import { evaluateReviewReadiness } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { createGhChangeRequestMergeObservationPort } from
  "../review-gate/hosts/github/merge-observation.js";
import { resolveAcceptableDeliveryBaseRefs } from
  "../review-gate/core/delivery-member-lookup.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { readGhRequiredStatusPolicy } from "../review-gate/hosts/github/checks-await.js";
import { GhMergeLockPort } from "../review-gate/hosts/github/merge-lock.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { createGitTreeReadFs } from "../review-gate/hosts/local/git-tree-fs.js";
import { RepositoryDeliveryMemberLookup } from "../review-gate/hosts/local/delivery-member-lookup.js";
import { readMergeLockSetting } from "../review-gate/hosts/local/merge-lock-config.js";
import {
  GhHostedReviewPort,
  hostedGhRunner,
  type HostedProcessRunner,
} from "../review-gate/hosted/gh-process.js";
import { settleHostedFinding } from "../review-gate/hosted/settle.js";
import { holdMergeLock, releaseMergeLock } from "../review-gate/merge-lock.js";
import { MergeMethodSchema, resolveMergeMethod } from "../review-gate/merge-method.js";
import { createRespondDependencies } from "../review-gate/runtime/respond-composition.js";
import { respondToReviewCommand } from "../review-gate/runtime/respond-command.js";
import { confirmCandidateResponseAction } from "./candidate-response-confirmation.js";
import { readIntegrationCheckpointComposition } from "./checkpoint-store.js";
import { composeCheckpointMovementPlan, CheckpointMovementObservationSchema } from "./checkpoint.js";
import {
  type IntegrationFinalPlan,
  type IntegrationMergeDependencies,
  type IntegrationMergeTarget,
} from "./merge.js";
import { executeSettlementPlan } from "./settlement-execution.js";
import {
  readLifecycleSummary,
  type IntegrationLifecycleStoragePort,
} from "./checkpoint-composition.js";

const GitHubMergeResponseSchema = z.object({
  merged: z.boolean(),
  message: z.string(),
  sha: z.string().nullable().optional(),
}).loose();
const GitHubMergeConfirmationSchema = z.object({
  number: z.number().int().positive(),
  merged: z.boolean(),
  merge_commit_sha: z.string().nullable(),
  base: z.object({ ref: z.string().min(1) }).loose(),
  head: z.object({ ref: z.string().min(1), sha: z.string().min(1) }).loose(),
}).loose();

/** Bind final work-unit movement evidence to one refreshed host target. */
export function composeIntegrationFinalPlan(input: {
  readonly drift: Pick<
    BaseDriftResult,
    "verdict" | "baseOid" | "headOid" | "movement" | "integrationEvidence"
  >;
  readonly target: IntegrationMergeTarget;
  readonly feasibility: GitMergeFeasibility;
  readonly admission: ChangeRequestMergeObservation;
}): IntegrationFinalPlan {
  const { drift, target } = input;
  if (drift.baseOid === null || typeof drift.headOid !== "string" || drift.headOid !== target.headSha
    || drift.movement === undefined
    || (drift.verdict !== "clean" && drift.verdict !== "reconcile")) {
    return {
      status: "unavailable",
      target,
      baseOid: drift.baseOid,
      detail: typeof drift.headOid === "string" && drift.headOid !== target.headSha
        ? `The authoritative drift head ${drift.headOid} does not match the refreshed host head ${target.headSha}.`
        : "The final authoritative base movement could not be established.",
    };
  }
  const observation = CheckpointMovementObservationSchema.parse({
    movement: drift.movement,
    integrationEvidenceComplete: drift.integrationEvidence?.coverage === "complete",
    feasibility: input.feasibility,
    admission: input.admission,
  });
  return {
    status: "available",
    target,
    baseOid: drift.baseOid,
    observation,
    plan: composeCheckpointMovementPlan(observation),
  };
}

function failureDetail(error: unknown): string {
  const detail = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").trim();
  return detail.slice(0, 1_024) || "The host operation failed without diagnostic detail.";
}

/** Bind Git, GitHub, review, lifecycle, and checkpoint stores to the merge reducer. */
export function createIntegrationMergeDependencies(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
  lifecycleStorage?: IntegrationLifecycleStoragePort;
  changeRequestPort?: ChangeRequestResolutionPort;
  hostedRunner?: HostedProcessRunner;
}): IntegrationMergeDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return settingsPromise;
  };
  const runner = input.hostedRunner ?? hostedGhRunner;
  const hostedPort = new GhHostedReviewPort(runner);
  const rawExec = createRawGitExec(input.cwd);
  const changeRequestPort = input.changeRequestPort
    ?? createGhChangeRequestResolutionPort(input.exec, input.cwd);
  const mergeObservationPort = createGhChangeRequestMergeObservationPort(runner);
  const respondDependencies = createRespondDependencies(input);
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup({ exec: input.exec, cwd: input.cwd });
  const lockPort = new GhMergeLockPort(
    runner,
    (request) => evaluateReviewReadiness(request, {
      deliveryMemberLookup,
      fs: createGitTreeReadFs({
        cwd: input.cwd,
        revision: request.target.headSha,
        exec: input.exec,
      }),
    }),
    readMergeLockSetting,
  );

  const archiveCadence = async () => (await settings()).settings["archive.cadence"] === "manual"
    ? "manual" as const
    : "with-integration" as const;
  const lifecycleStorage = input.lifecycleStorage ?? {
    readSnapshot: async () => {
      const head = (await input.exec("git", ["rev-parse", "HEAD"], {
        cwd: input.cwd,
        objectAccess: "local-only",
      })).stdout.trim();
      return {
        version: head,
        fs: createGitTreeReadFs({ cwd: input.cwd, revision: head, exec: input.exec }),
      };
    },
  };

  const currentTarget = async (): Promise<IntegrationMergeTarget> => {
    const branch = await getCurrentBranch(input.exec);
    if (branch === null) throw new Error("The integration merge requires an attached branch.");
    const repository = await changeRequestPort.resolveRepository();
    const candidates = (await changeRequestPort.listByHead(repository, branch))
      .filter(({ state }) => state === "OPEN");
    if (candidates.length !== 1 || candidates[0] === undefined) {
      throw new Error("The current integration branch does not identify one open change request.");
    }
    const changeRequest = candidates[0];
    return {
      repository,
      pullRequest: changeRequest.number,
      baseRef: changeRequest.baseRefName,
      headRef: changeRequest.headRefName,
      headSha: changeRequest.headRefOid,
    };
  };

  const liveTarget = async (target: IntegrationMergeTarget): Promise<IntegrationMergeTarget> => {
    const repository = await changeRequestPort.resolveRepository();
    if (repository.toLowerCase() !== target.repository.toLowerCase()) {
      throw new Error("The live repository no longer matches the checkpointed target.");
    }
    const candidates = await changeRequestPort.listByHead(repository, target.headRef);
    const candidate = candidates.find(({ number }) => number === target.pullRequest);
    if (candidate === undefined || candidate.state !== "OPEN") {
      throw new Error("The checkpointed change request is no longer open.");
    }
    return {
      repository,
      pullRequest: candidate.number,
      baseRef: candidate.baseRefName,
      headRef: candidate.headRefName,
      headSha: candidate.headRefOid,
    };
  };
  const confirmPinned = async (target: IntegrationMergeTarget) => {
    try {
      const response = GitHubMergeConfirmationSchema.parse(JSON.parse((await runner.run([
        "api", `repos/${target.repository}/pulls/${target.pullRequest}`,
      ])).stdout) as unknown);
      if (response.number !== target.pullRequest
        || response.base.ref !== target.baseRef
        || response.head.ref !== target.headRef) {
        return {
          state: "unavailable" as const,
          detail: "The confirmation no longer identifies the exact approved change request and target.",
        };
      }
      if (response.head.sha !== target.headSha) {
        return {
          state: "head-moved" as const,
          actualHead: response.head.sha,
          detail: "The change-request head moved before exact merge confirmation.",
        };
      }
      if (!response.merged) return { state: "unmerged" as const };
      return {
        state: "merged" as const,
        providerMergeId: response.merge_commit_sha,
      };
    } catch (error) {
      return {
        state: "unavailable" as const,
        detail: `Exact merged-state confirmation was unavailable: ${failureDetail(error)}`,
      };
    }
  };

  const lockRequest = async (target: IntegrationMergeTarget) => ({
    schemaVersion: 1 as const,
    treeRoot: input.cwd,
    target: {
      repository: target.repository,
      pullRequest: target.pullRequest,
      headSha: target.headSha,
    },
    vehicle: {
      kind: "work-unit" as const,
      slug: SlugSchema.parse(input.workUnit),
      archiveCadence: await archiveCadence(),
    },
  });

  return {
    readCheckpoint: async (workUnit, handle) => {
      const identity = await resolveIdentity({ exec: input.exec });
      if (identity === null) throw new Error("An ARC identity is required to read the integration checkpoint.");
      const surfaces = createUserSurfaceResolver({ cwd: input.cwd, identity });
      return readIntegrationCheckpointComposition(
        surfaces.workUnitRoot(SlugSchema.parse(workUnit)),
        workUnit,
        handle,
      );
    },
    executeSettlement: async (record) => executeSettlementPlan(record.settlementPlan, {
      settleHosted: (request) => settleHostedFinding(request, { port: hostedPort }),
      settleReviewResponse: ({ request, fixTarget }) => respondToReviewCommand(
        fixTarget === null ? request : { ...request, settledFixTarget: fixTarget },
        respondDependencies,
      ),
      confirmCandidateResponse: (action) => confirmCandidateResponseAction({
        cwd: input.cwd,
        exec: input.exec,
        workUnit: record.workUnit,
        approvedHead: record.approvedHead,
        action,
      }),
    }),
    readStatus: async (workUnit) => {
      const [target, cadence, actualHead] = await Promise.all([
        currentTarget(),
        archiveCadence(),
        input.exec("git", ["rev-parse", "HEAD"], {
          cwd: input.cwd,
          objectAccess: "local-only",
        }).then(({ stdout }) => stdout.trim()),
      ]);
      const snapshot = await lifecycleStorage.readSnapshot();
      const lifecycle = await readLifecycleSummary(
        input.cwd,
        workUnit,
        cadence,
        snapshot.version,
        snapshot.fs,
      );
      return {
        actualHead,
        lifecycleComplete: lifecycle.complete,
        lifecycleVersion: lifecycle.storageVersion,
        target,
      };
    },
    readMerged: async (target) => {
      const resolved = await resolveChangeRequest(
        {
          headRef: target.headRef,
          headSha: target.headSha,
          baseRef: target.baseRef,
          acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(
            deliveryMemberLookup,
            target.headSha,
          ),
        },
        changeRequestPort,
      );
      return resolved.state === "merged-at-head"
        && resolved.targetRef.repository === target.repository
        && resolved.candidate.number === target.pullRequest;
    },
    refreshTarget: async (target) => {
      const current = await liveTarget(target);
      if (
        current.repository !== target.repository
        || current.pullRequest !== target.pullRequest
        || current.baseRef !== target.baseRef
        || current.headRef !== target.headRef
      ) {
        throw new Error("The live target no longer identifies the checkpointed change request.");
      }
      return current;
    },
    releaseLock: async (target) => releaseMergeLock(await lockRequest(target), lockPort),
    holdLock: async (target) => holdMergeLock(await lockRequest(target ?? await currentTarget()), lockPort),
    createLockRequest: async (target) => lockRequest(target ?? await currentTarget()),
    observeChecks: async (target) => observeRequiredChecks({
      repository: target.repository,
      pullRequest: target.pullRequest,
      headSha: target.headSha,
    }, {
      port: createGhRequiredChecksPort(runner),
      signal: AbortSignal.timeout(60_000),
    }),
    resolveMergeMethod: async (repository, stackPosition) => resolveMergeMethod(
      MergeMethodSchema.parse((await settings()).settings["merge.strategy"]),
      createGhMergeMethodPolicyPort(runner),
      repository,
      stackPosition,
    ),
    readConfiguredBase: async () => (await readConfigSettings(input.cwd)).settings["branch.base"],
    readFinalPlan: async (target, admissionOverride) => {
      const config = await readConfigSettings(input.cwd);
      const [drift, observedTarget] = await Promise.all([
        runBaseDrift({
          exec: input.exec,
          baseBranch: config.settings["branch.base"],
          mode: "authoritative",
          ...createCurrentBaseDriftAdapters(
            input.exec,
            workUnitPathTreatmentContext(input.workUnit),
          ),
        }),
        liveTarget(target),
      ]);
      if (drift.baseOid === null || drift.movement === undefined
        || typeof drift.headOid !== "string" || drift.headOid !== observedTarget.headSha) {
        return {
          status: "unavailable",
          target: observedTarget,
          baseOid: drift.baseOid,
          detail: typeof drift.headOid === "string" && drift.headOid !== observedTarget.headSha
            ? `The authoritative drift head ${drift.headOid} does not match the refreshed host head `
              + `${observedTarget.headSha}.`
            : "The final authoritative base movement could not be established.",
        };
      }
      const coordinates = {
        repository: observedTarget.repository,
        changeRequest: observedTarget.pullRequest,
        base: drift.baseOid,
        head: observedTarget.headSha,
      };
      const feasibility = await observeGitMergeFeasibility({
        exec: rawExec,
        base: coordinates.base,
        head: coordinates.head,
        classify: createCurrentBaseDriftAdapters(
          input.exec,
          workUnitPathTreatmentContext(input.workUnit),
        ).classifyReconciliation,
      });
      const admission = admissionOverride === undefined
        ? await observeChangeRequestMergeAdmission(coordinates, mergeObservationPort)
        : ChangeRequestMergeObservationSchema.parse({ ...coordinates, ...admissionOverride });
      return composeIntegrationFinalPlan({ drift, target: observedTarget, feasibility, admission });
    },
    mergePinned: async (target, method) => {
      let response: z.infer<typeof GitHubMergeResponseSchema> | null = null;
      let mutationDetail: string | null = null;
      try {
        const result = await runner.run([
          "api", `repos/${target.repository}/pulls/${target.pullRequest}/merge`,
          "--method", "PUT",
          "--raw-field", `sha=${target.headSha}`,
          "--raw-field", `merge_method=${method}`,
        ]);
        response = GitHubMergeResponseSchema.parse(JSON.parse(result.stdout) as unknown);
      } catch (error) {
        mutationDetail = failureDetail(error);
      }
      const confirmation = await confirmPinned(target);
      if (confirmation.state === "merged") {
        return {
          state: "merged",
          target,
          providerMergeId: confirmation.providerMergeId,
        };
      }
      if (confirmation.state === "head-moved") {
        return {
          state: "head-moved",
          target,
          actualHead: confirmation.actualHead,
          detail: confirmation.detail,
        };
      }
      if (confirmation.state === "unavailable") {
        return {
          state: "merge-outcome-unknown",
          target,
          mutationDetail: mutationDetail ?? response?.message ?? "The mutating response was not conclusive.",
          confirmationDetail: confirmation.detail,
        };
      }
      if (mutationDetail !== null || response?.merged === true) {
        return {
          state: "operation-failed",
          target,
          detail: mutationDetail ?? "The host reported success but exact confirmation established no merge.",
        };
      }
      try {
        const policy = await readGhRequiredStatusPolicy(
          runner,
          target.repository,
          target.baseRef,
          AbortSignal.timeout(60_000),
        );
        if (policy.strictCurrentness) {
          return {
            state: "base-currentness-required",
            target,
            detail: "Applicable target policy requires the head to include the current base.",
          };
        }
      } catch {
        // An unavailable policy read cannot promote an opaque refusal to strict currency.
      }
      return {
        state: "refused",
        target,
        detail: response?.message ?? "The host refused the exact merge without establishing a narrower cause.",
      };
    },
  };
}
