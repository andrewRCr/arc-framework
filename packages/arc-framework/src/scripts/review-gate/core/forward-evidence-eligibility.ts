/** Forward-eligibility boundary that keeps parsed legacy evidence audit-only. */

import {
  parseVersionedReviewReceipt,
  reviewContractVersionAt,
} from "./contract-version-dispatch.js";
import type { ReviewReceiptV2 } from "./gate-contract-v2-schema.js";

export type ForwardEvidenceEligibility =
  | {
      eligible: false;
      version: 1;
      reason: "legacy-audit-only";
      receipt: ReturnType<typeof parseVersionedReviewReceipt>["record"];
      requestReuseKey: null;
      sourceClosureIdentity: null;
    }
  | {
      eligible: true;
      version: 2;
      reason: null;
      receipt: ReviewReceiptV2;
      requestReuseKey: string;
      sourceClosureIdentity: string;
    };

/** Parse receipt history while granting forward authority only to an exact v2 composite. */
export function classifyForwardEvidenceEligibility(input: Parameters<typeof parseVersionedReviewReceipt>[0]):
ForwardEvidenceEligibility {
  const parsed = parseVersionedReviewReceipt(input);
  if (parsed.version === 1) {
    return {
      eligible: false,
      version: 1,
      reason: "legacy-audit-only",
      receipt: parsed.record,
      requestReuseKey: null,
      sourceClosureIdentity: null,
    };
  }
  return {
    eligible: true,
    version: 2,
    reason: null,
    receipt: parsed.record,
    requestReuseKey: parsed.record.requestId,
    sourceClosureIdentity: parsed.record.evaluatorIdentity,
  };
}

/** Legacy projections remain readable by their parser but never enter forward verdict membership. */
export function isForwardProjectionVersion(input: unknown): boolean {
  return reviewContractVersionAt(input, "projection") === 2;
}
