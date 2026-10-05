/**
 * Corrective guidance for a review-policy refusal the caller can recover from.
 *
 * A producer spends review capacity only on the action the standard-review driver currently admits, so a request
 * the driver no longer admits refuses before anything is spent; re-reading the lane names what it admits instead,
 * including when the lane is complete or the next pass needs an Owner decision. A lane's attempts belong to the
 * head they reviewed, so re-resolving at a new head while still carrying them refuses; the passes they completed
 * carry forward as the count, and dropping the attempts reaches the ordinary resolution.
 *
 * @module
 */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { ChangeRequestTargetRef } from "../change-request.js";
import { ReviewDriverAdmissionError } from "../policy/review-execution-admission.js";
import { LocalReviewResultReaderError } from "../hosts/local/review-result-reader.js";
import { ReviewPolicyCommandRequestSchema } from "../policy/review-policy-driver.js";

const RESOLVE_ARGV = ["arc", "review", "resolve", "-"] as const;

const ADMISSION_INVARIANT = "Review capacity is spent only on the action the standard-review driver currently admits.";

const ATTEMPTS_INVARIANT = "A lane's attempts belong to the exact head they reviewed; passes completed at an "
  + "earlier head carry forward only as the completed-pass count.";

/** A lane re-resolved at the checkout's current head while still carrying attempts reviewed at an earlier head. */
export class StaleLaneAttemptsError extends Error {
  readonly code = "invalid-input" as const;
  readonly attemptHeadSha: string;
  readonly targetHeadSha: string;

  constructor(input: { attemptHeadSha: string; targetHeadSha: string }) {
    super(`review attempts were reviewed at head ${input.attemptHeadSha}, `
      + `not at the requested current head ${input.targetHeadSha}`);
    this.name = "StaleLaneAttemptsError";
    this.attemptHeadSha = input.attemptHeadSha;
    this.targetHeadSha = input.targetHeadSha;
  }
}

/** A hosted request the driver no longer admits, bound to the open change request whose status re-reads the lane. */
export class HostedReviewAdmissionError extends Error {
  readonly code = "invalid-input" as const;
  readonly admission: ReviewDriverAdmissionError;
  readonly statusTarget: ChangeRequestTargetRef;

  constructor(admission: ReviewDriverAdmissionError, statusTarget: ChangeRequestTargetRef) {
    super(admission.message);
    this.name = "HostedReviewAdmissionError";
    this.admission = admission;
    this.statusTarget = statusTarget;
  }
}

interface LaneReadRoute {
  readonly action: string;
  readonly additionalPass: string;
  readonly ceilingOverride: string;
}

const RESOLVE_ROUTE: LaneReadRoute = {
  action: "re-resolve the lane",
  additionalPass: "`additionalPassAuthorization`",
  ceilingOverride: "`ceilingOverride`",
};

const STATUS_ROUTE: LaneReadRoute = {
  action: "re-read the change request's review status",
  additionalPass: "`--additional-pass`",
  ceilingOverride: "`--ceiling-override`",
};

function admissionCorrection(error: ReviewDriverAdmissionError, route: LaneReadRoute): string {
  if (error.state === "pass-complete") {
    return "The lane is complete for this head; another pass needs the Owner's additional-pass authorization, "
      + `carried as ${route.additionalPass}. To confirm, ${route.action}`;
  }
  if (error.state === "approval-required") {
    return "Another pass exceeds the configured ceiling and needs the Owner's one-pass override, carried as "
      + `${route.ceilingOverride}. For its exact consequence, ${route.action}`;
  }
  if (error.state === "invalid-override") {
    return `The supplied override is invalid (${error.reason ?? "no reason given"}); correct or drop it, then `
      + route.action;
  }
  return `The driver answered ${error.state}/${error.nextAction}; ${route.action} and follow its typed state`;
}

/**
 * Name the replay for a lane re-resolved at a new head while carrying the earlier head's attempts.
 *
 * @param error - The failure the resolution raised.
 * @param request - The caller's request exactly as submitted.
 * @returns The remedy replaying that request without its attempts; otherwise `undefined`.
 */
export function staleLaneAttemptsRemedy(error: unknown, request: unknown): SpineRemedy | undefined {
  if (!(error instanceof StaleLaneAttemptsError)) return undefined;
  if (typeof request !== "object" || request === null || Array.isArray(request)) return undefined;
  return spineRemedy(
    ATTEMPTS_INVARIANT,
    "Drop the attempts bound to the earlier head, keep the completed-pass count, and re-resolve the lane",
    RESOLVE_ARGV,
    { ...request, attempts: [] },
  );
}

/**
 * Explain a missing hosted producer reference without inventing the caller's acknowledged action.
 *
 * @param error - Failure raised while resolving the submitted lane.
 * @param request - Original command input retaining the selected source.
 * @returns The refusal with caller recovery guidance, or the original failure unchanged.
 */
export function reviewResolveError(error: unknown, request: unknown): unknown {
  if (!(error instanceof LocalReviewResultReaderError) || error.code !== "missing-producer") return error;
  const parsed = ReviewPolicyCommandRequestSchema.safeParse(request);
  const attempt = parsed.success ? parsed.data.attempts.at(-1) : undefined;
  if (attempt?.sourceId !== "coderabbit-pr" && attempt?.sourceId !== "codex-pr") return error;
  return new LocalReviewResultReaderError(
    error.code,
    `${error.message} A terminal hosted policy attempt references the sealed producer, not the result digest. `
      + "Re-run arc review hosted await with the original acknowledged action as JSON input, then feed its "
      + "returned attempt to review resolve; do not request another review or substitute hostedResultId.",
  );
}

/**
 * Name the lane resolution behind a local review the driver no longer admits.
 *
 * @param error - The failure local preparation raised.
 * @returns The remedy re-resolving the exact policy request the driver evaluated; otherwise `undefined`.
 */
export function localPrepareAdmissionRemedy(error: unknown): SpineRemedy | undefined {
  if (!(error instanceof ReviewDriverAdmissionError) || error.request === null) return undefined;
  return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error, RESOLVE_ROUTE), RESOLVE_ARGV, error.request);
}

/**
 * Name the review status behind a hosted request the driver no longer admits.
 *
 * @param error - The failure the hosted request raised.
 * @returns The remedy re-reading the open change request's review status; otherwise `undefined`.
 */
export function hostedRequestAdmissionRemedy(error: unknown): SpineRemedy | undefined {
  if (!(error instanceof HostedReviewAdmissionError)) return undefined;
  return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error.admission, STATUS_ROUTE), [
    "arc", "review", "status", "--target", JSON.stringify(error.statusTarget),
  ]);
}
