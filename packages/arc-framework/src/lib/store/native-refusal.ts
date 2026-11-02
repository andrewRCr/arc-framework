/** The typed refusals a native read raises, which a caller reports whole rather than folding into its own failure. */
import { isOffBranchStoreRefusal, type StoreRefusalError } from "./refusal-error.js";
import { ProjectIdentityError } from "./project-identity.js";
import { ReviewOwnerSelectionError } from "./kinds/review/errors.js";
import { renderRemedyArgument } from "../../scripts/integration/spine-refusal.js";

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

/** A native typed refusal's condition, remedy text and supplied corrective command, or null for any other failure. */
export function nativeRefusalText(error: unknown): string | null {
  if (!isNativeTypedRefusal(error)) return null;
  const remedy = error instanceof ProjectIdentityError ? error.failure.remedy
    : error instanceof ReviewOwnerSelectionError ? error.remedy : error.refusal.remedy;
  return remedy.argv === undefined ? error.message
    : `${error.message} \`${remedy.argv.map(renderRemedyArgument).join(" ")}\``;
}
