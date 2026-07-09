/**
 * In-flight derivation — the oracle's branch→entry classifier.
 *
 * Given the pruned remote-ref set (live-backed local remote-tracking branches,
 * from the remote-ref reader), this resolves the identity's in-flight work
 * units and errands with no checkout. Errand-ness is a **record** property: a
 * branch carrying an errand record (supplied as a branch→slug index) is an
 * errand whatever its prefix, decoupling errand-ness from the `chore/` name. A
 * record-less branch is then classified by reading its candidate meta off the
 * remote-tracking ref (`git show origin/<branch>:<path>`): a branch whose meta
 * is present is a work unit. Classification is record- and content-driven, never
 * branch-name → WU — the branch name only supplies the candidate meta path and
 * the life-phase State proxy (`plan/` = planning, any other type-prefix =
 * activated).
 *
 * Worktree paths are not stored: they resolve live from `git worktree list`, so
 * a WU in flight only on the remote (no local worktree) is flagged `remoteOnly`
 * — the materialize-candidate signal. Identity filtering mirrors
 * `filterRosterByIdentity`: in team mode, entries owned by a different identity
 * drop while the current identity's and every unattributed entry survive; solo
 * mode (or no identity) passes everything through.
 *
 * @module
 */

import type { WorkUnitState } from "../../commands/active/types.js";
import { parseIdentifierList, parseMetaRecord, type MetaRecord } from "../active/meta-reader.js";

import type { GitExec } from "./exec.js";
import { readMetaAtRef } from "./remote-ref-reader.js";
import { resolveWorktreePathsByBranch } from "./worktree-roster.js";

/** Default remote whose tracking refs back the no-checkout meta reads. */
const DEFAULT_REMOTE = "origin";

/** Branch prefix marking live-mutating planning — the `Planning` State proxy. */
const PLANNING_BRANCH_PREFIX = "plan/";

/** State proxied off the branch life-phase prefix — coarse by design. */
export type InFlightState = Extract<WorkUnitState, "Planning" | "Active">;

/** Per-entry quality marker. Healthy entries omit marks. */
export type InFlightEntryMark = "degraded" | "indeterminate" | "location-ambiguous";

/** Scheduling-axis classification, independent from degradation marks. */
export type InFlightScheduling = "parked";

/** Structured warning codes emitted by the in-flight derivation. */
export type InFlightWarningCode =
  | "meta-enumeration-failed"
  | "meta-read-failed"
  | "meta-malformed"
  | "state-unrecognized"
  | "branch-field-missing"
  | "stale-location-dropped"
  | "stale-location-shadow";

/** Structured warning surfaced by in-flight derivation consumers. */
export interface InFlightWarning {
  /** Stable machine-readable warning code. */
  code: InFlightWarningCode;
  /** Branch/ref candidate the warning came from, when branch-scoped. */
  branch?: string;
  /** Work-unit slug the warning applies to, when known. */
  workUnit?: string;
  /** Stable human-readable rendering. */
  rendered: string;
}

/** Render a structured in-flight warning for CLI/advisory output. */
export function renderInFlightWarning(warning: InFlightWarning): string {
  return warning.rendered;
}

/** Open-PR signal for one branch, surfaced by a coordination adapter. */
export interface OpenPrSignal {
  /** PR number, when the adapter surfaces it. */
  number?: number;
  /** PR web URL, when the adapter surfaces it. */
  url?: string;
}

/**
 * PR-source seam — resolves open-PR state for the in-flight branches, keyed by
 * branch (branches with no open PR are simply absent from the map). The concrete
 * `gh`/coord-probe adapter is a downstream deliverable; the oracle needs only
 * this contract and is fully functional without it (refs-only). An adapter that
 * rejects degrades to refs-only — the oracle never propagates the throw.
 */
export type PrSource = (branches: readonly string[]) => Promise<Map<string, OpenPrSignal>>;

/** Fields shared by every in-flight entry, work unit or errand. */
interface InFlightLocation {
  /** The remote branch the entry derives from. */
  branch: string;
  /** Local worktree path; present only when the branch is checked out here. */
  worktreePath?: string;
  /** True when in flight on the remote with no local worktree — the materialize-candidate signal. */
  remoteOnly: boolean;
  /** Open-PR enrichment; present only when a PR source resolved one for this branch (refs-only otherwise). */
  pr?: OpenPrSignal;
  /** Degradation/indeterminacy marks; absent on healthy entries. */
  marks?: readonly InFlightEntryMark[];
}

