/** Hosted-provider capability projection for correction-review admission. */

import { CODERABBIT_HOSTED_REGISTRATION } from "./coderabbit.js";
import { CODEX_HOSTED_REGISTRATION } from "./codex.js";
import type { IncrementalReviewScope } from "../core/incremental-review-scope.js";
import type { HostedProviderId, HostedReviewCoverage } from "./request.js";

const HOSTED_CORRECTION_REVIEW_CAPABILITIES = {
  [CODERABBIT_HOSTED_REGISTRATION.id]: CODERABBIT_HOSTED_REGISTRATION.correctionReview,
  [CODEX_HOSTED_REGISTRATION.id]: CODEX_HOSTED_REGISTRATION.correctionReview,
} as const satisfies Readonly<Record<HostedProviderId, "complete-upgrade" | "native-incremental">>;

/**
 * Whether a hosted provider reviews only a correction range, rather than upgrading the request to complete coverage.
 *
 * @param provider - Registered hosted provider.
 * @returns True when the provider carries a correction scope natively.
 */
export function hostedProviderReviewsIncrementally(provider: HostedProviderId): boolean {
  return HOSTED_CORRECTION_REVIEW_CAPABILITIES[provider] === "native-incremental";
}

/** Whether a hosted provider can satisfy coverage through complete upgrade or bound native incrementality. */
export function hostedProviderAdmitsCoverage(
  provider: HostedProviderId,
  coverage: HostedReviewCoverage,
  correctionScope?: IncrementalReviewScope,
): boolean {
  if (coverage === "complete") return true;
  if (correctionScope === undefined) return false;
  switch (HOSTED_CORRECTION_REVIEW_CAPABILITIES[provider]) {
    case "complete-upgrade":
    case "native-incremental":
      return true;
  }
}
