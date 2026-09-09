/** Producer-bound validation shared by response, reduction, and replay consumers. */

import { canonicalize } from "../../../lib/kernel/index.js";
import {
  ApprovedDispositionRecordSchema,
  type ApprovedDispositionRecord,
} from "./advisory-records.js";
import {
  dispositionSetMatchesSourceContext,
  reviewerDispositionNit,
  reviewerDispositionSeverity,
  type ApprovedDispositionSet,
  type DispositionSourceContext,
} from "./disposition-records.js";
import { validateDispositionState } from "./dispositions.js";
import { parseReviewSourceReference } from "./review-source-reference.js";
import type { ReviewResult } from "./review-result.js";

/**
 * Project the exact source context that participates in canonical disposition identity.
 *
 * @param result - Immutable producer result whose identity and admission bind the proposal.
 * @returns The source context included in the disposition-set preimage.
 */
export function dispositionSourceContextForResult(result: ReviewResult): DispositionSourceContext {
  const producer = {
    producerId: result.producerId,
    resultDigest: result.resultDigest,
  };
  if (result.kind === "frontline") {
    return {
      ...producer,
      kind: "frontline",
      policyVersion: result.admission.policyVersion,
      frontlineBinding: {
        operationId: result.producerId,
        sourceBindingId: result.sourceBindingId,
        outcomeDigest: result.resultDigest,
      },
    };
  }
  return {
    ...producer,
    kind: "rubric",
    policyVersion: result.admission.policyVersion,
    rubricVersion: result.requirement.rubricVersion,
    rubricDigest: result.requirement.rubricDigest,
  };
}

/**
 * Validate one approved set against the complete immutable producer result.
 *
 * @param dispositions - Approved canonical set to validate.
 * @param result - Immutable producer result the approval claims to cover.
 * @returns The validated approved set.
 */
export function validateApprovedDispositionSetForResult(
  dispositions: ApprovedDispositionSet,
  result: ReviewResult,
): ApprovedDispositionSet {
  const validated = validateDispositionState(dispositions);
  if (validated.state !== "approved") throw new Error("producer result requires approved dispositions");
  const set = validated.dispositionSet;
  const context = dispositionSourceContextForResult(result);
  const expectedFindings = result.findings.map((finding) => ({
    findingId: finding.findingId,
    locus: finding.locus,
    severity: finding.severity,
    nit: finding.nit === true,
  })).sort((left, right) => left.findingId.localeCompare(right.findingId));
  const actualFindings = set.findings.map((finding) => ({
    findingId: finding.findingId,
    locus: finding.locus,
    severity: reviewerDispositionSeverity(finding),
    nit: reviewerDispositionNit(finding) === true,
  })).sort((left, right) => left.findingId.localeCompare(right.findingId));
  if (set.targetId !== result.target.targetId
    || !dispositionSetMatchesSourceContext(set, context)
    || !set.findings.every((finding) => finding.sourceIdentity === result.sourceIdentity)
    || canonicalize(actualFindings) !== canonicalize(expectedFindings)) {
    throw new Error("approved dispositions do not match the immutable producer result");
  }
  return validated;
}

/**
 * Validate one durable approved record against its exact immutable producer result.
 *
 * @param recordInput - Durable approved record to validate.
 * @param result - Immutable producer result named by the record.
 * @returns The validated durable record.
 */
export function validateApprovedDispositionRecordForResult(
  recordInput: ApprovedDispositionRecord,
  result: ReviewResult,
): ApprovedDispositionRecord {
  const record = ApprovedDispositionRecordSchema.parse(recordInput);
  validateApprovedDispositionSetForResult(record.approvedDisposition, result);
  if (record.operationId !== result.producerId || record.repositoryId !== result.repositoryId) {
    throw new Error("approved disposition record does not name its immutable producer");
  }
  const source = record.source;
  if (source.kind === "attested-local" && result.kind === "attested-local") {
    const reference = parseReviewSourceReference(source.receiptRef, "attested-local");
    if (reference.operationId === result.producerId
      && reference.durableRef === result.receiptRef
      && source.localSourceRef === result.localSourceRef) return record;
  } else if (source.kind === "frontline" && result.kind === "frontline") {
    const reference = parseReviewSourceReference(source.outcomeRef, "frontline");
    if (reference.operationId === result.producerId
      && reference.durableRef === result.outcomeRef) return record;
  } else if (source.kind === "hosted" && result.kind === "hosted") {
    const reference = parseReviewSourceReference(source.attemptRef, "hosted");
    if (reference.operationId === result.laneOperationId
      && reference.durableRef === result.producerId
      && source.hostedResultId === result.resultDigest) return record;
  }
  throw new Error("approved disposition record source does not match its immutable producer");
}
