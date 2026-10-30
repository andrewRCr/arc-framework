/** Stable error envelopes shared by review command transports. */
import { RemedySchema } from "../lib/store/refusal.js";
import { ZodError, type ZodType } from "zod";
import { ProjectIdentityError } from "../lib/store/project-identity.js";
import { projectIdentitySpineRemedy, reviewFailureSpineRemedy, reviewProjectIdentityRequestRemedy, reviewRequestRetryArgv }
  from "../scripts/review-gate/runtime/project-identity-remedy.js";
import { StoreRefusalError } from "../lib/store/refusal-error.js";
import { LocalTargetDerivationError, type LocalTargetInvalidReason } from "../scripts/review-gate/hosts/local/repository-target.js";
import { LocalReviewResultReaderError } from "../scripts/review-gate/hosts/local/review-result-reader.js";
import { FrontlineAdmissionError } from "../scripts/review-gate/core/frontline-admission-error.js";
import { HostedReviewAdmissionError } from "../scripts/review-gate/runtime/review-policy-remedy.js";
import { ReviewDriverAdmissionError } from "../scripts/review-gate/policy/review-execution-admission.js";
import { ReviewCommandModeSchema, type ReviewCommandMode, type ReviewCommandErrorCode } from "../scripts/review-gate/core/review-command-envelope.js";
import type { MergeLockCommandMode } from "../scripts/review-gate/merge-lock-command-envelope.js";
import type { SpineRemedy } from "../scripts/integration/spine-refusal.js";
export type ReviewHandlerErrorPhase = "request" | "execution" | "output";
export type ReviewFamilyMode = ReviewCommandMode | MergeLockCommandMode;
const DURABLE_CORRUPTION_CODES = new Set([
  "invalid-receipt-reference",
  "malformed-frontline-outcome",
  "malformed-ledger",
  "malformed-operation-state",
  "operation-id-mismatch",
  "repository-mismatch",
]);

function errorCode(error: unknown): string | null {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && typeof error.code === "string"
    ? error.code
    : null;
}

function reviewErrorCode(mode: ReviewFamilyMode, error: unknown): string | null {
  return mode === "review-resolve" && error instanceof LocalReviewResultReaderError
    && error.code === "missing-producer"
    ? "invalid-input"
    : errorCode(error);
}

function repositoryPrecondition(reason: LocalTargetInvalidReason) {
  switch (reason) {
    case "unborn-repository":
      return "repository-born" as const;
    case "dirty-worktree":
      return "clean-worktree" as const;
    case "non-commit-head":
      return "commit-head" as const;
    case "ambiguous-merge-base":
    case "invalid-base":
    case "no-merge-base":
    case "unresolved-base":
      return "base-resolved" as const;
  }
}

function reviewCommandDiagnostics(error: unknown, message: string) {
  if (error instanceof ReviewDriverAdmissionError) return error.diagnostics;
  if (error instanceof HostedReviewAdmissionError) return error.admission.diagnostics;
  if (error instanceof LocalTargetDerivationError) {
    return [{ code: "repository-precondition" as const, message, precondition: repositoryPrecondition(error.reason) }];
  }
  return error instanceof FrontlineAdmissionError
    ? [{ code: `frontline-admission-${error.reason}`, message }]
    : [];
}

function reviewProjectIdentityError(mode: ReviewFamilyMode, error: unknown, errorSchema: ZodType,
  remedyFor?: (code: ReviewCommandErrorCode) => SpineRemedy): unknown {
  if (!(error instanceof ProjectIdentityError) || !ReviewCommandModeSchema.safeParse(mode).success) return undefined;
  const code = "project-identity-unavailable" as const;
  const fallback = remedyFor?.(code) ?? reviewProjectIdentityRequestRemedy(mode, error);
  return errorSchema.parse({ schemaVersion: 1, mode, diagnostics: [], error: { code, message: error.message },
    remedy: projectIdentitySpineRemedy(error, fallback?.argv ?? ["arc", "review", "--help"], fallback?.stdin) });
}

// An in-repo store's refusal keeps today's code and message; only an off-branch store's reports as itself.
function reviewStoreRefusalError(mode: ReviewFamilyMode, error: unknown, errorSchema: ZodType,
  remedyFor?: (code: ReviewCommandErrorCode) => SpineRemedy): unknown {
  const parsed = ReviewCommandModeSchema.safeParse(mode);
  if (!(error instanceof StoreRefusalError) || !error.offBranch || !parsed.success) return undefined;
  const code = "store-refused" as const;
  const fallback = remedyFor?.(code);
  return errorSchema.parse({ schemaVersion: 1, mode, diagnostics: [], error: { code, message: error.message }, refusal: error.refusal,
    remedy: reviewFailureSpineRemedy(error.refusal.condition, error.refusal.remedy,
      fallback?.argv ?? reviewRequestRetryArgv(parsed.data) ?? ["arc", "review", "--help"], fallback?.stdin) });
}

/** Project one failure through the error schema owned by its command family. */
export function reviewCommandError(
  mode: ReviewFamilyMode,
  error: unknown,
  phase: ReviewHandlerErrorPhase,
  errorSchema: ZodType,
  remedyFor?: (code: ReviewCommandErrorCode) => SpineRemedy,
) {
  const detail = error instanceof Error ? error.message : String(error);
  const message = mode === "review-adversarial-record" && phase === "request"
    ? `${detail} Expected an approved adversarial record request; inspect arc review adversarial record --schema.` : detail;
  if (mode === "review-adversarial-record" && errorCode(error) === "unsupported") {
    const remedy = typeof error === "object" && error !== null && "remedy" in error ? error.remedy : undefined;
    return errorSchema.parse({ schemaVersion: 1, mode, diagnostics: [], error: { code: "unsupported", message },
      remedy: RemedySchema.parse(remedy) });
  }
  const identityFailure = reviewProjectIdentityError(mode, error, errorSchema, remedyFor)
    ?? reviewStoreRefusalError(mode, error, errorSchema, remedyFor);
  if (identityFailure !== undefined) return identityFailure;
  const code = reviewFailureCode(mode, error, phase);
  const diagnostics = reviewCommandDiagnostics(error, message);
  return errorSchema.parse({
    schemaVersion: 1,
    mode,
    diagnostics,
    error: { code, message },
    ...(remedyFor === undefined ? {} : { remedy: remedyFor(code) }),
  });
}

function reviewFailureCode(mode: ReviewFamilyMode, error: unknown, phase: ReviewHandlerErrorPhase): ReviewCommandErrorCode {
  const stableCode = reviewErrorCode(mode, error);
  return error instanceof LocalTargetDerivationError
    ? "invalid-input"
    : phase === "request" && (error instanceof ZodError || error instanceof SyntaxError)
      ? "invalid-input"
      : stableCode === "invalid-input" || stableCode === "corrupt-state"
        || stableCode === "uncertain-provider-execution"
        ? stableCode
        : stableCode !== null && DURABLE_CORRUPTION_CODES.has(stableCode)
          ? "corrupt-state"
          : "unexpected-failure";
}
