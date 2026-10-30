/** Preserve transient ordinary-decision references across policy forms and backend boundaries. */
import type { CanonicalDigest } from "../../../lib/kernel/index.js";

export interface ReviewGrantReferences {
  readonly ceilingOverride?: { readonly decisionKey?: CanonicalDigest };
  readonly additionalPassAuthorization?: { readonly decisionKey?: CanonicalDigest };
}

/** Keep either supplied reference while refusing two different references for one grant. */
export function consistentReviewDecisionReference(full: { readonly decisionKey?: CanonicalDigest } | undefined,
  targetless: { readonly decisionKey?: CanonicalDigest } | undefined): CanonicalDigest | undefined {
  if (full?.decisionKey !== undefined && targetless?.decisionKey !== undefined && full.decisionKey !== targetless.decisionKey) {
    throw Object.assign(new Error("Full and targetless extra-pass decision references disagree. Supply the matching live reference and retry."), { code: "invalid-input" });
  }
  return full?.decisionKey ?? targetless?.decisionKey;
}

/** Identify a request that must read recorded native authority. */
function hasReviewDecisionReference(input: ReviewGrantReferences | undefined): boolean {
  return input?.ceilingOverride?.decisionKey !== undefined || input?.additionalPassAuthorization?.decisionKey !== undefined;
}

/** Refuse native references in the repository arm without changing its ordinary judgment behavior. */
export function requireNativeReviewDecisionReferences(context: boolean | (() => boolean), ...inputs: readonly (ReviewGrantReferences | undefined)[]): void {
  if (!inputs.some(hasReviewDecisionReference)) return;
  const native = typeof context === "function" ? context() : context;
  if (!native) throw Object.assign(new Error(
    "Native review decision references require their native review context. Use the context that owns the recorded decision, "
    + "or omit decisionKey to supply a fresh judgment here, then retry."), { code: "invalid-input" });
}
