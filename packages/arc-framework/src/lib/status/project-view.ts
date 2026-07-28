/**
 * Project readiness view composer — renders `.arc/backlog/ROADMAP.md` from the
 * resolved project-readiness record graph.
 *
 * This is the file-writing counterpart to the shared status render primitive.
 * Resolved records feed a lifecycle index; dependency satisfaction then follows
 * canonical lifecycle predicates before rows group into In Flight, Ready,
 * Blocked depth bands, and Parked.
 *
 * @module
 */

import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { validatePriority, validateState, type Priority, type WorkUnitState } from "../../commands/active/types.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import type { GitExec } from "../git/exec.js";
import {
  deriveInFlight,
  type DeriveInFlightResult,
  type InFlightEntry,
  type InFlightWarning,
  type InFlightWorkUnit,
} from "../git/in-flight-derivation.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath } from "../layout/index.js";
import { branchToWorkUnitSlug } from "../work-unit/completed-index.js";
import { buildLifecycleIndexFromRecords, type LifecycleIndex } from "../work-unit/lifecycle-index.js";
import { resolveSlugQuery } from "../work-unit/lifecycle-query.js";
import type { TransitionOverlayCompositionInput } from "../work-unit/transition-overlay.js";

import { renderStatusTable, type StatusColumn, type StatusViewRow } from "./render.js";

/** Minimal directory-entry shape needed by the recursive meta scan. */
export interface ProjectViewDirEntry {
  name: string;
  isDirectory(): boolean;
}

/** Filesystem seams for composing the project readiness view. */
export interface ProjectViewFs {
  readdir: (path: string) => Promise<ProjectViewDirEntry[]>;
  readFile: (path: string) => Promise<string>;
}

/** Lifecycle tier represented by a project-readiness record. */
export type ProjectReadinessLocation = "active" | "planned" | "provisional" | "completed";

/** Source family that contributed a project-readiness record. */
export type ProjectReadinessSourceKind = "active-meta" | "backlog-stub" | "completed-index";

/** Provenance for one source candidate that contributed to a merged record. */
export interface ProjectReadinessRecordSource {
  kind: ProjectReadinessSourceKind;
  location: ProjectReadinessLocation;
  path?: string;
}

/** A candidate record before slug-keyed source precedence is applied. */
export interface ProjectReadinessRecordCandidate {
  slug: string;
  location: ProjectReadinessLocation;
  state: WorkUnitState;
  owner?: string;
  priority: Priority;
  dependsOn: string[];
  cohort?: string;
  source?: ProjectReadinessRecordSource;
  scheduling?: "parked";
}

/** One resolved project-readiness record after source precedence is applied. */
export interface ProjectReadinessRecord extends ProjectReadinessRecordCandidate {
  source: ProjectReadinessRecordSource;
  sources: readonly ProjectReadinessRecordSource[];
  scheduling?: "parked";
}

/** One losslessly retained record candidate before slug-keyed view merging. */
export interface ProjectReadinessAcceptedCandidate {
  slug: string;
  path: string;
  lifecycleLocation: ProjectReadinessLocation;
  record: ProjectReadinessRecord;
}

/** Why one discovered project record could not enter candidate composition. */
export type ProjectReadinessRejectedReason = "unreadable" | "malformed" | "unsupported-lifecycle";

/** Typed source evidence for one project record rejected before view merging. */
export interface ProjectReadinessRejectedRecord {
  slugHint: string | null;
  path: string;
  locus: string;
  reason: ProjectReadinessRejectedReason;
}

/** Derivation warning facts the pure composer can elevate into the render. */
export interface ProjectReadinessDerivationWarning {
  code: "stale-location-dropped" | "stale-location-shadow";
  workUnit?: string;
  rendered: string;
}

/** Structured composer warning codes returned alongside the project view. */
export type ProjectReadinessWarningCode =
  | "dangling-dependency"
  | "oracle-degraded"
  | "stale-location-unshipped";

/** A project-readiness warning produced from dependency or provenance classification. */
export interface ProjectReadinessWarning {
  code: ProjectReadinessWarningCode;
  workUnit?: string;
  dependency?: string;
  rendered: string;
}

/** Dependency satisfaction fact computed from lifecycle classification. */
export type ProjectDependencySatisfaction = "satisfied" | "unsatisfied";

/** Readiness verdict supplied by the configured readiness provider. */
export type ProjectReadinessVerdict = "ready" | "blocked";

/** Batch readiness provider contract: records in, per-slug verdicts out. */
export interface ProjectReadinessProvider {
  resolve(records: readonly ProjectReadinessRecord[]): ReadonlyMap<string, ProjectReadinessVerdict>;
}

/** Per-record facts the render layer consumes to build readiness tiers. */
export interface ProjectReadinessFact {
  slug: string;
  dependencySatisfaction: ProjectDependencySatisfaction;
  readiness: ProjectReadinessVerdict;
  unsatisfiedDependencies: readonly string[];
}

