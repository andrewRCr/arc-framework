/** Portable frontline admission snapshots retain recorded policy and result digests. */
import { z } from "zod";
import { frontlineLaneOutcome } from "../../../../../scripts/review-gate/lane-progress.js";
import { FrontlineAdmissionSchema, frontlineAdmissionOperationId } from "../../../../../scripts/review-gate/core/frontline-admission.js";
import { FrontlineSemanticRecordSchema } from "../../../../../scripts/review-gate/policy/frontline-semantic.js";
import { FrontlineExecutableIdentitySchema } from "../../../../../scripts/review-gate/core/advisory-records.js";
import { BoundFrontlineResponseBindingSchema } from "../../../../../scripts/review-gate/core/frontline-response-binding.js";
import {
  FrontlineUnavailableReasonSchema, FrontlineFailedReasonSchema,
  FrontlineTimedOutReasonSchema, FrontlineStaleTargetReasonSchema,
} from "../../../../../scripts/review-gate/policy/frontline-outcome.js";

export const PortableFrontlineSourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ sourceId: z.string().min(1), kind: z.literal("command"), capability: z.null() }),
  z.strictObject({ sourceId: z.string().min(1), kind: z.literal("agent"), capability: z.string().min(1) }),
]);
export const PortableFrontlineAdmissionSchema = z.strictObject({
  ...FrontlineAdmissionSchema.shape,
  frontlineReview: z.strictObject({
    ...FrontlineSemanticRecordSchema.shape,
    action: z.literal("attempt"),
    source: PortableFrontlineSourceSchema,
    promptText: z.string().min(1),
    maxPasses: FrontlineAdmissionSchema.shape.maxPasses,
  }),
}).superRefine((admission, context) => {
  if (admission.logicalPass > admission.maxPasses
    || admission.maxPasses !== admission.frontlineReview.maxPasses) {
    context.addIssue({ code: "custom", message: "frontline admission must respect its admitted pass ceiling" });
  }
  if (admission.operationId !== frontlineAdmissionOperationId({
    target: admission.target, lineage: admission.lineage,
    sourceId: admission.frontlineReview.source.sourceId,
    logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration,
  })) context.addIssue({ code: "custom", message: "frontline operation must match its admitted producer" });
});

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
