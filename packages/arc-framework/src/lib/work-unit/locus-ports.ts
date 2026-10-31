/** Narrow lifecycle boundary for locus-owned checkout claims. */
import type { WorktreeMarker } from "../git/worktree-marker.js";
import type { StoreRecord } from "../store/read.js";
import type { WorkUnitHolderRequest } from "./mutators/reconcile-work-unit-worktree.js";
import type { SessionAction } from "../session-init/actions.js";

/** Bind a record-holding caller to its exact operational owner, refusing an incomplete identity. */
export function ownerHolderRequest(record: Pick<StoreRecord, "reference" | "aliases">): Extract<WorkUnitHolderRequest, { kind: "owner" }> {
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) {
    throw new Error(`Operational work item ${owner.name} has no owner UID. Repair its owner identity, then retry.`);
  }
  return { kind: "owner", uid: owner.uid, names: { current: owner.name, former: record.aliases ?? [] } };
}

/** Exclusivity refusal identifies the checkout that already holds this work unit. */
export type MarkerExclusivityResult = { kind: "clear" } | { kind: "refused"; checkoutPath?: string; reason: string; unbound?: UnboundHoldingCheckout };
/** Exact generation written by an anchored claim, or its non-writing refusal. */
export type AnchoredMarkerWriteResult =
  | { kind: "created" | "replaced"; bytes: Buffer }
  | { kind: "exists" | "generation-mismatch" | "unadmitted" };
/** A holder lookup retains absence distinctly from one exact checkout. */
export type HoldingCheckoutResult = { kind: "none" } | { kind: "held"; path: string } | UnboundHoldingCheckout;
/** An unbound owner match carries its recovery actions without conferring owner authority. */
export interface UnboundHoldingCheckout { kind: "unbound"; path: string; exits: readonly SessionAction[]; reason: string }
/** A checkout exclusion applies identically to owner and creation requests. */
export type HolderLookupRequest = WorkUnitHolderRequest & { checkoutPath?: string; resolveLegacy?: () => Promise<string | null> };
/** Locus supplies these ports when it admits anchored work-unit markers. */
export interface LocusPorts {
  checkMarkerExclusivity: (request: WorkUnitHolderRequest & { checkoutPath?: string }) => Promise<MarkerExclusivityResult>;
  findHoldingCheckout: (request: HolderLookupRequest) => Promise<HoldingCheckoutResult>;
  writeAnchoredMarker: (cwd: string, marker: WorktreeMarker, options?: { expected?: Buffer }) => Promise<AnchoredMarkerWriteResult>;
}
/** Retain today's Git guards and checkout lookup until locus binds its authoritative implementations. */
export function createDefaultLocusPorts(): LocusPorts {
  return {
    checkMarkerExclusivity: () => Promise.resolve({ kind: "clear" }),
    findHoldingCheckout: async ({ resolveLegacy }) => {
      const path = await resolveLegacy?.() ?? null;
      return path === null ? { kind: "none" } : { kind: "held", path };
    },
    writeAnchoredMarker: () => Promise.resolve({ kind: "unadmitted" }),
  };
}
/** Refuse a duplicate claim with the work-or-release repair before any marker write. */
export async function requireMarkerExclusivity(ports: LocusPorts | undefined, request: WorkUnitHolderRequest & { checkoutPath?: string }): Promise<void> {
  const result = await (ports ?? createDefaultLocusPorts()).checkMarkerExclusivity(request);
  if (result.kind === "refused") throw new Error(result.reason);
}