/** Resolver output consumed by {@link composeProjectReadinessView}. */
export interface ProjectReadinessViewInput {
  title: string;
  records: ProjectReadinessRecord[];
  derivationWarnings: ProjectReadinessDerivationWarning[];
  sourceWarnings: ProjectReadinessWarning[];
  /** Whether the resolver observed changing in-flight inputs during derivation. */
  indeterminate: boolean;
}

/** Shared tree + oracle record composition before render-specific warning projection. */
export interface ProjectReadinessCompositionResult {
  /** Ordered unmerged candidates; duplicate slugs remain distinct. */
  acceptedCandidates: ProjectReadinessAcceptedCandidate[];
  /** Discovered records that could not enter the ordinary merged view. */
  rejectedRecords: ProjectReadinessRejectedRecord[];
  records: ProjectReadinessRecord[];
  /** Resolved records contributed by the current tracked tree before oracle composition. */
  treeRecords: ProjectReadinessRecord[];
  derivationWarnings: ProjectReadinessDerivationWarning[];
  sourceWarnings: ProjectReadinessWarning[];
  indeterminate: boolean;
  /** Native oracle result retained for non-render consumers; absent on tree-only composition. */
  oracleResult: DeriveInFlightResult | null;
  /** Ordinary merged projection retained beside the lossless evidence. */
  view: ProjectReadinessViewInput;
}

/** Checked-out branch whose staged tree record supersedes its own at-ref candidate. */
export interface ProjectReadinessProspectiveInput {
  currentBranch: string;
}

/** In-flight oracle inputs for project-readiness renders. */
export interface ProjectReadinessOracleOptions {
  exec: GitExec;
  /** Repository checkout used to resolve repository-common candidate claims. */
  decompositionClaimCwd?: string;
  /** `true` skips the network read and renders from last-known local refs. */
  localOnly?: boolean;
  /** Fetch and classify live membership branches absent from local remote-tracking refs. */
  expandLiveOnly?: boolean;
  baseBranch?: string;
  errandSlugByBranch?: ReadonlyMap<string, string>;
  /**
   * Whether the errand-record read that produced `errandSlugByBranch` was
   * complete. When `false`, record-less branches degrade to
   * `classification-unavailable` rather than `no-record-or-meta`. Defaults to
   * true inside the derivation when omitted.
   */
  errandRecordsComplete?: boolean;
  parkedSlugs?: ReadonlySet<string>;
  timeoutMs?: number;
}

/** Local-ref oracle inputs for tracked project-readiness renders. */
export type ProjectReadinessLocalRefsOptions = Omit<ProjectReadinessOracleOptions, "localOnly">;

/** Options for the tree-backed resolver. */
export interface ResolveProjectReadinessViewInputOptions {
  /** Repository root containing `.arc/`. */
  cwd: string;
  /** Optional H1 text without the leading `#`; omitted uses the renderer default. */
  title?: string;
  /** Injectable filesystem for tests and handler-owned I/O contexts. */
  fs?: ProjectViewFs;
  /** Optional local-ref oracle input to merge at-ref active metas into the record set. */
  localRefs?: ProjectReadinessLocalRefsOptions;
  /** Optional in-flight oracle input to merge at-ref active metas into the record set. */
  oracle?: ProjectReadinessOracleOptions;
  /** Treat this staged tree as authoritative for the checked-out branch's own work unit. */
  prospective?: ProjectReadinessProspectiveInput;
  /** Optional exact transition suppression, orthogonal to staged-tree precedence. */
  transitionOverlay?: TransitionOverlayCompositionInput;
}

/** Structured freshness stamp rendered in the view header. */
export interface ProjectReadinessRenderStamp {
  ref: string;
  scope?: string;
  liveView?: string;
}

/** Options for resolving a project-readiness freshness stamp. */
export interface ResolveProjectReadinessRenderStampOptions {
  exec: GitExec;
  cwd: string;
  scope?: string;
  liveView?: string;
}

/** Options for {@link composeProjectReadinessView}. */
export interface ComposeProjectReadinessViewOptions {
  /** Freshness marker to print in the header. */
  renderedRef: string | ProjectReadinessRenderStamp;
  /** H1 text without the leading `#`. */
  title: string;
  /** Already-resolved project-readiness records. */
  records: readonly ProjectReadinessRecord[];
  /** Source warnings from the resolver or oracle. */
  sourceWarnings?: readonly ProjectReadinessWarning[];
  /** Derivation warnings to classify against the same lifecycle index. */
  derivationWarnings?: readonly ProjectReadinessDerivationWarning[];
  /** Whether the source snapshot was indeterminate even if no source warning was supplied. */
  indeterminate?: boolean;
  /** Readiness provider; omitted uses dependency satisfaction as readiness. */
  readinessProvider?: ProjectReadinessProvider;
}

