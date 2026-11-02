/** Write admission for versioned publication boundaries. */
import type { BrokenRule, WriteCheckInput } from "../../../write-check.js";
import { parseReviewIntegrationBoundary } from "./parser.js";
import { deriveReviewReadinessBinding } from "./readiness.js";
import { reviewListingRefusal } from "../fact-access.js";
import type { ListingOutcome } from "../../../read.js";

async function publicationListing(input: WriteCheckInput, kind: "review/outcome" | "review/evidence" | "review/decision"):
  Promise<ListingOutcome> {
  const result = await input.after.list({ family: "review", kind, owner: input.reference.owner });
  const refusal = reviewListingRefusal(result);
  if (refusal !== null) return { status: "unreadable", condition: refusal.condition, remedy: refusal.remedy };
  if (result.status === "refused") return { status: "unreadable", condition: result.refusal.condition, remedy: result.refusal.remedy };
  return result.result;
}

/** Admit current boundary writes. */
export async function checkReviewIntegrationBoundary(input: WriteCheckInput): Promise<readonly BrokenRule[]> {
  const value = input.next === undefined ? null : parseReviewIntegrationBoundary(input.next.content);
  if (value?.schemaVersion === 1) return [{ rule: "review.integration-boundary.version",
    condition: "Retained version-one publication boundaries are read-only.",
    remedy: { text: `Run arc review pre-publication ${value.workUnit} to record its boundary in the current version-two format, then retry.`,
      argv: ["arc", "review", "pre-publication", value.workUnit] } }];
  if (value?.locus !== "publication-pending" || input.writer.kind !== "verb" || input.writer.verb !== "publish") return [];
  const [outcomes, evidence, decisions] = await Promise.all([
    publicationListing(input, "review/outcome"), publicationListing(input, "review/evidence"), publicationListing(input, "review/decision"),
  ]);
  // Pre-publication admits no pending review. The publisher retains its lane lock and checks the selected local
  // pending basis; final admission independently binds the proposed durable facts, including synchronized additions.
  const binding = deriveReviewReadinessBinding({ outcomes, evidence, decisions,
    subjectOwner: { kind: "candidate", candidateId: value.candidateId }, inFlight: [] });
  if (binding.status === "complete" && binding.digest === value.readinessBinding) return [];
  return [{ rule: "review.integration-boundary.publication-readiness",
    condition: binding.status === "incomplete" ? `Publication readiness is incomplete: ${binding.condition}`
      : "Standard review progress changed after publication readiness.",
    remedy: { text: `Run arc review pre-publication ${value.workUnit}, then retry publication.`,
      argv: ["arc", "review", "pre-publication", value.workUnit] } }];
}
