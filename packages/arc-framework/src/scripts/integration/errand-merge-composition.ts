/** Production composition for the exact-effect Errand terminal merge. */

import {
  BaseMovementObservationSchema,
  composeEvidenceDelta,
  reduceEvidenceApplicability,
} from "../../lib/evidence-applicability/index.js";
import {
  createCurrentBaseDriftAdapters,
} from "../../lib/base-drift/current-adapters.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import type { BaseDriftResult } from "../../lib/git/base-drift-types.js";
import {
  observeGitMergeFeasibility,
  type GitExec,
  type GitMergeFeasibility,
} from "../../lib/git/index.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { SlugSchema } from "../../lib/kernel/schema/slug.js";
import { runDerivedLocusStateProbe } from "../../handlers/derived-locus-state-probe.js";
import {
  ChangeRequestMergeObservationSchema,
  observeChangeRequestMergeAdmission,
  type ChangeRequestMergeObservation,
  type ChangeRequestResolutionPort,
} from "../review-gate/change-request.js";
import { createGitTreeReadFs } from "../review-gate/hosts/local/git-tree-fs.js";
import { createGhChangeRequestMergeObservationPort } from
  "../review-gate/hosts/github/merge-observation.js";
import { GhMergeLockPort } from "../review-gate/hosts/github/merge-lock.js";
import { readMergeLockSetting } from "../review-gate/hosts/local/merge-lock-config.js";
import {
  hostedGhRunner,
  type HostedProcessRunner,
} from "../review-gate/hosted/gh-process.js";
import { evaluateReviewReadiness } from "../review-gate/readiness.js";
import { holdMergeLock, releaseMergeLock } from "../review-gate/merge-lock.js";
import {
  composeCheckpointMovementPlan,
  CheckpointMovementObservationSchema,
} from "./checkpoint.js";
import {
  createIntegrationMergeDependencies,
} from "./merge-composition.js";
import { IntegrationBindingChangedError, type IntegrationMergeTarget } from "./merge.js";
import type {
  ErrandMergeDependencies,
  ErrandMergeFinalPlan,
} from "./errand-merge.js";

/** Reduce one complete Errand terminal observation through the shared applicability and movement planners. */
export function composeErrandFinalPlan(input: {
  readonly drift: Pick<
    BaseDriftResult,
    "verdict" | "baseOid" | "headOid" | "movement" | "integrationEvidence" | "overlap"
  >;
  readonly target: IntegrationMergeTarget;
  readonly feasibility: GitMergeFeasibility;
  readonly admission: ChangeRequestMergeObservation;
}): ErrandMergeFinalPlan {
  if (input.drift.baseOid === null || input.drift.movement === undefined
    || typeof input.drift.headOid !== "string" || input.drift.headOid !== input.target.headSha
    || input.drift.overlap === null
    || (input.drift.verdict !== "clean" && input.drift.verdict !== "reconcile")) {
    return {
      status: "unavailable",
      target: input.target,
      baseOid: input.drift.baseOid,
      detail: typeof input.drift.headOid === "string" && input.drift.headOid !== input.target.headSha
        ? `The authoritative drift head ${input.drift.headOid} does not match the refreshed host head `
          + `${input.target.headSha}.`
        : "The final authoritative base movement could not be established.",
    };
  }
  const coordinates = {
    repository: input.target.repository,
    changeRequest: input.target.pullRequest,
    base: input.drift.baseOid,
    head: input.target.headSha,
  };
  const baseMovement = BaseMovementObservationSchema.parse({
    coordinates,
    overlap: input.drift.overlap,
  });
  const hostAdmission = input.admission.state === "mergeable"
    ? { state: "mergeable" as const, coordinates }
    : {
        state: input.admission.state,
        coordinates,
        detail: input.admission.detail,
      };
  const reviewApplicability = reduceEvidenceApplicability(
    composeEvidenceDelta({ cause: "base-movement", observation: baseMovement, hostAdmission }),
    "review-clearance",
  );
  const observation = CheckpointMovementObservationSchema.parse({
    movement: input.drift.movement,
    integrationEvidenceComplete: input.drift.integrationEvidence?.coverage === "complete",
    feasibility: input.feasibility,
    admission: input.admission,
  });
  return {
    status: "available",
    target: input.target,
    baseOid: input.drift.baseOid,
    observation,
    plan: composeCheckpointMovementPlan(observation),
    reviewApplicability,
  };
}

/**
 * Select one exact current Errand identity from complete derived locus authority.
 *
 * @param frame - Fresh entering-checkout and shared identity evidence
 * @param slug - Approved Errand slug
 * @returns The exact current Errand identity for terminal merge
 */
