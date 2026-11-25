/** Require certified Git coordinates before a selected source can be routed. */
import type { ResolvedCheckRequest } from "../resolve-request.js";
import { SourceCoordinatesSchema, type SourceCoordinates } from "./contract-source.js";

/** Extract portable coordinates, refusing unavailable HEAD evidence with a safe retry. */
export function requireSourceCoordinates(request: ResolvedCheckRequest): SourceCoordinates {
  const head = request.source.head;
  const result = SourceCoordinatesSchema.safeParse({ tree: request.tree,
    ...(head.status === "known" ? { head: head.commit } : {}),
    ...(request.base === undefined ? {} : { base: request.base }), merged: request.merged ?? [] });
  if (head.status === "unavailable" || !result.success) {
    throw new Error("Could not certify source Git coordinates. Repair the checkout's HEAD and required objects, then retry; keep the check local if those coordinates cannot be established.");
  }
  return result.data;
}