/** A work unit in flight — a remote branch backed by an `active/` meta. */
export interface InFlightWorkUnit extends InFlightLocation {
  kind: "work-unit";
  /** WU name — the meta filename stem / branch segment after the life-phase prefix. */
  name: string;
  /** Life-phase State proxied off the branch prefix: `plan/` → Planning, else Active. */
  state: InFlightState;
  /** `**Owner:**` from the meta; absent when unattributed. */
  owner?: string;
  /** `**Design:**` spec pointer from the meta — the WU's stated scope; absent when unset or `[none]`. */
  design?: string;
  /** `**Cohort:**` from the meta; absent when unset or `[none]`. */
  cohort?: string;
  /** Raw `**Class:**` weight from the meta; absent only when the field is unset. The `[TBD]` sentinel is kept. */
  class?: string;
  /** Raw `**Priority:**` level from the meta; absent when unset or `[none]`. */
  priority?: string;
  /** Parsed `**Depends On:**` WU-names; empty when independent (`[none]`). */
  dependsOn: readonly string[];
  /** Scheduling-axis overlay; absent for normal in-flight work. */
  scheduling?: InFlightScheduling;
}

/** An errand in flight — a `chore/<slug>` branch with no backing meta. */
export interface InFlightErrand extends InFlightLocation {
  kind: "errand";
  /** The `<slug>` after `chore/`. */
  slug: string;
}

/** One derived in-flight entry. */
export type InFlightEntry = InFlightWorkUnit | InFlightErrand;

/** Result of the in-flight derivation. */
export interface DeriveInFlightResult {
  /** Identity-filtered in-flight work units and errands. */
  entries: InFlightEntry[];
  /** Structured warning channel; empty for healthy derivations. */
  warnings: InFlightWarning[];
  /** Whether live network membership backed the branch set. */
  reachable: boolean;
}

/** Inputs for {@link deriveInFlight}. */
export interface DeriveInFlightOptions {
  /** Injectable git executor — used for `git worktree list` and `git show`. */
  exec: GitExec;
  /** Pruned remote-ref branch set (short names) — from `listPrunedRemoteTrackingBranches`. */
  branches: readonly string[];
  /** Whether live network membership backed `branches`. Defaults to true for direct unit callers. */
  reachable?: boolean;
  /** Owner to filter to; `null` disables filtering. */
  identity: string | null;
  /** Team mode — identity filtering applies only when `true`. */
  teamMode: boolean;
  /** Remote whose tracking refs back the reads. Defaults to `origin`. */
  remote?: string;
  /**
   * Branch→slug index from the identity's errand records — the errand-identity
   * oracle. A branch present here is an errand (slug from the record). Defaults
   * to empty (no record-classified errands), so a record-less branch resolves by
   * meta presence alone.
   */
  errandSlugByBranch?: ReadonlyMap<string, string>;
  /** Work-unit slugs parked in the scheduling axis; matching entries are classified, not marked. */
  parkedSlugs?: ReadonlySet<string>;
  /** Open-PR enrichment seam. Absent → refs-only; a rejecting adapter degrades to refs-only. */
  prSource?: PrSource;
}

/**
 * Derive the identity's in-flight work units and errands from a pruned ref set.
 *
 * @param options - Executor, the pruned branch set, and the identity filter.
 * @returns In-flight entries in input-branch order, identity-filtered.
 */
export async function deriveInFlight(options: DeriveInFlightOptions): Promise<DeriveInFlightResult> {
  const { exec, branches, identity, teamMode, remote = DEFAULT_REMOTE, prSource } = options;
  const reachable = options.reachable ?? true;
  const errandSlugByBranch = options.errandSlugByBranch ?? new Map<string, string>();
  const parkedSlugs = options.parkedSlugs ?? new Set<string>();
  const worktreePaths = await resolveWorktreePathsByBranch(exec);

  const classified = await Promise.all(
    branches.map((branch) =>
      classifyBranch(exec, remote, branch, worktreePaths, errandSlugByBranch, parkedSlugs),
    ),
  );

  const kept = classified
    .filter((entry): entry is InFlightEntry => entry !== null)
    .filter((entry) => keepForIdentity(entry, identity, teamMode));

  const entries = prSource === undefined ? kept : await enrichWithPrState(kept, prSource);
  return { entries, warnings: [], reachable };
}

/**
 * Enrich the kept entries with open-PR state, querying only their branches. A
 * rejecting adapter degrades to refs-only — the seam never propagates a throw.
 */
