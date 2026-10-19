/** Proof that an approved response produced a change-set correction leg. */

import type { GitExec } from "../../../lib/git/exec.js";
import type { CandidateManagedRecordV1 } from "../../../lib/work-unit/candidate-attestation.js";
import type { LaneSubjectLineage } from "../core/lane-admission.js";
import type { LaneResponsePerformance } from "../core/operation-state-schema.js";
import type { ApprovedDispositionRecordStore } from "../core/ports.js";
import type { ReviewResult } from "../core/review-result.js";
import type { ReviewTarget } from "../core/gate-contract-v2-schema.js";
import type { IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import { readIncrementalPredecessorResponseEvidence } from "./review-policy-evidence.js";
import { confirmPrivateCandidateCorrectionBasis } from "./candidate-correction-proof.js";

/** Trusted record readers and optional Candidate Git authority for one correction leg. */
export interface PerformedResponseProofInput {
  readonly predecessor: ReviewResult;
  readonly currentTarget: ReviewTarget;
  readonly currentLineage: LaneSubjectLineage;
  readonly currentResult?: ReviewResult;
  readonly dispositionStore: ApprovedDispositionRecordStore;
  readonly readResponsePerformance: (result: ReviewResult) => Promise<LaneResponsePerformance | null>;
  readonly candidateProof?: {
    readonly candidate: CandidateManagedRecordV1 | null;
    readonly cwd: string;
    readonly baseRef: string;
    readonly exec: GitExec;
    readonly observeTarget: () => Promise<ReviewTarget>;
  };
}

/** Confirm an unchanged-base leg through its approved, performed response. */
export async function confirmPerformedResponse(
  input: PerformedResponseProofInput,
): Promise<IncrementalPredecessorApplicability> {
  const { predecessor, currentTarget } = input;
  if (predecessor.originalOutcome !== "findings"
    || predecessor.target.kind !== "change-set" || currentTarget.kind !== "change-set"
    || predecessor.target.baseRef !== currentTarget.baseRef
    || predecessor.target.diffBaseSha !== currentTarget.diffBaseSha
    || predecessor.target.diffBaseTree !== currentTarget.diffBaseTree) return "unavailable";
  try {
    const performance = await input.readResponsePerformance(predecessor);
    if (performance?.producerId !== predecessor.producerId
      || performance.originatingHeadSha !== predecessor.target.headSha) return "unavailable";
    const response = await readIncrementalPredecessorResponseEvidence(
      predecessor, input.dispositionStore, () => Promise.resolve(performance),
    );
    if (response.status !== "performed") return "unavailable";
    if (performance.producedHeadSha === currentTarget.headSha) return "applicable";
    if (input.candidateProof === undefined) return "unavailable";
    return await confirmPrivateCandidateCorrectionBasis({
      ...input,
      ...input.candidateProof,
      readResponsePerformance: () => Promise.resolve(performance),
    });
  } catch {
    return "unavailable";
  }
}