export function selectCurrentErrandMergeIdentity(
  frame: Pick<Awaited<ReturnType<typeof runDerivedLocusStateProbe>>,
    "entering" | "identityDiscovery" | "roster">,
  slug: string,
): {
  readonly slug: ReturnType<typeof SlugSchema.parse>;
  readonly claimId: string;
  readonly branch: string;
  readonly generation: string;
} {
  if (frame.entering.kind !== "selected") {
    throw new Error("The entering checkout does not resolve to one current Errand identity.");
  }
  if (frame.identityDiscovery.kind !== "complete" || frame.identityDiscovery.diagnostics.length > 0) {
    throw new IntegrationBindingChangedError(
      "identity", "The shared Errand identity basis is incomplete.",
    );
  }
  const row = frame.entering.row;
  const record = row.identity;
  if (row.kind !== "transient" || row.subject.kind !== "errand"
    || row.subject.key !== slug || record === null
    || record.kind !== "errand" || record.purpose !== "errand"
    || record.key !== slug || record.claimId !== row.subject.claimId
    || record.branch !== row.checkout.branch
    || row.markerGeneration !== `errand-v1/${slug}/${record.claimId}`) {
    throw new IntegrationBindingChangedError(
      "identity", "The entering checkout no longer proves the exact current Errand generation.",
    );
  }
  const claims = frame.roster.filter((candidate) => candidate.subject?.kind === "errand"
    && candidate.subject.key === slug && candidate.subject.claimId === record.claimId);
  if (claims.length !== 1 || claims[0]?.checkout.path !== row.checkout.path) {
    throw new IntegrationBindingChangedError(
      "identity", "The current Errand identity is claimed by more than one checkout.",
    );
  }
  return {
    slug: SlugSchema.parse(slug),
    claimId: record.claimId,
    branch: record.branch,
    generation: row.markerGeneration,
  };
}

/** Bind the current Errand locus, Git, GitHub, checks, merge policy, lock, and provider ports. */
export function createErrandMergeDependencies(input: {
  readonly cwd: string;
  readonly exec: GitExec;
  readonly identity: string;
  readonly slug: string;
  readonly hostedRunner?: HostedProcessRunner;
  readonly changeRequestPort?: ChangeRequestResolutionPort;
}): ErrandMergeDependencies {
  const slug = SlugSchema.parse(input.slug);
  const runner = input.hostedRunner ?? hostedGhRunner;
  const common = createIntegrationMergeDependencies({
    cwd: input.cwd,
    exec: input.exec,
    workUnit: slug,
    hostedRunner: runner,
    ...(input.changeRequestPort === undefined ? {} : { changeRequestPort: input.changeRequestPort }),
  });
  const rawExec = createRawGitExec(input.cwd);
  const treatment = createCurrentBaseDriftAdapters(input.exec);
  const mergeObservationPort = createGhChangeRequestMergeObservationPort(runner);
  const lockPort = new GhMergeLockPort(
    runner,
    (request) => evaluateReviewReadiness(request, {
      fs: createGitTreeReadFs({
        cwd: input.cwd,
        revision: request.target.headSha,
        exec: input.exec,
      }),
    }),
    readMergeLockSetting,
  );
  const lockRequest = (target: IntegrationMergeTarget) => ({
    schemaVersion: 1 as const,
    treeRoot: input.cwd,
    target: {
      repository: target.repository,
      pullRequest: target.pullRequest,
      headSha: target.headSha,
    },
    vehicle: { kind: "errand" as const, slug },
  });

  return {
    readCurrentIdentity: async () => {
      const config = await readConfigSettings(input.cwd);
      const frame = await runDerivedLocusStateProbe({
        cwd: input.cwd,
        identity: input.identity,
        baseBranch: config.settings["branch.base"],
        exec: input.exec,
      });
      return selectCurrentErrandMergeIdentity(frame, slug);
    },
    readMerged: async (target) => ({
      merged: await common.readMerged(target),
      providerMergeId: null,
    }),
    refreshTarget: (target) => common.refreshTarget(target),
    observeChecks: (target) => common.observeChecks(target),
    resolveMergeMethod: async (repository) => common.resolveMergeMethod(repository, "non-delivery"),
    readFinalPlan: async (target, admissionOverride) => {
      const config = await readConfigSettings(input.cwd);
      const [drift, observedTarget] = await Promise.all([
        runBaseDrift({
          exec: input.exec,
          baseBranch: config.settings["branch.base"],
          mode: "authoritative",
          ...treatment,
        }),
        common.refreshTarget(target),
      ]);
      if (drift.baseOid === null || drift.movement === undefined
        || typeof drift.headOid !== "string" || drift.headOid !== observedTarget.headSha
        || drift.overlap === null) {
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
        classify: treatment.classifyReconciliation,
      });
      const admission = admissionOverride === undefined
        ? await observeChangeRequestMergeAdmission(coordinates, mergeObservationPort, {
            baseContained: drift.behind === 0,
          })
        : ChangeRequestMergeObservationSchema.parse({ ...coordinates, ...admissionOverride });
      return composeErrandFinalPlan({ drift, target: observedTarget, feasibility, admission });
    },
    releaseLock: async (target) => releaseMergeLock(lockRequest(target), lockPort),
    holdLock: async (target) => holdMergeLock(lockRequest(target), lockPort),
    mergePinned: (target, method) => common.mergePinned(target, method),
  };
}
