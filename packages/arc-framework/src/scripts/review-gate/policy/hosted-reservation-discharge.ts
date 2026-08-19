/** Discharge evidence for a hosted-review reservation carried across publication. */

import { RepositoryGitCommonStatePublisher } from "../../../lib/git-common-state.js";
import type { GitExec } from "../../../lib/git/index.js";
import { resolveRepositoryIdentity } from "../hosts/local/git-common-state.js";
import { LocalReviewOperationStateStore } from "../hosts/local/operation-state-store.js";
import { readLaneProgress, type LaneProgressProjection } from "../lane-progress.js";
import type { StandardReviewReservationV1 } from "./integration-boundary-locus.js";

type ProjectedLaneAttempt = Extract<LaneProgressProjection, { status: "recorded" }>["attempts"][number];

/** Whether the reserved hosted review has produced a verdict, with the evidence for that reading. */
export interface HostedReservationDischarge {
  discharged: boolean;
  detail: string;
}

/**
 * Decide whether a carried hosted-review reservation has been discharged.
 *
 * Discharge is a settled attempt — `clean` or `settled-findings` — by the first ordered source that
 * was not safely unavailable on the standard lane anywhere in the Candidate span. It is read rather than written because a discharge
 * write needs a caller who remembers to make it, and a reservation nobody cleared is the realized
 * failure this replaces. The span rather than the approved head alone: a review that ran before a
 * later fix landed still discharged the obligation, and gating on the head would replace the
 * workflow's own review-applicability judgment with a CLI gate.
 *
 * @param input - The carried reservation, the Candidate span, and the lane-progress read.
 * @returns The discharge verdict and the evidence sentence naming what settled it.
 */
export async function projectHostedReservationDischarge(input: {
  reservation: StandardReviewReservationV1 | null;
  span: readonly string[];
  readLaneProgress: (headSha: string) => Promise<LaneProgressProjection>;
}): Promise<HostedReservationDischarge> {
  const { reservation } = input;
  if (reservation === null) {
    return { discharged: true, detail: "Local carrier `local-attestation`." };
  }
  const attempts: ProjectedLaneAttempt[] = [];
  for (const headSha of input.span) {
    const progress = await input.readLaneProgress(headSha);
    if (progress.status !== "recorded") continue;
    attempts.push(...progress.attempts);
  }
  for (const sourceId of reservation.sources) {
    const sourceAttempts = attempts.filter((attempt) => attempt.sourceId === sourceId);
    const settled = sourceAttempts.some(({ outcome }) => outcome === "clean" || outcome === "settled-findings");
    if (settled) {
      return {
        discharged: true,
        detail: `Hosted source \`${sourceId}\`.`,
      };
    }
    const safelyUnavailable = sourceAttempts.length > 0 && sourceAttempts.every(({ outcome }) => (
      outcome === "rate-limited" || outcome === "transient-unavailable"
    ));
    if (!safelyUnavailable) break;
  }
  return {
    discharged: false,
    detail: `The reserved standard-review source order beginning at \`${reservation.sourceId}\` has not produced `
      + "a settled review across the Candidate span.",
  };
}

/**
 * Bind the repository's durable lane progress and Candidate span to the discharge projection.
 *
 * @param input - The repository root and its Git boundary.
 * @returns A reader resolving discharge for one reservation over one Candidate span.
 */
export function createHostedReservationDischargeReader(input: {
  cwd: string;
  exec: GitExec;
}): (args: {
  reservation: StandardReviewReservationV1 | null;
  baseRevision: string;
  approvedHead: string;
}) => Promise<HostedReservationDischarge> {
  const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
  const store = new LocalReviewOperationStateStore(publisher);
  let repositoryIdPromise: Promise<string> | null = null;
  const repositoryId = () => {
    repositoryIdPromise ??= resolveRepositoryIdentity(publisher);
    return repositoryIdPromise;
  };

  return async ({ reservation, baseRevision, approvedHead }) => {
    if (reservation === null) {
      return projectHostedReservationDischarge({
        reservation,
        span: [],
        readLaneProgress: () => Promise.resolve({ status: "unrecorded" }),
      });
    }
    const { stdout } = await input.exec("git", ["rev-list", `${baseRevision}..${approvedHead}`], {
      cwd: input.cwd,
      objectAccess: "local-only",
    });
    const span = [baseRevision, ...stdout.trim().split("\n").filter((line) => line !== "")];
    return projectHostedReservationDischarge({
      reservation,
      span,
      readLaneProgress: async (headSha) => readLaneProgress(store, {
        lane: "standard",
        repositoryId: await repositoryId(),
        headSha,
      }),
    });
  };
}
