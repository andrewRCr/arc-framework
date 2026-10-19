/** Narrow lifecycle boundary for locus-owned checkout claims. */
import type { WorktreeMarker } from "../git/worktree-marker.js";

/** Exclusivity refusal identifies the checkout that already holds this work unit. */
export type MarkerExclusivityResult = { kind: "clear" } | { kind: "refused"; checkoutPath?: string; reason: string };
/** Exact generation written by an anchored claim, or its non-writing refusal. */
export type AnchoredMarkerWriteResult =
  | { kind: "created" | "replaced"; bytes: Buffer }
  | { kind: "exists" | "generation-mismatch" | "unadmitted" };
/** Locus supplies these ports when it admits anchored work-unit markers. */
export interface LocusPorts {
  checkMarkerExclusivity: (request: { name: string; checkoutPath?: string }) => Promise<MarkerExclusivityResult>;
  findHoldingCheckout: (request: { name: string; resolveLegacy: () => Promise<string | null> }) => Promise<string | null>;
  writeAnchoredMarker: (cwd: string, marker: WorktreeMarker, options?: { expected?: Buffer }) => Promise<AnchoredMarkerWriteResult>;
}
/** Retain today's Git guards and checkout lookup until locus binds its authoritative implementations. */
export function createDefaultLocusPorts(): LocusPorts {
  return {
    checkMarkerExclusivity: () => Promise.resolve({ kind: "clear" }),
    findHoldingCheckout: ({ resolveLegacy }) => resolveLegacy(),
    writeAnchoredMarker: () => Promise.resolve({ kind: "unadmitted" }),
  };
}
/** Refuse a duplicate claim with the work-or-release repair before any marker write. */
export async function requireMarkerExclusivity(ports: LocusPorts | undefined, request: { name: string; checkoutPath?: string }): Promise<void> {
  const result = await (ports ?? createDefaultLocusPorts()).checkMarkerExclusivity(request);
  if (result.kind === "refused") throw new Error(result.reason);
}
