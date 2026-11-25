/** Read-only frontline result projections preserve captured identities without launch coordinates. */
import type { ReviewOutcome } from "../../../lib/store/kinds/review/outcome/schema.js";
import { canonicalize } from "../../../lib/kernel/index.js";
import { FrontlineReviewOutcomeSchema, FrontlineUnavailableReasonSchema, FrontlineFailedReasonSchema,
  type FrontlineReviewOutcome } from "../policy/frontline-outcome.js";
import type { FrontlineAdmission } from "./frontline-admission.js";
import type { BoundFrontlineResponseBinding } from "./frontline-response-binding.js";
import { projectPortableFrontlineAdmission } from "./portable-frontline-admission.js";
import { computeFrontlineSourceBindingId } from "./frontline-source-binding.js";

/** Project a captured run result, including inconclusive provider reasons, without replaying its effect. */
export function projectStoredFrontlineOutcome(value: ReviewOutcome): FrontlineReviewOutcome {
  const binding = value.frontline;
  if (binding === undefined) throw new Error("Stored result is not a frontline outcome.");
  const reason = binding.reason;
  const outcome = reason === null ? value.outcome : FrontlineUnavailableReasonSchema.safeParse(reason).success
    ? "unavailable" : FrontlineFailedReasonSchema.safeParse(reason).success ? "failed" : value.outcome;
  return FrontlineReviewOutcomeSchema.parse({ schemaVersion: 1, semanticsVersion: "frontline-review/v1",
    source: binding.admission.frontlineReview.source, target: value.target, pass: value.logicalPass,
    maxPasses: binding.admission.maxPasses, outcome, findings: value.findings, reason });
}

/** Compare a ready admission to its captured portable policy and original source binding. */
export function storedFrontlineAdmissionMatches(value: ReviewOutcome, admission: FrontlineAdmission,
  responseBinding?: BoundFrontlineResponseBinding): boolean {
  const binding = value.frontline, source = admission.frontlineReview.source;
  return binding !== undefined && source !== null
    && canonicalize(binding.admission) === canonicalize(projectPortableFrontlineAdmission(admission))
    && canonicalize(binding.responseBinding ?? null) === canonicalize(responseBinding ?? null)
    && binding.sourceBindingId === computeFrontlineSourceBindingId(source, responseBinding);
}