/** Render result plus structured warnings for the caller to surface separately. */
export interface ProjectReadinessViewResult {
  markdown: string;
  warnings: ProjectReadinessWarning[];
  facts: ProjectReadinessFact[];
}

/** A blocked planned row plus the unresolved edges it displays. */
interface BlockedRow {
  row: StatusViewRow;
  unsatisfied: string[];
}

interface DependencyClassification {
  unsatisfiedBySlug: ReadonlyMap<string, readonly string[]>;
  warnings: ProjectReadinessWarning[];
}

const META_FILE_RE = /^meta-(.+)\.md$/u;
const DEFAULT_TITLE = "Roadmap: Project Status";
const INDETERMINATE_ORACLE_WARNING: ProjectReadinessWarning = {
  code: "oracle-degraded",
  rendered: "In-flight inputs were indeterminate during derivation; rendering project view from a degraded snapshot.",
};

export const PROJECT_IN_FLIGHT_COLUMNS = [
  "state",
  "workUnit",
  "priority",
  "owner",
  "dependsOn",
  "cohort",
] as const satisfies readonly StatusColumn[];

export const PROJECT_READINESS_COLUMNS = [
  "workUnit",
  "priority",
  "owner",
  "dependsOn",
  "cohort",
] as const satisfies readonly StatusColumn[];

const DEFAULT_FS: ProjectViewFs = {
  readdir: (path) => readdir(path, { withFileTypes: true }),
  readFile: (path) => readFile(path, "utf8"),
};

/** Resolve the standard render stamp for tracked and live project-readiness views. */
export async function resolveProjectReadinessRenderStamp(
  options: ResolveProjectReadinessRenderStampOptions,
): Promise<ProjectReadinessRenderStamp> {
  let ref: string;
  try {
    const { stdout } = await options.exec("git", ["rev-parse", "--short", "HEAD"], { cwd: options.cwd });
    ref = stdout.trim() || "working tree";
  } catch {
    ref = "working tree";
  }
  return {
    ref,
    ...(options.scope !== undefined ? { scope: options.scope } : {}),
    ...(options.liveView !== undefined ? { liveView: options.liveView } : {}),
  };
}

