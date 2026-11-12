/** Source-identity and repeated-heading boundaries for carrying cut authoring. */
import type { CutMap } from "./cut-map-schema.js";
import type { CutMapMachine } from "./cut-map-machine.js";
import type { DecomposeRevisionMismatch } from "./revision-starter-report.js";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";

type SourceUnit = CutMapMachine["sourceUnits"][number];

/** Locate the first different canonical value, including an added or removed entry. */
export function firstRebindDifference(prior: readonly unknown[], current: readonly unknown[]): number | null {
  for (let index = 0; index < Math.max(prior.length, current.length); index++) {
    if (index >= prior.length || index >= current.length || canonicalDigest(prior[index]) !== canonicalDigest(current[index])) return index;
  }
  return null;
}

/** Require stable unit identities, allowing only unique dropped or retained content to change. */
export function decomposeRebindUnitMismatch(map: CutMap, machine: CutMapMachine): DecomposeRevisionMismatch | undefined {
  const prior = map.machine.sourceUnits, current = machine.sourceUnits;
  const identity = unitIdentityMismatch(prior, current);
  if (identity !== undefined) return identity;
  const repeated = repeatedHeadingGroups(prior);
  const allocations = new Map(map.authoring.sourceAllocations.map(allocation => [allocation.sourceId, allocation]));
  for (const [index, unit] of prior.entries()) {
    if (current[index]?.contentDigest === unit.contentDigest) continue;
    const locus = `machine.sourceUnits.${index}.contentDigest`;
    if (headingGroupKeys(unit).some(key => repeated.has(key))) return { reason: "source-unit-ambiguous", locus };
    if (allocations.get(unit.sourceId)?.disposition.kind === "target") return { reason: "source-units", locus };
  }
  return undefined;
}

function unitIdentityMismatch(prior: readonly SourceUnit[], current: readonly SourceUnit[]): DecomposeRevisionMismatch | undefined {
  if (prior.length !== current.length) return { reason: "source-units",
    locus: `machine.sourceUnits.${firstRebindDifference(prior, current) ?? 0}` };
  for (const [index, unit] of prior.entries()) {
    const refreshed = current[index];
    if (refreshed === undefined || unit.sourceId !== refreshed.sourceId
      || canonicalDigest(unit.sourceLocator) !== canonicalDigest(refreshed.sourceLocator)) {
      return { reason: "source-units", locus: `machine.sourceUnits.${index}` };
    }
  }
  return undefined;
}

function headingGroupKeys(unit: SourceUnit): string[] {
  const locator = unit.sourceLocator;
  if (locator.kind !== "section") return [];
  const keys = locator.ancestry.map((ancestor, index) => canonicalDigest({ artifact: locator.artifact,
    ancestry: locator.ancestry.slice(0, index), level: ancestor.level, headingSource: ancestor.headingSource }));
  keys.push(canonicalDigest({ artifact: locator.artifact, ancestry: locator.ancestry,
    level: locator.level, headingSource: locator.headingSource }));
  return keys;
}

function repeatedHeadingGroups(units: readonly SourceUnit[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const unit of units) {
    const own = headingGroupKeys(unit).at(-1);
    if (own !== undefined) counts.set(own, (counts.get(own) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
}
