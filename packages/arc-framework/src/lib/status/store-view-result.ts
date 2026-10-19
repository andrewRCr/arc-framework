/** Status read results preserve store failures and add the view's unreadable-listing code. */
import type { Remedy, StoreRefusal } from "../store/refusal.js";

/** The status surface's refusal fields, independent of a storage operation's extra context. */
export interface StatusViewRefusal {
  code: StoreRefusal["code"] | "listing-unreadable";
  condition: string;
  remedy: Remedy;
}

/** A readable view or an actionable refusal that must not render as empty work. */
export type StatusViewResult<T> = { status: "ok"; result: T } | { status: "refused"; refusal: StatusViewRefusal };