/** Collect `meta-*.md` files recursively under `dir`; a missing directory yields none. */
async function collectMetaFiles(dir: string, fs: ProjectViewFs): Promise<string[]> {
  let entries: ProjectViewDirEntry[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMetaFiles(full, fs)));
    } else if (META_FILE_RE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Resolve the canonical slug from a meta filename. */
function slugOf(path: string): string {
  return META_FILE_RE.exec(basename(path))?.[1] ?? basename(path);
}

function slugHintOf(path: string): string | null {
  return META_FILE_RE.exec(basename(path))?.[1] ?? null;
}

function sourceKindFor(location: ProjectReadinessLocation): ProjectReadinessSourceKind {
  switch (location) {
    case "active":
      return "active-meta";
    case "planned":
    case "provisional":
      return "backlog-stub";
    case "completed":
      return "completed-index";
  }
}

function sourceFor(location: ProjectReadinessLocation, path: string | undefined): ProjectReadinessRecordSource {
  return {
    kind: sourceKindFor(location),
    location,
    ...(path !== undefined ? { path } : {}),
  };
}

/** Parse one meta into the renderer's compact project-view row shape. */
async function readProjectMeta(
  fs: ProjectViewFs,
  location: ProjectReadinessLocation,
  path: string,
): Promise<
  | { kind: "accepted"; record: ProjectReadinessRecordCandidate }
  | { kind: "rejected"; record: ProjectReadinessRejectedRecord }
> {
  let content: string;
  try {
    content = await fs.readFile(path);
  } catch {
    return {
      kind: "rejected",
      record: { slugHint: slugHintOf(path), path, locus: "read", reason: "unreadable" },
    };
  }

  let record;
  try {
    record = parseMetaRecord(content);
  } catch {
    return {
      kind: "rejected",
      record: { slugHint: slugHintOf(path), path, locus: "meta", reason: "malformed" },
    };
  }

  const state = validateState(record.state);
  if (state === "unknown") {
    return {
      kind: "rejected",
      record: { slugHint: slugHintOf(path), path, locus: "State", reason: "unsupported-lifecycle" },
    };
  }

  return {
    kind: "accepted",
    record: {
      slug: slugOf(path),
      location,
      state,
      ...(record.owner !== null ? { owner: record.owner } : {}),
      priority: validatePriority(record.priority),
      dependsOn: record.dependsOn,
      ...(record.cohort !== null ? { cohort: record.cohort } : {}),
      source: sourceFor(location, path),
    },
  };
}

/** Load lifecycle-tier metas from disk into unmerged record candidates. */
async function loadProjectRecords(
  cwd: string,
  fs: ProjectViewFs,
): Promise<{
  candidates: ProjectReadinessRecordCandidate[];
  rejectedRecords: ProjectReadinessRejectedRecord[];
}> {
  const roots = [
    { location: "active" as const, dir: join(cwd, ".arc", "active") },
    { location: "planned" as const, dir: join(cwd, ".arc", "backlog", "planned") },
    { location: "provisional" as const, dir: join(cwd, ".arc", "backlog", "provisional") },
    { location: "completed" as const, dir: join(cwd, ".arc", "completed") },
  ];

  const metas: ProjectReadinessRecordCandidate[] = [];
  const rejectedRecords: ProjectReadinessRejectedRecord[] = [];
  for (const root of roots) {
    for (const path of (await collectMetaFiles(root.dir, fs)).sort()) {
      const meta = await readProjectMeta(fs, root.location, path);
      if (meta.kind === "accepted") metas.push(meta.record);
      else rejectedRecords.push(meta.record);
    }
  }
  return { candidates: metas, rejectedRecords };
}

const SOURCE_PRECEDENCE: Record<ProjectReadinessLocation, number> = {
  active: 3,
  planned: 2,
  provisional: 1,
  completed: 0,
};

function compareCandidates(
  left: ProjectReadinessRecordCandidate,
  right: ProjectReadinessRecordCandidate,
): number {
  const precedence = SOURCE_PRECEDENCE[right.location] - SOURCE_PRECEDENCE[left.location];
  if (precedence !== 0) return precedence;
  return sourcePathOf(left).localeCompare(sourcePathOf(right));
}

function sourcePathOf(candidate: ProjectReadinessRecordCandidate): string {
  return candidate.source?.path ?? `${candidate.location}/${candidate.slug}`;
}

function acceptedCandidateOf(candidate: ProjectReadinessRecordCandidate): ProjectReadinessAcceptedCandidate {
  const source = candidate.source ?? sourceFor(candidate.location, undefined);
  return {
    slug: candidate.slug,
    path: source.path ?? `${candidate.location}/${candidate.slug}`,
    lifecycleLocation: candidate.location,
    record: {
      ...candidate,
      source,
      sources: [source],
    },
  };
}

function isParkedPointer(candidate: ProjectReadinessRecordCandidate): boolean {
  return candidate.scheduling === "parked" || (candidate.location === "planned" && candidate.state === "Active");
}

/**
 * Merge source candidates into one slug-keyed project-readiness record set.
 *
 * At-ref active metas win the row-field precedence over backlog stubs and completed
 * records. Parking is an axis overlay: a planned Active pointer owns scheduling
 * tier membership even when an active meta supplies the row fields.
 */
export function mergeProjectReadinessRecords(
  candidates: readonly ProjectReadinessRecordCandidate[],
): ProjectReadinessRecord[] {
  const groups = new Map<string, ProjectReadinessRecordCandidate[]>();
  for (const candidate of candidates) {
    groups.set(candidate.slug, [...(groups.get(candidate.slug) ?? []), candidate]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, group]) => {
      const ordered = [...group].sort(compareCandidates);
      const winner = ordered[0];
      if (winner === undefined) throw new Error("project-readiness merge requires a non-empty group");
      const parked = group.some(isParkedPointer);
      const source = winner.source ?? sourceFor(winner.location, undefined);
      return {
        ...winner,
        source,
        sources: ordered.map((candidate) => candidate.source ?? sourceFor(candidate.location, undefined)),
        ...(parked ? { location: "planned" as const, scheduling: "parked" as const } : {}),
      };
    });
}

/** Resolve the project-readiness view title from render inputs only. */
function resolveTitle(title: string | undefined): string {
  return title ?? DEFAULT_TITLE;
}

function selectedRefFor(entry: InFlightWorkUnit): string {
  return entry.provenance?.find((candidate) => candidate.selected)?.ref ?? entry.branch;
}

function inFlightEntryToCandidate(entry: InFlightEntry): ProjectReadinessRecordCandidate | null {
  if (entry.kind !== "work-unit") return null;
  const state = validateState(entry.state);
  if (state === "unknown") return null;
  const ref = selectedRefFor(entry);
  const metaPath = resolveArcPath({
    kind: "work-unit-artifact",
    placement: { kind: "active", scope: { kind: "project" } },
    slug: SlugSchema.parse(entry.name),
    artifact: "meta",
  });
  return {
    slug: entry.name,
    location: "active",
    state,
    ...(entry.owner !== undefined ? { owner: entry.owner } : {}),
    priority: validatePriority(entry.priority ?? null),
    dependsOn: [...entry.dependsOn],
    ...(entry.cohort !== undefined ? { cohort: entry.cohort } : {}),
    source: sourceFor("active", `${ref}:${metaPath}`),
    ...(entry.scheduling === "parked" ? { scheduling: "parked" as const } : {}),
  };
}

