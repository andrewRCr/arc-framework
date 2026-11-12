/** Preserve native refusal repair guidance at review command boundaries. */
import type { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import { nativeRefusalReport } from "../../../lib/store/native-refusal.js";
import type { Remedy } from "../../../lib/store/refusal.js";
import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { ReviewCommandModeSchema, type ReviewCommandMode } from "../core/review-command-envelope.js";

// Pre-publication takes its work unit as an operand, not a request, and supplies its own retry.
const COMMAND_PATHS: Record<Exclude<ReviewCommandMode, "review-pre-publication">, readonly string[]> = {
  "review-readiness": ["readiness"],
  "review-lane-read": ["lane", "read"],
  "review-adversarial-record": ["adversarial", "record"],
  "review-resolve": ["resolve"],
  "review-frontline-resolve": ["frontline", "resolve"],
  "review-chunking-resolve": ["changeset", "resolve"],
  "review-planning-grooming-resolve": ["planning-grooming", "resolve"],
  "review-frontline-run": ["frontline", "run"],
  "review-local-prepare": ["local", "prepare"],
  "review-local-attest": ["local", "attest"],
  "review-local-cancel": ["local", "cancel"],
  "review-respond": ["respond"],
  "review-reduce": ["reduce"],
  "review-local-resume": ["local", "resume"],
  "review-hosted-request": ["hosted", "request"],
  "review-hosted-await": ["hosted", "await"],
  "review-hosted-settle": ["hosted", "settle"],
  "review-hosted-dismiss": ["hosted", "dismiss"],
  "review-terminus-accept": ["terminus", "accept"],
};

/** Keep a failure's own command when present; otherwise retain the caller's exact retry input. */
export function reviewFailureSpineRemedy(reason: string, remedy: Remedy, retryArgv: readonly string[],
  submittedRequest?: unknown): SpineRemedy {
  const argv = remedy.argv ?? retryArgv;
  return spineRemedy(reason, remedy.text, argv, argv.at(-1) === "-" ? submittedRequest : undefined);
}

/** Keep the port's command when present; otherwise retain the caller's exact retry input. */
export function projectIdentitySpineRemedy(error: ProjectIdentityError, retryArgv: readonly string[],
  submittedRequest?: unknown): SpineRemedy {
  return reviewFailureSpineRemedy(error.failure.reason, error.failure.remedy, retryArgv, submittedRequest);
}

/** The review command's own request-bearing retry, absent for pre-publication. */
export function reviewRequestRetryArgv(mode: ReviewCommandMode): readonly string[] | undefined {
  return mode === "review-pre-publication" ? undefined : ["arc", "review", ...COMMAND_PATHS[mode], "-"];
}

/**
 * Build a review command's request-bearing retry for a native typed refusal: a project-identity failure, a work-item
 * selection refusal, or an off-branch store's refusal. Other failures and other command families get none.
 */
export function reviewFailureRequestRemedy(mode: string, error: unknown, submittedRequest?: unknown): SpineRemedy | undefined {
  const report = nativeRefusalReport(error);
  const parsed = ReviewCommandModeSchema.safeParse(mode);
  const argv = parsed.success ? reviewRequestRetryArgv(parsed.data) : undefined;
  return report === null || argv === undefined ? undefined
    : reviewFailureSpineRemedy(report.condition, report.remedy, argv, submittedRequest);
}
