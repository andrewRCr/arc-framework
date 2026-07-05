/**
 * Composer for `arc status --user` — the explicit in-flight-mine view request.
 *
 * Fires the in-flight oracle behind a bounded network read, assembles the
 * identity's in-flight-mine slice, and renders it to a canonical-markdown table
 * via the pure render core. An active re-render request, not a passive
 * file-open: it resolves fresh state every call.
 *
 * The view has two sources, merged into an In Flight section and a Ready section:
 *
 * - **In Flight** — the git-derived in-flight-mine slice (your WUs in flight
 *   anywhere), merged with fresh local-worktree meta so local ceremony changes
 *   win over stale remote-tracking content for the same branch.
 * - **Ready** — the local ready-mine slice (your owned, unblocked planned work).
 *   It reads only local metas, so it is always available — it never degrades when
 *   the remote is unreachable.
 *
 * Two offline behaviors, kept distinct:
 *
 * - **`--local` / `--no-fetch`** skips the network read and renders from the
 *   last-known local remote-tracking refs plus fresh local-worktree meta — a
 *   fast offline view the caller explicitly asked for. It cannot prune dead
 *   refs, so a lingering merged-and-deleted branch may surface; the online path
 *   prunes correctly.
 * - **Online but unreachable** degrades to the last-rendered `STATUS.USER` cache
 *   rather than rendering a half-resolved in-flight view — the file is the cache.
 *   Only the in-flight half degrades this way; the structured merge of the fresh
 *   local ready slice into the cached document is the deferred file-writer's job.
 *
 * The explicit view path may persist a successful render as the local cache.
 * The full structured writer, chrome, trigger wiring, and offline cache merge
 * reuse the same render core and land later.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  deriveInFlight,
  type InFlightEntry,
  type PrSource,
} from "../git/in-flight-derivation.js";
import { resolveInFlightBranchSet } from "../git/remote-ref-reader.js";
import { readErrandSlugByBranch } from "../errand/record.js";

import { buildInFlightMineSlice } from "./in-flight-mine.js";
import {
  renderStatusTable,
  STATUS_USER_COLUMNS,
  STATUS_USER_READY_COLUMNS,
  type StatusViewRow,
} from "./render.js";

/** What produced the view output. */
export type StatusUserViewSource = "rendered" | "cache" | "cache-missing" | "no-identity";

/** Result of an explicit in-flight-mine view request. */
export interface StatusUserViewResult {
  /** The text to print to the terminal. */
  output: string;
  /** Which path produced {@link output}. */
  source: StatusUserViewSource;
}

/** Inputs for {@link runStatusUserView}. */
export interface RunStatusUserViewOptions {
  /** Injectable git executor. */
  exec: GitExec;
  /** Resolved identity; `null` short-circuits (the view is identity-scoped). */
  identity: string | null;
  /** Team mode — gates oracle identity filtering. */
  teamMode: boolean;
  /** `--local` / `--no-fetch`: skip the network read, render from local refs. */
  localOnly: boolean;
  /** Per-read network timeout in ms; defaults to the reader's bound. */
  timeoutMs?: number;
  /** Open-PR enrichment seam; omitted → refs-only. */
  prSource?: PrSource;
  /** Read the last-rendered `STATUS.USER` cache; `null` when absent. */
  readLastRendered: () => Promise<string | null>;
  /**
   * Resolve local worktree-backed in-flight WUs. These override stale
   * remote-tracking rows for the same branch and append when a local WU has no
   * remote row yet.
   */
  readLocalInFlight?: () => Promise<InFlightEntry[]>;
  /**
   * Resolve the local ready-mine slice (owned, unblocked planned work). Network-
   * independent, so it is awaited regardless of remote reachability.
   */
  readReadyMine: () => Promise<StatusViewRow[]>;
}

/** Compose the two-section user view from the resolved in-flight and ready slices. */
function composeUserView(
  identity: string,
  inFlight: readonly StatusViewRow[],
  ready: readonly StatusViewRow[],
): string {
  const inFlightBody =
    inFlight.length > 0
      ? renderStatusTable(inFlight, STATUS_USER_COLUMNS)
      : `No in-flight work units for \`${identity}\`.`;
  const readyBody =
    ready.length > 0
      ? renderStatusTable(ready, STATUS_USER_READY_COLUMNS)
      : `No ready work units for \`${identity}\`.`;
  return `## In Flight\n\n${inFlightBody}\n\n## Ready\n\n${readyBody}`;
}

/**
 * Merge remote-oracle entries with local worktree entries.
 *
 * Remote order is preserved. When a local worktree exists for the same branch,
 * the local parsed meta wins (fresh local truth beats stale remote-tracking
 * content). Local-only entries append after the remote set.
 */
function mergeInFlightEntries(
  remote: readonly InFlightEntry[],
  local: readonly InFlightEntry[],
): InFlightEntry[] {
  const byBranch = new Map<string, InFlightEntry>();
  for (const entry of remote) byBranch.set(entry.branch, entry);
  for (const entry of local) byBranch.set(entry.branch, entry);
  return [...byBranch.values()];
}

/**
 * Run the explicit in-flight-mine view request.
 *
 * @param options - Git adapter, identity, mode flags, and the cache reader.
 * @returns The rendered table, a degraded cache view, or a status message.
 */
export async function runStatusUserView(
  options: RunStatusUserViewOptions,
): Promise<StatusUserViewResult> {
  const { exec, identity, teamMode, localOnly, timeoutMs, prSource } = options;

  if (identity === null) {
    return {
      output: "Status (User) requires `arc.identity` to be set in git config.",
      source: "no-identity",
    };
  }

  // The ready slice is local and always available — resolved regardless of
  // remote reachability so the unreachable path below never has to recompute it.
  const ready = await options.readReadyMine();

  const { branches, reachable } = await resolveInFlightBranchSet({ exec, localOnly, timeoutMs });

  // Online but unreachable: the in-flight half can't be refreshed, so degrade to
  // the last-rendered cache rather than render a half-resolved view. `--local`
  // never degrades — it rendered from local refs by request.
  if (!localOnly && !reachable) {
    const cached = await options.readLastRendered();
    if (cached !== null) return { output: cached.trimEnd(), source: "cache" };
    return {
      output: "Remote unreachable and no cached STATUS.USER view to fall back on.",
      source: "cache-missing",
    };
  }

  const errandSlugByBranch = await readErrandSlugByBranch({ exec, identity });
  const [remoteEntries, localEntries] = await Promise.all([
    deriveInFlight({ exec, branches, identity, teamMode, errandSlugByBranch, prSource }),
    options.readLocalInFlight?.() ?? Promise.resolve([]),
  ]);
  const inFlight = buildInFlightMineSlice(mergeInFlightEntries(remoteEntries, localEntries));
  return { output: composeUserView(identity, inFlight, ready), source: "rendered" };
}
