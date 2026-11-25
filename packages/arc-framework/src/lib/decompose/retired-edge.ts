/** Decomposition adapter for shared before-state retired-provider resolution. */
import type { Store } from "../store/contract.js";
import type { OwnerIdentity } from "../store/identity.js";
import { resolveRetiredEdge, type ResolvedRetiredEdge } from "../store/retired-edge.js";
import { decomposeStoreRefusal, type DecomposeResult } from "./refusal.js";

/** Shared retired-provider evidence expressed at the decomposition boundary. */
export type ResolvedDecomposeRetiredEdge = ResolvedRetiredEdge;

/** Resolve the prior provider while preserving decomposition's refusal envelope. */
export async function resolveDecomposeRetiredEdge(store: Store, slug: string,
  dependent: OwnerIdentity, uid?: string): Promise<DecomposeResult<ResolvedDecomposeRetiredEdge | null>> {
  const result = await resolveRetiredEdge(store, slug, dependent, uid);
  return result.status === "refused" ? decomposeStoreRefusal(result.refusal) : result;
}
