/** Preserve project-identity and store repair guidance at review command boundaries. */
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
import { StoreRefusalError } from "../../../lib/store/refusal-error.js";
import type { Remedy } from "../../../lib/store/refusal.js";
import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import { ReviewCommandModeSchema, type ReviewCommandMode } from "../core/review-command-envelope.js";

const COMMAND_PATHS: Record<ReviewCommandMode, readonly string[]> = {
  "review-readiness": ["readiness"],
  "review-lane-read": ["lane", "read"],
  "review-adversarial-record": ["adversarial", "record"],
  "review-resolve": ["resolve"],
  "review-frontline-resolve": ["frontline", "resolve"],
  "review-chunking-resolve": ["chunking", "resolve"],
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
  "review-pre-publication": ["pre-publication"],
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

/** The review command's own request-bearing retry. */
export function reviewRequestRetryArgv(mode: ReviewCommandMode): readonly string[] {
  return ["arc", "review", ...COMMAND_PATHS[mode], "-"];
}

/** Build a request-bearing review retry without changing unrelated command families. */
export function reviewProjectIdentityRequestRemedy(mode: string, error: unknown,
  submittedRequest?: unknown): SpineRemedy | undefined {
  if (!(error instanceof ProjectIdentityError)) return undefined;
  const parsed = ReviewCommandModeSchema.safeParse(mode);
  if (!parsed.success) return undefined;
  return projectIdentitySpineRemedy(error, reviewRequestRetryArgv(parsed.data), submittedRequest);
}

/** Build the request-bearing retry for a project-identity failure or an off-branch store's refusal. */
export function reviewFailureRequestRemedy(mode: string, error: unknown, submittedRequest?: unknown): SpineRemedy | undefined {
  if (!(error instanceof StoreRefusalError) || !error.offBranch) return reviewProjectIdentityRequestRemedy(mode, error, submittedRequest);
  const parsed = ReviewCommandModeSchema.safeParse(mode);
  return parsed.success ? reviewFailureSpineRemedy(error.refusal.condition, error.refusal.remedy,
    reviewRequestRetryArgv(parsed.data), submittedRequest) : undefined;
}
