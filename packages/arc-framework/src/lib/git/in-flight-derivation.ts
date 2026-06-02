/**
 * In-flight derivation — the oracle's branch→entry classifier.
 *
 * Given the pruned remote-ref set (live-backed local remote-tracking branches,
 * from the remote-ref reader), this resolves the identity's in-flight work
 * units and errands with no checkout. Each branch is classified by reading its
 * candidate meta off the remote-tracking ref (`git show origin/<branch>:<path>`):
 * a branch whose meta is present is a work unit; a `chore/<slug>` branch with no
 * backing meta is an errand. Classification is content-driven, never branch-name
 * → WU — the branch name only supplies the candidate meta path and the
 * life-phase State proxy (`plan/` = planning, any other type-prefix = activated).
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
import { parseMetaRecord } from "../active/meta-reader.js";
import { errandSlugOf } from "../session-init/errand-branch.js";

import type { GitExec } from "./exec.js";
import { readMetaAtRef } from "./remote-ref-reader.js";
import { resolveWorktreePathsByBranch } from "./worktree-roster.js";

/** Default remote whose tracking refs back the no-checkout meta reads. */
const DEFAULT_REMOTE = "origin";

/** Branch prefix marking live-mutating planning — the `Planning` State proxy. */
const PLANNING_BRANCH_PREFIX = "plan/";

/** State proxied off the branch life-phase prefix — coarse by design. */
export type InFlightState = Extract<WorkUnitState, "Planning" | "Active">;

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
  /** `**Cohort:**` from the meta; absent when unset or `[none]`. */
  cohort?: string;
}

/** An errand in flight — a `chore/<slug>` branch with no backing meta. */
export interface InFlightErrand extends InFlightLocation {
  kind: "errand";
  /** The `<slug>` after `chore/`. */
  slug: string;
}

/** One derived in-flight entry. */
export type InFlightEntry = InFlightWorkUnit | InFlightErrand;

/** Inputs for {@link deriveInFlight}. */
export interface DeriveInFlightOptions {
  /** Injectable git executor — used for `git worktree list` and `git show`. */
  exec: GitExec;
  /** Pruned remote-ref branch set (short names) — from `listPrunedRemoteTrackingBranches`. */
  branches: readonly string[];
  /** Owner to filter to; `null` disables filtering. */
  identity: string | null;
  /** Team mode — identity filtering applies only when `true`. */
  teamMode: boolean;
  /** Remote whose tracking refs back the reads. Defaults to `origin`. */
  remote?: string;
  /** Open-PR enrichment seam. Absent → refs-only; a rejecting adapter degrades to refs-only. */
  prSource?: PrSource;
}

/**
 * Derive the identity's in-flight work units and errands from a pruned ref set.
 *
 * @param options - Executor, the pruned branch set, and the identity filter.
 * @returns In-flight entries in input-branch order, identity-filtered.
 */
export async function deriveInFlight(options: DeriveInFlightOptions): Promise<InFlightEntry[]> {
  const { exec, branches, identity, teamMode, remote = DEFAULT_REMOTE, prSource } = options;
  const worktreePaths = await resolveWorktreePathsByBranch(exec);

  const classified = await Promise.all(
    branches.map((branch) => classifyBranch(exec, remote, branch, worktreePaths)),
  );

  const kept = classified
    .filter((entry): entry is InFlightEntry => entry !== null)
    .filter((entry) => keepForIdentity(entry, identity, teamMode));

  return prSource === undefined ? kept : enrichWithPrState(kept, prSource);
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
 * Classify one branch into a work unit, an errand, or nothing — reading its
 * candidate meta off the remote-tracking ref to drive the decision by content.
 */
async function classifyBranch(
  exec: GitExec,
  remote: string,
  branch: string,
  worktreePaths: Map<string, string>,
): Promise<InFlightEntry | null> {
  const ref = `${remote}/${branch}`;
  const location = locationOf(branch, worktreePaths);

  const slug = errandSlugOf(branch);
  if (slug !== null) {
    // A `chore/` branch is an errand unless a backing meta promotes it to a WU.
    const content = await readMetaAtRef({ exec, ref, metaPath: metaPathForWu(slug) });
    if (content === null) return { kind: "errand", slug, ...location };
    return buildWorkUnit(slug, content, location, /* planning */ false);
  }

  // A WU branch is `<type>/<wu-name>`; without a `/` it carries no WU name
  // (main, release branches) and is not in flight.
  const sep = branch.indexOf("/");
  if (sep === -1) return null;
  const name = branch.slice(sep + 1);
  if (name === "") return null;

  const content = await readMetaAtRef({ exec, ref, metaPath: metaPathForWu(name) });
  if (content === null) return null; // Type-prefixed but no active meta — not a WU.
  return buildWorkUnit(name, content, location, branch.startsWith(PLANNING_BRANCH_PREFIX));
}

/** Assemble a work-unit entry from its meta content, location, and life-phase. */
function buildWorkUnit(
  name: string,
  content: string,
  location: InFlightLocation,
  planning: boolean,
): InFlightWorkUnit {
  const fields = parseMetaRecord(content);
  const { Owner: owner, Cohort: cohort } = fields;
  return {
    kind: "work-unit",
    name,
    state: planning ? "Planning" : "Active",
    ...location,
    ...(owner !== null ? { owner } : {}),
    ...(cohort !== null && cohort !== "[none]" ? { cohort } : {}),
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
