/** Validate a Candidate selection across its mechanically unchanged extension or the commit that records it. */

import { canonicalize } from "../../../lib/kernel/canonical/canonical-json.js";
import type { RawGitExec } from "../../../lib/git/exec.js";
import {
  parseCandidateManagedRecord,
  type CandidateManagedRecordV1,
  type CandidateReviewApplicabilitySelectionV1,
} from "../../../lib/work-unit/candidate-attestation.js";
import { resolveCandidateRecordRelativePath } from "../../../lib/work-unit/candidate-record-store.js";
import type {
  ReviewContributionApplicabilityResult,
  ReviewContributionApplicabilitySelector,
} from "./review-contribution-applicability.js";
import type { MechanicallyCarriedReviewApplicabilitySelection } from
  "./review-applicability-authority.js";

type DecisionProjection = Extract<ReviewContributionApplicabilityResult, { state: "decision-required" }>;

/** One work unit's own Candidate record, read as committed at an exact head. */
export interface CandidateRecordAtHead {
  readonly path: string;
  /** The parsed record, or null when the head carries none or it does not parse. */
  readonly read: (head: string) => Promise<CandidateManagedRecordV1 | null>;
}

const decoder = new TextDecoder("utf-8", { fatal: true });

/**
 * Read a work unit's own Candidate record from Git.
 *
 * @param exec - Raw Git access to the repository holding the heads.
 * @param workUnit - The work unit whose record path is read.
 * @returns The record path and a reader that yields null for an absent, unreadable, or malformed record.
 */
export function gitCandidateRecordAtHead(exec: RawGitExec, workUnit: string): CandidateRecordAtHead {
  const path = resolveCandidateRecordRelativePath(workUnit);
  return {
    path,
    read: async (head) => {
      try {
        const { stdout } = await exec(["show", `${head}:${path}`], { objectAccess: "local-only" });
        return parseCandidateManagedRecord(decoder.decode(stdout));
      } catch {
        return null;
      }
    },
  };
}

function sameSelectorOwner(
  selected: ReviewContributionApplicabilitySelector,
  current: ReviewContributionApplicabilitySelector,
): boolean {
  return selected.repositoryId === current.repositoryId
    && selected.repository === current.repository
    && selected.pullRequest === current.pullRequest
    && selected.sourceId === current.sourceId
    && selected.priorAttemptId === current.priorAttemptId
    && selected.priorHead === current.priorHead
    && selected.priorBase === current.priorBase;
}

function sameVehicle(
  selected: ReviewContributionApplicabilitySelector["currentVehicle"],
  current: ReviewContributionApplicabilitySelector["currentVehicle"],
): boolean {
  if (selected === undefined || current === undefined) return selected === current;
  return selected.planId === current.planId
    && selected.deliverableId === current.deliverableId
    && selected.workUnitId === current.workUnitId;
}

/**
 * Whether a segment that changed only the Candidate record did nothing but record selections, the carried one
 * among them. Any other record change stays in the residual for an Owner decision.
 */
async function recordsOwnSelection(
  ownRecord: CandidateRecordAtHead,
  segment: ReviewContributionApplicabilityResult,
  selection: CandidateReviewApplicabilitySelectionV1,
): Promise<boolean> {
  if (segment.state !== "decision-required"
    || segment.verdict !== "clean-divergence"
    || canonicalize(segment.paths) !== canonicalize([ownRecord.path])) return false;
  const [before, after] = await Promise.all([
    ownRecord.read(segment.selector.priorHead),
    ownRecord.read(segment.selector.currentHead),
  ]);
  if (before === null || after === null) return false;
  const appended = after.transitions.slice(before.transitions.length);
  return appended.length > 0
    && appended.every(({ transitionKind }) => transitionKind === "review-applicability-selection")
    && appended.some((transition) => canonicalize(transition) === canonicalize(selection))
    && canonicalize(before) === canonicalize({
      ...after,
      transitions: after.transitions.slice(0, before.transitions.length),
    });
}

/** Reproject both legs; the reducer checks their exact identity, digest, and contribution equivalence. */
export async function projectMechanicalReviewApplicabilityCarry(input: {
  readonly candidateId: string;
  readonly projection: DecisionProjection;
  readonly selections: readonly CandidateReviewApplicabilitySelectionV1[];
  readonly projectSelector: (
    selector: ReviewContributionApplicabilitySelector,
  ) => Promise<ReviewContributionApplicabilityResult>;
  /** The work unit's own Candidate record, whose selection commits extend the selected endpoint. */
  readonly ownRecord?: CandidateRecordAtHead;
}): Promise<MechanicallyCarriedReviewApplicabilitySelection[]> {
  const current = input.projection.selector;
  const projected = await Promise.all(input.selections.map(async (selection) => {
    const selected = selection.selector;
    if (selection.candidateId !== input.candidateId
      || !sameSelectorOwner(selected, current)
      || (selected.currentHead === current.currentHead
        && selected.currentBase === current.currentBase)
      || !sameVehicle(selected.currentVehicle, current.currentVehicle)) return null;
    const selectedVehicle = selected.currentVehicle;
    const currentVehicle = current.currentVehicle;
    const selectedProjection = await input.projectSelector(selected);
    const mechanicalProjection = await input.projectSelector({
      ...current,
      priorHead: selected.currentHead,
      priorBase: selected.currentBase,
      ...(selectedVehicle === undefined || currentVehicle === undefined
        ? {}
        : { priorVehicle: selectedVehicle, currentVehicle }),
    });
    if (selectedProjection.state !== "decision-required") return null;
    if (mechanicalProjection.state === "applicable") {
      return { selection, selectedProjection, mechanicalProjection };
    }
    return mechanicalProjection.state === "decision-required"
      && input.ownRecord !== undefined
      && await recordsOwnSelection(input.ownRecord, mechanicalProjection, selection)
      ? { selection, selectedProjection, mechanicalProjection, ownRecordPath: input.ownRecord.path }
      : null;
  }));
  return projected.filter((value) => value !== null);
}