function sourceWarningFromInFlight(warning: InFlightWarning): ProjectReadinessWarning {
  return {
    code: "oracle-degraded",
    ...(warning.workUnit !== undefined ? { workUnit: warning.workUnit } : {}),
    rendered: warning.rendered,
  };
}

function staleWarningFromInFlight(warning: InFlightWarning): ProjectReadinessDerivationWarning | null {
  if (warning.code !== "stale-location-dropped" && warning.code !== "stale-location-shadow") {
    return null;
  }
  return {
    code: warning.code,
    ...(warning.workUnit !== undefined ? { workUnit: warning.workUnit } : {}),
    rendered: warning.rendered,
  };
}

function appendIndeterminateOracleWarning(
  warnings: readonly ProjectReadinessWarning[],
  indeterminate: boolean,
  hasSpecificIndeterminateWarning: boolean,
): ProjectReadinessWarning[] {
  const renderedAlready = warnings.some((warning) =>
    warning.rendered === INDETERMINATE_ORACLE_WARNING.rendered
    || /indeterminate|changed during derivation/iu.test(warning.rendered));
  return indeterminate && !hasSpecificIndeterminateWarning && !renderedAlready
    ? [...warnings, INDETERMINATE_ORACLE_WARNING]
    : [...warnings];
}

async function resolveOracleCandidates(
  options: ProjectReadinessOracleOptions | undefined,
  prospective?: ProjectReadinessProspectiveInput & { stagedSlugs: ReadonlySet<string> },
  transitionOverlay?: TransitionOverlayCompositionInput,
): Promise<{
  candidates: ProjectReadinessRecordCandidate[];
  derivationWarnings: ProjectReadinessDerivationWarning[];
  sourceWarnings: ProjectReadinessWarning[];
  rejectedRecords: ProjectReadinessRejectedRecord[];
  indeterminate: boolean;
  result: DeriveInFlightResult | null;
}> {
  if (options === undefined) {
    return {
      candidates: [],
      derivationWarnings: [],
      sourceWarnings: [],
      rejectedRecords: [],
      indeterminate: false,
      result: null,
    };
  }
  const result = await deriveInFlight({
    exec: options.exec,
    localOnly: options.localOnly ?? false,
    expandLiveOnly: options.expandLiveOnly ?? false,
    baseBranch: options.baseBranch,
    timeoutMs: options.timeoutMs,
    identity: null,
    teamMode: false,
    errandSlugByBranch: options.errandSlugByBranch,
    errandRecordsComplete: options.errandRecordsComplete,
    parkedSlugs: options.parkedSlugs,
    decompositionClaimCwd: options.decompositionClaimCwd,
  });
  const entries = prospective === undefined && transitionOverlay === undefined
    ? result.entries
    : result.entries.filter((entry) =>
        entry.kind !== "work-unit"
        || !(
          (
            prospective !== undefined
            && entry.branch === prospective.currentBranch
            && prospective.stagedSlugs.has(entry.name)
          )
          || (
            entry.branch === transitionOverlay?.sourceBranch
            && entry.name === transitionOverlay.origin
          )
        ));
  const warnings = prospective === undefined && transitionOverlay === undefined
    ? result.warnings
    : result.warnings.filter((warning) => {
        const warningSlug = warning.branch === undefined ? null : branchToWorkUnitSlug(warning.branch);
        return !(
          (
            warning.code === "branch-residue"
            && prospective !== undefined
            && warning.branch === prospective.currentBranch
            && warningSlug !== null
            && prospective.stagedSlugs.has(warningSlug)
          )
          || (
            transitionOverlay !== undefined
            && warning.branch === transitionOverlay.sourceBranch
            && warningSlug === transitionOverlay.origin
          )
        );
      });
  const composedResult = entries === result.entries && warnings === result.warnings
    ? result
    : { ...result, entries, warnings };
  const candidates = entries
    .map(inFlightEntryToCandidate)
    .filter((candidate): candidate is ProjectReadinessRecordCandidate => candidate !== null);
  const derivationWarnings: ProjectReadinessDerivationWarning[] = [];
  const sourceWarnings: ProjectReadinessWarning[] = [];
  const rejectedRecords: ProjectReadinessRejectedRecord[] = [];
  let hasIndeterminateSourceWarning = false;
  for (const warning of warnings) {
    if (warning.code === "input-snapshot-disagreement") hasIndeterminateSourceWarning = true;
    const stale = staleWarningFromInFlight(warning);
    if (stale === null) sourceWarnings.push(sourceWarningFromInFlight(warning));
    else derivationWarnings.push(stale);
    const reason = warning.code === "meta-read-failed"
      ? "unreadable"
      : warning.code === "meta-malformed"
        ? "malformed"
        : warning.code === "state-unrecognized"
          ? "unsupported-lifecycle"
          : null;
    if (reason !== null) {
      const rawSlugHint = warning.workUnit ?? (
        warning.branch === undefined ? null : branchToWorkUnitSlug(warning.branch)
      );
      const parsedSlugHint = rawSlugHint === null ? null : SlugSchema.safeParse(rawSlugHint);
      const slugHint = parsedSlugHint?.success === true ? parsedSlugHint.data : null;
      const metaPath = slugHint === null
        ? "[unknown-meta]"
        : resolveArcPath({
            kind: "work-unit-artifact",
            placement: { kind: "active", scope: { kind: "project" } },
            slug: SlugSchema.parse(slugHint),
            artifact: "meta",
          });
      rejectedRecords.push({
        slugHint,
        path: warning.branch === undefined ? metaPath : `${warning.branch}:${metaPath}`,
        locus: warning.code,
        reason,
      });
    }
  }
  if (!options.localOnly && !result.reachable) {
    sourceWarnings.unshift({
      code: "oracle-degraded",
      rendered: "Remote unreachable; rendering project view from local refs only.",
    });
  }
  const indeterminate = inFlightResultIndeterminate(composedResult);
  return {
    candidates,
    derivationWarnings,
    sourceWarnings: appendIndeterminateOracleWarning(sourceWarnings, indeterminate, hasIndeterminateSourceWarning),
    rejectedRecords,
    indeterminate: indeterminate || rejectedRecords.some(({ slugHint }) => slugHint === null),
    result: composedResult,
  };
}

