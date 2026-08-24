/** Production composition for exact-target review status. */

import { readConfigSettings } from "../../lib/config/status-reader.js";
import type { GitExec } from "../../lib/git/exec.js";
import { isGitProcessError } from "../../lib/git/process-error.js";
import { isGitObjectId } from "../../lib/git/object-id.js";
import { createRawGitExec } from "../../lib/io-context.js";
import { readCandidateRecordVersioned } from "../../lib/work-unit/candidate-record-store.js";
import {
  projectGitCandidateEffectiveTarget,
  resolveGitCandidateTargetBase,
} from "../../lib/work-unit/git-candidate-effective-target.js";
import { readSubmissionBoundary } from "../../lib/work-unit/submission-boundary-store.js";
import {
  resolveAcceptableDeliveryBaseRefs,
  type DeliveryDischargeTargetLookup,
  type DeliveryMemberLookup,
} from "./core/delivery-member-lookup.js";
import { resolveReviewSubject } from "./core/review-subject.js";
import {
  createHostedReservationDischargeReader,
  resolveHostedReservationTargets,
} from "./policy/hosted-reservation-discharge.js";
import {
  resolveChangeRequest,
  type ChangeRequestTargetRef,
} from "./change-request.js";
import { createGhChangeRequestResolutionPort } from "./hosts/github/change-request.js";
import { aggregateChecks } from "./checks-await.js";
import { createGhRequiredChecksPort } from "./hosts/github/checks-await.js";
import { RepositoryDeliveryMemberLookup } from "./hosts/local/delivery-member-lookup.js";
import { hostedGhRunner } from "./hosted/gh-process.js";
import {
  composeDeliveryReviewObligation,
  type ReviewStatusObservation,
  type ReviewStatusPort,
  type RoutedReviewObligation,
} from "./status.js";

