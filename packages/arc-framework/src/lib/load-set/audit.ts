/**
 * Recovery audit diffing for load-set manifests.
 *
 * The compaction seed embeds the init-time load-set as a baseline. Recovery
 * re-resolves a fresh manifest and audits it here so the recovery workflow can
 * stop when session state moved mid-compaction.
 *
 * @module
 */

import type { LoadSetEntry, LoadSetManifest, ReadMode } from "./types.js";

type AuditableLoadSetManifest = Omit<LoadSetManifest, "manifestVersion"> & {
  manifestVersion: number;
};

/** Membership changes between the seed baseline and the fresh manifest. */
export interface LoadSetMembershipDiff {
  /** Fresh entries whose path occurrence is absent or extra relative to the seed baseline. */
  added: LoadSetEntry[];
  /** Seed-baseline entries whose path occurrence is absent or extra relative to the fresh manifest. */
  removed: LoadSetEntry[];
}

/** Read-mode drift for a load-set member retained at the same path. */
export interface LoadSetReadModeChange {
  /** Retained repository-relative path. */
  path: string;
  /** Read mode embedded in the seed baseline. */
  expected: ReadMode;
  /** Read mode freshly resolved during recovery. */
  actual: ReadMode;
}

/** Path drift for a retained load-set slot. */
export interface LoadSetPathDrift {
  /** Zero-based load-set index where the drift was detected. */
  index: number;
  /** Entry embedded in the seed baseline. */
  expected: LoadSetEntry;
  /** Entry freshly resolved during recovery. */
  actual: LoadSetEntry;
}

/** Structured recovery-audit diff. */
export interface LoadSetAuditDiff {
  /** Manifest-version drift between baseline and fresh load-set schemas. */
  manifestVersion: {
    expected: number;
    actual: number;
  } | null;
  /** Added and removed load-set members. */
  membership: LoadSetMembershipDiff;
  /** Read-mode changes on retained paths. */
  readModeChanges: LoadSetReadModeChange[];
  /** Same-slot path substitutions or order drift. */
  pathDrifts: LoadSetPathDrift[];
}

/** Verdict returned to the recovery workflow. */
export interface LoadSetAuditVerdict {
  /** Whether the fresh manifest matches or diverges from the seed baseline. */
  status: "match" | "diverged";
  /** Boolean form of {@link status}, convenient for workflow gates. */
  diverged: boolean;
  /** Structured diff categories for rendering a stop surface. */
  diff: LoadSetAuditDiff;
}

/** Inputs for auditing a fresh load-set manifest against a seed baseline. */
export interface AuditLoadSetManifestOptions {
  /** Load-set manifest embedded in the compaction seed. */
  baseline: AuditableLoadSetManifest;
  /** Fresh load-set manifest resolved from the recovery probe. */
  fresh: AuditableLoadSetManifest;
}

/**
 * Diff a freshly resolved load set against the seed baseline.
 *
 * @param options - Baseline and fresh manifests to compare
 * @returns Match/divergence verdict plus renderable diff categories
 */
