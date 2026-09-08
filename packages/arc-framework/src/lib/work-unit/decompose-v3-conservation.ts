/** Pure pre-creation conservation planning for v3 decomposition. */

import { canonicalDigest, sortByCanonicalBytes } from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import {
  decodeV3DecomposeCutMap,
  type V3DecomposeCutMap,
} from "./decompose-v3-schema.js";
import {
  revalidateV3DecomposeCutMapBinding,
  type V3DecomposePreflight,
} from "./decompose-v3-preflight.js";
import type { V3DecomposeRefusalEvidence } from "./decompose-v3-refusal.js";
import { replaceDependencySlot } from "./decompose-sweep.js";

export interface V3DecomposeLiveWorkUnit {
  slug: string;
  writablePath?: string;
  dependsOn: string[];
}

export interface V3DecomposeConservationInput {
  completedMap: V3DecomposeCutMap;
  currentPreflight: V3DecomposePreflight;
  originDependsOn: string[];
  workUnits: V3DecomposeLiveWorkUnit[];
  retiringArtifacts?: Array<{ path: string; byteLength: number }>;
}

export interface V3ValidatedDependencyEdit {
  kind: "incoming" | "outgoing" | "internal";
  edgeId: string;
  destinationId: string | null;
  dependent: string;
  writablePath: string | null;
  beforeTargets: string[];
  afterTargets: string[];
}

export type V3DecomposeConservationStage =
  | "decoded-map"
  | "machine-binding"
  | "live-conservation"
  | "ownership"
  | "dependency-projection";

export interface V3DecomposeConservationRefusal {
  stage: V3DecomposeConservationStage;
  reason: string;
  locus: string;
  evidence?: V3DecomposeRefusalEvidence;
}

export type V3DecomposeConservationResult =
  | {
    status: "validated";
    allocations: V3DecomposeCutMap["authoring"]["sourceAllocations"];
    dependencyEdits: V3ValidatedDependencyEdit[];
  }
  | { status: "refused"; refusal: V3DecomposeConservationRefusal };

type V3SourceTargetLocator = Extract<
  V3DecomposeCutMap["authoring"]["sourceAllocations"][number]["disposition"],
  { kind: "target" }
>["targetLocator"];

function refuse(
  stage: V3DecomposeConservationStage,
  reason: string,
  locus: string,
  evidence?: V3DecomposeRefusalEvidence,
): V3DecomposeConservationResult {
  return {
    status: "refused",
    refusal: { stage, reason, locus, ...(evidence === undefined ? {} : { evidence }) },
  };
}

function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function artifactBelongsToWorkUnit(artifact: string, slug: string): boolean {
  return artifact.endsWith(`-${slug}.md`)
    || artifact === `spec-${slug}-prd.md`
    || artifact === `spec-${slug}-rfc.md`;
}

function locatorBelongsToDestination(
  destination: V3DecomposeCutMap["authoring"]["destinations"][number],
  locator: V3SourceTargetLocator,
): boolean {
  const artifact = locator.artifact;
  if (destination.kind === "new-member") {
    return artifactBelongsToWorkUnit(artifact, destination.slug);
  }
  if (destination.kind === "cohort-coordination") {
    return artifact === `cohort-${destination.cohort.split("/").at(-1)}.md`;
  }
  if (destination.target.kind === "document") {
    return destination.target.path.split("/").at(-1) === artifact;
  }
  if (destination.target.kind === "draft-block") {
    return canonicalDigest(destination.target.locator) === canonicalDigest(locator);
  }
  return artifactBelongsToWorkUnit(artifact, destination.target.slug);
}

function destinationIdentity(
  destination: V3DecomposeCutMap["authoring"]["destinations"][number],
): string {
  if (destination.kind === "new-member") return `work-unit:${destination.slug}`;
  if (destination.kind === "cohort-coordination") return `cohort:${destination.cohort}`;
  if (destination.target.kind === "work-unit") return `work-unit:${destination.target.slug}`;
  if (destination.target.kind === "document") return `document:${destination.target.path}`;
  return `draft-block:${destination.target.slug}:${canonicalDigest(destination.target.locator)}`;
}

/**
 * Validate exact allocation coverage and project every dependency disposition
 * before any mutable repository locus exists.
 *
 * @param input - Completed map, freshly bound preflight, and complete live dependency facts.
 * @returns One closed ordered projection or the first deterministic refusal.
 */
