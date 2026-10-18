/**
 * Corrective guidance for a review-policy refusal the caller can recover from.
 *
 * A producer spends review capacity only on the action the standard-review driver currently admits, so a request
 * the driver no longer admits refuses before anything is spent; re-reading the lane names what it admits instead,
 * including when the lane is complete or the next pass needs an Owner decision. A lane's attempts belong to the
 * head they reviewed, so re-resolving at a new head while still carrying them refuses; concluded attempts
 * carry forward in the logical count, and dropping the attempts reaches the ordinary resolution. Hosted requests take
 * complete coverage; the local fix check re-examines an approved fix before another hosted complete pass.
 *
 * @module
 */

import { spineRemedy, type SpineRemedy } from "../../integration/spine-refusal.js";
import type { ChangeRequestTargetRef } from "../change-request.js";
import { ReviewDriverAdmissionError } from "../policy/review-execution-admission.js";
import { LocalReviewResultReaderError } from "../hosts/local/review-result-reader.js";
import { ReviewPolicyCommandRequestSchema, ReviewResolveEnvelopeSchema, type ReviewPolicyCommandRequest } from "../policy/review-policy-driver.js";

import { ReviewTerminalAttemptInputError } from "../policy/review-policy-evidence.js";

const RESOLVE_ARGV = ["arc", "review", "resolve", "-"] as const;

const ADMISSION_INVARIANT = "Review capacity is spent only on the action the standard-review driver currently admits.";

const ATTEMPTS_INVARIANT = "A lane's attempts belong to the exact head they reviewed; attempts concluded at an "
  + "earlier head carry forward only as the logical attempt count.";

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

  constructor(admission: ReviewDriverAdmissionError, statusTarget: ChangeRequestTargetRef,
    readonly allowsOwnerStop = false) {
    super(admission.message);
    this.name = "HostedReviewAdmissionError";
    this.admission = admission;
    this.statusTarget = statusTarget;
  }
}

const HOSTED_COMPLETE_INVARIANT = "Hosted review requests use complete coverage; fix checks run locally.";

/** A hand-composed hosted incremental request refused before review capacity is spent. */
export class HostedIncrementalCoverageError extends Error {
  readonly code = "invalid-input" as const;