export function auditLoadSetManifest(
  options: AuditLoadSetManifestOptions,
): LoadSetAuditVerdict {
  const manifestVersion = options.baseline.manifestVersion === options.fresh.manifestVersion
    ? null
    : {
      expected: options.baseline.manifestVersion,
      actual: options.fresh.manifestVersion,
    };
  const baselineByPath = groupByPath(options.baseline.entries);
  const freshByPath = groupByPath(options.fresh.entries);
  const preliminaryAddedPaths = new Set(
    pathsWithExtraEntries({
      candidate: freshByPath,
      reference: baselineByPath,
    }),
  );
  const preliminaryRemovedPaths = new Set(
    pathsWithExtraEntries({
      candidate: baselineByPath,
      reference: freshByPath,
    }),
  );

  const pathDrifts = resolvePathDrifts({
    baseline: options.baseline.entries,
    fresh: options.fresh.entries,
    preliminaryAddedPaths,
    preliminaryRemovedPaths,
  });
  const pathDriftIndexes = new Set(pathDrifts.map((drift) => drift.index));
  const baselineWithoutPathDrifts = groupByPath(options.baseline.entries, pathDriftIndexes);
  const freshWithoutPathDrifts = groupByPath(options.fresh.entries, pathDriftIndexes);

  const added = extraEntries({
    candidate: freshWithoutPathDrifts,
    reference: baselineWithoutPathDrifts,
  });
  const removed = extraEntries({
    candidate: baselineWithoutPathDrifts,
    reference: freshWithoutPathDrifts,
  });
  const readModeChanges = [...baselineWithoutPathDrifts.entries()].flatMap(([path, baselineEntries]) => {
    const freshEntries = freshWithoutPathDrifts.get(path) ?? [];
    const retainedCount = Math.min(baselineEntries.length, freshEntries.length);
    return baselineEntries.slice(0, retainedCount).flatMap((entry, index) => {
      const freshEntry = freshEntries[index];
      if (freshEntry === undefined || readModeEqual(entry.readMode, freshEntry.readMode)) return [];
      return [{
        path: entry.path,
        expected: entry.readMode,
        actual: freshEntry.readMode,
      }];
    });
  });

  const diverged = manifestVersion !== null
    || added.length > 0
    || removed.length > 0
    || readModeChanges.length > 0
    || pathDrifts.length > 0;

  return {
    status: diverged ? "diverged" : "match",
    diverged,
    diff: {
      manifestVersion,
      membership: {
        added,
        removed,
      },
      readModeChanges,
      pathDrifts,
    },
  };
}

interface EntriesByPath {
  candidate: ReadonlyMap<string, readonly LoadSetEntry[]>;
  reference: ReadonlyMap<string, readonly LoadSetEntry[]>;
}

function groupByPath(
  entries: readonly LoadSetEntry[],
  excludedIndexes: ReadonlySet<number> = new Set(),
): Map<string, LoadSetEntry[]> {
  const groups = new Map<string, LoadSetEntry[]>();
  for (const [index, entry] of entries.entries()) {
    if (excludedIndexes.has(index)) continue;
    const group = groups.get(entry.path) ?? [];
    group.push(entry);
    groups.set(entry.path, group);
  }
  return groups;
}

function pathsWithExtraEntries(options: EntriesByPath): string[] {
  return [...options.candidate.entries()]
    .filter(([path, entries]) => entries.length > (options.reference.get(path)?.length ?? 0))
    .map(([path]) => path);
}

function extraEntries(options: EntriesByPath): LoadSetEntry[] {
  return [...options.candidate.entries()].flatMap(([path, entries]) => {
    const referenceCount = options.reference.get(path)?.length ?? 0;
    return entries.slice(referenceCount);
  });
}

interface ResolvePathDriftsOptions {
  baseline: readonly LoadSetEntry[];
  fresh: readonly LoadSetEntry[];
  preliminaryAddedPaths: ReadonlySet<string>;
  preliminaryRemovedPaths: ReadonlySet<string>;
}

function resolvePathDrifts(options: ResolvePathDriftsOptions): LoadSetPathDrift[] {
  const length = Math.min(options.baseline.length, options.fresh.length);
  const hasMembershipDelta = options.preliminaryAddedPaths.size > 0
    || options.preliminaryRemovedPaths.size > 0;
  const pathDrifts: LoadSetPathDrift[] = [];

  for (let index = 0; index < length; index++) {
    const expected = options.baseline[index];
    const actual = options.fresh[index];
    if (expected === undefined || actual === undefined) continue;
    if (expected.path === actual.path) continue;

    const substitution = options.preliminaryRemovedPaths.has(expected.path)
      && options.preliminaryAddedPaths.has(actual.path);
    const orderDrift = !hasMembershipDelta;
    if (!substitution && !orderDrift) continue;

    pathDrifts.push({
      index,
      expected,
      actual,
    });
  }

  return pathDrifts;
}

function readModeEqual(left: ReadMode, right: ReadMode): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "partial-section") {
    return right.kind === "partial-section" && left.heading === right.heading;
  }
  return true;
}
