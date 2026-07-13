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
import { branchToWorkUnitSlug } from "../work-unit/completed-index.js";

import type { GitExec } from "./exec.js";
import {
  fetchRefBounded,
  listMetaPathsAtRef,
  readLocalInFlightRefSnapshot,
  readMetaAtRef,
  resolveInFlightBranchSetFromLocalRefs,
  type InFlightBranchSet,
  type LocalInFlightRefSnapshot,
  type RefTipMap,
} from "./remote-ref-reader.js";
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
  | "branch-residue"
  | "errand-record-branch-missing"
  | "errand-record-read-failed"
  | "meta-enumeration-failed"
  | "meta-read-failed"
  | "meta-malformed"
  | "state-unrecognized"
  | "branch-field-missing"
  | "worktree-list-failed"
  | "stale-location-dropped"
  | "stale-location-shadow"
  | "candidate-shadowed"
  | "location-ambiguous"
  | "input-snapshot-disagreement";

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

/** Why an observed branch/record could not become an in-flight entry. */
export type InFlightResidueReason =
  | "no-record-or-meta"
  | "errand-record-without-branch"
  | "classification-unavailable";

/** Advisory branch/record residue, kept separate from materializable in-flight entries. */
export interface InFlightResidue {
  /** Branch named by the observed ref or errand record. */
  branch: string;
  /** Best available stable identity, derived from the branch when no record exists. */
  slug: string;
  /** Why this item could not be classified as a work unit or errand. */
  reason: InFlightResidueReason;
  /** Degradation/indeterminacy marks; absent when the residue classification is conclusive. */
  marks?: readonly InFlightEntryMark[];
}

/** Agreed mutable input snapshot backing this derivation. */
export interface InFlightInputSnapshot {
  /** Candidate ref tips, keyed as the actual input ref (`origin/<branch>` or local branch name). */
  refs: RefTipMap;
  /** Worktree branch locations, keyed by branch. */
  worktrees: Record<string, string>;
}

/** Result of the in-flight derivation. */
export interface DeriveInFlightResult {
  /** Identity-filtered in-flight work units and errands. */
  entries: InFlightEntry[];
  /** Branch/record residue for advisory cleanup consumers. */
  residue: InFlightResidue[];
  /** Structured warning channel; empty for healthy derivations. */
  warnings: InFlightWarning[];
  /** Whole-result quality markers; absent for healthy derivations. */
  marks?: readonly InFlightEntryMark[];
  /** Agreed mutable input snapshot used for derivation and later fire-time probes. */
  snapshot: InFlightInputSnapshot;
  /** Live remote membership tips, keyed by remote-qualified ref; empty offline or when supplied branches bypass it. */
  liveRefs: RefTipMap;
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
  /** Fetch and classify live membership branches that have no local remote-tracking ref. */
  expandLiveOnly?: boolean;
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
  /** Whether the record index was read completely; false degrades record-dependent classification. */
  errandRecordsComplete?: boolean;
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
  const errandRecordsComplete = options.errandRecordsComplete ?? true;
  const parkedSlugs = options.parkedSlugs ?? new Set<string>();
  const input = branches === undefined
    ? await resolveAgreedInputs({
        exec,
        localOnly: options.localOnly ?? false,
        timeoutMs: options.timeoutMs,
        remote,
        expandLiveOnly: options.expandLiveOnly ?? false,
      })
    : await resolveSuppliedBranchInputs({ exec, branches, reachable: options.reachable ?? true, remote });
  const { worktreeResult, worktreePaths, branchSet } = input;
  const inputs = buildInputCandidates(
    branchSet.branches,
    worktreePaths,
    remote,
    branchSet.reachable,
    input.classificationRefs,
  );
  const markedInputs = inputs
    .map((candidate) => markInputCandidate(candidate, input.indeterminate))
    .map((candidate) => errandRecordsComplete ? candidate : markInputDegraded(candidate));

