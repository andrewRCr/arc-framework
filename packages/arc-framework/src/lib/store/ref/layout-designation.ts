/** Pure layout selection from counted publisher facts. */
import type { RefDesignation, RefRemoteDesignation } from "./designation.js";
import type { StoreLayout } from "./migrate-record.js";

/** A competing push designation chooses no layout; the sole code remote selects the default layout. */
export function designatedStoreLayout(designation: RefDesignation): StoreLayout | null {
  if (designation.pushes.length > 1) return null;
  const publisher = designation.backing?.role === "push" || designation.pushes.length !== 1 ? undefined : designation.pushes[0];
  return publisherLayout(publisher, designation.codeRemote);
}

/** The layout a given publisher requires; a switch's source remains the physical layout. */
export function publisherLayout(publisher: Pick<RefRemoteDesignation, "name" | "repository"> | undefined, codeRemote: string | null): StoreLayout {
  return publisher?.repository === "code" && publisher.name === codeRemote ? "default" : "separate";
}
