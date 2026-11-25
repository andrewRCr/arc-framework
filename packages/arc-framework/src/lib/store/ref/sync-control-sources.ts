/** Transient source identities for the existing primary and cohort-placement selections. */

export type SyncControlName = "primary" | "placement";
export interface SyncCohortEndRoute {
  kind: "pending-end" | "late-live"; live: string; history: string; liveSide: "local" | "incoming";
}
export interface SyncControlSource {
  ref: string; tip: string | null; recordFree: boolean;
  cohortEnd?: { live: string; history: string };
}
/** Undefined denotes a composed control, never an invented single source. Both keys always exist. */
export type SyncControlSelections = Record<SyncControlName, SyncControlSource | undefined>;

/** A chosen whole container supplies even controls that are absent from every metadata key set. */
export function selectSyncControls(selections: SyncControlSelections, path: readonly string[], source: SyncControlSource): void {
  for (const key of ["primary", "placement"] as const) {
    if (path.length === 0 || path.length === 1 && path[0] === key) selections[key] = source;
  }
}

/** Only the two admitted same-owner end routes identify an open cohort input. */
export function cohortEndLiveSource(route: SyncCohortEndRoute | undefined,
  refs: { local: string; incoming: string }, destination: string, currentSide: "local" | "incoming", reopening?: boolean): string | undefined {
  if (!route || reopening || destination !== route.history || !/^refs\/arc\/cohort\/[^/]+$/u.test(route.live)
    || route.history !== route.live.replace("refs/arc/", "refs/arc/history/")) return undefined;
  if (route.kind === "pending-end") return route.liveSide === "local" && currentSide === "incoming"
    && refs.local === route.live && refs.incoming === route.history ? route.live : undefined;
  return route.liveSide === "incoming" && currentSide === "local"
    && refs.local === route.history && refs.incoming === route.live ? route.live : undefined;
}
