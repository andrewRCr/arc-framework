/** The typed refusals a native read raises, which a caller reports whole rather than folding into its own failure. */
import { isOffBranchStoreRefusal, type StoreRefusalError } from "./refusal-error.js";
import { ProjectIdentityError } from "./project-identity.js";
import { ReviewOwnerSelectionError } from "./kinds/review/errors.js";

/** An off-branch store's refusal, a missing project ID, or a native work-item selection refusal. */
export type NativeTypedRefusal = StoreRefusalError | ProjectIdentityError | ReviewOwnerSelectionError;

/** Whether an error is an off-branch store's refusal, a missing project ID, or a native work-item selection refusal. */
export function isNativeTypedRefusal(error: unknown): error is NativeTypedRefusal {
  return isOffBranchStoreRefusal(error) || error instanceof ProjectIdentityError || error instanceof ReviewOwnerSelectionError;
}

/** Rethrow a native typed refusal so it reaches the command whole; any other failure stays the caller's to handle. */
export function rethrowNativeRefusal(error: unknown): void {
  if (isNativeTypedRefusal(error)) throw error;
}

/** A native typed refusal's condition and remedy text, or null for any other failure. */
export function nativeRefusalText(error: unknown): string | null {
  return isNativeTypedRefusal(error) ? error.message : null;
}