function inFlightResultIndeterminate(result: Awaited<ReturnType<typeof deriveInFlight>>): boolean {
  return Boolean(result.marks?.includes("indeterminate"))
    || result.entries.some((entry) => entry.marks?.includes("indeterminate") ?? false)
    || result.warnings.some((warning) => warning.code === "input-snapshot-disagreement");
}

function oracleOptionsFor(options: ResolveProjectReadinessViewInputOptions): ProjectReadinessOracleOptions | undefined {
  // `oracle` is the full live/local input contract; `localRefs` is only the tracked-render shorthand.
  if (options.oracle !== undefined) return options.oracle;
  if (options.localRefs === undefined) return undefined;
  return { ...options.localRefs, localOnly: true };
}

/** Resolve the shared tree + oracle record set used by project rendering and lifecycle queries. */
export async function resolveProjectReadinessComposition(
  options: ResolveProjectReadinessViewInputOptions,
): Promise<ProjectReadinessCompositionResult> {
  const fs = options.fs ?? DEFAULT_FS;
  const tree = await loadProjectRecords(options.cwd, fs);
  const configuredOracle = oracleOptionsFor(options);
  const parkedSlugs = configuredOracle?.parkedSlugs ?? new Set(
    tree.candidates.filter(isParkedPointer).map((record) => record.slug),
  );
  const localRefs = await resolveOracleCandidates(
    configuredOracle === undefined
      ? undefined
      : { ...configuredOracle, parkedSlugs },
    options.prospective === undefined
      ? undefined
      : {
          ...options.prospective,
          stagedSlugs: new Set(tree.candidates.map((record) => record.slug)),
        },
    options.transitionOverlay,
  );
  const candidates = [...tree.candidates, ...localRefs.candidates];
  const rejectedRecords = [...tree.rejectedRecords, ...localRefs.rejectedRecords];
  const indeterminate = localRefs.indeterminate || rejectedRecords.some(({ slugHint }) => slugHint === null);
  const records = mergeProjectReadinessRecords(candidates);
  const treeRecords = mergeProjectReadinessRecords(tree.candidates);
  const derivationWarnings = localRefs.derivationWarnings;
  const sourceWarnings = localRefs.sourceWarnings;
  return {
    acceptedCandidates: candidates.map(acceptedCandidateOf),
    rejectedRecords,
    records,
    treeRecords,
    derivationWarnings,
    sourceWarnings,
    indeterminate,
    oracleResult: localRefs.result,
    view: {
      title: resolveTitle(options.title),
      records,
      derivationWarnings,
      sourceWarnings,
      indeterminate,
    },
  };
}

/** Resolve tree-backed records and the title read into a compose-ready input. */
export async function resolveProjectReadinessViewInput(
  options: ResolveProjectReadinessViewInputOptions,
): Promise<ProjectReadinessViewInput> {
  const composition = await resolveProjectReadinessComposition(options);
  return composition.view;
}

function lifecycleIndexFromRecords(records: readonly ProjectReadinessRecord[]): LifecycleIndex {
  return buildLifecycleIndexFromRecords(
    records.map((record) => ({
      slug: record.slug,
      state: record.state,
      location: record.location,
      cohort: record.cohort ?? null,
      dependsOn: record.dependsOn,
      path: record.source.path,
    })),
  );
}

