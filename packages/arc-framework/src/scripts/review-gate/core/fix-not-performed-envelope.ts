/** Recovery payload for an approved fix that lacks exact performed-response evidence. */

import { z } from "zod";

import { CandidateVerificationApplicabilitySchema } from
  "../../../lib/work-unit/candidate-evidence.js";
import {
  ReviewCanonicalDigestSchema,
  ReviewIdentifierSchema,
} from "./gate-contract-v2-schema.js";

export const FixNotPerformedPayloadSchema = z.strictObject({
  operationId: ReviewIdentifierSchema,
  dispositionSetId: ReviewCanonicalDigestSchema,
  approvedVerification: CandidateVerificationApplicabilitySchema,
  interactionText: z.string().trim().min(1),
});
