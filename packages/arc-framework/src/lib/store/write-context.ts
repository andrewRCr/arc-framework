/** Existing verb preflights adapt to the storage refusal without inventing a landing route. */
import type { PlanningEntryRoute, WriteContext } from "../git/write-context.js";
import type { StoreRefusal } from "./refusal.js";

/** Existing producer verdicts; ordinary record writes use selected-copy admission instead. */
export type StoreWritePreflight = WriteContext | PlanningEntryRoute;
/** The caller's already-derived refusal condition and actionable landing place. */
export type StoreWriteLanding = Pick<Extract<StoreRefusal, { code: "checkout-not-writable" }>, "checkout" | "condition" | "remedy">;

/** Preserve one existing preflight decision as a recoverable checkout refusal.
 * @param preflight - The existing producer's typed verdict.
 * @param landing - The exact observed condition, landing place and remedy the verb already derives.
 * @returns No refusal on proceed; otherwise the actionable checkout refusal.
 */
export function checkoutRefusalFromPreflight(preflight: StoreWritePreflight, landing: StoreWriteLanding): Extract<StoreRefusal, { code: "checkout-not-writable" }> | undefined {
  if ("verdict" in preflight ? preflight.verdict === "proceed" : preflight.route === "proceed") return undefined;
  return { code: "checkout-not-writable", class: "recoverable", ...landing };
}
