/** Resolve an unhusked checkout's work-unit claim without consulting Git topology. */
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../git/worktree-marker.js";
import { workUnitCheckoutClaim } from "./work-unit-claim.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import { classifyUnboundMarker, type UnboundMarkerClassification } from "../locus/unbound-marker.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";

/** A current marker either supplies an active primary, reports unbound ownership, or holds no current claim. */
export type ClaimedCurrentWorkUnit = { kind: "absent" } | { kind: "present"; record: StoreRecord } | UnboundMarkerClassification;

/** Read the current primary only for a live work-unit marker whose placement is active.
 * @param input - Checkout root and operational state contract.
 * @param warnings - Receives malformed-marker or refused-operation diagnostics.
 * @returns Active primary bytes, an unbound classification, or absence for a non-current claim.
 */
export async function readClaimedCurrentWorkUnit(input: { cwd: string; store: Store }, warnings: string[]): Promise<ClaimedCurrentWorkUnit> {
  try {
    const marker = await readWorktreeMarker(input.cwd);
    if (marker.kind === "absent") return { kind: "absent" };
    if (marker.kind === "malformed") { warnings.push(`${marker.path}: ${marker.message}. Inspect and repair or remove the marker, then retry.`); return { kind: "absent" }; }
    if (marker.marker.husk !== undefined) return { kind: "absent" };
    const ownership = decodeWorktreeMarkerOwnership(marker.marker);
    if (ownership.kind !== "current" || ownership.subject.kind !== "work-unit") return { kind: "absent" };
    if (input.store.capabilities.stateOffBranch && ownership.subject.uid === undefined) return await readUnboundClaim(input, marker.marker, warnings);
    return await readActiveClaim({ store: input.store, name: ownership.subject.name, uid: ownership.subject.uid }, warnings);
  } catch (error) {
    warnings.push(`Unable to resolve the checkout's work-unit claim: ${error instanceof Error ? error.message : String(error)}`);
    return { kind: "absent" };
  }
}

async function readUnboundClaim(input: { cwd: string; store: Store }, marker: WorktreeMarker, warnings: string[]): Promise<ClaimedCurrentWorkUnit> {
  const unbound = await classifyUnboundMarker({ ...input, marker });
  if (unbound.kind === "unbound") return unbound;
  warnings.push(unbound.reason);
  return { kind: "absent" };
}

async function readActiveClaim(input: { store: Store; name: string; uid?: string }, warnings: string[]): Promise<ClaimedCurrentWorkUnit> {
  const lookup = await input.store.lookup({ kind: "claim", claim: workUnitCheckoutClaim(input.store, input.name, input.uid) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code !== "not-found") warnings.push(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
    return { kind: "absent" };
  }
  const read = await input.store.read({ reference: lookup.result.reference });
  if (read.status === "refused") {
    if (read.refusal.code !== "not-found") warnings.push(`${read.refusal.condition} ${read.refusal.remedy.text}`);
    return { kind: "absent" };
  }
  return read.result.reference.kind === "work-item/meta" && read.result.placement?.kind === "active"
    ? { kind: "present", record: read.result } : { kind: "absent" };
}
