/** Construct checkout claims without giving tracked stores operational owner authority. */
import type { Store } from "./contract.js";
import type { CheckoutClaim } from "./lookup.js";
import { SlugSchema } from "../kernel/index.js";

/** Preserve a marker's owner binding only when the selected store keeps operational state off branch. */
export function workUnitCheckoutClaim(store: Pick<Store, "capabilities">, name: string, uid?: string):
  Extract<CheckoutClaim, { kind: "work-unit" }> {
  return { kind: "work-unit", slug: SlugSchema.parse(name),
    ...(store.capabilities.stateOffBranch && uid !== undefined ? { uid } : {}) };
}
