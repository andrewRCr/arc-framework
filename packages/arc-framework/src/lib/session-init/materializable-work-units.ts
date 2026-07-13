/**
 * Materializable-WU detection — filtering the oracle's in-flight entries to the
 * operator's remote-only work units, the discovery surface session-init offers
 * to materialize onto this machine.
 *
 * A WU in flight only on the remote (branch + committed meta on `origin`, no
 * local branch or worktree) is a materialize candidate: session-init's Materialize arm
 * picks the chosen one up via `git worktree add` → `arc user pull` → orient. A
 * WU already checked out here is a resume, not a materialize (git refuses
 * double-checkout anyway — free safety); another identity's WU is not the
 * operator's to pick up. The candidate list *is* the correctness mechanism —
 * selecting a real in-flight WU makes a phantom / typo'd name impossible.
 *
 * Pure core over the oracle's output ({@link InFlightEntry}): no git coupling.
 * Identity filtering mirrors the oracle's `keepForIdentity` — `null` identity
 * keeps everything; otherwise the current identity's and every unattributed WU
 * survive while another identity's drop — so the gate holds regardless of how
 * the upstream oracle was configured.
 *
 * @module
 */

import type { InFlightEntry } from "../git/in-flight-derivation.js";

/** One remote-only work unit that can be materialized onto this machine. */
export interface MaterializableWorkUnit {
  /** WU name — the meta filename stem / branch segment after the life-phase prefix. */
  name: string;
  /** The remote branch the WU derives from. */
  branch: string;
}

export interface FindMaterializableWorkUnitsOptions {
  /** Oracle-derived in-flight entries (work units and errands). */
  entries: readonly InFlightEntry[];
  /** Operator to filter to; `null` disables owner filtering. */
  identity: string | null;
}

export interface MaterializableWorkUnitsResult {
  /** Remote-only owned work units materializable as cross-machine pickups. */
  candidates: MaterializableWorkUnit[];
  /** Soft diagnostics emitted by the in-flight oracle feeding this slice. */
  warnings?: string[];
}

/**
 * Select the materializable work units from the oracle's in-flight entries.
 *
 * A WU qualifies when it is remote-only (no local branch or worktree) and owned
 * by the operator, or unattributed when an identity exists. Errands are never
 * WU candidates.
 *
 * @param options - The oracle entries and the operator identity to filter to.
 * @returns The operator's remote-only materializable work units.
 */
export function findMaterializableWorkUnits(
  options: FindMaterializableWorkUnitsOptions,
): MaterializableWorkUnitsResult {
  const { entries, identity } = options;
  const candidates: MaterializableWorkUnit[] = [];
  for (const entry of entries) {
    if (entry.kind !== "work-unit") continue;
    if (!entry.remoteOnly) continue;
    if (entry.scheduling === "parked") continue;
    if (entry.state === "Shipped") continue;
    if (entry.marks !== undefined && entry.marks.length > 0) continue;
    if (identity !== null && entry.owner !== undefined && entry.owner !== identity) continue;
    candidates.push({ name: entry.name, branch: entry.branch });
  }
  return { candidates };
}
