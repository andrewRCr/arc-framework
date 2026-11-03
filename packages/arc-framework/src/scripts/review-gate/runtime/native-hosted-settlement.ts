/** Hosted reply receipts advance their exact approved native response. */
import { assertNativeHostedResponseHeads } from "./native-hosted-response-heads.js";
import type { ConfirmResponseHeadContinuation } from "../core/response-head-continuation.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { StoredReviewResultReader } from "../hosts/local/stored-result-reader.js";
import { HostedSettlementEvidenceSchema, type HostedSettlementEvidence } from "../core/operation-state-schema.js";
import type { NativeReviewApprovalInput } from "./native-review-approval.js";
import type { StoredReviewFact } from "../core/ports.js";
import type { ReviewEvidence } from "../../../lib/store/kinds/review/evidence/schema.js";

/** One completed host action supplied by the selected invocation. */
interface NativeHostedSettlementInput extends Omit<NativeReviewApprovalInput, "record" | "now"> {
  producerId: string;
  confirmResponseHeadContinuation?: ConfirmResponseHeadContinuation;
  settlement: Extract<HostedSettlementEvidence, { channelAction: "reply-and-resolve" }>;
}

/** Append one completed finding action, preserving exact settlement replay. */
export async function publishNativeHostedSettlement(input: NativeHostedSettlementInput): Promise<StoredReviewFact<ReviewEvidence>> {
  const result = await new StoredReviewResultReader(input).readResult(input.producerId);
  const entry = HostedSettlementEvidenceSchema.parse(input.settlement);
  const prior = await input.evidence.read(entry.dispositionSetId);
  if (prior === null) throw new Error("Approve the hosted response before recording settlement, then retry.");
  const settlement = prior.value.settlement;
  if (result.kind !== "hosted" || result.originalOutcome !== "findings"
    || prior.value.dispositionSet.producerId !== input.producerId || settlement === undefined
    || prior.value.successorDispositionSetId !== null) {
    throw new Error("Hosted settlement requires the current approved response for this producer; restore it and retry.");
  }
  const current = settlement.evidence.find(candidate => candidate.findingId === entry.findingId);
  if (current !== undefined) {
    if (canonicalize(current) !== canonicalize({ ...entry, performedAt: current.performedAt })) {
      throw new Error("Hosted settlement conflicts with its recorded receipt; replay the original host receipt.");
    }
    return prior;
  }
  const next = { ...prior.value, settlement: { ...settlement, evidence: [...settlement.evidence, entry] } };
  await assertNativeHostedResponseHeads(next, result, input.confirmResponseHeadContinuation);
  return input.evidence.advance(next, prior.version);
}
