/** Portable frontline admission snapshots retain recorded policy and result digests. */
import { z } from "zod";
import { frontlineLaneOutcome } from "../../../../../scripts/review-gate/core/frontline-lane-outcome.js";
import { FrontlineAdmissionSchema } from "../../../../../scripts/review-gate/core/frontline-admission.js";
import { PortableFrontlineAdmissionSchema } from "../../../../../scripts/review-gate/core/portable-frontline-admission.js";
import { FrontlineExecutableIdentitySchema } from "../../../../../scripts/review-gate/core/advisory-records.js";
import { BoundFrontlineResponseBindingSchema } from "../../../../../scripts/review-gate/core/frontline-response-binding.js";
import {
  FrontlineUnavailableReasonSchema, FrontlineFailedReasonSchema,
  FrontlineTimedOutReasonSchema, FrontlineStaleTargetReasonSchema,
} from "../../../../../scripts/review-gate/policy/frontline-outcome.js";

export const FrontlineOutcomeBindingSchema = z.strictObject({
  admission: PortableFrontlineAdmissionSchema,
  outcomeDigest: FrontlineAdmissionSchema.shape.policyVersion,
  sourceBindingId: FrontlineAdmissionSchema.shape.policyVersion,
  executableIdentity: FrontlineExecutableIdentitySchema.nullable(),
  reason: z.union([
    z.null(), FrontlineUnavailableReasonSchema, FrontlineFailedReasonSchema,
    FrontlineTimedOutReasonSchema, FrontlineStaleTargetReasonSchema,
  ]),
  responseBinding: BoundFrontlineResponseBindingSchema.optional(),
});

/** Match a stored lane outcome to the portable frontline reason and launch facts. */
export function validateFrontlineResult(
  binding: z.infer<typeof FrontlineOutcomeBindingSchema>, outcome: string, context: z.RefinementCtx,
): void {
  const reason = binding.reason?.class ?? null;
  const fail = (message: string) => { context.addIssue({ code: "custom", path: ["frontline"], message }); };
  const mapped = reason === null ? outcome === "clean" || outcome === "findings" ? outcome : null
    : frontlineLaneOutcome("failed", reason);
  if (mapped !== outcome) fail("frontline reason must match its recorded lane outcome");
  const neverLaunched = reason === "source-unbound";
  const launchOptional = reason === "capability-unsupported" || outcome === "stale-target"
    || outcome === "timed-out" || (reason !== null && FrontlineFailedReasonSchema.safeParse(binding.reason).success);
  if ((neverLaunched && binding.executableIdentity !== null)
    || (!neverLaunched && !launchOptional && binding.executableIdentity === null)) {
    fail("frontline executable identity must match whether its producer launched");
  }
}
