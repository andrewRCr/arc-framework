/** Factual delivery-member cursor shared by actionable status results. */
import type { z } from "zod";
import type { DeliveryReviewConjunctionMemberSchema, DeliveryReviewConjunctionSchema, ReviewStatusResult } from "./status.js";

/** Preserve the selected member while projecting the conjunction's completion counts. */
export function projectDeliveryReviewCursor(
  conjunction: z.infer<typeof DeliveryReviewConjunctionSchema>,
  currentMember: z.infer<typeof DeliveryReviewConjunctionMemberSchema>,
): NonNullable<ReviewStatusResult["deliveryCursor"]> {
  return { status: conjunction.status,
    completedMemberCount: conjunction.members.filter(member => member.state === "discharged").length,
    memberCount: conjunction.members.length, currentMember };
}
