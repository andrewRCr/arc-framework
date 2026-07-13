/**
 * Shared tree + in-flight lifecycle-index resolver.
 *
 * The project readiness view owns the record composition machinery; this
 * module projects that exact record set into the lifecycle index consumed by
 * slug queries and dispatch without changing their pure interfaces.
 *
 * @module
 */

import { isAbsolute, relative, sep } from "node:path";

import type {
  InFlightEntryMark,
  InFlightState,
  InFlightWarning,
  InFlightWarningCode,
} from "../git/in-flight-derivation.js";
import type { RefTipMap } from "../git/remote-ref-reader.js";
import {
  resolveProjectReadinessComposition,
  type ProjectReadinessProspectiveInput,
  type ProjectReadinessOracleOptions,
  type ProjectViewFs,
} from "../status/project-view.js";

import { buildLifecycleIndexFromRecords, type LifecycleIndex } from "./lifecycle-index.js";

/** Native quality facts for one slug, including entries omitted from the lifecycle index. */
export interface ComposedLifecycleSlugQuality {
  state?: InFlightState;
  marks: readonly InFlightEntryMark[];
  warnings: readonly InFlightWarning[];
}

/** Oracle quality channels retained without the project view's warning flattening. */
export interface ComposedLifecycleQualityFacts {
  warnings: readonly InFlightWarning[];
  resultMarks: readonly InFlightEntryMark[];
  bySlug: ReadonlyMap<string, ComposedLifecycleSlugQuality>;
  /** Live membership was requested but could not be read; local/tree truth is degraded, never fatal. */
  unreachable?: true;
}

/** Options for resolving composed lifecycle truth. */
export interface ResolveComposedLifecycleIndexOptions {
  cwd: string;
  fs?: ProjectViewFs;
  /** Omit for exact tree-only parity. `baseBranch` is required because exclusion is load-bearing. */
  oracle?: Omit<ProjectReadinessOracleOptions, "baseBranch"> & { baseBranch: string };
  /** Optional staged-tree precedence for the checked-out branch's own work unit. */
  prospective?: ProjectReadinessProspectiveInput;
}

/** Tree + oracle lifecycle truth and the quality/enrichment channels consumers need beside it. */
export interface ComposedLifecycleIndexResult {
  index: LifecycleIndex;
  qualityFacts: ComposedLifecycleQualityFacts;
  worktreePathBySlug: ReadonlyMap<string, string>;
  liveRefs: RefTipMap;
  reachable: boolean;
}

/** Warning codes that make one named target unsafe for branch-minting decisions. */
export const INDETERMINATE_IN_FLIGHT_WARNING_CODES: ReadonlySet<InFlightWarningCode> = new Set([
  "meta-enumeration-failed",
  "meta-read-failed",
  "meta-malformed",
  "state-unrecognized",
  "branch-field-missing",
  "location-ambiguous",
  "input-snapshot-disagreement",
]);

/** Whether composed quality says a slug cannot safely be treated as absent or mintable. */
export function isComposedLifecycleSlugIndeterminate(
  result: ComposedLifecycleIndexResult,
  slug: string,
): boolean {
  if (result.qualityFacts.unreachable === true) return true;
  if (result.qualityFacts.resultMarks.includes("indeterminate")) return true;
  const fact = result.qualityFacts.bySlug.get(slug);
  if (fact === undefined) return false;
  if (fact.marks.includes("degraded") || fact.marks.includes("indeterminate")) return true;
  return fact.warnings.some((warning) => INDETERMINATE_IN_FLIGHT_WARNING_CODES.has(warning.code));
}

function normalizedPath(cwd: string, path: string | undefined): string | undefined {
  if (path === undefined || !isAbsolute(path)) return path;
  return relative(cwd, path).split(sep).join("/");
}

function qualityFactsFor(
  oracleResult: Awaited<ReturnType<typeof resolveProjectReadinessComposition>>["oracleResult"],
  liveRequested: boolean,
): ComposedLifecycleQualityFacts {
  if (oracleResult === null) return { warnings: [], resultMarks: [], bySlug: new Map() };

  const warningsBySlug = new Map<string, InFlightWarning[]>();
  for (const warning of oracleResult.warnings) {
    if (warning.workUnit === undefined) continue;
    warningsBySlug.set(warning.workUnit, [...(warningsBySlug.get(warning.workUnit) ?? []), warning]);
  }
  const entriesBySlug = new Map(
    oracleResult.entries
      .filter((entry) => entry.kind === "work-unit")
      .map((entry) => [entry.name, entry] as const),
  );
  const bySlug = new Map<string, ComposedLifecycleSlugQuality>();
  for (const slug of new Set([...warningsBySlug.keys(), ...entriesBySlug.keys()])) {
    const entry = entriesBySlug.get(slug);
    const warnings = warningsBySlug.get(slug) ?? [];
    const marks = entry?.marks ?? [];
    if (entry?.state !== "unknown" && marks.length === 0 && warnings.length === 0) continue;
    bySlug.set(slug, {
      ...(entry !== undefined ? { state: entry.state } : {}),
      marks: [...marks],
      warnings: [...warnings],
    });
  }
  return {
    warnings: [...oracleResult.warnings],
    resultMarks: [...(oracleResult.marks ?? [])],
    bySlug,
    ...(liveRequested && !oracleResult.reachable ? { unreachable: true as const } : {}),
  };
}

/** Resolve the lifecycle index from the same merged records as the project readiness view. */
export async function resolveComposedLifecycleIndex(
  options: ResolveComposedLifecycleIndexOptions,
): Promise<ComposedLifecycleIndexResult> {
  const composition = await resolveProjectReadinessComposition({
    cwd: options.cwd,
    ...(options.fs !== undefined ? { fs: options.fs } : {}),
    ...(options.oracle !== undefined ? { oracle: options.oracle } : {}),
    ...(options.prospective !== undefined ? { prospective: options.prospective } : {}),
  });
  const oracleResult = composition.oracleResult;
  const worktreePathBySlug = new Map<string, string>();
  for (const entry of oracleResult?.entries ?? []) {
    if (entry.kind === "work-unit" && entry.worktreePath !== undefined) {
      worktreePathBySlug.set(entry.name, entry.worktreePath);
    }
  }
  return {
    index: buildLifecycleIndexFromRecords(
      composition.records.map((record) => ({
        slug: record.slug,
        state: record.state,
        location: record.location,
        cohort: record.cohort ?? null,
        dependsOn: record.dependsOn,
        path: normalizedPath(options.cwd, record.source.path),
      })),
    ),
    qualityFacts: qualityFactsFor(oracleResult, options.oracle !== undefined && options.oracle.localOnly !== true),
    worktreePathBySlug,
    liveRefs: { ...(oracleResult?.liveRefs ?? {}) },
    reachable: oracleResult?.reachable ?? false,
  };
}
