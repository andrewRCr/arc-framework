/** Production boundaries for the exact-checkpoint integration merge. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import { createCurrentBaseDriftAdapters } from "../../lib/base-drift/current-adapters.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import { getCurrentBranch, resolveIdentity, type GitExec } from "../../lib/git/index.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { createUserSurfaceResolver } from "../../lib/user-surfaces.js";
import { resolveComposedLifecycleIndex } from "../../lib/work-unit/composed-lifecycle-index.js";
import { resolveSlugQuery } from "../../lib/work-unit/lifecycle-query.js";
import { resolveChangeRequest } from "../review-gate/change-request.js";
import { awaitRequiredChecks } from "../review-gate/checks-await.js";
import { evaluateReviewReadiness } from "../review-gate/readiness.js";
import { createGhChangeRequestResolutionPort } from "../review-gate/hosts/github/change-request.js";
import { createGhRequiredChecksPort } from "../review-gate/hosts/github/checks-await.js";
import { GhMergeLockPort } from "../review-gate/hosts/github/merge-lock.js";
import { createGhMergeMethodPolicyPort } from "../review-gate/hosts/github/merge-method.js";
import { RepositoryDeliveryMemberLookup } from "../review-gate/hosts/local/delivery-member-lookup.js";
import { readMergeLockSetting } from "../review-gate/hosts/local/merge-lock-config.js";
import { GhHostedReviewPort, hostedGhRunner } from "../review-gate/hosted/gh-process.js";
import { settleHostedFinding } from "../review-gate/hosted/settle.js";
import { holdMergeLock, releaseMergeLock } from "../review-gate/merge-lock.js";
import { MergeMethodSchema, resolveMergeMethod } from "../review-gate/merge-method.js";
import { createRespondDependencies } from "../review-gate/runtime/respond-composition.js";
import { respondToReviewCommand } from "../review-gate/runtime/respond-command.js";
import { readIntegrationCheckpointComposition } from "./checkpoint-store.js";
import {
  type IntegrationMergeDependencies,
  type IntegrationMergeTarget,
} from "./merge.js";
import { executeSettlementPlan } from "./settlement-execution.js";

const CHECKS_TIMEOUT_MS = 10 * 60 * 1_000;
const CHECKS_POLL_INTERVAL_MS = 10 * 1_000;

/** Bind Git, GitHub, review, lifecycle, and checkpoint stores to the merge reducer. */
export function createIntegrationMergeDependencies(input: {
  cwd: string;
  exec: GitExec;
  workUnit: string;
}): IntegrationMergeDependencies {
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return settingsPromise;
  };
  const hostedPort = new GhHostedReviewPort(hostedGhRunner);
  const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd);
  const respondDependencies = createRespondDependencies(input);
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup({ exec: input.exec, cwd: input.cwd });
  const lockPort = new GhMergeLockPort(
    hostedGhRunner,
    (request) => evaluateReviewReadiness(request, { deliveryMemberLookup }),
    readMergeLockSetting,
  );

  const archiveCadence = async () => (await settings()).settings["archive.cadence"] === "manual"
    ? "manual" as const
    : "with-integration" as const;

  const currentTarget = async (): Promise<IntegrationMergeTarget> => {
    const branch = await getCurrentBranch(input.exec);
    if (branch === null) throw new Error("The integration merge requires an attached branch.");
    const headSha = (await input.exec("git", ["rev-parse", "HEAD"], {
      cwd: input.cwd,
      objectAccess: "local-only",
    })).stdout.trim();
    const changeRequest = await resolveChangeRequest(
      { headRef: branch, headSha },
      changeRequestPort,
    );
    if (changeRequest.state !== "open") {
      throw new Error(`The current integration head has no reusable open change request (${changeRequest.state}).`);
    }
    return {
      repository: changeRequest.targetRef.repository,
      pullRequest: changeRequest.candidate.number,
      headSha,
    };
  };

  const lockRequest = async (target: IntegrationMergeTarget) => ({
    schemaVersion: 1 as const,
    treeRoot: input.cwd,
    target,
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
    }),
    readStatus: async (workUnit) => {
      const [target, query, cadence] = await Promise.all([
        currentTarget(),
        resolveComposedLifecycleIndex({ cwd: input.cwd })
          .then(({ index }) => resolveSlugQuery(index, workUnit)),
        archiveCadence(),
      ]);
      const lifecycleComplete = cadence === "manual"
        ? query.state === "integrating"
          && query.position?.phase === "Integrating"
          && query.position.location === "active"
        : query.state === "shipped"
          && query.position?.phase === "Shipped"
          && query.position.location === "completed";
      return { actualHead: target.headSha, lifecycleComplete, target };
    },
    readMerged: async (target) => {
      const branch = await getCurrentBranch(input.exec);
      if (branch === null) return false;
      const resolved = await resolveChangeRequest(
        { headRef: branch, headSha: target.headSha },
        changeRequestPort,
      );
      return resolved.state === "merged-at-head"
        && resolved.targetRef.repository === target.repository
        && resolved.candidate.number === target.pullRequest;
    },
    releaseLock: async (target) => releaseMergeLock(await lockRequest(target), lockPort),
    holdLock: async (target) => holdMergeLock(await lockRequest(target ?? await currentTarget()), lockPort),
    awaitChecks: async (target) => awaitRequiredChecks({
      pullRequest: target.pullRequest,
      headSha: target.headSha,
      timeoutMs: CHECKS_TIMEOUT_MS,
      pollIntervalMs: CHECKS_POLL_INTERVAL_MS,
    }, {
      port: createGhRequiredChecksPort(hostedGhRunner),
      clock: {
        now: () => Date.now(),
        sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
      },
    }),
    resolveMergeMethod: async () => resolveMergeMethod(
      MergeMethodSchema.parse((await settings()).settings["merge.strategy"]),
      createGhMergeMethodPolicyPort(hostedGhRunner),
    ),
    readFinalDrift: async () => {
      const config = await settings();
      return runBaseDrift({
        exec: input.exec,
        baseBranch: config.settings["branch.base"],
        mode: "authoritative",
        ...createCurrentBaseDriftAdapters(input.exec),
      });
    },
    mergePinned: async (target, method) => {
      const flag = method === "merge" ? "--merge" : method === "rebase" ? "--rebase" : "--squash";
      await hostedGhRunner.run([
        "pr", "merge", String(target.pullRequest), "--repo", target.repository,
        flag, "--match-head-commit", target.headSha,
      ]);
      return { state: "merged" };
    },
  };
}
