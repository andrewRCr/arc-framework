/** Shared derivation of convergence and admissible correction coverage for the next look. */
import { canonicalize } from "../../../lib/kernel/index.js";
import { currentApprovedDispositionNode } from "../core/advisory-records.js";
import { laneSubjectOwnerMatches } from "../core/lane-admission.js";
import { fixesMaterialFinding } from "../core/review-convergence.js";
import { validateApprovedDispositionRecordForResult } from "../core/review-result-disposition.js";
import type { ReviewResult } from "../core/review-result.js";
import { resolveIncrementalCorrectionScope, type IncrementalPredecessorApplicability } from "./incremental-coverage-basis.js";
import { confirmPerformedResponse, type PerformedResponseProofInput } from "./performed-response-proof.js";
import { confirmDeliveryCorrectionLeg } from "./delivery-correction-proof.js";
import { readIncrementalPredecessorResponseEvidence } from "./review-policy-evidence.js";
import type { StandardReviewObligationProjection } from "./standard-review-projection-schema.js";
import type { ReviewResultReader } from "../core/ports.js";

import { type ReviewNextPassContext } from "./review-next-pass-schema.js";
export { ReviewNextPassContextSchema, type ReviewNextPassContext } from "./review-next-pass-schema.js";

/** Current target and record readers shared by convergence and correction-chain confirmation. */
export interface ReviewNextPassInput extends Omit<PerformedResponseProofInput, "predecessor" | "currentResult" | "currentTarget"> {
  readonly predecessor: ReviewResult | null;
  readonly currentTarget: PerformedResponseProofInput["currentTarget"] | null;
  readonly standardReview: StandardReviewObligationProjection;
  readonly resultReader: ReviewResultReader;
  readonly confirmApplicability?: (predecessor: ReviewResult, current: ReviewResult) => Promise<IncrementalPredecessorApplicability>;
  readonly confirmCurrentApplicability?: (predecessor: ReviewResult) => Promise<IncrementalPredecessorApplicability>;
}

async function approvedFindings(input: Pick<PerformedResponseProofInput, "predecessor" | "dispositionStore">) {
  const record = await input.dispositionStore.readDispositionRecord(input.predecessor.producerId);
  return record === null ? null : currentApprovedDispositionNode(
    validateApprovedDispositionRecordForResult(record, input.predecessor),
  ).approvedDisposition.dispositionSet.findings;
}

/** Preserve a site's grounds while proving fixes through the subject's performed-response proof. */
export async function confirmReviewCorrectionLeg(input: PerformedResponseProofInput & {
  readonly confirmGrounds?: () => Promise<IncrementalPredecessorApplicability>;
}): Promise<IncrementalPredecessorApplicability> {
  const grounds = await input.confirmGrounds?.().catch(() => "unavailable" as const) ?? "unavailable";
  if (input.predecessor.target.kind !== "change-set") return confirmDeliveryCorrectionLeg(input, grounds);
  const findings = await approvedFindings(input);
  if (findings?.some(finding => finding.disposition === "fix") !== true) return grounds;
  return confirmPerformedResponse(input);
}

function samePolicy(predecessor: ReviewResult, input: ReviewNextPassInput,
  currentTarget: PerformedResponseProofInput["currentTarget"]): boolean {
  if (predecessor.kind === "frontline") return false;
  const { obligation, reasons, rubricVersion, rubricDigest, retrigger, count } = predecessor.requirement;
  return predecessor.repositoryId === currentTarget.repositoryId
    && laneSubjectOwnerMatches(predecessor.admission.lineage, input.currentLineage)
    && canonicalize({ obligation, reasons: [...reasons].sort(), rubricVersion, rubricDigest, retrigger, count })
      === canonicalize({ ...input.standardReview, reasons: [...input.standardReview.reasons].sort() });
}

/** Derive the predecessor's convergence, response obligation, and exact next correction scope. */
export async function deriveReviewNextPassContext(input: ReviewNextPassInput): Promise<ReviewNextPassContext> {
  const { predecessor, currentTarget } = input;
  if (predecessor === null) return { convergence: "none", responseDue: false, incremental: null };
  const readResponseEvidence = (result: ReviewResult) => readIncrementalPredecessorResponseEvidence(
    result, input.dispositionStore, input.readResponsePerformance,
  );
  const response = await readResponseEvidence(predecessor);
  const findings = predecessor.originalOutcome === "clean" ? [] : await approvedFindings({ ...input, predecessor });
  const convergence = findings !== null && fixesMaterialFinding(findings) ? "unconverged"
    : response.status === "performed" ? "converged" : "pending";
  const responseDue = predecessor.originalOutcome === "findings" && response.status !== "performed";
  if (currentTarget === null || !samePolicy(predecessor, input, currentTarget)
    || (input.standardReview.retrigger === "full-final" && convergence !== "unconverged")) {
    return { convergence, responseDue, incremental: null };
  }
  const { confirmApplicability, confirmCurrentApplicability } = input;
  const scope = await resolveIncrementalCorrectionScope({ predecessor, currentHeadSha: currentTarget.headSha }, {
    resultReader: input.resultReader,
    readResponseEvidence,
    confirmApplicability: (earlier, current) => confirmReviewCorrectionLeg({
      ...input, predecessor: earlier, currentTarget: current.target,
      currentLineage: current.admission.lineage, currentResult: current,
      confirmGrounds: confirmApplicability === undefined ? undefined
        : () => confirmApplicability(earlier, current),
    }),
    confirmCurrentApplicability: earlier => confirmReviewCorrectionLeg({
      ...input, predecessor: earlier, currentTarget,
      confirmGrounds: confirmCurrentApplicability === undefined ? undefined
        : () => confirmCurrentApplicability(earlier),
    }),
  });
  return { convergence, responseDue, incremental: scope === null ? null : { basis: "fix-check", scope } };
}

/** Select a referenced terminal or an owning composition's earlier-head producer before deriving the next look. */
export async function deriveReviewNextPassContextFromAttempts(input: Omit<ReviewNextPassInput, "predecessor"> & {
  readonly attempts: readonly { readonly outcome: string; readonly reviewOperationId?: string }[];
  readonly predecessorOperationId?: string;
}): Promise<ReviewNextPassContext> {
  const terminal = input.attempts.at(-1);
  const producerId = terminal?.outcome === "clean" || terminal?.outcome === "findings"
    ? terminal.reviewOperationId : input.predecessorOperationId;
  return deriveReviewNextPassContext({
    ...input,
    predecessor: producerId === undefined ? null : await input.resultReader.readResult(producerId),
  });
}

/** Select the latest completed producer, ignoring retries that produced no verdict. */
export function latestCompletedLaneAttempt<Attempt extends { readonly logicalPass: number; readonly outcome: string }>(
  attempts: readonly Attempt[],
): Attempt | undefined {
  return [...attempts].filter(attempt => attempt.outcome === "clean" || attempt.outcome === "findings"
    || attempt.outcome === "settled-findings").sort((left, right) => right.logicalPass - left.logicalPass)[0];
}
