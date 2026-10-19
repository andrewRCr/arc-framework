/** Review-choice envelopes sharing production subject and authorization identities. */
import { canonicalDigest } from "../../src/lib/kernel/index.js";
import type { ReviewDecision } from "../../src/lib/store/kinds/review/decision/schema.js";
import type { ReviewOutcome } from "../../src/lib/store/kinds/review/outcome/schema.js";

export function terminusDecision(): ReviewDecision {
  return { schemaVersion: 1, subject: { lineage: { kind: "candidate", candidateId: canonicalDigest({ candidate: 1 }) },
    headSha: null, subjectDigest: canonicalDigest({ subject: 1 }) }, lane: "standard", choice: { kind: "terminus" },
    decidedBy: "andrew", decidedAt: "2026-10-19T13:00:00Z", basis: { passCount: 2 } };
}

export function extraPassDecision(kind: "ceiling" | "additional" = "ceiling"): ReviewDecision {
  return { ...terminusDecision(), choice: { kind: "extra-pass", passCount: 2,
    precondition: kind === "ceiling" ? { kind } : { kind, precedingProducerId: "producer-1" } }, basis: null };
}

export function approvedFixDecision(outcome: ReviewOutcome): ReviewDecision {
  return { ...terminusDecision(), subject: { lineage: outcome.lineage, headSha: outcome.target.headSha, subjectDigest: null },
    lane: outcome.lane, choice: { kind: "extra-pass", passCount: outcome.logicalPass,
      precondition: { kind: "approved-fix", repositoryId: outcome.target.repositoryId, producerId: outcome.attemptId,
        dispositionSetId: canonicalDigest({ set: 1 }), originatingHeadSha: outcome.target.headSha,
        exhaustedPassCount: outcome.logicalPass } }, basis: null };
}
