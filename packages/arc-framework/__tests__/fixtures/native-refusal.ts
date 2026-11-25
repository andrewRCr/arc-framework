/** The typed refusal a native review read raises when its listing cannot be read, built by the listing's own producer. */
import { reviewFactListingError, reviewListingRefusal } from "../../src/lib/store/kinds/review/fact-access.js";
import type { StoreRefusalError } from "../../src/lib/store/refusal-error.js";

/** A native review listing's unreadable-index refusal, as the typed review ports throw it. */
export function nativeListingRefusal(): StoreRefusalError {
  const refusal = reviewListingRefusal({ status: "ok", result: { status: "unreadable",
    condition: "The review family index cannot be read.", remedy: { text: "Restore the review family index, then retry." } } });
  if (refusal === null) throw new Error("Expected an unreadable listing to refuse.");
  return reviewFactListingError({ status: "unavailable", reason: refusal.condition, refusal }) as StoreRefusalError;
}
