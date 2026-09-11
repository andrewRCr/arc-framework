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
import { analyzeRevisionOverlap, getCurrentBranch, type GitExec } from "../../../lib/git/index.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import { SlugSchema, validateManagedPath } from "../../../lib/kernel/index.js";
import { materializeArcPath, resolveArcPath } from "../../../lib/layout/index.js";
import { resolveActiveWu } from "../../../lib/release/wu-resolution.js";
import { resolveGitCommonDir } from "../../../lib/user-sync/repo-shared-paths.js";
import {
  candidateReviewResponses,
  reduceCandidateDurableBaseline,
  type CandidateManagedRecordV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import { readCandidateRecord } from "../../../lib/work-unit/candidate-record-store.js";
import { readAncestry } from "../../../lib/work-unit/git-decomposition-object-readers.js";
import { projectGitCandidateEffectiveTarget } from "../../../lib/work-unit/git-candidate-effective-target.js";
import type { CandidateEffectiveTargetProjection } from
  "../../../lib/work-unit/candidate-effective-target.js";
import { resolveChangeRequest } from "../change-request.js";
import { resolveAcceptableDeliveryBaseRefs } from "../core/delivery-member-lookup.js";
import { createGhChangeRequestResolutionPort } from "../hosts/github/change-request.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import { createLocalFrontlineSourcePreferenceReader } from "../hosts/local/frontline-source-preferences.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import {
  createLocalReviewMethodFilePort,
  createLocalReviewRubricBindingPort,
} from "../hosts/local/method-files.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTarget,
} from "../hosts/local/repository-target.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { readLaneProgressAcrossLineage } from "../lane-progress.js";
import { composeWorkUnitReviewAssurance } from "./assurance.js";
import { resolveConfiguredLanePolicy } from "./lane-policy-config.js";
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
}): CandidateRead {
  const baseline = reduceCandidateDurableBaseline(input.record);
  if (input.effective.state === "current") {
    return {
      status: "current",
      candidateId: input.effective.candidateId,
      headSha: input.effective.recognizedTarget.revision,
      subjectDigest: input.effective.recognizedTarget.subject.subjectDigest,
      implementationChanged: input.effective.implementationChanged,
      convergenceVerification: input.effective.convergenceVerification,
      lineageHeadShas: [...new Set([
        input.record.attestation.baseRevision,
        ...candidateReviewResponses(input.record)
          .flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
        ...input.record.lineageAttestations.map((attestation) => attestation.target.revision),
        input.effective.recognizedTarget.revision,
      ])],
    };
  }
  const authorizedPendingFix = input.effective.state === "changed"
    || input.effective.state === "decision-required";
  if (authorizedPendingFix && input.pending.status === "selected"
    && input.pending.candidateId === baseline.candidateId) {
    return {
      status: "current",
      candidateId: baseline.candidateId,
      headSha: input.pending.reviewedHead,
      subjectDigest: baseline.target.subject.subjectDigest,
      implementationChanged: baseline.implementationChanged,
      convergenceVerification: baseline.verificationCompleted ? "satisfied" : "pending",
      pendingReviewTarget: input.pending.reviewedTarget,
      lineageHeadShas: [...new Set([
        input.record.attestation.baseRevision,
        ...candidateReviewResponses(input.record)
          .flatMap((response) => [response.oldTarget.revision, response.newTarget.revision]),
        ...input.record.lineageAttestations.map((attestation) => attestation.target.revision),
        input.pending.reviewedHead,
      ])],
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
  const deliveryMemberLookup = new RepositoryDeliveryMemberLookup(input);
  const deliveryReviewTargetDependencies = createPreBindingDeliveryReviewTargetDependencies(input);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };

  return {
    readCandidate: async (workUnit): Promise<CandidateRead> => {
      const name = SlugSchema.parse(workUnit);
      const record = await readCandidateRecord(input.cwd, name);
      if (record === null) return { status: "missing" };
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
      return projectPrePublicationCandidateRead({ record, effective, pending });
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

    readDeliveryReviewTargets: async (workUnit) => composePreBindingDeliveryReviewTargets({
      workUnitId: workUnit,
      baseRef: (await settings())["branch.base"],
    }, deliveryReviewTargetDependencies),

    deriveImmutableTarget: async (): Promise<ImmutableTargetRead> => {
      try {
        return {
          status: "resolved",
          target: await deriveLocalReviewTarget({
            exec: input.exec,
            cwd: input.cwd,
            baseRef: (await settings())["branch.base"],
            repositoryId: await repositoryId(),
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

    readLaneProgress: async (lane, headSha, lineageHeadShas) => readLaneProgressAcrossLineage(store, {
      lane,
      repositoryId: await repositoryId(),
      headSha,
      lineageHeadShas,
    }),

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
