/** A store refusal carried whole through code that reports failure by throwing. */
import type { StoreRefusal } from "./refusal.js";

/** Throw a refusal with its class, code, and remedy intact; its message is the condition and remedy text. */
export class StoreRefusalError extends Error {
  /**
   * @param refusal - The store's refusal, unchanged
   * @param offBranch - Whether a store keeping state off the branch refused; an in-repo refusal reports as before
   */
  constructor(readonly refusal: StoreRefusal, readonly offBranch: boolean) {
    super(`${refusal.condition} ${refusal.remedy.text}`);
    this.name = "StoreRefusalError";
  }
}

/** Whether an error is an off-branch store's refusal, which a command reports whole rather than rewrapping. */
export function isOffBranchStoreRefusal(error: unknown): error is StoreRefusalError {
  return error instanceof StoreRefusalError && error.offBranch;
}