function classifyDependencies(
  records: readonly ProjectReadinessRecord[],
  index: LifecycleIndex,
): DependencyClassification {
  const warnings: ProjectReadinessWarning[] = [];
  const warned = new Set<string>();
  const unsatisfiedBySlug = new Map<string, string[]>();

  for (const record of records) {
    const unsatisfied: string[] = [];
    for (const dep of record.dependsOn) {
      const query = resolveSlugQuery(index, dep);
      if (query.state === "nonexistent") {
        unsatisfied.push(dep);
        const key = `${record.slug}\0${dep}`;
        if (!warned.has(key)) {
          warned.add(key);
          warnings.push({
            code: "dangling-dependency",
            workUnit: record.slug,
            dependency: dep,
            rendered: `\`${record.slug}\` depends on missing work unit \`${dep}\`; treating the edge as blocked.`,
          });
        }
      } else if (!query.shipped) {
        unsatisfied.push(dep);
      }
    }
    if (unsatisfied.length > 0) unsatisfiedBySlug.set(record.slug, unsatisfied);
  }

  return { unsatisfiedBySlug, warnings };
}

function elevatedDerivationWarnings(
  warnings: readonly ProjectReadinessDerivationWarning[],
  index: LifecycleIndex,
): ProjectReadinessWarning[] {
  return warnings.flatMap((warning): ProjectReadinessWarning[] => {
    if (warning.workUnit === undefined) return [];
    const query = resolveSlugQuery(index, warning.workUnit);
    if (query.shipped) return [];
    return [
      {
        code: "stale-location-unshipped",
        workUnit: warning.workUnit,
        rendered: `${warning.rendered} Work unit \`${warning.workUnit}\` has not shipped; treating the view as degraded.`,
      },
    ];
  });
}

/** Default provider: a record is ready exactly when all dependency edges are satisfied. */
export const depsOnlyReadinessProvider: ProjectReadinessProvider = {
  resolve(records) {
    const classification = classifyDependencies(records, lifecycleIndexFromRecords(records));
    return new Map(
      records.map((record) => [
        record.slug,
        unsatisfiedFor(classification, record.slug).length === 0 ? "ready" : "blocked",
      ]),
    );
  },
};

/** Build a render row from a resolved record, filtering dependency display to unsatisfied edges. */
function rowOf(
  record: ProjectReadinessRecord,
  unsatisfiedDeps: readonly string[],
  includeState: boolean,
): StatusViewRow {
  return {
    workUnit: record.slug,
    ...(includeState ? { state: `\`${record.state}\`` } : {}),
    priority: record.priority,
    ...(record.owner !== undefined ? { owner: record.owner } : {}),
    dependsOn: [...unsatisfiedDeps],
    ...(record.cohort !== undefined ? { cohort: record.cohort } : {}),
  };
}

function unsatisfiedFor(classification: DependencyClassification, slug: string): readonly string[] {
  return classification.unsatisfiedBySlug.get(slug) ?? [];
}

function readinessFor(
  verdicts: ReadonlyMap<string, ProjectReadinessVerdict>,
  slug: string,
): ProjectReadinessVerdict {
  return verdicts.get(slug) ?? "blocked";
}

function factsFor(
  records: readonly ProjectReadinessRecord[],
  classification: DependencyClassification,
  readiness: ReadonlyMap<string, ProjectReadinessVerdict>,
): ProjectReadinessFact[] {
  return records.map((record) => {
    const unsatisfiedDependencies = unsatisfiedFor(classification, record.slug);
    return {
      slug: record.slug,
      dependencySatisfaction: unsatisfiedDependencies.length === 0 ? "satisfied" : "unsatisfied",
      readiness: readinessFor(readiness, record.slug),
      unsatisfiedDependencies: [...unsatisfiedDependencies],
    };
  });
}

/** Depth-band blocked rows by longest unresolved blocked-dependency chain. */
function blockedDepths(blocked: ReadonlyMap<string, BlockedRow>): Map<number, StatusViewRow[]> {
  const memo = new Map<string, number>();

  function depthOf(slug: string, visiting: ReadonlySet<string>): number {
    const cached = memo.get(slug);
    if (cached !== undefined) return cached;
    const item = blocked.get(slug);
    if (item === undefined) return 0;
    if (visiting.has(slug)) return 1;

    const nextVisiting = new Set(visiting);
    nextVisiting.add(slug);
    const childDepth = Math.max(0, ...item.unsatisfied.map((dep) => depthOf(dep, nextVisiting)));
    const depth = childDepth + 1;
    memo.set(slug, depth);
    return depth;
  }

  const groups = new Map<number, StatusViewRow[]>();
  for (const [slug, item] of blocked) {
    const depth = depthOf(slug, new Set());
    groups.set(depth, [...(groups.get(depth) ?? []), item.row]);
  }
  return groups;
}

/** Render one tier, using a stable placeholder when the tier is empty. */
function renderTier(rows: readonly StatusViewRow[], columns: readonly StatusColumn[], empty: string): string {
  return rows.length === 0 ? empty : renderStatusTable(rows, columns);
}