export function validateV3DecomposeConservation(
  input: V3DecomposeConservationInput,
): V3DecomposeConservationResult {
  const decoded = decodeV3DecomposeCutMap(input.completedMap);
  if (decoded.status === "rejected") {
    return refuse("decoded-map", decoded.issue.code, decoded.issue.path);
  }
  const binding = revalidateV3DecomposeCutMapBinding(decoded.value, input.currentPreflight);
  if (binding.status === "stale") {
    return refuse("machine-binding", binding.reason, binding.locus, binding.evidence);
  }
  const extraction = decoded.value.authoring.shape === "extraction";

  if (!extraction && input.retiringArtifacts !== undefined) {
    const coveredPaths = new Set(decoded.value.machine.sourceUnits.map(({ sourcePath }) => sourcePath));
    const uncovered = [...input.retiringArtifacts]
      .sort((left, right) => compareUtf8(left.path, right.path))
      .find(({ path, byteLength }) =>
        path !== input.currentPreflight.sourceOriginPath
        && path.endsWith(".md")
        && byteLength > 0
        && !coveredPaths.has(path));
    if (uncovered !== undefined) {
      return refuse("live-conservation", "uncovered-retirement-content", uncovered.path);
    }
  }

  const workUnits = new Map<string, V3DecomposeLiveWorkUnit>();
  for (const [index, record] of input.workUnits.entries()) {
    if (workUnits.has(record.slug)) {
      return refuse("live-conservation", "duplicate-live-work-unit", `workUnits.${index}.slug`);
    }
    workUnits.set(record.slug, record);
  }
  const origin = decoded.value.machine.source.origin;
  const liveIncoming = sortByCanonicalBytes(
    input.workUnits.filter(({ dependsOn }) => dependsOn.includes(origin)).map(({ slug }) => slug),
  );
  const expectedIncoming = sortByCanonicalBytes(
    decoded.value.machine.incomingEdges.map(({ dependent }) => dependent),
  );
  if (!sameTargets(liveIncoming, expectedIncoming)) {
    const index = liveIncoming.findIndex((slug, candidateIndex) => slug !== expectedIncoming[candidateIndex]);
    return refuse(
      "live-conservation",
      "incoming-edge-set-changed",
      index >= 0 ? `workUnits.${liveIncoming[index]}.dependsOn` : "machine.incomingEdges",
      { expected: expectedIncoming, actual: liveIncoming },
    );
  }
  const liveOutgoing = sortByCanonicalBytes(input.originDependsOn);
  const expectedOutgoing = sortByCanonicalBytes(
    decoded.value.machine.outgoingEdges.map(({ prerequisite }) => prerequisite),
  );
  if (new Set(input.originDependsOn).size !== input.originDependsOn.length
    || !sameTargets(liveOutgoing, expectedOutgoing)) {
    return refuse(
      "live-conservation",
      "outgoing-edge-set-changed",
      "originDependsOn",
      { expected: expectedOutgoing, actual: liveOutgoing },
    );
  }

  const destinations = new Map(
    decoded.value.authoring.destinations.map((destination) => [destination.destinationId, destination]),
  );
  const destinationIdentities = new Set<string>();
  for (const [index, destination] of decoded.value.authoring.destinations.entries()) {
    const identity = destinationIdentity(destination);
    if (destinationIdentities.has(identity)) {
      return refuse("ownership", "duplicate-destination-identity", `authoring.destinations.${index}`);
    }
    if ((destination.kind === "new-member" && destination.slug === origin)
      || (destination.kind === "existing-home"
        && destination.target.kind === "work-unit"
        && destination.target.slug === origin)) {
      return refuse("ownership", "retiring-origin-destination", `authoring.destinations.${index}`);
    }
    destinationIdentities.add(identity);
  }
  for (const [index, allocation] of decoded.value.authoring.sourceAllocations.entries()) {
    const destination = allocation.disposition.kind === "target"
      ? destinations.get(allocation.disposition.destinationId)
      : undefined;
    if (allocation.disposition.kind === "target" && destination === undefined) {
      return refuse(
        "ownership",
        "unknown-allocation-destination",
        `authoring.sourceAllocations.${index}.disposition.destinationId`,
      );
    }
    if (allocation.disposition.kind === "target"
      && destination !== undefined
      && !locatorBelongsToDestination(destination, allocation.disposition.targetLocator)) {
      return refuse(
        "ownership",
        "incompatible-allocation-locator",
        `authoring.sourceAllocations.${index}.disposition.targetLocator`,
      );
    }
    const ownershipMatches = allocation.ownership === "cohort-shared"
      ? destination?.kind === "cohort-coordination"
      : destination?.kind !== "cohort-coordination";
    if (!ownershipMatches) {
      return refuse(
        "ownership",
        "incompatible-source-ownership",
        `authoring.sourceAllocations.${index}.ownership`,
      );
    }
  }

  const projectedTargets = new Map<string, {
    destinationId: string | null;
    writablePath: string | null;
    targets: string[];
    requiresWritablePath: boolean;
  }>();
  for (const record of input.workUnits) {
    projectedTargets.set(record.slug, {
      destinationId: null,
      writablePath: record.writablePath ?? null,
      targets: [...record.dependsOn],
      requiresWritablePath: true,
    });
  }
  const permittedRecipients = new Map<string, string>();
  for (const destination of decoded.value.authoring.destinations) {
    if (destination.kind === "new-member") {
      if (workUnits.has(destination.slug)) {
        return refuse("ownership", "occupied-new-member", `authoring.destinations.${destination.destinationId}`);
      }
      permittedRecipients.set(destination.slug, destination.destinationId);
      projectedTargets.set(destination.slug, {
        destinationId: destination.destinationId,
        writablePath: null,
        targets: [],
        requiresWritablePath: false,
      });
    } else if (destination.kind === "existing-home" && destination.target.kind === "work-unit") {
      const live = workUnits.get(destination.target.slug);
      if (live !== undefined) {
        permittedRecipients.set(destination.target.slug, destination.destinationId);
        const projected = projectedTargets.get(destination.target.slug);
        if (projected !== undefined) projected.destinationId = destination.destinationId;
      }
    }
  }
  const contributions: Array<
    | {
      kind: "incoming";
      edgeId: string;
      dependent: string;
      replacements: string[];
      locus: string;
    }
    | {
      kind: "outgoing" | "internal";
      edgeId: string;
      dependent: string;
      prerequisite: string;
      locus: string;
    }
  > = [];
  for (const [index, edge] of decoded.value.machine.incomingEdges.entries()) {
    const live = workUnits.get(edge.dependent);
    if (live === undefined) {
      return refuse("dependency-projection", "missing-dependent", `machine.incomingEdges.${index}.dependent`);
    }
    if (live.writablePath === undefined || !isManagedPath(live.writablePath)) {
      return refuse("dependency-projection", "unwritable-dependent", `workUnits.${edge.dependent}.writablePath`);
    }
    if (!sameTargets(
      sortByCanonicalBytes(live.dependsOn),
      sortByCanonicalBytes(edge.currentTargets),
    )) {
      return refuse(
        "dependency-projection",
        "stale-dependent",
        live.writablePath,
        {
          expected: sortByCanonicalBytes(edge.currentTargets),
          actual: sortByCanonicalBytes(live.dependsOn),
        },
      );
    }
    const originIndex = live.dependsOn.indexOf(decoded.value.machine.source.origin);
    if (originIndex < 0) {
      return refuse("dependency-projection", "missing-origin-slot", live.writablePath);
    }
    const authored = decoded.value.authoring.incomingDispositions[index];
    if (authored === undefined || authored.edgeId !== edge.edgeId) {
      return refuse("live-conservation", "missing-incoming-disposition", `authoring.incomingDispositions.${index}`);
    }
    const replacements = authored.disposition.kind === "replace"
      ? authored.disposition.replacementTargets
      : [];
    for (const [targetIndex, target] of replacements.entries()) {
      const locus = `authoring.incomingDispositions.${index}.disposition.replacementTargets.${targetIndex}`;
      if (target === decoded.value.machine.source.origin && !extraction) {
        return refuse("dependency-projection", "origin-reference-remains", locus);
      }
      if (target !== decoded.value.machine.source.origin && !permittedRecipients.has(target)) {
        return refuse("dependency-projection", "unknown-dependency-recipient", locus);
      }
    }
    contributions.push({
      kind: "incoming",
      edgeId: edge.edgeId,
      dependent: edge.dependent,
      replacements: [...replacements],
      locus: `authoring.incomingDispositions.${index}.disposition`,
    });
  }

  for (const [index, edge] of decoded.value.machine.outgoingEdges.entries()) {
    const authored = decoded.value.authoring.outgoingDispositions[index];
    if (authored === undefined || authored.edgeId !== edge.edgeId) {
      return refuse("live-conservation", "missing-outgoing-disposition", `authoring.outgoingDispositions.${index}`);
    }
    if (authored.disposition.kind === "drop") continue;
    for (const [targetIndex, target] of authored.disposition.targets.entries()) {
      if (!permittedRecipients.has(target)) {
        return refuse(
          "dependency-projection",
          "unknown-dependency-recipient",
          `authoring.outgoingDispositions.${index}.disposition.targets.${targetIndex}`,
        );
      }
      contributions.push({
        kind: "outgoing",
        edgeId: edge.edgeId,
        dependent: target,
        prerequisite: edge.prerequisite,
        locus: `authoring.outgoingDispositions.${index}.disposition.targets.${targetIndex}`,
      });
    }
  }
  const newMembers = new Set(
    decoded.value.authoring.destinations.flatMap((destination) =>
      destination.kind === "new-member" ? [destination.slug] : []),
  );
  for (const [index, edge] of decoded.value.authoring.internalEdges.entries()) {
    const locus = `authoring.internalEdges.${index}`;
    if (!newMembers.has(edge.from)) {
      return refuse("dependency-projection", "unknown-internal-dependent", `${locus}.from`);
    }
    if (!newMembers.has(edge.to)) {
      return refuse("dependency-projection", "unknown-internal-prerequisite", `${locus}.to`);
    }
    if (edge.from === edge.to) {
      return refuse("dependency-projection", "self-dependency", locus);
    }
    if (!permittedRecipients.has(edge.from)) {
      return refuse("dependency-projection", "unknown-dependency-recipient", `${locus}.from`);
    }
    contributions.push({
      kind: "internal",
      edgeId: canonicalDigest({ schemaVersion: 3, kind: "internal", from: edge.from, to: edge.to }),
      dependent: edge.from,
      prerequisite: edge.to,
      locus,
    });
  }
  contributions.sort((left, right) =>
    compareUtf8(left.edgeId, right.edgeId) || compareUtf8(left.dependent, right.dependent));
  const dependencyEdits: V3ValidatedDependencyEdit[] = [];
  const touchedDependents = new Map<string, string>();
  for (const contribution of contributions) {
    const projected = projectedTargets.get(contribution.dependent);
    if (projected === undefined) {
      return refuse("dependency-projection", "unknown-dependency-recipient", contribution.locus);
    }
    if (projected.requiresWritablePath
      && (projected.writablePath === null || !isManagedPath(projected.writablePath))) {
      return refuse("dependency-projection", "unwritable-dependent", contribution.dependent);
    }
    const beforeTargets = [...projected.targets];
    let afterTargets: string[];
    if (contribution.kind === "incoming") {
      afterTargets = replaceDependencySlot(
        beforeTargets,
        decoded.value.machine.source.origin,
        contribution.replacements,
      );
    } else {
      if (beforeTargets.includes(contribution.prerequisite)) {
        return refuse(
          "dependency-projection",
          "unchanged-dependency-slot",
          projected.writablePath ?? contribution.dependent,
        );
      }
      afterTargets = [...beforeTargets, contribution.prerequisite];
    }
    if (sameTargets(beforeTargets, afterTargets)) {
      if (extraction && contribution.kind === "incoming") continue;
      return refuse(
        "dependency-projection",
        "unchanged-dependency-slot",
        projected.writablePath ?? contribution.dependent,
      );
    }
    projected.targets = afterTargets;
    touchedDependents.set(contribution.dependent, contribution.locus);
    dependencyEdits.push({
      kind: contribution.kind,
      edgeId: contribution.edgeId,
      destinationId: projected.destinationId,
      dependent: contribution.dependent,
      writablePath: projected.writablePath,
      beforeTargets,
      afterTargets,
    });
  }
  for (const [dependent, locus] of touchedDependents) {
    if (!extraction
      && projectedTargets.get(dependent)?.targets.includes(decoded.value.machine.source.origin) === true) {
      return refuse("dependency-projection", "origin-reference-remains", locus);
    }
  }

  return {
    status: "validated",
    allocations: structuredClone(decoded.value.authoring.sourceAllocations),
    dependencyEdits,
  };
}
