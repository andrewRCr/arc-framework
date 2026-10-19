/** Pure allocation ownership and destination-identity conservation over cut maps. */
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeRefusal } from "./refusal.js";
import type { DecomposeHome } from "./check-homes.js";
import { canonicalDigest } from "../kernel/canonical/canonical-json.js";
import { companionArtifactName } from "../store/companion-name.js";
import { decomposeMapRuleRefusal } from "./map-rule-refusal.js";

type Destination = CutMap["authoring"]["destinations"][number];
type Locator = CutMap["machine"]["sourceUnits"][number]["sourceLocator"];

/** Check destination identity, locator ownership, and source ownership without reading target content. */
export function checkDecomposeAllocations(map: CutMap, homes: readonly DecomposeHome[] = []): DecomposeRefusal | undefined {
  return checkDestinationIdentities(map, homes) ?? checkAllocationOwnership(map, homes);
}

function checkDestinationIdentities(map: CutMap, homes: readonly DecomposeHome[]): DecomposeRefusal | undefined {
  const identities = new Set<string>();
  for (const [index, destination] of map.authoring.destinations.entries()) {
    const home = homes.find(candidate => candidate.destinationId === destination.destinationId);
    const identity = destinationIdentity(destination, home);
    const locus = `authoring.destinations.${index}`;
    if (identities.has(identity)) return decomposeMapRuleRefusal("duplicate-destination-identity", locus,
      "Keep one destination per work unit, cohort, document, or draft-block locator in the map, then retry.");
    identities.add(identity);
    if ((destination.kind === "new-member" && destination.slug === map.machine.origin.slug)
      || (destination.kind === "existing-home" && destination.target.kind === "work-unit"
        && (destination.target.slug === map.machine.origin.slug || home?.primary.reference.owner.name === map.machine.origin.slug))) {
      return decomposeMapRuleRefusal("retiring-origin-destination", locus,
        "Choose a destination other than the origin; retain extraction scope with retained-origin instead, then retry.");
    }
  }
  return undefined;
}

function checkAllocationOwnership(map: CutMap, homes: readonly DecomposeHome[]): DecomposeRefusal | undefined {
  for (const [index, allocation] of map.authoring.sourceAllocations.entries()) {
    const target = allocation.disposition;
    const destination = target.kind === "target" ? map.authoring.destinations.find(candidate => candidate.destinationId === target.destinationId) : undefined;
    const locus = `authoring.sourceAllocations.${index}`;
    if (target.kind === "target" && destination === undefined) return decomposeMapRuleRefusal("authoring-identity", `${locus}.disposition.destinationId`,
      "Name a declared destinationId for this allocation, then retry.");
    const home = homes.find(candidate => candidate.destinationId === destination?.destinationId);
    if (target.kind === "target" && destination !== undefined && !locatorBelongs(map, destination, target.targetLocator, home)) {
      return decomposeMapRuleRefusal("incompatible-allocation-locator", `${locus}.disposition.targetLocator`,
        "Target an artifact belonging to the selected destination and its profile, or the exact declared draft-block locator, then retry.");
    }
    const ownershipMatches = allocation.ownership === "cohort-shared"
      ? destination?.kind === "cohort-coordination" : destination?.kind !== "cohort-coordination";
    if (!ownershipMatches) return decomposeMapRuleRefusal("incompatible-source-ownership", `${locus}.ownership`,
      "Use cohort-shared ownership only for cohort coordination, and destination-owned for all other dispositions, then retry.");
  }
  return undefined;
}

function destinationIdentity(destination: Destination, home?: DecomposeHome): string {
  if (destination.kind === "new-member") return `work-unit:${destination.slug}`;
  if (destination.kind === "cohort-coordination") return `cohort:${destination.cohort}`;
  const target = destination.target;
  if (target.kind === "document") return `document:${target.path}`;
  const name = home?.primary.reference.owner.name ?? target.slug;
  return target.kind === "work-unit" ? `work-unit:${name}` : `draft-block:${name}:${canonicalDigest(target.locator)}`;
}

function locatorBelongs(map: CutMap, destination: Destination, locator: Locator, home?: DecomposeHome): boolean {
  const artifact = locator.artifact;
  if (destination.kind === "new-member") {
    const roles = map.machine.planningProfile.kind === "draft" ? ["draft"]
      : map.machine.planningProfile.kind === "single-spec" ? ["spec"] : ["spec-prd", "spec-rfc"];
    return [...roles, "tasks", "notes"].some(role => companionArtifactName(destination.slug, role) === artifact);
  }
  if (destination.kind === "cohort-coordination") return artifact === companionArtifactName(destination.cohort.split("/").at(-1) ?? destination.cohort, "cohort");
  const target = destination.target;
  if (target.kind === "document") return artifact === target.path.split("/").at(-1);
  if (target.kind === "draft-block") return canonicalDigest(locator) === canonicalDigest(target.locator);
  return [target.slug, home?.primary.reference.owner.name].some(slug => slug !== undefined &&
    (artifact.endsWith(`-${slug}.md`) || artifact === companionArtifactName(slug, "spec-prd") || artifact === companionArtifactName(slug, "spec-rfc")));
}
