/** Resolve an unhusked checkout's work-unit claim without consulting Git topology. */
import { decodeWorktreeMarkerOwnership, readWorktreeMarker } from "../git/worktree-marker.js";
import { workUnitCheckoutClaim } from "./work-unit-claim.js";
import type { Store } from "./contract.js";
import type { StoreRecord } from "./read.js";
import { classifyUnboundMarker, type UnboundMarkerClassification } from "../locus/unbound-marker.js";
import type { WorktreeMarker } from "../git/worktree-marker.js";
import type { StoreRefusal } from "./refusal.js";
import { StoreRefusalError } from "./refusal-error.js";
import { isNativeTypedRefusal, type NativeTypedRefusal } from "./native-refusal.js";

/**
 * A current marker either supplies an active primary, reports unbound ownership, or holds no current claim. An absent
 * claim carries `cause` when an off-branch store's refusal or another native typed refusal kept its primary unread.
 */
export type ClaimedCurrentWorkUnit = { kind: "absent"; cause?: NativeTypedRefusal } | { kind: "present"; record: StoreRecord }
  | UnboundMarkerClassification;

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
    return absent(error);
  }
}

/** Absence, carrying a native typed refusal whole when one kept the claim unread. */
function absent(error: unknown): ClaimedCurrentWorkUnit {
  return isNativeTypedRefusal(error) ? { kind: "absent", cause: error } : { kind: "absent" };
}

/** A missing claim is plain absence; any other refusal warns and, from an off-branch store, rides along whole. */
function refusedClaim(store: Store, refusal: StoreRefusal, warnings: string[]): ClaimedCurrentWorkUnit {
  if (refusal.code === "not-found") return { kind: "absent" };
  warnings.push(`${refusal.condition} ${refusal.remedy.text}`);
  return absent(new StoreRefusalError(refusal, store.capabilities.stateOffBranch));
}

async function readUnboundClaim(input: { cwd: string; store: Store }, marker: WorktreeMarker, warnings: string[]): Promise<ClaimedCurrentWorkUnit> {
  const unbound = await classifyUnboundMarker({ ...input, marker });
  if (unbound.kind === "unbound") return unbound;
  warnings.push(unbound.reason);
  return { kind: "absent" };
}

async function readActiveClaim(input: { store: Store; name: string; uid?: string }, warnings: string[]): Promise<ClaimedCurrentWorkUnit> {
  const lookup = await input.store.lookup({ kind: "claim", claim: workUnitCheckoutClaim(input.store, input.name, input.uid) });
  if (lookup.status === "refused") return refusedClaim(input.store, lookup.refusal, warnings);
  const read = await input.store.read({ reference: lookup.result.reference });
  if (read.status === "refused") return refusedClaim(input.store, read.refusal, warnings);
  return read.result.reference.kind === "work-item/meta" && read.result.placement?.kind === "active"
    ? { kind: "present", record: read.result } : { kind: "absent" };
}