async function enrichWithPrState(
  entries: InFlightEntry[],
  prSource: PrSource,
): Promise<InFlightEntry[]> {
  let openPrs: Map<string, OpenPrSignal>;
  try {
    openPrs = await prSource(entries.map((entry) => entry.branch));
  } catch {
    return entries;
  }
  return entries.map((entry) => {
    const pr = openPrs.get(entry.branch);
    return pr === undefined ? entry : { ...entry, pr };
  });
}

/** Build the location fields for a branch from the live worktree map. */
function locationOf(branch: string, worktreePaths: Map<string, string>): InFlightLocation {
  const worktreePath = worktreePaths.get(branch);
  return worktreePath === undefined
    ? { branch, remoteOnly: true }
    : { branch, worktreePath, remoteOnly: false };
}

/** Repo-relative meta path for a WU name, by `meta-<name>.md` convention. */
function metaPathForWu(name: string): string {
  return `.arc/active/meta-${name}.md`;
}

/**
 * Classify one branch into a work unit, an errand, or nothing. Errand-ness is a
 * record property — a branch carrying an errand record is an errand (slug from
 * the record), whatever its prefix. A record-less branch is decided by content:
 * read its candidate meta off the remote-tracking ref; present → work unit.
 */
async function classifyBranch(
  exec: GitExec,
  remote: string,
  branch: string,
  worktreePaths: Map<string, string>,
  errandSlugByBranch: ReadonlyMap<string, string>,
  parkedSlugs: ReadonlySet<string>,
): Promise<InFlightEntry | null> {
  const ref = `${remote}/${branch}`;
  const location = locationOf(branch, worktreePaths);

  const errandSlug = errandSlugByBranch.get(branch);
  if (errandSlug !== undefined) {
    // A record marks this branch an errand. A promoted errand → WU removed its
    // record, so it falls through to the meta-backed work-unit path below.
    return { kind: "errand", slug: errandSlug, ...location };
  }

  // A WU branch is `<type>/<wu-name>`; without a `/` it carries no WU name
  // (main, release branches) and is not in flight.
  const sep = branch.indexOf("/");
  if (sep === -1) return null;
  const name = branch.slice(sep + 1);
  if (name === "") return null;

  const content = await readMetaAtRef({ exec, ref, metaPath: metaPathForWu(name) });
  if (content === null) return null; // No errand record and no active meta — not in flight.
  return buildWorkUnit(
    name,
    content,
    location,
    branch.startsWith(PLANNING_BRANCH_PREFIX),
    parkedSlugs.has(name),
  );
}

/**
 * Parse a meta record, dropping structurally malformed content from the advisory
 * in-flight oracle. One broken remote meta must not crash the whole derivation,
 * but treating it as ownerless would leak malformed WUs through identity-scoped
 * views.
 */
function parseRecord(content: string): MetaRecord | null {
  try {
    return parseMetaRecord(content);
  } catch {
    return null;
  }
}

/** Assemble a work-unit entry from its meta content, location, and life-phase. */
function buildWorkUnit(
  name: string,
  content: string,
  location: InFlightLocation,
  planning: boolean,
  parked: boolean,
): InFlightWorkUnit | null {
  const fields = parseRecord(content);
  if (fields === null) return null;
  const { Owner: owner, Design: design, Cohort: cohort, Class: workClass, Priority: priority } = fields;
  return {
    kind: "work-unit",
    name,
    state: planning ? "Planning" : "Active",
    ...location,
    ...(owner !== null ? { owner } : {}),
    ...(design !== null && design !== "[none]" ? { design } : {}),
    ...(cohort !== null && cohort !== "[none]" ? { cohort } : {}),
    // Keep `[TBD]`: it is a real value the view renders, unlike the `[none]`
    // absences above. Drop only a genuinely field-absent (`null`) Class.
    ...(workClass !== null ? { class: workClass } : {}),
    ...(priority !== null && priority !== "[none]" ? { priority } : {}),
    dependsOn: parseIdentifierList(fields["Depends On"]),
    ...(parked ? { scheduling: "parked" as const } : {}),
  };
}

/**
 * Identity filter mirroring `filterRosterByIdentity` semantics: solo mode (or no
 * identity) keeps everything; team mode drops entries owned by a different
 * identity while keeping the current identity's and every unattributed entry
 * (errands carry no owner, so they always pass).
 */
function keepForIdentity(entry: InFlightEntry, identity: string | null, teamMode: boolean): boolean {
  if (!teamMode || identity === null) return true;
  const owner = entry.kind === "work-unit" ? entry.owner : undefined;
  return owner === undefined || owner === identity;
}
