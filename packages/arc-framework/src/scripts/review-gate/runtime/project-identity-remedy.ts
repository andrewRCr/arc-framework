/** Preserve project-identity repair guidance at review command boundaries. */
import { ProjectIdentityError } from "../../../lib/store/project-identity.js";
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
  "review-respond": ["respond"],
  "review-reduce": ["reduce"],
  "review-local-resume": ["local", "resume"],
  "review-hosted-request": ["hosted", "request"],
  "review-hosted-await": ["hosted", "await"],
  "review-hosted-settle": ["hosted", "settle"],
  "review-terminus-accept": ["terminus", "accept"],
  "review-pre-publication": ["pre-publication"],
};

/** Keep the port's command when present; otherwise retain the caller's exact retry input. */
export function projectIdentitySpineRemedy(error: ProjectIdentityError, retryArgv: readonly string[],
  submittedRequest?: unknown): SpineRemedy {
  const argv = error.failure.remedy.argv ?? retryArgv;
  return spineRemedy(error.failure.reason, error.failure.remedy.text, argv,
    argv.at(-1) === "-" ? submittedRequest : undefined);
}

/** Build a request-bearing review retry without changing unrelated command families. */
export function reviewProjectIdentityRequestRemedy(mode: string, error: unknown,
  submittedRequest?: unknown): SpineRemedy | undefined {
  if (!(error instanceof ProjectIdentityError)) return undefined;
  const parsed = ReviewCommandModeSchema.safeParse(mode);
  if (!parsed.success) return undefined;
  return projectIdentitySpineRemedy(error, ["arc", "review", ...COMMAND_PATHS[parsed.data], "-"], submittedRequest);
}