function renderStamp(stamp: string | ProjectReadinessRenderStamp): string {
  const resolved = typeof stamp === "string" ? { ref: stamp } : stamp;
  const lines = [
    `**Generated from meta files — re-render at ceremony boundaries.** Last rendered against \`${resolved.ref}\`.`,
  ];
  const details: string[] = [];
  if (resolved.scope !== undefined) details.push(`Source scope: ${resolved.scope}.`);
  if (resolved.liveView !== undefined) details.push(`Live view: \`${resolved.liveView}\`.`);
  if (details.length > 0) lines.push(details.join(" "));
  return lines.map((line) => `> ${line}`).join("\n");
}

/**
 * Compose the project readiness view from resolved records.
 *
 * @param options - Header freshness marker, title, and resolved records.
 * @returns The markdown body plus structured warnings, without requiring a trailing newline.
 */
export function composeProjectReadinessViewResult(
  options: ComposeProjectReadinessViewOptions,
): ProjectReadinessViewResult {
  const records = [...options.records];
  const index = lifecycleIndexFromRecords(records);
  const classification = classifyDependencies(records, index);
  const sourceWarnings = appendIndeterminateOracleWarning(options.sourceWarnings ?? [], options.indeterminate === true, false);
  const warnings = [
    ...sourceWarnings,
    ...classification.warnings,
    ...elevatedDerivationWarnings(options.derivationWarnings ?? [], index),
  ];
  const readiness = (options.readinessProvider ?? depsOnlyReadinessProvider).resolve(records);
  const facts = factsFor(records, classification, readiness);
  const factsBySlug = new Map(facts.map((fact) => [fact.slug, fact]));

  const active = records
    .filter((record) => record.location === "active" && record.scheduling !== "parked")
    .map((record) => rowOf(record, unsatisfiedFor(classification, record.slug), true));

  const planned = records.filter((record) => record.location === "planned" && record.scheduling !== "parked");
  const ready = planned
    .filter((record) => record.state === "Planning")
    .filter((record) => {
      const fact = factsBySlug.get(record.slug);
      return fact?.dependencySatisfaction === "satisfied" && fact.readiness === "ready";
    })
    .map((record) => rowOf(record, [], false));

  const blocked = new Map<string, BlockedRow>();
  for (const record of planned.filter((item) => item.state === "Planning")) {
    const fact = factsBySlug.get(record.slug);
    if (fact?.dependencySatisfaction === "satisfied" && fact.readiness === "ready") continue;
    const unsatisfied = unsatisfiedFor(classification, record.slug);
    blocked.set(record.slug, { row: rowOf(record, unsatisfied, false), unsatisfied: [...unsatisfied] });
  }

  const parked = records
    .filter((record) => record.scheduling === "parked" || (record.location === "planned" && record.state === "Active"))
    .map((record) => rowOf(record, unsatisfiedFor(classification, record.slug), false));
  const blockedGroups = blockedDepths(blocked);

  const lines = [
    `# ${options.title}`,
    "",
    renderStamp(options.renderedRef),
    "",
    "This view is a derived readiness and dependency map. Tier membership follows dependency satisfaction: a",
    "unit is Ready once the units it depends on have shipped, and Blocked units are banded by how many",
    "unsatisfied dependency hops separate them from a startable root. Within each tier, rows are ordered by",
    "Priority (P1 → P2 → P3), then cohort, then canonical name. Cohort renders as the leaf segment; the full",
    "path lives in each meta's Cohort field. Cohort membership is a logical grouping, not a scheduling constraint.",
    "",
    "---",
    "",
    "## In Flight",
    "",
    renderTier(active, PROJECT_IN_FLIGHT_COLUMNS, "_No work units in flight._"),
    "",
    "## Ready",
    "",
    renderTier(ready, PROJECT_READINESS_COLUMNS, "_No ready work units._"),
    "",
    "## Blocked",
    "",
  ];

  if (blockedGroups.size === 0) {
    lines.push("_No blocked work units._", "");
  } else {
    for (const depth of [...blockedGroups.keys()].sort((a, b) => a - b)) {
      lines.push(`### Depth ${depth}`, "", renderStatusTable(blockedGroups.get(depth) ?? [], PROJECT_READINESS_COLUMNS), "");
    }
  }

  if (parked.length > 0) {
    lines.push("## Parked", "", renderStatusTable(parked, PROJECT_READINESS_COLUMNS), "");
  }

  lines.push("---", "", "_Pre-commitment thinking that hasn't been sequenced yet lives in `backlog/provisional/`._");

  return { markdown: lines.join("\n"), warnings, facts };
}

/**
 * Compose only the project readiness markdown body.
 *
 * @param options - Header freshness marker, title, and resolved records.
 * @returns The complete markdown body, without requiring a trailing newline.
 */
export function composeProjectReadinessView(
  options: ComposeProjectReadinessViewOptions,
): string {
  return composeProjectReadinessViewResult(options).markdown;
}
