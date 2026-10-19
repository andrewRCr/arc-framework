/** Production composition for the exact-effect Errand terminal merge. */

import type { Store } from "../../lib/store/contract.js";
import { createStore } from "../../lib/store/create.js";
import { createDefaultStorePorts } from "../../lib/store/default-ports.js";
import { readStoreTerminalBasis, storeTerminalAcquisitionRefusal, missingStoreTerminalSubject } from "../../lib/errand/store-terminal-basis.js";
import {
  BaseMovementObservationSchema,
  composeEvidenceDelta,
  reduceEvidenceApplicability,
  type EvidenceOverlapObservation,
} from "../../lib/evidence-applicability/index.js";
import {
  createCurrentBaseDriftAdapters,
} from "../../lib/base-drift/current-adapters.js";
import { readConfigSettings } from "../../lib/config/status-reader.js";
import { runBaseDrift } from "../../lib/git/base-distance.js";
import type { BaseDriftResult, OverlapEvidence } from "../../lib/git/base-drift-types.js";
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

/**
 * Read drift overlap evidence into the observation the applicability delta carries.
 *
 * Both unions state the same four readings, and this assignment is where that agreement is proved. The delta
 * validates what it is handed strictly, so a reading one side gains alone would otherwise reach it as an
 * unrecognized status and throw at the parse; here it fails at the compiler instead.
 *
 * @param overlap - Drift overlap evidence as the authoritative reading produced it.
 * @returns The equivalent observation, under the same status the reading established.
 */
function observeDriftOverlap(overlap: OverlapEvidence): EvidenceOverlapObservation {
  return overlap;
}

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
    overlap: observeDriftOverlap(input.drift.overlap),
    merge: input.feasibility,
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

/** Frame facts used for exact entering Errand selection. */
type MergeIdentityFrame = Pick<Awaited<ReturnType<typeof runDerivedLocusStateProbe>>, "entering" | "identityDiscovery" | "roster">;
/** Current generation of the exact entering Errand. */
export interface CurrentErrandMergeIdentity { readonly slug: ReturnType<typeof SlugSchema.parse>; readonly claimId: string; readonly branch: string; readonly generation: string }
/** Preserve legacy synchronous selection; an explicit store supplies the asynchronous exact proof. */
export function selectCurrentErrandMergeIdentity(frame: MergeIdentityFrame, slug: string): CurrentErrandMergeIdentity;
export function selectCurrentErrandMergeIdentity(frame: MergeIdentityFrame, slug: string, store: Store): Promise<CurrentErrandMergeIdentity>;
export function selectCurrentErrandMergeIdentity(frame: MergeIdentityFrame, slug: string, store?: Store): CurrentErrandMergeIdentity | Promise<CurrentErrandMergeIdentity> {
  return store === undefined ? selectFromCheckout(frame, slug) : selectWithStore(frame, slug, store);
}
async function selectWithStore(frame: MergeIdentityFrame, slug: string, store: Store): Promise<CurrentErrandMergeIdentity> {
  if (!store.capabilities.stateOffBranch) return selectFromCheckout(frame, slug);
  if (frame.identityDiscovery.kind !== "store") throw new IntegrationBindingChangedError("identity", "Independent Store Errands and claims acquisitions are unavailable.");
  const inventory = storeTerminalAcquisitionRefusal(frame.identityDiscovery);
  if (inventory !== null) throw new IntegrationBindingChangedError("identity", inventory);
  const row = frame.entering.kind === "selected" ? frame.entering.row : null;
  if (row?.subject?.kind !== "errand" || row.subject.key !== slug) {
    const unresolved = missingStoreTerminalSubject(slug, frame.identityDiscovery.errands.kind === "complete" ? frame.identityDiscovery.errands.diagnostics : []);
    if (unresolved.kind === "refused") throw new IntegrationBindingChangedError("identity", unresolved.message);
    return selectFromCheckout(frame, slug, true);
  }
  const basis = await readStoreTerminalBasis({ store, discovery: frame.identityDiscovery, subject: { slug, claimId: row.subject.claimId } });
  if (basis.kind === "refused") throw new IntegrationBindingChangedError("identity", basis.message);
  return selectFromCheckout(frame, slug, true);
}
function selectFromCheckout(frame: MergeIdentityFrame, slug: string, storeBasis = false): CurrentErrandMergeIdentity {
  if (frame.entering.kind !== "selected") {
    throw new Error("The entering checkout does not resolve to one current Errand identity.");
  }
  if (!storeBasis && (frame.identityDiscovery.kind !== "complete" || frame.identityDiscovery.diagnostics.length > 0)) {
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
    || row.markerGeneration === null) {
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
    generation: `errand-v1/${slug}/${record.claimId}`,
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
  readonly store?: Store;
}): ErrandMergeDependencies {
  const slug = SlugSchema.parse(input.slug);
  const store = input.store ?? createStore(createDefaultStorePorts({ checkoutRoot: input.cwd, exec: input.exec, identity: SlugSchema.parse(input.identity) }));
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
        store,
        identity: input.identity,
        baseBranch: config.settings["branch.base"],
        exec: input.exec,
      });
      return selectCurrentErrandMergeIdentity(frame, slug, store);
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
        baseRef: observedTarget.baseRef,
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
