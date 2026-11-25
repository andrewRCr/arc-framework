/** Prepare an authorized terminus decision without separating it from its boundary transaction. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";
import { ReviewDecisionSchema, type ReviewDecision } from "../../../lib/store/kinds/review/decision/schema.js";
import { reviewDecisionKey } from "../../../lib/store/kinds/review/decision/key.js";
import type { NativeReviewFactPorts, ReviewFactPut } from "../core/ports.js";
import { resolveNativeReviewTerminus } from "./native-terminus.js";

/** A decision key and its create-only mutation, omitted when the same live decision is already stored. */
export interface PreparedNativeReviewTerminus {
  key: CanonicalDigest;
  put?: ReviewFactPut;
}

/** Prepare the Owner's recorded judgment, retaining an existing decision on exact replay. */
export async function prepareNativeReviewTerminus(input: {
  facts: Pick<NativeReviewFactPorts, "decisions">; subject: ReviewDecision["subject"];
  acceptedBy: string; completedPasses: number; now: string;
}): Promise<PreparedNativeReviewTerminus> {
  const subject = { ...input.subject, headSha: input.subject.lineage.kind === "candidate" ? null : input.subject.headSha };
  const live = await resolveNativeReviewTerminus({ facts: input.facts, subject });
  const value = ReviewDecisionSchema.parse({ schemaVersion: 1, subject, lane: "standard", choice: { kind: "terminus" },
    decidedBy: input.acceptedBy, decidedAt: input.now, basis: { passCount: input.completedPasses } });
  const key = reviewDecisionKey(value), prior = await input.facts.decisions.read(key);
  if (prior !== null && live?.decisionKey !== key) {
    throw new Error("The recorded terminus is withdrawn or superseded; restore current live authority and retry.");
  }
  return { key, ...(prior === null ? { put: input.facts.decisions.prepareCreate(value) } : {}) };
}
