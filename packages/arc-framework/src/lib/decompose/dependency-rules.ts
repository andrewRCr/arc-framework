/** Authored edge conservation independent of mutable recipient projection. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeDependencyFacts } from "./dependency-facts.js";
import type { DecomposeRefusal } from "./refusal.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

/** Reject origin retention in retirement, self dependencies, and invalid external edges at their authored loci. */
export function checkDecomposeDependencyRules(map: CutMap, facts: DecomposeDependencyFacts): DecomposeRefusal | undefined {
  const originNames = new Set<string>([map.machine.origin.slug, ...(facts.origin.aliases ?? [])]);
  if (map.authoring.shape !== "extraction") {
    for (const [index, entry] of map.authoring.incomingDispositions.entries()) {
      if (entry.disposition.kind !== "replace") continue;
      const retained = entry.disposition.replacementTargets.findIndex(target => originNames.has(target));
      if (retained >= 0) return decomposeMapRuleRefusal("origin-reference-remains",
        `authoring.incomingDispositions.${index}.disposition.replacementTargets.${retained}`,
        "Replace the retired origin with destination providers, or drop its incoming edge with a reason, then retry.");
    }
  }
  const self = map.authoring.internalEdges.findIndex(edge => edge.from === edge.to);
  if (self >= 0) return decomposeMapRuleRefusal("self-dependency", `authoring.internalEdges.${self}`,
    "Remove the self dependency or choose a different prerequisite destination, then retry.");
  return checkExternalEdges(map, facts, originNames);
}

function checkExternalEdges(map: CutMap, facts: DecomposeDependencyFacts, originNames: ReadonlySet<string>): DecomposeRefusal | undefined {
  const destinations = new Set(map.authoring.destinations.flatMap(destination => destination.kind === "new-member"
    ? [destination.slug] : destination.kind === "existing-home" && destination.target.kind === "work-unit" ? [destination.target.slug] : []));
  for (const home of facts.homes) {
    if (!map.authoring.destinations.some(destination => destination.destinationId === home.destinationId
      && destination.kind === "existing-home" && destination.target.kind === "work-unit")) continue;
    destinations.add(home.primary.reference.owner.name);
    for (const alias of home.primary.aliases ?? []) destinations.add(alias);
  }
  for (const [index, edge] of map.authoring.externalEdges.entries()) {
    const locus = `authoring.externalEdges.${index}.to`;
    if (destinations.has(edge.to)) return decomposeMapRuleRefusal("redundant-external-edge", locus,
      "Express an edge between destination work units as an internal edge instead, then retry.");
    if (map.authoring.shape !== "extraction" && originNames.has(edge.to)) return decomposeMapRuleRefusal("retiring-origin-target", locus,
      "Remove the edge to the retiring origin or choose a surviving provider, then retry.");
    if (!facts.externalTargets.has(edge.to) && !(map.authoring.shape === "extraction" && originNames.has(edge.to))) {
      return decomposeMapRuleRefusal("unknown-external-target", locus,
        "Drop the external edge or choose a provider that resolves to a live or completed work unit, then retry.");
    }
  }
  return undefined;
}