  const classified = await Promise.all(
    markedInputs.map((candidate) =>
      classifyInput(exec, candidate, baseBranch, worktreePaths, errandSlugByBranch, errandRecordsComplete),
    ),
  );
  const expandedEnumerationFailed = classified.some((classification) =>
    input.classificationRefs[`${remote}/${classification.input.branch}`] !== undefined
    && classification.warnings.some((warning) => warning.code === "meta-enumeration-failed"));
  const resultMarks = expandedEnumerationFailed
    ? appendMark(input.resultMarks, "indeterminate")
    : input.resultMarks;
  // A checked-out branch with no active meta is still authoritative for that
  // branch location; its stale upstream twin must not resurrect old in-flight state.
  const locallyTombstonedBranches = new Set(
    classified
      .filter((classification) => classification.shadowsSameBranchRemote)
      .map((classification) => classification.input.branch),
  );
  const workUnitCandidates = classified
    .flatMap((classification) => classification.workUnits)
    .filter((candidate) =>
      candidate.input.source === "worktree" || !locallyTombstonedBranches.has(candidate.input.branch),
    );

  const deduped = await dedupeWorkUnitCandidates({
    exec,
    candidates: workUnitCandidates,
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
  const remoteReadDegraded = branches === undefined
    && !(options.localOnly ?? false)
    && !branchSet.reachable;
  const classifiedResidue = dedupeResidue(
    classified
      .map((classification) => classification.residue)
      .filter((item): item is IndexedResidue => item !== null),
  );
  const observedBranches = new Set(markedInputs.map((input) => input.branch));
  for (const ref of Object.keys(branchSet.liveRefs)) observedBranches.add(branchFromInputRef(ref, remote));
  const recordResidue = branches === undefined
    ? [...errandSlugByBranch.entries()]
        .filter(([branch]) => branch !== baseBranch && !observedBranches.has(branch))
        .map(([branch, slug], offset): IndexedResidue => ({
          residue: {
            branch,
            slug,
            reason: "errand-record-without-branch",
            ...(remoteReadDegraded ? { marks: ["degraded", "indeterminate"] } : {}),
          },
          index: markedInputs.length + offset,
          source: "remote-tracking",
        }))
    : [];
  const residue = [...classifiedResidue, ...recordResidue]
    .sort((a, b) => a.index - b.index)
    .map(({ residue: item }) => remoteReadDegraded ? markResidueDegraded(item) : item)
    .map((item) => worktreeResult.ok ? item : markResidueDegraded(item));
  const warnings = classified
    .flatMap((classification) => classification.warnings)
    .concat(
      deduped.warnings,
      classifiedResidue
        .filter(({ residue: item }) => item.reason === "no-record-or-meta")
        .map(({ residue: item }) => branchResidueWarning(item.branch)),
      recordResidue.map(({ residue: item }) => errandRecordBranchMissingWarning(item)),
    );
  if (!worktreeResult.ok) {
    warnings.unshift(worktreeListFailedWarning());
  }
  warnings.unshift(...input.warnings);
  if (!errandRecordsComplete) warnings.unshift(errandRecordReadFailedWarning());
  const entriesWithWorktreeMarks = worktreeResult.ok ? candidateEntries : candidateEntries.map(markEntryDegraded);
  const entriesForIdentity = entriesWithWorktreeMarks
    .filter((entry) => keepForIdentity(entry, identity, teamMode));

  const entries = prSource === undefined ? entriesForIdentity : await enrichWithPrState(entriesForIdentity, prSource);
  return {
    entries,
    residue,
    warnings,
    ...(resultMarks.length > 0 ? { marks: resultMarks } : {}),
    snapshot: input.snapshot,
    liveRefs: branchSet.liveRefs,
    reachable: branchSet.reachable,
  };
}

interface InputResolution {
  branchSet: InFlightBranchSet;
  worktreeResult: Awaited<ReturnType<typeof resolveWorktreePathsByBranchResult>>;
  worktreePaths: Map<string, string>;
  snapshot: InFlightInputSnapshot;
  indeterminate: {
    refs: ReadonlySet<string>;
    worktrees: ReadonlySet<string>;
  };
  resultMarks: InFlightEntryMark[];
  warnings: InFlightWarning[];
  classificationRefs: RefTipMap;
}

async function resolveSuppliedBranchInputs(input: {
  exec: GitExec;
  branches: readonly string[];
  reachable: boolean;
  remote: string;
}): Promise<InputResolution> {
  const worktreeResult = await resolveWorktreePathsByBranchResult(input.exec);
  const worktreePaths = worktreeResult.paths;
  const branchSet: InFlightBranchSet = {
    branches: [...input.branches],
    refs: Object.fromEntries(input.branches.map((branch) => [`${input.remote}/${branch}`, ""])),
    liveRefs: {},
    reachable: input.reachable,
  };
  return {
    branchSet,
    worktreeResult,
    worktreePaths,
    snapshot: snapshotFor(branchSet, worktreePaths, { remoteTracking: {}, localHeads: {} }, input.remote),
    indeterminate: { refs: new Set(), worktrees: new Set() },
    resultMarks: [],
    warnings: [],
    classificationRefs: {},
  };
}

async function resolveAgreedInputs(input: {
  exec: GitExec;
  localOnly: boolean;
  timeoutMs?: number;
  remote: string;
  expandLiveOnly: boolean;
}): Promise<InputResolution> {
  const firstRefs = await readLocalInFlightRefSnapshot(input.exec, input.remote);
  const firstWorktree = await resolveWorktreePathsByBranchResult(input.exec);
  const localFirstBranchSet = firstRefs.ok ? await resolveInFlightBranchSetFromLocalRefs({
    exec: input.exec,
    refs: firstRefs.refs,
    remote: input.remote,
    localOnly: input.localOnly,
    timeoutMs: input.timeoutMs,
  }) : emptyInFlightBranchSet();
  const expansion = await expandLiveOnlyCandidates({
    exec: input.exec,
    branchSet: localFirstBranchSet,
    localRefs: firstRefs.refs,
    remote: input.remote,
    timeoutMs: input.timeoutMs,
    enabled: input.expandLiveOnly,
  });
  const firstBranchSet = withExpandedBranches(localFirstBranchSet, expansion.refs, input.remote);

  const secondRefs = await readLocalInFlightRefSnapshot(input.exec, input.remote);
  const secondWorktree = await resolveWorktreePathsByBranchResult(input.exec);
  const secondBranchSet = withExpandedBranches(
    branchSetFromMembership({
      refs: secondRefs.refs,
      firstBranchSet,
      localOnly: input.localOnly,
      remote: input.remote,
    }),
    expansion.refs,
    input.remote,
  );

  const firstSnapshot = snapshotFor(firstBranchSet, firstWorktree.paths, firstRefs.refs, input.remote);
  const secondSnapshot = snapshotFor(secondBranchSet, secondWorktree.paths, secondRefs.refs, input.remote);
  const comparison = mergeSnapshotComparisons(
    compareSnapshots(firstSnapshot, secondSnapshot),
    compareLocalRefSnapshots(firstRefs.refs, secondRefs.refs, input.remote),
    compareRefReadResults(firstRefs.ok, secondRefs.ok),
  );
  const warnings = snapshotWarnings(comparison, input.remote);

  return {
    branchSet: firstBranchSet,
    worktreeResult: firstWorktree,
    worktreePaths: firstWorktree.paths,
    snapshot: firstSnapshot,
    indeterminate: comparison.wholeResult
      ? { refs: new Set(), worktrees: new Set() }
      : { refs: comparison.changedRefs, worktrees: comparison.changedWorktrees },
    resultMarks: comparison.wholeResult || expansion.failed ? ["indeterminate"] : [],
    warnings,
    classificationRefs: expansion.refs,
  };
}

interface LiveOnlyExpansionResult {
  refs: RefTipMap;
  failed: boolean;
}

async function expandLiveOnlyCandidates(input: {
  exec: GitExec;
  branchSet: InFlightBranchSet;
  localRefs: LocalInFlightRefSnapshot;
  remote: string;
  timeoutMs?: number;
  enabled: boolean;
}): Promise<LiveOnlyExpansionResult> {
  if (!input.enabled || !input.branchSet.reachable) return { refs: {}, failed: false };
  const localBranches = new Set(Object.keys(input.localRefs.remoteTracking));
  const refs: RefTipMap = {};
  let failed = false;
  for (const [qualifiedRef, sha] of Object.entries(input.branchSet.liveRefs)) {
    const prefix = `${input.remote}/`;
    const branch = qualifiedRef.startsWith(prefix) ? qualifiedRef.slice(prefix.length) : qualifiedRef;
    if (localBranches.has(branch)) continue;
    const ok = await fetchRefBounded({
      exec: input.exec,
      remote: input.remote,
      branch,
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
    });
    if (ok) refs[`${input.remote}/${branch}`] = sha;
    else failed = true;
  }
  return { refs, failed };
}

function withExpandedBranches(
  branchSet: InFlightBranchSet,
  expandedRefs: RefTipMap,
  remote: string,
): InFlightBranchSet {
  const prefix = `${remote}/`;
  const expandedBranches = Object.keys(expandedRefs).map((ref) => ref.startsWith(prefix) ? ref.slice(prefix.length) : ref);
  return {
    ...branchSet,
    branches: [...new Set([...branchSet.branches, ...expandedBranches])],
    refs: { ...branchSet.refs, ...expandedRefs },
  };
}

function emptyInFlightBranchSet(): InFlightBranchSet {
  return { branches: [], refs: {}, liveRefs: {}, reachable: false };
}

function branchSetFromMembership(input: {
  refs: LocalInFlightRefSnapshot;
  firstBranchSet: InFlightBranchSet;
  localOnly: boolean;
  remote: string;
}): InFlightBranchSet {
  const local = Object.keys(input.refs.remoteTracking);
  const refTipsFor = (branches: readonly string[]): RefTipMap =>
    Object.fromEntries(branches.map((branch) => [`${input.remote}/${branch}`, input.refs.remoteTracking[branch] ?? ""]));
  if (input.localOnly || !input.firstBranchSet.reachable) {
    return {
      branches: local,
      refs: refTipsFor(local),
      liveRefs: {},
      reachable: input.firstBranchSet.reachable,
    };
  }
  const live = new Set(
    Object.keys(input.firstBranchSet.liveRefs)
      .map((ref) => ref.startsWith(`${input.remote}/`) ? ref.slice(`${input.remote}/`.length) : ref),
  );
  const branches = local.filter((branch) => live.has(branch));
  return {
    branches,
    refs: refTipsFor(branches),
    liveRefs: input.firstBranchSet.liveRefs,
    reachable: true,
  };
}

function snapshotFor(
  branchSet: InFlightBranchSet,
  worktreePaths: ReadonlyMap<string, string>,
  refs: LocalInFlightRefSnapshot,
  remote: string,
): InFlightInputSnapshot {
  const snapshotRefs: RefTipMap = {};
  for (const branch of branchSet.branches) {
    snapshotRefs[`${remote}/${branch}`] = refs.remoteTracking[branch] ?? branchSet.refs[`${remote}/${branch}`] ?? "";
  }
  for (const branch of worktreePaths.keys()) {
    snapshotRefs[branch] = refs.localHeads[branch] ?? "";
  }
  return {
    refs: sortRecord(snapshotRefs),
    worktrees: sortRecord(Object.fromEntries(worktreePaths.entries())),
  };
}

function sortRecord(input: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}

interface SnapshotComparison {
  wholeResult: boolean;
  changedRefs: Set<string>;
  changedWorktrees: Set<string>;
}

function compareSnapshots(left: InFlightInputSnapshot, right: InFlightInputSnapshot): SnapshotComparison {
  const leftRefKeys = Object.keys(left.refs);
  const rightRefKeys = Object.keys(right.refs);
  const leftWorktreeKeys = Object.keys(left.worktrees);
  const rightWorktreeKeys = Object.keys(right.worktrees);
  const wholeResult =
    !sameStringSet(leftRefKeys, rightRefKeys)
    || !sameStringSet(leftWorktreeKeys, rightWorktreeKeys);
  if (wholeResult) return { wholeResult: true, changedRefs: new Set(), changedWorktrees: new Set() };

  const changedRefs = new Set(leftRefKeys.filter((key) => left.refs[key] !== right.refs[key]));
  const changedWorktrees = new Set(leftWorktreeKeys.filter((key) => left.worktrees[key] !== right.worktrees[key]));
  return { wholeResult: false, changedRefs, changedWorktrees };
}

function compareLocalRefSnapshots(
  left: LocalInFlightRefSnapshot,
  right: LocalInFlightRefSnapshot,
  remote: string,
): SnapshotComparison {
  return compareSnapshots(
    { refs: rawLocalRefSnapshot(left, remote), worktrees: {} },
    { refs: rawLocalRefSnapshot(right, remote), worktrees: {} },
  );
}

function compareRefReadResults(leftOk: boolean, rightOk: boolean): SnapshotComparison {
  return leftOk && rightOk
    ? { wholeResult: false, changedRefs: new Set(), changedWorktrees: new Set() }
    : { wholeResult: true, changedRefs: new Set(), changedWorktrees: new Set() };
}

function rawLocalRefSnapshot(refs: LocalInFlightRefSnapshot, remote: string): RefTipMap {
  return sortRecord({
    ...Object.fromEntries(
      Object.entries(refs.remoteTracking).map(([branch, sha]) => [`${remote}/${branch}`, sha]),
    ),
    ...refs.localHeads,
  });
}

function mergeSnapshotComparisons(...comparisons: readonly SnapshotComparison[]): SnapshotComparison {
  if (comparisons.some((comparison) => comparison.wholeResult)) {
    return { wholeResult: true, changedRefs: new Set(), changedWorktrees: new Set() };
  }
  return {
    wholeResult: false,
    changedRefs: new Set(comparisons.flatMap((comparison) => [...comparison.changedRefs])),
    changedWorktrees: new Set(comparisons.flatMap((comparison) => [...comparison.changedWorktrees])),
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}

function snapshotWarnings(comparison: SnapshotComparison, remote: string): InFlightWarning[] {
  if (comparison.wholeResult) {
    return [
      warning({
        code: "input-snapshot-disagreement",
        rendered: "In-flight input set changed during derivation; result marked indeterminate.",
      }),
    ];
  }
  const warnings: InFlightWarning[] = [];
  for (const ref of comparison.changedRefs) {
    warnings.push(
      warning({
        code: "input-snapshot-disagreement",
        branch: branchFromInputRef(ref, remote),
        rendered: `Ref \`${ref}\` changed during in-flight derivation; affected entry marked indeterminate.`,
      }),
    );
  }
  for (const branch of comparison.changedWorktrees) {
    warnings.push(
      warning({
        code: "input-snapshot-disagreement",
        branch,
        rendered: `Worktree for \`${branch}\` changed during in-flight derivation; affected entry marked indeterminate.`,
      }),
    );
  }
  return warnings;
}

function branchFromInputRef(ref: string, remote: string): string {
  return ref.startsWith(`${remote}/`) ? ref.slice(`${remote}/`.length) : ref;
}

function markInputCandidate(
  input: InputCandidate,
  indeterminate: InputResolution["indeterminate"],
): InputCandidate {
  const marked =
    indeterminate.refs.has(input.ref)
    || indeterminate.worktrees.has(input.branch);
  return marked ? { ...input, marks: ["indeterminate"] } : input;
}

function markInputDegraded(input: InputCandidate): InputCandidate {
  return { ...input, marks: appendMark(input.marks ?? [], "degraded") };
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
  marks?: readonly InFlightEntryMark[];
}

function buildInputCandidates(
  remoteBranches: readonly string[],
  worktreePaths: ReadonlyMap<string, string>,
  remote: string,
  reachable: boolean,
  classificationRefs: RefTipMap,
): InputCandidate[] {
  const out: InputCandidate[] = [];
  const remoteSource: InFlightCandidateSource = reachable ? "remote-live" : "remote-tracking";
  for (const branch of remoteBranches) {
    const qualifiedRef = `${remote}/${branch}`;
    out.push({
      index: out.length,
      branch,
      ref: classificationRefs[qualifiedRef] ?? qualifiedRef,
      source: remoteSource,
    });
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

interface IndexedResidue {
  residue: InFlightResidue;
  index: number;
  source: InFlightCandidateSource;
}

interface InputClassification {
  input: InputCandidate;
  errand: IndexedEntry | null;
  residue: IndexedResidue | null;
  workUnits: WorkUnitCandidate[];
  warnings: InFlightWarning[];
  shadowsSameBranchRemote: boolean;
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
 * enumerate active metas at the candidate ref; every readable meta becomes a
 * work-unit candidate keyed by its meta filename.
 */
async function classifyInput(
  exec: GitExec,
  input: InputCandidate,
  baseBranch: string,
  worktreePaths: Map<string, string>,
  errandSlugByBranch: ReadonlyMap<string, string>,
  errandRecordsComplete: boolean,
): Promise<InputClassification> {
  const { branch, ref } = input;
  const location = locationOf(branch, worktreePaths);

  const errandSlug = errandSlugByBranch.get(branch);
  if (errandSlug !== undefined) {
    // A record marks this branch an errand. A promoted errand → WU removed its
    // record, so it falls through to the meta-backed work-unit path below.
    return {
      input,
      errand: {
        entry: {
          kind: "errand",
          slug: errandSlug,
          ...location,
          ...(input.marks !== undefined && input.marks.length > 0 ? { marks: input.marks } : {}),
        },
        index: input.index,
      },
      workUnits: [],
      residue: null,
      warnings: [],
      shadowsSameBranchRemote: false,
    };
  }

  if (branch === baseBranch) {
    return { input, errand: null, residue: null, workUnits: [], warnings: [], shadowsSameBranchRemote: false };
  }

  const listed = await listMetaPathsAtRef({ exec, ref });
  if (!listed.ok) {
    return {
      input,
      errand: null,
      residue: {
        residue: branchResidue(input, "classification-unavailable", ["degraded"]),
        index: input.index,
        source: input.source,
      },
      workUnits: [],
      warnings: [
        warning({
          code: "meta-enumeration-failed",
          branch,
          rendered: `Unable to enumerate active metas at \`${ref}\`.`,
        }),
      ],
      shadowsSameBranchRemote: false,
    };
  }
  if (listed.paths.length === 0) {
    return {
      input,
      errand: null,
      residue: {
        residue: branchResidue(
          input,
          errandRecordsComplete ? "no-record-or-meta" : "classification-unavailable",
        ),
        index: input.index,
        source: input.source,
      },
      workUnits: [],
      warnings: [],
      shadowsSameBranchRemote: input.source === "worktree",
    };
  }

  const metas: MetaCandidate[] = [];
  const warnings: InFlightWarning[] = [];
  for (const metaPath of listed.paths) {
    const candidate = await readMetaCandidate(exec, ref, branch, metaPath);
    if (candidate !== null) {
      warnings.push(...candidate.warnings);
      metas.push({
        ...candidate,
        marks: [...(input.marks ?? []), ...candidate.marks],
      });
    }
  }
  const hasLocationMatch = metas.some((candidate) => candidate.relation === "consistent");
  const workUnits = metas.map((meta) => ({
    input,
    location,
    meta,
    shadowedByLocationMatch: hasLocationMatch && meta.relation === "stale",
  }));

  return { input, errand: null, residue: null, workUnits, warnings, shadowsSameBranchRemote: false };
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
      ...shadowed.flatMap((candidate) => {
        if (candidate.meta.relation === "stale") {
          return [staleLocationWarning(candidate.meta, candidate.input.branch, "stale-location-shadow")];
        }
        return isWorktreeRemoteMirror(candidate, winner) ? [] : [candidateShadowedWarning(candidate, winner)];
      }),
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

function isWorktreeRemoteMirror(left: WorkUnitCandidate, right: WorkUnitCandidate): boolean {
  if (left.input.branch !== right.input.branch) return false;
  if (left.meta.relation !== "consistent" || right.meta.relation !== "consistent") return false;
  const sources = new Set([left.input.source, right.input.source]);
  return sources.has("worktree") && (sources.has("remote-live") || sources.has("remote-tracking"));
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
): Promise<MetaCandidate | null> {
  const name = nameFromMetaPath(metaPath);
  let content = await readMetaAtRef({ exec, ref, metaPath });
  if (content === null) {
    content = await readMetaAtRef({ exec, ref, metaPath });
  }
  if (content === null) {
    return degradedMetaCandidate({
      name,
      metaPath,
      branch,
      code: "meta-read-failed",
      rendered: `Unable to read \`${metaPath}\` at \`${ref}\`.`,
    });
  }

  const record = parseRecord(content);
  if (record === null) {
    return degradedMetaCandidate({
      name,
      metaPath,
      branch,
      code: "meta-malformed",
      rendered: `Malformed meta \`${metaPath}\` at \`${ref}\`.`,
    });
  }

  const branchField = record.Branch;
  if (branchField === null || branchField === "[none]" || branchField.trim() === "") {
    return {
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
    };
  }

  return {
    name,
    metaPath,
    record,
    relation: branchField === branch ? "consistent" : "stale",
    marks: [],
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

function branchResidue(
  input: InputCandidate,
  reason: Extract<InFlightResidueReason, "no-record-or-meta" | "classification-unavailable">,
  extraMarks: readonly InFlightEntryMark[] = [],
): InFlightResidue {
  const marks = [...(input.marks ?? [])];
  for (const mark of extraMarks) {
    if (!marks.includes(mark)) marks.push(mark);
  }
  return {
    branch: input.branch,
    slug: branchToWorkUnitSlug(input.branch) ?? input.branch,
    reason,
    ...(marks.length > 0 ? { marks } : {}),
  };
}

function branchResidueWarning(branch: string): InFlightWarning {
  return warning({
    code: "branch-residue",
    branch,
    rendered: `Branch \`${branch}\` has no errand record or active work-unit meta; cleanup may be required.`,
  });
}

function errandRecordBranchMissingWarning(residue: InFlightResidue): InFlightWarning {
  return warning({
    code: "errand-record-branch-missing",
    branch: residue.branch,
    rendered: `Errand record \`${residue.slug}\` names missing branch \`${residue.branch}\`; cleanup may be required.`,
  });
}

function errandRecordReadFailedWarning(): InFlightWarning {
  return warning({
    code: "errand-record-read-failed",
    rendered: "Errand records could not be read completely; record-dependent classification is degraded.",
  });
}

function dedupeResidue(items: readonly IndexedResidue[]): IndexedResidue[] {
  const byBranch = new Map<string, IndexedResidue>();
  for (const item of items) {
    const existing = byBranch.get(item.residue.branch);
    if (existing === undefined || inputSourceRank(item.source) > inputSourceRank(existing.source)) {
      byBranch.set(item.residue.branch, item);
    }
  }
  return [...byBranch.values()];
}

function inputSourceRank(source: InFlightCandidateSource): number {
  switch (source) {
    case "worktree":
      return 3;
    case "remote-live":
      return 2;
    case "remote-tracking":
      return 1;
  }
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

function markResidueDegraded(residue: InFlightResidue): InFlightResidue {
  return { ...residue, marks: appendMark(residue.marks ?? [], "degraded") };
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
