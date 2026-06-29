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
  /** Fresh entries whose paths were absent from the seed baseline. */
  added: LoadSetEntry[];
  /** Seed-baseline entries whose paths are absent from the fresh manifest. */
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
  const baselineByPath = indexByPath(options.baseline.entries);
  const freshByPath = indexByPath(options.fresh.entries);
  const preliminaryAddedPaths = new Set(
    options.fresh.entries
      .filter((entry) => !baselineByPath.has(entry.path))
      .map((entry) => entry.path),
  );
  const preliminaryRemovedPaths = new Set(
    options.baseline.entries
      .filter((entry) => !freshByPath.has(entry.path))
      .map((entry) => entry.path),
  );

  const pathDrifts = resolvePathDrifts({
    baseline: options.baseline.entries,
    fresh: options.fresh.entries,
    preliminaryAddedPaths,
    preliminaryRemovedPaths,
  });
  const pathDriftExpectedPaths = new Set(pathDrifts.map((drift) => drift.expected.path));
  const pathDriftActualPaths = new Set(pathDrifts.map((drift) => drift.actual.path));

  const added = options.fresh.entries.filter((entry) => (
    preliminaryAddedPaths.has(entry.path) && !pathDriftActualPaths.has(entry.path)
  ));
  const removed = options.baseline.entries.filter((entry) => (
    preliminaryRemovedPaths.has(entry.path) && !pathDriftExpectedPaths.has(entry.path)
  ));
  const readModeChanges = options.baseline.entries.flatMap((entry) => {
    if (pathDriftExpectedPaths.has(entry.path)) return [];
    const freshEntry = freshByPath.get(entry.path)?.entry;
    if (freshEntry === undefined || readModeEqual(entry.readMode, freshEntry.readMode)) return [];
    return [{
      path: entry.path,
      expected: entry.readMode,
      actual: freshEntry.readMode,
    }];
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

interface IndexedEntry {
  entry: LoadSetEntry;
  index: number;
}

function indexByPath(entries: readonly LoadSetEntry[]): Map<string, IndexedEntry> {
  return new Map(entries.map((entry, index) => [entry.path, { entry, index }]));
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