  constructor(readonly statusTarget: ChangeRequestTargetRef) {
    super("Hosted incremental coverage is unsupported; run the local fix check.");
    this.name = "HostedIncrementalCoverageError";
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

function localSourceCorrection(error: ReviewDriverAdmissionError, allowsOwnerStop: boolean): string | null {
  if (error.diagnostics.some(({ code }) => code === "delta-check-local-source-unconfigured")) {
    return "Add delegated-agent to review.standard_sources so the delta check can run locally; re-run this command";
  }
  if (error.diagnostics.some(({ code }) => code === "delta-check-local-review-required")) {
    return "Run the delta check locally on delegated-agent through arc review local prepare; "
      + "supply complete coverage there to run a local complete pass instead";
  }
  if (error.diagnostics.some(({ code }) => code === "material-fix-local-source-unconfigured")) {
    return "Add delegated-agent to review.standard_sources"
      + (allowsOwnerStop ? ", or take the Owner's stop disclosed as resting on fixes no reviewer re-examined" : "")
      + "; re-run this command after the chosen remedy";
  }
  if (error.diagnostics.some(({ code }) => code === "material-fix-local-review-required")) {
    return "Run the next pass locally on delegated-agent to re-examine the material fixes; "
      + "use arc review local prepare rather than forcing a hosted source";
  }
  return null;
}

function incrementalOverride(error: ReviewDriverAdmissionError): boolean {
  return error.state === "invalid-override" && error.reason === "incremental-coverage";
}

function withoutCeilingOverride(request: unknown): unknown {
  if (typeof request !== "object" || request === null || Array.isArray(request)) return request;
  const corrected: Record<string, unknown> = { ...request };
  delete corrected.ceilingOverride;
  for (const field of ["policyJudgment", "deliveryAdmission"]) {
    const nested = corrected[field];
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      const selection: Record<string, unknown> = { ...nested };
      delete selection.ceilingOverride;
      corrected[field] = selection;
    }
  }
  return corrected;
}

function incrementalOverrideRemedy(request: unknown, argv: readonly string[]): SpineRemedy {
  return spineRemedy(ADMISSION_INVARIANT,
    "Ceiling overrides authorize complete coverage only; rerun the incremental fix check or delta check without the override",
    argv, withoutCeilingOverride(request));
}

function admissionCorrection(error: ReviewDriverAdmissionError, route: LaneReadRoute, allowsOwnerStop = false): string {
  if (incrementalOverride(error)) return "Ceiling overrides authorize complete coverage only; rerun without the override";
  const local = localSourceCorrection(error, allowsOwnerStop);
  if (local !== null) return local;
  if (error.state === "pass-complete") {
    return "The lane is complete for this head; another pass needs the Owner's additional-pass authorization, "
      + `carried as ${route.additionalPass}. To confirm, ${route.action}`;
  }
  if (error.state === "approval-required") {
    return "Another complete pass exceeds the configured ceiling and needs the Owner's one-pass override, carried as "
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

/** Return a corrected terminal input replay, or the existing stale-attempt recovery route. */
export function reviewResolveRemedy(error: unknown, request: unknown): SpineRemedy | undefined {
  if (error instanceof ReviewDriverAdmissionError && incrementalOverride(error)) return incrementalOverrideRemedy(request, RESOLVE_ARGV);
  if (error instanceof ReviewDriverAdmissionError && localSourceCorrection(error, false) !== null) {
    return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error, RESOLVE_ROUTE), RESOLVE_ARGV, request);
  }
  if (!(error instanceof ReviewTerminalAttemptInputError)) return staleLaneAttemptsRemedy(error, request);
  return spineRemedy(
    "Terminal attempt progress must match its immutable producer's admitted pass, lane, source, outcome, scope, and policy.",
    `${error.correction}; replay the corrected request without requesting another review`,
    RESOLVE_ARGV,
    error.correctedRequest,
  );
}

/** Surface a recoverable source or coverage selection stop through command error guidance. */
export function requireReviewSourceSelection(
  resolution: unknown,
  request: ReviewPolicyCommandRequest,
): unknown {
  const parsed = ReviewResolveEnvelopeSchema.safeParse(resolution);
  if (!parsed.success) return resolution;
  const error = new ReviewDriverAdmissionError(parsed.data.state === "invalid-override"
    ? "The chosen coverage cannot use this ceiling override." : "The next review pass requires a local source.", parsed.data, request);
  if (incrementalOverride(error) || (parsed.data.state === "unavailable" && localSourceCorrection(error, false) !== null)) throw error;
  return resolution;
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
export function localPrepareAdmissionRemedy(error: unknown, submittedRequest?: unknown): SpineRemedy | undefined {
  if (!(error instanceof ReviewDriverAdmissionError)) return undefined;
  if (submittedRequest !== undefined && incrementalOverride(error)) {
    return incrementalOverrideRemedy(submittedRequest, ["arc", "review", "local", "prepare", "-"]);
  }
  if (error.request === null) return undefined;
  if (incrementalOverride(error)) return incrementalOverrideRemedy(error.request, RESOLVE_ARGV);
  if (submittedRequest !== undefined && localSourceCorrection(error, false) !== null) {
    return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error, RESOLVE_ROUTE),
      ["arc", "review", "local", "prepare", "-"], submittedRequest);
  }
  return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error, RESOLVE_ROUTE), RESOLVE_ARGV, error.request);
}

/**
 * Name the review status behind a hosted coverage or policy refusal.
 *
 * @param error - The failure the hosted request raised.
 * @returns The remedy re-reading the open change request's review status; otherwise `undefined`.
 */
export function hostedRequestAdmissionRemedy(error: unknown): SpineRemedy | undefined {
  if (error instanceof HostedIncrementalCoverageError) {
    return spineRemedy(HOSTED_COMPLETE_INVARIANT, "Run the local fix check through arc review local prepare; "
      + "re-read status for the next complete hosted pass", ["arc", "review", "status", "--target", JSON.stringify(error.statusTarget)]);
  }
  if (!(error instanceof HostedReviewAdmissionError)) return undefined;
  return spineRemedy(ADMISSION_INVARIANT, admissionCorrection(error.admission, STATUS_ROUTE, error.allowsOwnerStop), [
    "arc", "review", "status", "--target", JSON.stringify(error.statusTarget),
  ]);
}
