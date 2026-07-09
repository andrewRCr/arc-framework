/**
 * `arc active in-flight` — the oracle-backed in-flight set.
 *
 * Fires the in-flight oracle behind a bounded network read and returns the
 * identity's in-flight work units and errands (identity-filtered refs, optional
 * PR enrichment), cross-worktree *and* cross-machine. This is the activation
 * scope-check's data input, supplanting the local-only `arc active roster`: it
 * surfaces remote-only work units (no local worktree) the worktree roster can't
 * see. Pure logic over injected git deps — the handler resolves identity, team
 * mode, and the network/offline mode flag.
 *
 * @module
 */

import type { GitExec } from "../../lib/git/exec.js";
import {
  deriveInFlight,
  type InFlightEntry,
  type InFlightWarning,
  type PrSource,
} from "../../lib/git/in-flight-derivation.js";
import { readErrandSlugByBranch } from "../../lib/errand/record.js";

export interface ActiveInFlightOptions {
  exec: GitExec;
  /** Current identity, or `null` when unconfigured — the filter passes through. */
  identity: string | null;
  /** Team mode — gates the oracle identity filter (no-op in solo mode). */
  teamMode: boolean;
  /** `--local` / `--no-fetch`: skip the network read, derive from local refs. */
  localOnly: boolean;
  /** Configured base branch; excluded from in-flight classification. */
  baseBranch?: string;
  /** Slugs whose checkout lifecycle record classifies them as parked. */
  parkedSlugs?: ReadonlySet<string>;
  /** Per-read network timeout in ms; defaults to the reader's bound. */
  timeoutMs?: number;
  /** Open-PR enrichment seam; omitted → refs-only. */
  prSource?: PrSource;
}

export interface ActiveInFlightResult {
  /** Identity-filtered in-flight work units and errands, in oracle (input-branch) order. */
  entries: InFlightEntry[];
  /** Structured diagnostics emitted while deriving the in-flight set. */
  warnings: InFlightWarning[];
  /**
   * True only when live remote membership was read and pruned against (online).
   * `false` on `--local` / unreachable — entries derive from last-known local
   * refs, a degraded view the advisory caller may note but never gates on.
   */
  reachable: boolean;
}

/**
 * Resolve the identity's oracle-backed in-flight set.
 *
 * @param options - Injected git adapter plus resolved identity, team mode, and mode flag.
 * @returns The in-flight work units and errands, with the network-reachability flag.
 */
export async function runActiveInFlight(
  options: ActiveInFlightOptions,
): Promise<ActiveInFlightResult> {
  const { exec, identity, teamMode, localOnly, baseBranch, parkedSlugs, timeoutMs, prSource } = options;
  const errandSlugByBranch = await readErrandSlugByBranch({ exec, identity });
  const result = await deriveInFlight({
    exec,
    localOnly,
    baseBranch,
    timeoutMs,
    identity,
    teamMode,
    errandSlugByBranch,
    parkedSlugs,
    prSource,
  });
  return { entries: result.entries, warnings: result.warnings, reachable: result.reachable };
}
