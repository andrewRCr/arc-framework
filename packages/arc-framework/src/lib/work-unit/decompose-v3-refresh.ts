/** Exact-identity refresh for an authored extraction cut map. */

import { canonicalDigest } from "../canonical/canonical-json.js";
import type { V3DecomposePreflight } from "./decompose-v3-preflight.js";
import type {
  V3DecomposeEvidenceValue,
  V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import {
  decodeV3DecomposeCutMap,
  parseV3DecomposeStarterMap,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";

/** Closed reason why an authored extraction must be written again. */
export type V3ExtractionCutMapRefreshMismatch =
  | "completed-map"
  | "source-identity"
  | "result-base"
  | "planning-profile"
  | "source-units"
  | "source-unit-ambiguous"
  | "incoming-edges"
  | "outgoing-edges";

/** Exact carry-forward result for one completed extraction map. */
export type V3ExtractionCutMapRefreshResult =
  | {
      status: "current" | "refreshed";
      completedMap: V3DecomposeCutMap;
      preflight: V3DecomposePreflight;
    }
  | {
      status: "reauthor";
      reason: V3ExtractionCutMapRefreshMismatch;
      locus: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

type SourceUnit = V3DecomposeCutMap["machine"]["sourceUnits"][number];

function firstArrayMismatch<T extends V3DecomposeEvidenceValue>(
  expected: readonly T[],
  actual: readonly T[],
): { index: number; evidence: V3DecomposeRefusalEvidence } {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= expected.length || index >= actual.length
      || canonicalDigest(expected[index]) !== canonicalDigest(actual[index])) {
      return {
        index,
        evidence: {
          expected: expected[index] ?? { kind: "absent" },
          actual: actual[index] ?? { kind: "absent" },
        },
      };
    }
  }
  return { index: 0, evidence: { expected: [...expected], actual: [...actual] } };
}

function headingGroupKeys(unit: SourceUnit): string[] {
  const { sourceLocator: locator } = unit;
  if (locator.kind !== "section") return [];
  const keys = locator.ancestry.map((ancestor, index) => canonicalDigest({
    artifact: locator.artifact,
    ancestry: locator.ancestry.slice(0, index),
    level: ancestor.level,
    headingSource: ancestor.headingSource,
  }));
  keys.push(canonicalDigest({
    artifact: locator.artifact,
    ancestry: locator.ancestry,
    level: locator.level,
    headingSource: locator.headingSource,
  }));
  return keys;
}

function repeatedHeadingGroups(units: readonly SourceUnit[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    const ownKey = headingGroupKeys(unit).at(-1);
    if (ownKey !== undefined) counts.set(ownKey, (counts.get(ownKey) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}

function stableRefreshMismatch(
  prior: V3DecomposeCutMap["machine"],
  current: V3DecomposeCutMap["machine"],
): V3ExtractionCutMapRefreshResult | null {
  if (prior.source.origin !== current.source.origin
    || prior.source.logicalBranch !== current.source.logicalBranch
    || prior.source.ref !== current.source.ref) {
    return {
      status: "reauthor",
      reason: "source-identity",
      locus: "machine.source",
      evidence: {
        expected: {
          origin: prior.source.origin,
          logicalBranch: prior.source.logicalBranch,
          ref: prior.source.ref,
        },
        actual: {
          origin: current.source.origin,
          logicalBranch: current.source.logicalBranch,
          ref: current.source.ref,
        },
      },
    };
  }
  if (canonicalDigest(prior.resultBase) !== canonicalDigest(current.resultBase)) {
    return {
      status: "reauthor",
      reason: "result-base",
      locus: "machine.resultBase",
      evidence: { expected: prior.resultBase, actual: current.resultBase },
    };
  }
  if (canonicalDigest(prior.planningProfile) !== canonicalDigest(current.planningProfile)) {
    return {
      status: "reauthor",
      reason: "planning-profile",
      locus: "machine.planningProfile",
      evidence: { expected: prior.planningProfile, actual: current.planningProfile },
    };
  }
  if (prior.sourceUnits.length !== current.sourceUnits.length) {
    const mismatch = firstArrayMismatch(prior.sourceUnits, current.sourceUnits);
    return {
      status: "reauthor",
      reason: "source-units",
      locus: `machine.sourceUnits.${mismatch.index}`,
      evidence: mismatch.evidence,
    };
  }
  for (let index = 0; index < prior.sourceUnits.length; index += 1) {
    const previous = prior.sourceUnits[index];
    const refreshed = current.sourceUnits[index];
    if (previous === undefined || refreshed === undefined
      || previous.sourceId !== refreshed.sourceId
      || previous.sourcePath !== refreshed.sourcePath
      || canonicalDigest(previous.sourceLocator) !== canonicalDigest(refreshed.sourceLocator)) {
      return {
        status: "reauthor",
        reason: "source-units",
        locus: `machine.sourceUnits.${index}`,
        evidence: {
          expected: previous ?? { kind: "absent" },
          actual: refreshed ?? { kind: "absent" },
        },
      };
    }
  }
  return null;
}

/**
 * Carry authored extraction choices across machine-only source refresh.
 *
 * @param completedMap - Previously authored canonical extraction map
 * @param currentPreflight - Fresh machine inventory from the current source
 * @returns Refreshed authority or one exact reauthoring boundary
 */
export function refreshV3ExtractionCutMap(
  completedMap: V3DecomposeCutMap,
  currentPreflight: V3DecomposePreflight,
): V3ExtractionCutMapRefreshResult {
  if (completedMap.authoring.shape !== "extraction") {
    return { status: "reauthor", reason: "completed-map", locus: "authoring.shape" };
  }
  const currentStarter = parseV3DecomposeStarterMap(currentPreflight.starterMap);
  if (currentStarter === null) {
    return { status: "reauthor", reason: "completed-map", locus: "machine" };
  }
  const prior = completedMap.machine;
  const current = currentStarter.machine;
  const stableMismatch = stableRefreshMismatch(prior, current);
  if (stableMismatch !== null) return stableMismatch;
  const ambiguousGroups = repeatedHeadingGroups(prior.sourceUnits);
  const allocationBySource = new Map(completedMap.authoring.sourceAllocations.map((allocation) => [
    allocation.sourceId,
    allocation,
  ]));
  for (let index = 0; index < prior.sourceUnits.length; index += 1) {
    const previous = prior.sourceUnits[index];
    const refreshed = current.sourceUnits[index];
    if (previous !== undefined && refreshed !== undefined
      && previous.contentDigest !== refreshed.contentDigest
      && headingGroupKeys(previous).some((key) => ambiguousGroups.has(key))) {
      return {
        status: "reauthor",
        reason: "source-unit-ambiguous",
        locus: `machine.sourceUnits.${index}.contentDigest`,
      };
    }
    if (previous !== undefined && refreshed !== undefined
      && previous.contentDigest !== refreshed.contentDigest
      && allocationBySource.get(previous.sourceId)?.disposition.kind === "target") {
      return {
        status: "reauthor",
        reason: "source-units",
        locus: `machine.sourceUnits.${index}.contentDigest`,
        evidence: {
          expected: previous.contentDigest,
          actual: refreshed.contentDigest,
        },
      };
    }
  }
  if (canonicalDigest(prior.incomingEdges) !== canonicalDigest(current.incomingEdges)) {
    const mismatch = firstArrayMismatch(prior.incomingEdges, current.incomingEdges);
    return {
      status: "reauthor",
      reason: "incoming-edges",
      locus: `machine.incomingEdges.${mismatch.index}`,
      evidence: mismatch.evidence,
    };
  }
  if (canonicalDigest(prior.outgoingEdges) !== canonicalDigest(current.outgoingEdges)) {
    const mismatch = firstArrayMismatch(prior.outgoingEdges, current.outgoingEdges);
    return {
      status: "reauthor",
      reason: "outgoing-edges",
      locus: `machine.outgoingEdges.${mismatch.index}`,
      evidence: mismatch.evidence,
    };
  }
  if (canonicalDigest(prior) === canonicalDigest(current)) {
    return { status: "current", completedMap, preflight: currentPreflight };
  }
  const decoded = decodeV3DecomposeCutMap({
    schemaVersion: 3,
    machine: current,
    authoring: completedMap.authoring,
  });
  if (decoded.status === "rejected") {
    return { status: "reauthor", reason: "completed-map", locus: decoded.issue.path };
  }
  return {
    status: "refreshed",
    completedMap: decoded.value,
    preflight: currentPreflight,
  };
}
