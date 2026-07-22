/** Explicit project-channel qualification for exact forward review evidence. */

import { z } from "zod";

import type {
  ReviewReceiptV2,
  ReviewRequestV2,
  ReviewRequirementV2,
} from "./gate-contract-v2-schema.js";

export const ReviewChannelSchema = z.enum(["local", "hosted", "both"]);
export type ReviewChannel = z.infer<typeof ReviewChannelSchema>;

/** Qualification result retained for diagnostics without changing requirement identity. */
export interface ForwardSourceQualification {
  qualified: boolean;
  channel: ReviewChannel;
  source: "local" | "hosted";
  reasons: string[];
}

/** Qualify one already-validated request/receipt pair against explicit channel and source policy. */
export function qualifyForwardReviewSource(input: {
  channel: ReviewChannel;
  requirement: ReviewRequirementV2;
  request: ReviewRequestV2;
  receipt: ReviewReceiptV2;
}): ForwardSourceQualification {
  const channel = ReviewChannelSchema.parse(input.channel);
  const source = input.request.carrier.kind === "local-change-set" ? "local" : "hosted";
  const reasons: string[] = [];
  if (channel !== "both" && channel !== source) reasons.push("channel-not-enabled");
  const acceptable = input.requirement.acceptableSources.some((candidate) =>
    candidate.sourceKind === "agent"
    && (candidate.qualifier === null || candidate.qualifier === input.requirement.rubricVersion));
  if (!acceptable) reasons.push("source-not-accepted");
  if (source === "local" && input.receipt.providerEventIdentity !== null) {
    reasons.push("local-provider-event-present");
  }
  if (source === "hosted" && input.receipt.providerEventIdentity === null) {
    reasons.push("hosted-provider-event-missing");
  }
  return { qualified: reasons.length === 0, channel, source, reasons };
}
