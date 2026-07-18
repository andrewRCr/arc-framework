/**
 * Pure report-input projections over canonical coupling scan evidence.
 *
 * @module
 */

import { sortByCanonicalBytes } from "../canonical/canonical-json.js";
import { normalizeRepositoryPath } from "./canonical.js";
import { CouplingAuditScanError } from "./contracts.js";
import { compareRankedClasses } from "./ranking.js";
import type {
  CouplingIdiom,
  CouplingManifest,
  CouplingReportInputs,
  CouplingScanCore,
  RankedInventoryRecord,
} from "./types.js";

const CONCRETE_PATH_IDIOMS: ReadonlySet<CouplingIdiom> = new Set([
  "path-literal",
  "directory-state",
  "git-tracked-path",
  "filename-prefix",
]);
const PLACEMENT_CLASS_IDS = [
  "active-placement",
  "completed-placement",
  "planned-placement",
  "provisional-placement",
] as const;
const PLACEMENT_READER_IDIOMS: readonly CouplingIdiom[] = ["directory-state", "filename-prefix"];

function uniqueSorted(values: readonly string[]): string[] {
  return sortByCanonicalBytes([...new Set(values)]);
}

/**
 * Build the complete ranked inventory and both hard-consumer extracts.
 *
 * @param manifest - Canonical source classes, thresholds, and dispositions.
 * @param result - Mechanical scan core before report-input projection.
 * @returns Deterministic report inputs keyed back to canonical evidence.
 */
export function buildReportInputs(manifest: CouplingManifest, result: CouplingScanCore): CouplingReportInputs {
  const assumptions = new Map(manifest.classes.map((entry) => [entry.id, entry]));
  const ranked = result.classes
    .map((entry) => {
      if (entry.verdict === null || entry.rankKey === null) {
        throw new CouplingAuditScanError(`unresolved class ${entry.classId}`);
      }
      return { ...entry, verdict: entry.verdict, rankKey: entry.rankKey };
    })
    .sort(compareRankedClasses);
  const residueSummary = {
    classified: result.candidates.classified.length,
    dismissed: result.candidates.dismissed.length,
    unresolved: result.candidates.unresolved.length,
    exactDispositions: manifest.dispositions.exact.length,
    bulkDispositions: manifest.dispositions.bulk.length,
  };
  const rankedInventory: RankedInventoryRecord[] = ranked.map((entry, index) => {
    const assumption = assumptions.get(entry.classId);
    if (assumption === undefined) throw new CouplingAuditScanError(`missing manifest class ${entry.classId}`);
    if (entry.volatility === "unresolved") {
      throw new CouplingAuditScanError(`unresolved class ${entry.classId}`);
    }
    if (assumption.volatility.evidence === null) {
      throw new CouplingAuditScanError(`missing volatility evidence for class ${entry.classId}`);
    }
    return {
      rank: index + 1,
      classId: entry.classId,
      classFilesRef: entry.classId,
      reportAnchor: `class-${entry.classId}`,
      provenance: {
        manifestDigest: result.manifestDigest,
        corpusFilesDigest: result.corpus.filesDigest,
        resultVersion: result.version,
      },
      thresholdMethod: {
        highWhen: "any-surface-count-gte-threshold",
        mixedSurfaceRank: "maximum-count-over-threshold",
        thresholds: { ...manifest.thresholds },
      },
      residueSummary: { ...residueSummary },
      fanOut: entry.fanOut,
      hitCount: entry.hitCount,
      surfaceCounts: { ...entry.surfaceCounts },
      volatility: entry.volatility,
      volatilityEvidence: { ...assumption.volatility.evidence },
      quadrant: { fanOut: entry.highFanOut ? "high" : "low", volatility: entry.volatility },
      maxThresholdRatio: entry.maxThresholdRatio,
      verdict: entry.verdict,
      rankKey: entry.rankKey,
    };
  });
  const rankByClass = new Map(rankedInventory.map((entry) => [entry.classId, entry.rank]));
  const substrateAbstractions = ranked
    .filter((entry) => entry.verdict === "abstract")
    .map((entry) => {
      const hits = entry.hits.filter((hit) => CONCRETE_PATH_IDIOMS.has(hit.idiom));
      return {
        classId: entry.classId,
        inventoryAnchor: `class-${entry.classId}`,
        idioms: uniqueSorted(hits.map((hit) => hit.idiom)) as CouplingIdiom[],
        evidenceDigests: uniqueSorted(hits.map((hit) => hit.evidenceDigest)),
      };
    })
    .filter((entry) => entry.evidenceDigests.length > 0);

  const availablePlacementIds = PLACEMENT_CLASS_IDS.filter((id) => assumptions.has(id));
  const readerHits = result.classes
    .filter((entry) => availablePlacementIds.includes(entry.classId as (typeof PLACEMENT_CLASS_IDS)[number]))
    .flatMap((entry) => entry.hits)
    .filter((hit) => hit.surfaceKind === "code" && PLACEMENT_READER_IDIOMS.includes(hit.idiom));
  const byPath = new Map<string, typeof readerHits>();
  for (const hit of readerHits) {
    const path = normalizeRepositoryPath(hit.path);
    const hits = byPath.get(path) ?? [];
    hits.push(hit);
    byPath.set(path, hits);
  }
  const readers = [...byPath.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, hits]) => ({
      path,
      classIds: uniqueSorted(hits.map((hit) => hit.classId)),
      evidenceDigests: uniqueSorted(hits.map((hit) => hit.evidenceDigest)),
    }));

  return {
    rankedInventory,
    substrateAbstractions: substrateAbstractions.sort(
      (left, right) => (rankByClass.get(left.classId) ?? 0) - (rankByClass.get(right.classId) ?? 0),
    ),
    placementReaders: {
      classIds: uniqueSorted(availablePlacementIds),
      idioms: [...PLACEMENT_READER_IDIOMS],
      readers,
    },
  };
}
