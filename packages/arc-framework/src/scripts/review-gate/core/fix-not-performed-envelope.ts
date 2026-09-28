/** Recovery payload for an approved fix that lacks exact performed-response evidence. */

import { z } from "zod";

import { CandidateVerificationApplicabilitySchema } from
  "../../../lib/work-unit/candidate-evidence.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";

/** The remedy for a settlement whose approved fix has no recorded verified response yet. */
export const FIX_NOT_PERFORMED_INTERACTION_TEXT = "Complete the approved fix, submit its verifiedFix response with "
  + "the approved verification scope, then retry the exact settlement request.";

export const FixNotPerformedPayloadSchema = z.strictObject({
  operationId: ReviewIdentifierSchema,
  dispositionSetId: ReviewCanonicalDigestSchema,
  approvedVerification: CandidateVerificationApplicabilitySchema,
  interactionText: z.string().trim().min(1),
});
