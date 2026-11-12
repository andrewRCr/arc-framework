/** Cross-record comparison of carried hosted settlement receipts. */
import { canonicalize } from "../../../../kernel/index.js";
import type { BrokenRule } from "../../../write-check.js";
import { brokenRule } from "../../rule-support.js";
import type { HostedSettlementEvidence } from "../../../../../scripts/review-gate/core/operation-state-schema.js";
import type { EvidenceHistory } from "./history.js";
import type { ReviewEvidence } from "./schema.js";

/** Require every carried receipt to retain its direct predecessor's exact settlement facts. */
export function checkEvidenceSettlementCarry(value: ReviewEvidence, after: EvidenceHistory): readonly BrokenRule[] {
  const parent = value.predecessorDispositionSetId === null ? undefined : after.get(value.predecessorDispositionSetId);
  const invalid = value.settlement?.evidence.some((entry) => {
    if (entry.carriedFromDispositionSetId === null) return false;
    const original = parent?.settlement?.evidence.find(({ findingId }) => findingId === entry.findingId);
    return original === undefined || canonicalize(receipt(entry)) !== canonicalize(receipt(original));
  });
  return invalid === true ? [brokenRule("review.evidence.settlement-carry", "Carried settlement differs from its predecessor's receipt.",
    "Carry the exact predecessor receipt, changing only its disposition-set and carried-from coordinates.")] : [];
}

function receipt(entry: HostedSettlementEvidence): unknown {
  return { ...entry, dispositionSetId: null, carriedFromDispositionSetId: null };
}
