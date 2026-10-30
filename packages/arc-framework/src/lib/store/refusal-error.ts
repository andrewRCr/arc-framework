/** A store refusal carried whole through code that reports failure by throwing. */
import type { StoreRefusal } from "./refusal.js";

/** Throw a refusal with its class, code, and remedy intact; its message is the condition and remedy text. */
export class StoreRefusalError extends Error {
  constructor(readonly refusal: StoreRefusal) {
    super(`${refusal.condition} ${refusal.remedy.text}`);
    this.name = "StoreRefusalError";
  }
}
