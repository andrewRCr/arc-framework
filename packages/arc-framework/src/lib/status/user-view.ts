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
 *   anywhere), resolved behind the bounded network read.
 * - **Ready** — the local ready-mine slice (your owned, unblocked planned work).
 *   It reads only local metas, so it is always available — it never degrades when
 *   the remote is unreachable.
 *
 * Two offline behaviors, kept distinct:
 *
 * - **`--local` / `--no-fetch`** skips the network read and renders from the
 *   last-known local remote-tracking refs — a fast offline view the caller
 *   explicitly asked for. It cannot prune dead refs, so a lingering
 *   merged-and-deleted branch may surface; the online path prunes correctly.
 * - **Online but unreachable** degrades to the last-rendered `STATUS.USER` cache
 *   rather than rendering a half-resolved in-flight view — the file is the cache.
 *   Only the in-flight half degrades this way; the structured merge of the fresh
 *   local ready slice into the cached document is the deferred file-writer's job.
 *
 * This work unit renders to the terminal only; the canonical-file write and
 * reconcile reuse the same render core and land later.
 *
 * @module
 */

import type { GitExec } from "../git/exec.js";
import {
  deriveInFlight,
  type PrSource,
} from "../git/in-flight-derivation.js";
import { resolveInFlightBranchSet } from "../git/remote-ref-reader.js";

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

  const entries = await deriveInFlight({ exec, branches, identity, teamMode, prSource });
  const inFlight = buildInFlightMineSlice(entries);
  return { output: composeUserView(identity, inFlight, ready), source: "rendered" };
}
