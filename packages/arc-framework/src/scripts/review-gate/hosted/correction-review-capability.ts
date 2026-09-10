/** Hosted-provider capability projection for correction-review admission. */

import { CODERABBIT_HOSTED_REGISTRATION } from "./coderabbit.js";
import { CODEX_HOSTED_REGISTRATION } from "./codex.js";
import type { HostedProviderId, HostedReviewCoverage } from "./request.js";

const HOSTED_CORRECTION_REVIEW_CAPABILITIES = {
  [CODERABBIT_HOSTED_REGISTRATION.id]: CODERABBIT_HOSTED_REGISTRATION.correctionReview,
  [CODEX_HOSTED_REGISTRATION.id]: CODEX_HOSTED_REGISTRATION.correctionReview,
} as const satisfies Readonly<Record<HostedProviderId, "complete-upgrade" | "unscoped-incremental">>;

/** Whether a hosted provider can satisfy requested coverage without an exact correction-scope carrier. */
export function hostedProviderAdmitsCoverage(
  provider: HostedProviderId,
  coverage: HostedReviewCoverage,
): boolean {
  return coverage === "complete"
    || HOSTED_CORRECTION_REVIEW_CAPABILITIES[provider] === "complete-upgrade";
}
