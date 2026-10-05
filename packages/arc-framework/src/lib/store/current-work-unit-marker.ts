/** Resolve an unhusked checkout's work-unit claim without consulting Git topology. */
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../git/worktree-marker.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";

/** Read the current primary only for a live work-unit marker whose placement is active.
 * @param input - Checkout root and operational state contract.
 * @param warnings - Receives malformed-marker or refused-operation diagnostics.
 * @returns Active primary bytes, or absence for a non-current claim.
 */
export async function readClaimedCurrentWorkUnit(input: { cwd: string; store: Store }, warnings: string[]): Promise<StoreRecord | undefined> {
  try {
    const marker = await readWorktreeMarker(input.cwd);
    if (marker.kind === "absent") return undefined;
    if (marker.kind === "malformed") { warnings.push(`${marker.path}: ${marker.message}`); return undefined; }
    if (marker.marker.husk !== undefined) return undefined;
    const ownership = decodeWorktreeMarkerOwnership(marker.marker);
    if (ownership.kind !== "current" || ownership.subject.kind !== "work-unit") return undefined;
    const lookup = await input.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(ownership.subject.name) } });
    if (lookup.status === "refused") {
      if (lookup.refusal.code !== "not-found") warnings.push(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
      return undefined;
    }
    const read = await input.store.read({ reference: lookup.result.reference });
    if (read.status === "refused") {
      if (read.refusal.code !== "not-found") warnings.push(`${read.refusal.condition} ${read.refusal.remedy.text}`);
      return undefined;
    }
    return read.result.reference.kind === "work-item/meta" && read.result.placement?.kind === "active"
      ? read.result : undefined;
  } catch (error) {
    warnings.push(`Unable to resolve the checkout's work-unit claim: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}
