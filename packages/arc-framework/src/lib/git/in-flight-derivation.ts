/**
 * In-flight derivation — the oracle's branch→entry classifier.
 *
 * Given the pruned remote-ref set (live-backed local remote-tracking branches,
 * from the remote-ref reader), this resolves the identity's in-flight work
 * units and errands with no checkout. Errand-ness is a **record** property: a
 * branch carrying an errand record (supplied as a branch→slug index) is an
 * errand whatever its prefix, decoupling errand-ness from the `chore/` name. A
 * record-less branch is then classified by enumerating the active metas carried
 * at that ref: meta filename supplies WU identity, the meta `Branch` field
 * supplies location consistency, and the meta `State` field supplies lifecycle
 * phase. Classification is record- and content-driven, never branch-name → WU.
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

import { validateState, WORK_UNIT_STATE_ORDER, type WorkUnitState } from "../../commands/active/types.js";
import { META_FIELDS, parseIdentifierList, parseMetaRecord, type MetaRecord } from "../active/meta-reader.js";

import type { GitExec } from "./exec.js";
import { listMetaPathsAtRef, readMetaAtRef, resolveInFlightBranchSet } from "./remote-ref-reader.js";
import { resolveWorktreePathsByBranchResult } from "./worktree-roster.js";

/** Default remote whose tracking refs back the no-checkout meta reads. */
const DEFAULT_REMOTE = "origin";

/** Validated lifecycle state read from the meta, plus a degraded unknown sentinel. */
export type InFlightState = WorkUnitState | "unknown";

/** Per-entry quality marker. Healthy entries omit marks. */
export type InFlightEntryMark = "degraded" | "indeterminate" | "location-ambiguous";

/** Scheduling-axis classification, independent from degradation marks. */
export type InFlightScheduling = "parked";

/** Where one candidate for an in-flight work unit came from. */
export type InFlightCandidateSource = "remote-live" | "remote-tracking" | "worktree";

/** Whether the candidate meta's `Branch` field agrees with the candidate branch. */
export type InFlightCandidateRelation = "consistent" | "missing-branch" | "stale";

/** One branch/ref that contributed to a work unit's candidate set. */
export interface InFlightBranchProvenance {
  branch: string;
  ref: string;
  source: InFlightCandidateSource;
  relation: InFlightCandidateRelation;
  selected: boolean;
}

/** Structured warning codes emitted by the in-flight derivation. */
export type InFlightWarningCode =
  | "meta-enumeration-failed"
  | "meta-read-failed"
  | "meta-malformed"
  | "state-unrecognized"
  | "branch-field-missing"
  | "worktree-list-failed"
  | "stale-location-dropped"
  | "stale-location-shadow"
  | "candidate-shadowed"
  | "location-ambiguous";

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
  /** The branch/ref candidate the entry derives from. */
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

/** A work unit in flight — a branch/ref candidate backed by an active meta. */
export interface InFlightWorkUnit extends InFlightLocation {
  kind: "work-unit";
  /** WU name — the meta filename stem. */
  name: string;
  /** Lifecycle State read from the meta record. */
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
  /** Candidate branches carrying this WU, including shadowed/stale candidates. */
  provenance?: readonly InFlightBranchProvenance[];
}

/** An errand in flight — a branch keyed by an errand record. */
export interface InFlightErrand extends InFlightLocation {
  kind: "errand";
  /** Errand slug from the record. */
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
  /** Pre-resolved remote branch set, retained for low-level tests and compatibility during migration. */
  branches?: readonly string[];
  /** Whether live network membership backed `branches`. Defaults to true when `branches` is supplied. */
  reachable?: boolean;
  /** `--local` / `--no-fetch`: skip the network read while resolving branches internally. */
  localOnly?: boolean;
  /** Per-read network timeout in ms; defaults to the branch-set reader's bound. */
  timeoutMs?: number;
  /** Configured base branch; excluded because lifecycle residue there is not an in-flight location. */
  baseBranch?: string;
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
  const { exec, branches, identity, teamMode, remote = DEFAULT_REMOTE, prSource, baseBranch = "main" } = options;
  const errandSlugByBranch = options.errandSlugByBranch ?? new Map<string, string>();
  const parkedSlugs = options.parkedSlugs ?? new Set<string>();
  const worktreeResult = await resolveWorktreePathsByBranchResult(exec);
  const worktreePaths = worktreeResult.paths;
  const branchSet = branches === undefined
    ? await resolveInFlightBranchSet({ exec, localOnly: options.localOnly ?? false, timeoutMs: options.timeoutMs })
    : { branches: [...branches], reachable: options.reachable ?? true };
  const inputs = buildInputCandidates(branchSet.branches, worktreePaths, remote, branchSet.reachable);

