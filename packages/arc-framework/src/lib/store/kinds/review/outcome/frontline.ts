/** Portable frontline admission snapshots retain recorded policy and result digests. */
import { z } from "zod";
import { canonicalize } from "../../../../kernel/index.js";
import { FrontlineAdmissionSchema, type FrontlineAdmission } from "../../../../../scripts/review-gate/core/frontline-admission.js";
import { computeFrontlineSourceBindingId } from "../../../../../scripts/review-gate/core/frontline-source-binding.js";
import { frontlineLaneOutcome } from "../../../../../scripts/review-gate/core/frontline-lane-outcome.js";
import { ReviewCanonicalDigestSchema } from "../../../../../scripts/review-gate/core/gate-contract-v2-schema.js";
import { projectPortableFrontlineAdmission, PortableFrontlineAdmissionSchema } from "../../../../../scripts/review-gate/core/portable-frontline-admission.js";
import { FrontlineExecutableIdentitySchema, type FrontlineOutcomeRecord } from "../../../../../scripts/review-gate/core/advisory-records.js";
import { BoundFrontlineResponseBindingSchema } from "../../../../../scripts/review-gate/core/frontline-response-binding.js";
import {
  FrontlineUnavailableReasonSchema, FrontlineFailedReasonSchema,
  FrontlineTimedOutReasonSchema, FrontlineStaleTargetReasonSchema,
} from "../../../../../scripts/review-gate/policy/frontline-outcome.js";

export const FrontlineOutcomeBindingSchema = z.strictObject({
  admission: PortableFrontlineAdmissionSchema,
  outcomeDigest: ReviewCanonicalDigestSchema,
  sourceBindingId: ReviewCanonicalDigestSchema,
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

type FrontlineOutcomeProjection = {
  schemaVersion: 1;
  attemptId: string;
  lane: "frontline";
  lineage: FrontlineAdmission["lineage"];
  logicalPass: number;
  retryGeneration: number;
  source: { sourceId: string; kind: "frontline" };
  target: FrontlineAdmission["target"];
  requestedCoverage: "complete";
  effectiveCoverage: "complete" | null;
  outcome: Exclude<ReturnType<typeof frontlineLaneOutcome>, null | "pending" | "settled-findings">;
  findings: FrontlineOutcomeRecord["outcome"]["findings"];
  endedAt: string;
  frontline: z.infer<typeof FrontlineOutcomeBindingSchema>;
};

/** Capture a run's original identities before removing executable launch coordinates. */
export function projectFrontlineOutcome(admissionInput: FrontlineAdmission, record: FrontlineOutcomeRecord,
  endedAt: string): FrontlineOutcomeProjection {
  const admission = FrontlineAdmissionSchema.parse(admissionInput);
  const source = record.outcome.source;
  const promptText = admission.frontlineReview.promptText;
  if (admission.frontlineReview.action !== "attempt" || promptText === null
    || record.outcome.reason?.class === "pass-cap-exhausted") throw new Error("Frontline record has no admitted attempt.");
  const sourceBindingId = computeFrontlineSourceBindingId(source, record.responseBinding);
  if (canonicalize(source) !== canonicalize(admission.frontlineReview.source)
    || canonicalize(record.outcome.target) !== canonicalize(admission.target)
    || record.outcome.pass !== admission.logicalPass || record.outcome.maxPasses !== admission.maxPasses) {
    throw new Error(`Frontline outcome does not match admission ${admission.operationId}.`);
  }
  const outcome = frontlineLaneOutcome(record.outcome.outcome, record.outcome.reason?.class ?? null);
  if (outcome === null || outcome === "pending" || outcome === "settled-findings") throw new Error("Frontline record has no ended attempt.");
  const complete = outcome === "clean" || outcome === "findings";
  return {
    schemaVersion: 1, attemptId: admission.operationId, lane: "frontline", lineage: admission.lineage,
    logicalPass: admission.logicalPass, retryGeneration: admission.retryGeneration,
    source: { sourceId: source.sourceId, kind: "frontline" }, target: admission.target,
    requestedCoverage: "complete", effectiveCoverage: complete ? "complete" : null,
    outcome,
    findings: record.outcome.findings, endedAt,
    frontline: { admission: projectPortableFrontlineAdmission(admission),
    outcomeDigest: record.outcomeDigest, sourceBindingId, executableIdentity: record.executableIdentity,
    reason: record.outcome.reason, ...(record.responseBinding === undefined ? {} : { responseBinding: record.responseBinding }) },
  };
}
