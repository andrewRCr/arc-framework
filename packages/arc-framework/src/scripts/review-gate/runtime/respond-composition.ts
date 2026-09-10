/** Production assembly for approved review dispositions. */

import { readConfigSettings } from "../../../lib/config/status-reader.js";
import {
  projectTransientInFlightRead,
  readTransientInFlightIndexes,
} from "../../../lib/errand/record.js";
import type { GitExec } from "../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import { createRawGitExec } from "../../../lib/io-context.js";
import { getFrameworkVersion } from "../../../lib/version.js";
import {
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
  resolveGitCandidateTargetBase,
} from "../../../lib/work-unit/git-candidate-effective-target.js";
import {
  collectGitCandidateTarget,
  collectUnstagedReviewablePaths,
} from "../../../lib/work-unit/git-candidate-subject.js";
import {
  LocalApprovedDispositionRecordStore,
} from "../hosts/local/disposition-record-store.js";
import {
  bindHostedAttemptDisposition,
  settleLaneAttempt,
} from "../lane-progress.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import {
  LocalFrontlineOutcomeStore,
} from "../hosts/local/frontline-outcome-store.js";
import { readLocalReviewLiveContext } from "../hosts/local/live-context.js";
import { LocalReviewAuthorityError } from "../hosts/local/review-authority.js";
import { RepositoryDeliveryMemberLookup } from "../hosts/local/delivery-member-lookup.js";
import {
  composeDeliveryMemberTarget,
  deriveLocalReviewTargetFromCoordinates,
} from "../hosts/local/repository-target.js";
import { LocalForwardReviewReceiptStore } from "../hosts/local/receipt-store.js";
import type { RespondCommandDependencies } from "./respond-command.js";
import { createLocalPrepareDependencies } from "./local-prepare-composition.js";
import {
  resolveCandidateMutationOwner,
  resolveCompletedCandidateWorkUnits,
} from "../../../handlers/candidate-mutation-owner.js";

/** Bind respond to repository-common records and trusted local/runtime identities. */
export function createRespondDependencies(input: {
  exec: GitExec;
  cwd: string;
}): RespondCommandDependencies {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const rawGit = createRawGitExec(input.cwd);
  const prepare = createLocalPrepareDependencies(input);
  const deliveryMembers = new RepositoryDeliveryMemberLookup(input);
  let receiptStore: Promise<LocalForwardReviewReceiptStore> | null = null;
  const receipts = () => {
    receiptStore ??= resolveRepositoryIdentity(publisher)
      .then((repositoryId) => new LocalForwardReviewReceiptStore(publisher, repositoryId));
    return receiptStore;
  };
  let settingsPromise: ReturnType<typeof readConfigSettings> | null = null;
  const settings = async () => {
    settingsPromise ??= readConfigSettings(input.cwd);
    return (await settingsPromise).settings;
  };
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
    operationStore: prepare.operationStore,
    sourceStore: prepare.sourceStore,
    outcomeStore: new LocalFrontlineOutcomeStore(publisher),
    dispositionStore: new LocalApprovedDispositionRecordStore(publisher),
    readReceipt: async (reference) => (await receipts()).readReceiptReference(reference),
    confirmTarget: (target) => prepare.confirmTarget(target),
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
      const reviewedBase = await resolveGitCandidateTargetBase({
        cwd: input.cwd,
        revision: target.headSha,
        baseBranch,
        exec: input.exec,
      });
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
            target: { revision: target.headSha, currentBase: reviewedBase },
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
      const [effective, current, unstagedReviewablePaths] = await Promise.all([
        projectGitCandidateEffectiveTarget({
          cwd: input.cwd,
          name: selected.workUnit,
          baseBranch: currentSettings["branch.base"],
          record: selected.record,
          exec: input.exec,
          rawExec: rawGit,
        }),
        collectGitCandidateTarget({
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
      ]);
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
    settleLaneFindings: async (settlement) => {
      await settleLaneAttempt(prepare.operationStore, {
        ...settlement,
        now: new Date().toISOString(),
      });
    },
    bindHostedDisposition: async (binding) => {
      await bindHostedAttemptDisposition(prepare.operationStore, {
        ...binding,
        now: new Date().toISOString(),
      });
    },
  };
}
