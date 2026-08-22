/** Exact-identity refresh for an authored extraction cut map. */

import { canonicalDigest } from "../canonical/canonical-json.js";
import type { V3DecomposePreflight } from "./decompose-v3-preflight.js";
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
  | { status: "reauthor"; reason: V3ExtractionCutMapRefreshMismatch; locus: string };

type SourceUnit = V3DecomposeCutMap["machine"]["sourceUnits"][number];

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
  if (prior.source.origin !== current.source.origin
    || prior.source.logicalBranch !== current.source.logicalBranch
    || prior.source.ref !== current.source.ref) {
    return { status: "reauthor", reason: "source-identity", locus: "machine.source" };
  }
  if (canonicalDigest(prior.resultBase) !== canonicalDigest(current.resultBase)) {
    return { status: "reauthor", reason: "result-base", locus: "machine.resultBase" };
  }
  if (canonicalDigest(prior.planningProfile) !== canonicalDigest(current.planningProfile)) {
    return { status: "reauthor", reason: "planning-profile", locus: "machine.planningProfile" };
  }
  if (prior.sourceUnits.length !== current.sourceUnits.length) {
    return { status: "reauthor", reason: "source-units", locus: "machine.sourceUnits" };
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
      };
    }
  }
  const ambiguousGroups = repeatedHeadingGroups(prior.sourceUnits);
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
  }
  const edgeBindings = [
    ["incoming-edges", "machine.incomingEdges", prior.incomingEdges, current.incomingEdges],
    ["outgoing-edges", "machine.outgoingEdges", prior.outgoingEdges, current.outgoingEdges],
  ] as const;
  for (const [reason, locus, previous, refreshed] of edgeBindings) {
    if (canonicalDigest(previous) !== canonicalDigest(refreshed)) {
      return { status: "reauthor", reason, locus };
    }
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