  const classified = await Promise.all(
    inputs.map((input) =>
      classifyInput(exec, input, baseBranch, worktreePaths, errandSlugByBranch),
    ),
  );

  const deduped = await dedupeWorkUnitCandidates({
    exec,
    candidates: classified.flatMap((classification) => classification.workUnits),
    parkedSlugs,
    reachable: branchSet.reachable,
  });
  const candidateEntries = [
    ...classified
      .map((classification) => classification.errand)
      .filter((entry): entry is IndexedEntry => entry !== null),
    ...deduped.entries,
  ]
    .sort((a, b) => a.index - b.index)
    .map(({ entry }) => entry);
  const warnings = classified
    .flatMap((classification) => classification.warnings)
    .concat(deduped.warnings);
  if (!worktreeResult.ok) {
    warnings.unshift(worktreeListFailedWarning());
  }
  const entriesWithWorktreeMarks = worktreeResult.ok ? candidateEntries : candidateEntries.map(markEntryDegraded);
  const entriesForIdentity = entriesWithWorktreeMarks
    .filter((entry) => keepForIdentity(entry, identity, teamMode));

  const entries = prSource === undefined ? entriesForIdentity : await enrichWithPrState(entriesForIdentity, prSource);
  return { entries, warnings, reachable: branchSet.reachable };
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

interface InputCandidate {
  index: number;
  branch: string;
  ref: string;
  source: InFlightCandidateSource;
}

function buildInputCandidates(
  remoteBranches: readonly string[],
  worktreePaths: ReadonlyMap<string, string>,
  remote: string,
  reachable: boolean,
): InputCandidate[] {
  const out: InputCandidate[] = [];
  const remoteSource: InFlightCandidateSource = reachable ? "remote-live" : "remote-tracking";
  for (const branch of remoteBranches) {
    out.push({ index: out.length, branch, ref: `${remote}/${branch}`, source: remoteSource });
  }
  for (const branch of worktreePaths.keys()) {
    out.push({ index: out.length, branch, ref: branch, source: "worktree" });
  }
  return out;
}

interface IndexedEntry {
  entry: InFlightEntry;
  index: number;
}

interface InputClassification {
  errand: IndexedEntry | null;
  workUnits: WorkUnitCandidate[];
  warnings: InFlightWarning[];
}

type MetaLocationRelation = InFlightCandidateRelation;

interface MetaCandidate {
  name: string;
  metaPath: string;
  record: MetaRecord;
  relation: MetaLocationRelation;
  marks: InFlightEntryMark[];
  warnings: InFlightWarning[];
}

interface WorkUnitCandidate {
  input: InputCandidate;
  location: InFlightLocation;
  meta: MetaCandidate;
  shadowedByLocationMatch: boolean;
}

/** Extract the WU slug from `.arc/active/meta-<slug>.md`. */
function nameFromMetaPath(metaPath: string): string {
  const filename = metaPath.split("/").pop() ?? metaPath;
  return filename.replace(/^meta-/u, "").replace(/\.md$/u, "");
}

/**
 * Classify one input into work-unit candidates, an errand, or nothing. Errand-ness is a
 * record property — a branch carrying an errand record is an errand (slug from
 * the record), whatever its prefix. A record-less branch is decided by content:
 * read its candidate meta off the remote-tracking ref; present → work unit.
 */
async function classifyInput(
  exec: GitExec,
  input: InputCandidate,
  baseBranch: string,
  worktreePaths: Map<string, string>,
  errandSlugByBranch: ReadonlyMap<string, string>,
): Promise<InputClassification> {
  const { branch, ref } = input;
  const location = locationOf(branch, worktreePaths);

  const errandSlug = errandSlugByBranch.get(branch);
  if (errandSlug !== undefined) {
    // A record marks this branch an errand. A promoted errand → WU removed its
    // record, so it falls through to the meta-backed work-unit path below.
    return {
      errand: { entry: { kind: "errand", slug: errandSlug, ...location }, index: input.index },
      workUnits: [],
      warnings: [],
    };
  }

  if (branch === baseBranch) return { errand: null, workUnits: [], warnings: [] };

  const listed = await listMetaPathsAtRef({ exec, ref });
  if (!listed.ok) {
    return {
      errand: null,
      workUnits: [],
      warnings: [
        warning({
          code: "meta-enumeration-failed",
          branch,
          rendered: `Unable to enumerate active metas at \`${ref}\`.`,
        }),
      ],
    };
  }
  if (listed.paths.length === 0) return { errand: null, workUnits: [], warnings: [] };

  const metas: MetaCandidate[] = [];
  const warnings: InFlightWarning[] = [];
  for (const metaPath of listed.paths) {
    const candidate = await readMetaCandidate(exec, ref, branch, metaPath);
    warnings.push(...candidate.warnings);
    if (candidate.candidate !== null) {
      warnings.push(...candidate.candidate.warnings);
      metas.push(candidate.candidate);
    }
  }
  const hasLocationMatch = metas.some((candidate) => candidate.relation === "consistent");
  const workUnits = metas.map((meta) => ({
    input,
    location,
    meta,
    shadowedByLocationMatch: hasLocationMatch && meta.relation === "stale",
  }));

  return { errand: null, workUnits, warnings };
}

interface DedupeWorkUnitCandidatesOptions {
  exec: GitExec;
  candidates: WorkUnitCandidate[];
  parkedSlugs: ReadonlySet<string>;
  reachable: boolean;
}

interface DedupeWorkUnitCandidatesResult {
  entries: IndexedEntry[];
  warnings: InFlightWarning[];
}

async function dedupeWorkUnitCandidates(
  options: DedupeWorkUnitCandidatesOptions,
): Promise<DedupeWorkUnitCandidatesResult> {
  const groups = new Map<string, WorkUnitCandidate[]>();
  for (const candidate of options.candidates) {
    const group = groups.get(candidate.meta.name) ?? [];
    group.push(candidate);
    groups.set(candidate.meta.name, group);
  }

  const commitTimeCache = new Map<string, number>();
  const entries: IndexedEntry[] = [];
  const warnings: InFlightWarning[] = [];
  for (const group of groups.values()) {
    const winner = await chooseWorkUnitCandidate(options.exec, group, commitTimeCache);
    if (winner === null) {
      warnings.push(
        ...group.map((candidate) =>
          staleLocationWarning(
            candidate.meta,
            candidate.input.branch,
            candidate.shadowedByLocationMatch ? "stale-location-shadow" : "stale-location-dropped",
          ),
        ),
      );
      continue;
    }

    const shadowed = group.filter((candidate) => candidate !== winner);
    warnings.push(
      ...shadowed.map((candidate) =>
        candidate.meta.relation === "stale"
          ? staleLocationWarning(candidate.meta, candidate.input.branch, "stale-location-shadow")
          : candidateShadowedWarning(candidate, winner),
      ),
    );

    const built = buildWorkUnit(
      winner.meta,
      winner.location,
      options.parkedSlugs.has(winner.meta.name),
      winner.input.branch,
      winner.input.ref,
    );
    warnings.push(...built.warnings);

    const provenance = provenanceForGroup(group, winner);
    let entry: InFlightWorkUnit = { ...built.entry, provenance };
    if (shouldMarkLocationAmbiguous(options.reachable, group, winner)) {
      entry = { ...entry, marks: appendMark(entry.marks ?? [], "location-ambiguous") };
      warnings.push(locationAmbiguousWarning(winner));
    }
    entries.push({ entry, index: winner.input.index });
  }
  return { entries, warnings };
}

function candidateSourceRank(candidate: WorkUnitCandidate): number {
  switch (candidate.input.source) {
    case "worktree":
      return 3;
    case "remote-live":
      return 2;
    case "remote-tracking":
      return 1;
  }
}

function candidateRelationRank(candidate: WorkUnitCandidate): number {
  switch (candidate.meta.relation) {
    case "consistent":
      return 2;
    case "missing-branch":
      return 1;
    case "stale":
      return 0;
  }
}

async function chooseWorkUnitCandidate(
  exec: GitExec,
  group: readonly WorkUnitCandidate[],
  commitTimeCache: Map<string, number>,
): Promise<WorkUnitCandidate | null> {
  const eligible = group.filter((candidate) => candidate.meta.relation !== "stale");
  if (eligible.length === 0) return null;

  const bestSourceRank = Math.max(...eligible.map(candidateSourceRank));
  const sourceTier = eligible.filter((candidate) => candidateSourceRank(candidate) === bestSourceRank);
  const bestRelationRank = Math.max(...sourceTier.map(candidateRelationRank));
  const relationTier = sourceTier.filter((candidate) => candidateRelationRank(candidate) === bestRelationRank);
  return pickByContentOrder(exec, relationTier, commitTimeCache);
}

async function pickByContentOrder(
  exec: GitExec,
  candidates: readonly WorkUnitCandidate[],
  commitTimeCache: Map<string, number>,
): Promise<WorkUnitCandidate> {
  let best = candidates[0];
  if (best === undefined) throw new Error("candidate ordering requires at least one candidate");
  for (const candidate of candidates.slice(1)) {
    if ((await compareContentOrder(exec, candidate, best, commitTimeCache)) > 0) {
      best = candidate;
    }
  }
  return best;
}

async function compareContentOrder(
  exec: GitExec,
  left: WorkUnitCandidate,
  right: WorkUnitCandidate,
  commitTimeCache: Map<string, number>,
): Promise<number> {
  const leftAncestor = await isAncestor(exec, left.input.ref, right.input.ref);
  const rightAncestor = await isAncestor(exec, right.input.ref, left.input.ref);
  if (leftAncestor && !rightAncestor) return -1;
  if (rightAncestor && !leftAncestor) return 1;

  const stateDiff = stateOrder(left) - stateOrder(right);
  if (stateDiff !== 0) return stateDiff;

  const timeDiff = (await commitTime(exec, left.input.ref, commitTimeCache)) -
    (await commitTime(exec, right.input.ref, commitTimeCache));
  if (timeDiff !== 0) return timeDiff;

  return right.input.branch.localeCompare(left.input.branch);
}

async function isAncestor(exec: GitExec, ancestor: string, descendant: string): Promise<boolean> {
  if (ancestor === descendant) return true;
  try {
    await exec("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function stateOrder(candidate: WorkUnitCandidate): number {
  const state = validateState(candidate.meta.record.State);
  return state === "unknown" ? -1 : WORK_UNIT_STATE_ORDER[state];
}

async function commitTime(
  exec: GitExec,
  ref: string,
  cache: Map<string, number>,
): Promise<number> {
  const cached = cache.get(ref);
  if (cached !== undefined) return cached;
  let value: number;
  try {
    const { stdout } = await exec("git", ["show", "-s", "--format=%ct", ref]);
    value = Number.parseInt(stdout.trim(), 10);
    if (!Number.isFinite(value)) value = 0;
  } catch {
    value = 0;
  }
  cache.set(ref, value);
  return value;
}

function provenanceForGroup(
  group: readonly WorkUnitCandidate[],
  winner: WorkUnitCandidate,
): InFlightBranchProvenance[] {
  return [...group]
    .sort((a, b) => a.input.index - b.input.index)
    .map((candidate) => ({
      branch: candidate.input.branch,
      ref: candidate.input.ref,
      source: candidate.input.source,
      relation: candidate.meta.relation,
      selected: candidate === winner,
    }));
}

function shouldMarkLocationAmbiguous(
  reachable: boolean,
  group: readonly WorkUnitCandidate[],
  winner: WorkUnitCandidate,
): boolean {
  if (reachable || winner.input.source !== "remote-tracking") return false;
  if (group.some((candidate) => candidate.input.source === "worktree")) return false;
  return group.filter((candidate) => candidate.input.source === "remote-tracking").length > 1;
}

function degradedMetaRecord(): MetaRecord {
  return Object.fromEntries(META_FIELDS.map((field) => [field.name, null])) as MetaRecord;
}

function degradedMetaCandidate(input: {
  name: string;
  metaPath: string;
  branch: string;
  code: "meta-read-failed" | "meta-malformed";
  rendered: string;
}): MetaCandidate {
  return {
    name: input.name,
    metaPath: input.metaPath,
    record: degradedMetaRecord(),
    relation: "missing-branch",
    marks: ["degraded"],
    warnings: [
      warning({
        code: input.code,
        branch: input.branch,
        workUnit: input.name,
        rendered: input.rendered,
      }),
    ],
  };
}

async function readMetaCandidate(
  exec: GitExec,
  ref: string,
  branch: string,
  metaPath: string,
): Promise<{ candidate: MetaCandidate | null; warnings: InFlightWarning[] }> {
  const name = nameFromMetaPath(metaPath);
  const content = await readMetaAtRef({ exec, ref, metaPath });
  if (content === null) {
    return {
      candidate: degradedMetaCandidate({
        name,
        metaPath,
        branch,
        code: "meta-read-failed",
        rendered: `Unable to read \`${metaPath}\` at \`${ref}\`.`,
      }),
      warnings: [],
    };
  }

  const record = parseRecord(content);
  if (record === null) {
    return {
      candidate: degradedMetaCandidate({
        name,
        metaPath,
        branch,
        code: "meta-malformed",
        rendered: `Malformed meta \`${metaPath}\` at \`${ref}\`.`,
      }),
      warnings: [],
    };
  }

  const branchField = record.Branch;
  if (branchField === null || branchField === "[none]" || branchField.trim() === "") {
    return {
      candidate: {
        name,
        metaPath,
        record,
        relation: "missing-branch",
        marks: ["degraded"],
        warnings: [
          warning({
            code: "branch-field-missing",
            branch,
            workUnit: name,
            rendered: `Meta \`${metaPath}\` at \`${ref}\` has no usable Branch field.`,
          }),
        ],
      },
      warnings: [],
    };
  }

  return {
    candidate: {
      name,
      metaPath,
      record,
      relation: branchField === branch ? "consistent" : "stale",
      marks: [],
      warnings: [],
    },
    warnings: [],
  };
}

function staleLocationWarning(
  candidate: MetaCandidate,
  branch: string,
  code: "stale-location-dropped" | "stale-location-shadow",
): InFlightWarning {
  const pointsTo = candidate.record.Branch ?? "[missing]";
  const rendered = code === "stale-location-dropped"
    ? `Meta \`${candidate.metaPath}\` at \`${branch}\` points to \`${pointsTo}\`; dropped stale location.`
    : `Meta \`${candidate.metaPath}\` at \`${branch}\` points to \`${pointsTo}\`; shadowed by location match.`;
  return warning({
    code,
    branch,
    workUnit: candidate.name,
    rendered,
  });
}

function candidateShadowedWarning(candidate: WorkUnitCandidate, winner: WorkUnitCandidate): InFlightWarning {
  return warning({
    code: "candidate-shadowed",
    branch: candidate.input.branch,
    workUnit: candidate.meta.name,
    rendered: `Candidate \`${candidate.input.ref}\` for \`${candidate.meta.name}\` was shadowed by ` +
      `\`${winner.input.ref}\`.`,
  });
}

function locationAmbiguousWarning(candidate: WorkUnitCandidate): InFlightWarning {
  return warning({
    code: "location-ambiguous",
    branch: candidate.input.branch,
    workUnit: candidate.meta.name,
    rendered: `Location for \`${candidate.meta.name}\` is ambiguous across unverified tracking refs; ` +
      `selected \`${candidate.input.ref}\`.`,
  });
}

function warning(input: {
  code: InFlightWarningCode;
  branch?: string;
  workUnit?: string;
  rendered: string;
}): InFlightWarning {
  return {
    code: input.code,
    ...(input.branch !== undefined ? { branch: input.branch } : {}),
    ...(input.workUnit !== undefined ? { workUnit: input.workUnit } : {}),
    rendered: input.rendered,
  };
}

function appendMark(marks: readonly InFlightEntryMark[], mark: InFlightEntryMark): InFlightEntryMark[] {
  return marks.includes(mark) ? [...marks] : [...marks, mark];
}

function markEntryDegraded(entry: InFlightEntry): InFlightEntry {
  return { ...entry, marks: appendMark(entry.marks ?? [], "degraded") };
}

function worktreeListFailedWarning(): InFlightWarning {
  return warning({
    code: "worktree-list-failed",
    rendered: "Unable to list git worktrees; local checkout status is degraded.",
  });
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
  candidate: MetaCandidate,
  location: InFlightLocation,
  parked: boolean,
  branch: string,
  ref: string,
): { entry: InFlightWorkUnit; warnings: InFlightWarning[] } {
  const { name, record: fields } = candidate;
  const { Owner: owner, Design: design, Cohort: cohort, Class: workClass, Priority: priority } = fields;
  const state = validateState(fields.State);
  const marks = state === "unknown" ? appendMark(candidate.marks, "degraded") : [...candidate.marks];
  const warnings: InFlightWarning[] = [];
  if (state === "unknown") {
    warnings.push(
      warning({
        code: "state-unrecognized",
        branch,
        workUnit: name,
        rendered: `Meta \`${candidate.metaPath}\` at \`${ref}\` has unrecognized State ` +
          `\`${fields.State ?? "[missing]"}\`.`,
      }),
    );
  }
  return {
    entry: {
      kind: "work-unit",
      name,
      state,
      ...location,
      ...(marks.length > 0 ? { marks } : {}),
      ...(owner !== null ? { owner } : {}),
      ...(design !== null && design !== "[none]" ? { design } : {}),
      ...(cohort !== null && cohort !== "[none]" ? { cohort } : {}),
      // Keep `[TBD]`: it is a real value the view renders, unlike the `[none]`
      // absences above. Drop only a genuinely field-absent (`null`) Class.
      ...(workClass !== null ? { class: workClass } : {}),
      ...(priority !== null && priority !== "[none]" ? { priority } : {}),
      dependsOn: parseIdentifierList(fields["Depends On"]),
      ...(parked ? { scheduling: "parked" as const } : {}),
    },
    warnings,
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