async function readBasePosition(input: {
  cwd: string;
  exec: GitExec;
  headSha: string;
}): Promise<Pick<ReviewStatusObservation, "currentBaseOid" | "baseContained">> {
  const { settings } = await readConfigSettings(input.cwd);
  const base = settings["branch.base"];
  await input.exec("git", ["fetch", "origin", base], { cwd: input.cwd });
  const currentBaseOid = (await input.exec(
    "git",
    ["rev-parse", "--verify", `refs/remotes/origin/${base}`],
    { cwd: input.cwd, objectAccess: "local-only" },
  )).stdout.trim();
  if (!isGitObjectId(currentBaseOid)) throw new Error("invalid base object ID");
  try {
    await input.exec("git", ["merge-base", "--is-ancestor", currentBaseOid, input.headSha], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    return { currentBaseOid, baseContained: true };
  } catch (error) {
    if (isGitProcessError(error) && error.kind === "nonzero-exit" && error.exitCode === 1) {
      return { currentBaseOid, baseContained: false };
    }
    throw error;
  }
}

/**
 * Reduce the routed review obligation for one exact target from the repository's own evidence.
 *
 * @param cwd - The repository root holding the boundary, Candidate record, and lane progress.
 * @param exec - The Git boundary the Candidate span and durable state are read through.
 * @param target - The exact change-request target the obligation is reported for.
 * @returns The obligation state and the evidence sentence naming what decided it.
 */
export async function readRoutedObligation(
  cwd: string,
  exec: GitExec,
  target: ChangeRequestTargetRef,
  pullRequest: number,
  memberLookup: DeliveryMemberLookup & DeliveryDischargeTargetLookup = new RepositoryDeliveryMemberLookup({ cwd, exec }),
  currentBaseRevision?: string,
): Promise<RoutedReviewObligation> {
  const subject = await resolveReviewSubject({
    headRef: target.headRef,
    headSha: target.headSha,
    memberLookup,
  });
  if (subject.status === "unavailable") {
    return { state: "blocked", detail: "The delivery member's owning work unit is unavailable." };
  }
  if (subject.status === "unbound") {
    return { state: "blocked", detail: "The target branch does not identify a work unit." };
  }
  const workUnit = subject.workUnitId;
  try {
    const boundary = await readSubmissionBoundary(cwd, workUnit);
    if (boundary === null) {
      return { state: "blocked", detail: "The publication boundary is unavailable." };
    }
    const versionedRecord = await readCandidateRecordVersioned(cwd, workUnit);
    if (versionedRecord.record === null || versionedRecord.version === null) {
      return { state: "blocked", detail: "The managed Candidate record behind the reservation is unavailable." };
    }
    const record = versionedRecord.record;
    const baseBranch = (await readConfigSettings(cwd)).settings["branch.base"];
    const candidateHead = subject.member?.candidateHead ?? target.headSha;
    const targetBase = await resolveGitCandidateTargetBase({
      cwd,
      revision: candidateHead,
      baseBranch,
      baseRevision: currentBaseRevision,
      exec,
    });
    const effective = await projectGitCandidateEffectiveTarget({
      cwd,
      name: workUnit,
      baseBranch,
      record,
      exec,
      rawExec: createRawGitExec(cwd),
      target: { revision: candidateHead, currentBase: targetBase },
    });
    if (effective.state !== "current" || effective.recognizedTarget.revision !== candidateHead) {
      return { state: "blocked", detail: "The owning work-unit Candidate is not current." };
    }
    const candidateSubjectDigest = effective.recognizedTarget.subject.subjectDigest;
    if (boundary.candidateId !== record.attestation.candidateId
      || boundary.candidateSubjectDigest !== candidateSubjectDigest) {
      return { state: "blocked", detail: "The publication boundary belongs to a different Candidate subject." };
    }
    // A carried reservation is not itself an unsettled obligation — nothing clears it, so reading it
    // that way reports every hosted-first work unit as forever mid-review. What settles it is the
    // reserved source's own verdict on the lane.
    const { reservation } = boundary;
    if (reservation === null) {
      return { state: "settled", detail: "No hosted review was reserved across publication." };
    }
    const readDischarge = createHostedReservationDischargeReader({ cwd, exec });
    if (reservation.target.kind === "delivery") {
      const resolution = await resolveHostedReservationTargets({
        workUnitId: workUnit,
        reservation,
        singleton: {
          repository: target.repository,
          pullRequest,
          headSha: target.headSha,
          baseRevision: record.attestation.baseRevision,
        },
        delivery: memberLookup,
      });
      if (resolution.status !== "resolved" || resolution.kind !== "delivery") {
        return { state: "blocked", detail: "The retained delivery-member review targets are unavailable." };
      }
      const deliveryTargets = resolution.targets.flatMap((memberTarget) => (
        memberTarget.vehicle === undefined ? [] : [{ ...memberTarget, vehicle: memberTarget.vehicle }]
      ));
      if (deliveryTargets.length !== resolution.targets.length) {
        return { state: "blocked", detail: "The retained delivery-member review selectors are unavailable." };
      }
      const discharges = await Promise.all(deliveryTargets.map((memberTarget) => readDischarge({
        reservation,
        baseRevision: memberTarget.baseRevision,
        approvedHead: memberTarget.headSha,
        changeRequest: {
          repository: memberTarget.repository,
          pullRequest: memberTarget.pullRequest,
        },
        vehicle: memberTarget.vehicle,
        candidate: record,
      })));
      return composeDeliveryReviewObligation({
        targets: deliveryTargets,
        discharges,
        applicabilityContext: {
          workUnitId: workUnit,
          expectedRecordVersion: versionedRecord.version,
          candidateId: record.attestation.candidateId,
        },
      });
    }
    const discharge = await readDischarge({
      reservation,
      baseRevision: record.attestation.baseRevision,
      approvedHead: target.headSha,
      changeRequest: { repository: target.repository, pullRequest },
      candidate: record,
    });
    return discharge.discharged
      ? { state: "settled", detail: discharge.detail }
      : { state: "review-required", detail: discharge.detail };
  } catch (error) {
    return {
      state: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Bind GitHub, publication-boundary, and Git base reads to the status reducer. */
export function createReviewStatusPort(input: { cwd: string; exec: GitExec }): ReviewStatusPort {
  return {
    observe: async (target) => {
      try {
        const changeRequestPort = createGhChangeRequestResolutionPort(input.exec, input.cwd);
        const memberLookup = new RepositoryDeliveryMemberLookup(input);
        const baseRef = (await readConfigSettings(input.cwd)).settings["branch.base"];
        const refs = await changeRequestPort.readHeadRef(target.headRef);
        const actualHeadSha = refs.remote ?? refs.local ?? target.headSha;
        const resolution = await resolveChangeRequest(
          {
            headRef: target.headRef,
            headSha: target.headSha,
            baseRef,
            acceptableBaseRefs: await resolveAcceptableDeliveryBaseRefs(memberLookup, target.headSha),
          },
          changeRequestPort,
        );
        const base = await readBasePosition({ cwd: input.cwd, exec: input.exec, headSha: target.headSha });
        if (
          resolution.state !== "open"
          || resolution.targetRef.repository.toLowerCase() !== target.repository.toLowerCase()
        ) {
          return {
            actualHeadSha,
            requiredChecks: "unavailable",
            routedObligation: {
              state: "blocked",
              detail: `The exact target has no reusable open change request (${resolution.state}).`,
            },
            ...base,
          };
        }
        const routedObligation = await readRoutedObligation(
          input.cwd,
          input.exec,
          target,
          resolution.candidate.number,
          memberLookup,
          base.currentBaseOid ?? undefined,
        );
        const checksPort = createGhRequiredChecksPort(hostedGhRunner);
        const repository = await checksPort.resolveRepository();
        if (repository.toLowerCase() !== target.repository.toLowerCase()) {
          return {
            actualHeadSha,
            requiredChecks: "unavailable",
            routedObligation: {
              state: "blocked",
              detail: "The required-check repository does not match the target.",
            },
            ...base,
          };
        }
        const signal = new AbortController().signal;
        const checkedHead = await checksPort.readHead(repository, resolution.candidate.number, signal);
        const requiredChecks = aggregateChecks(
          await checksPort.readRequiredChecks(repository, resolution.candidate.number, signal),
        );
        return { actualHeadSha: checkedHead, requiredChecks, routedObligation, ...base };
      } catch (error) {
        return {
          actualHeadSha: target.headSha,
          requiredChecks: "unavailable",
          routedObligation: {
            state: "blocked",
            detail: error instanceof Error ? error.message : String(error),
          },
          currentBaseOid: null,
          baseContained: false,
        };
      }
    },
  };
}
