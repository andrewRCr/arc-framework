/**
 * B-side consumer of the sibling sync-state ref — selects the live partial-push
 * markers session-init renders as the **Aware** advisory one-liner.
 *
 * The producer (`partial-push-marker`) writes a per-machine marker to
 * `refs/arc/user/{identity}/sync-state` recording an outstanding notes-push
 * intent (HEAD it was advancing for, when, and the notes-ref target). On a
 * sibling clone, a marker whose intent origin's notes ref has not yet reached is
 * a notes push that hasn't arrived — lag, not loss. This module reads that ref,
 * invokes the producer's liveness predicate and TTL backstop (never
 * reimplementing self-invalidation), and returns the markers worth surfacing.
 *
 * The decision is presentation-only: the agent proceeds-with-context and never
 * auto-resolves (it does not force-push to "fix" stale notes). An absent ref
 * (fetch-only clone, remote sync off, or no producer) degrades to silence rather
 * than erroring — the cohort edge is soft.
 *
 * @module
 */

import { isContainedIn } from "../git/branch-containment.js";
import { readRefTip } from "../git/ref-tree.js";
import type { GitExec } from "../git/exec.js";
import {
  evaluateMarkerLiveness,
  isMarkerExpired,
  readSyncStateMarker,
  SYNC_STATE_MARKER_TTL_DAYS,
  type AncestryResolver,
  type SyncStateMarker,
} from "../user-sync/sync-state-marker.js";
import { readEntries } from "../user-sync/sync-state-ref.js";

/** Notes ref prefix; mirrors the producer's `refs/notes/arc/user`. */
const USER_NOTES_REF = "refs/notes/arc/user";

/** One marker selected for the Aware surface, carrying the fields its line is rendered from. */
export interface AwareMarkerEntry {
  /** The writing machine's id (→ the "whose" affordance). */
  machineId: string;
  /** The HEAD the failed notes push was advancing for (→ the short-sha affordance). */
  lastAttemptedCommit: string;
  /** ISO-8601 timestamp of the attempt (→ the "when" affordance). */
  attemptTimestamp: string;
}

/** The partial-push-marker surface slot — the live markers to render, empty when silent. */
export interface PartialPushMarkerSurfaceResult {
  /** Live, non-expired markers to render as Aware advisory lines; empty when nothing surfaces. */
  markers: AwareMarkerEntry[];
}

/** Inputs to the pure marker-selection decision. */
export interface SelectAwareMarkersInput {
  /** Every machine's marker read from the local sync-state ref; empty when the ref is absent. */
  markers: SyncStateMarker[];
  /**
   * Origin's notes-ref tip, against which each marker's intent is compared. The
   * local pulled notes ref is its network-free proxy — once notes are pulled the
   * two coincide, and a marker whose intent the local ref already carries (this
   * machine's own outstanding push) self-silences as `fulfilled`.
   */
  notesRefTip: string | null;
  /** Reference time the TTL backstop measures `attemptTimestamp` against. */
  now: string;
  /** TTL window in days; defaults to the producer's {@link SYNC_STATE_MARKER_TTL_DAYS}. */
  ttlDays?: number;
  /**
   * Resolves whether a marker's intent is reachable from the notes-ref tip — the
   * predicate's git-ancestry input. Wired to the `isContainedIn` reachability
   * primitive in production, substituted by a fake in unit tests.
   */
  isReachable: AncestryResolver;
}

/**
 * Select the markers that render an Aware line: still `live` by the producer's
 * reachability predicate and within the TTL backstop. A `fulfilled` marker (its
 * intent reached at origin) and an aged-out one both drop to silence.
 *
 * The TTL filter runs first so an aged-out marker never spends a git ancestry
 * call on the reachability check.
 *
 * @param input - The read markers, origin's notes-ref tip, the reference time, the TTL, and the reachability resolver.
 * @returns The markers to surface; empty when none qualify.
 */
export async function selectAwareMarkers(
  input: SelectAwareMarkersInput,
): Promise<PartialPushMarkerSurfaceResult> {
  const { markers, notesRefTip, now, ttlDays = SYNC_STATE_MARKER_TTL_DAYS, isReachable } = input;
  const selected: AwareMarkerEntry[] = [];
  for (const marker of markers) {
    if (isMarkerExpired(marker, now, ttlDays)) continue;
    if ((await evaluateMarkerLiveness(marker, notesRefTip, isReachable)) !== "live") continue;
    selected.push({
      machineId: marker.machineId,
      lastAttemptedCommit: marker.lastAttemptedCommit,
      attemptTimestamp: marker.attemptTimestamp,
    });
  }
  return { markers: selected };
}

/** Inputs for the IO composition over the local sync-state ref. */
export interface RunPartialPushMarkerSurfaceOptions {
  exec: GitExec;
  /** Identity whose sync-state ref is read; the ref is identity-scoped. */
  identity: string;
  /** Reference time the TTL backstop measures against (injected for determinism). */
  now: string;
}

/**
 * Read the local sync-state ref and resolve the Aware surface for it.
 *
 * Enumerates every machine's entry, parses each into a marker (malformed or
 * key-mismatched entries drop out at the typed boundary), reads the local
 * notes-ref tip as origin's network-free proxy, and runs the pure selection. An
 * absent ref yields no entries and the surface is silent.
 *
 * @param options - The git executor, identity, and reference time.
 * @returns The markers to surface; empty when the ref is absent or nothing is live.
 */
export async function runPartialPushMarkerSurface(
  options: RunPartialPushMarkerSurfaceOptions,
): Promise<PartialPushMarkerSurfaceResult> {
  const { exec, identity, now } = options;
  const refIo = { exec, identity };

  const entries = await readEntries(refIo);
  if (entries.size === 0) return { markers: [] };

  const markers = (
    await Promise.all([...entries.keys()].map((machineId) => readSyncStateMarker(refIo, machineId)))
  ).filter((marker): marker is SyncStateMarker => marker !== null);

  const notesRefTip = await readRefTip(exec, `${USER_NOTES_REF}/${identity}`);
  return selectAwareMarkers({
    markers,
    notesRefTip,
    now,
    isReachable: (ancestor, descendant) => isContainedIn(exec, ancestor, descendant),
  });
}
