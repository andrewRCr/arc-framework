/** Pure destination-state validation for v3 extraction finish. */

import { posix } from "node:path";

import {
  canonicalDigest,
  digestBytes,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { parseMetaRecord } from "../active/meta-reader.js";
import { resolveArcPath } from "../layout/index.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import type { V3DecomposePreflight } from "./decompose-v3-preflight.js";
import {
  v3DecomposeByteEvidence,
  type V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
import type {
  V3RepositoryPlanState,
  V3RepositoryPlanTree,
} from "./decompose-v3-repository-plan.js";
import type { V3DecomposeCutMap } from "./decompose-v3-schema.js";
import { replaceDependencySlot } from "./decompose-sweep.js";
import { v3CohortDocumentPath } from "./decompose-v3-topology.js";

const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

/** One exact destination state proven on the configured integration base. */
export interface V3ExtractionDestinationState {
  path: string;
  mode: "100644" | "100755";
  contentDigest: CanonicalDigest;
}

/** Immutable base proof consumed by later source-thinning planning. */
export interface V3ExtractionDestinationProof {
  baseRef: string;
  baseHead: string;
  destinations: V3ExtractionDestinationState[];
}

/** Exact source and destination facts retained for thinning planning. */
export interface V3ExtractionFinishPreparation {
  completedMap: V3DecomposeCutMap;
  currentPreflight: V3DecomposePreflight;
  sourceTree: V3RepositoryPlanTree;
  proof: V3ExtractionDestinationProof;
}

/** Git-backed proof result returned before any source mutation. */
export type GitV3ExtractionDestinationProofResult =
  | { status: "proven"; preparation: V3ExtractionFinishPreparation }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

/** Pure destination-state validation result. */
export type V3ExtractionDestinationValidationResult =
  | { status: "proven"; destinations: V3ExtractionDestinationState[] }
  | {
      status: "refused";
      reason: string;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

/** Semantic authority needed to validate owner-authored extraction destinations. */
export interface V3ExtractionDestinationValidationAuthority {
  completedMap: V3DecomposeCutMap;
  blobs: ReadonlyArray<{ contentDigest: CanonicalDigest; bytes: Uint8Array }>;
  expectedRoadmap: Uint8Array;
}

function byteComparisonEvidence(
  expected: CanonicalDigest,
  actual: Uint8Array,
): V3DecomposeRefusalEvidence {
  return {
    expected: { contentDigest: expected },
    actual: v3DecomposeByteEvidence(actual),
  };
}

function delimitedBlock(text: string, start: string, end: string): string | null {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return null;
  const endIndex = text.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? null : text.slice(startIndex, endIndex + end.length);
}

type DestinationMutation = ValidatedDecomposePlan["mutations"][number];
type ComposedDestinationMutation = Extract<DestinationMutation, { kind: "composed" }>;
type PlannedFileState = Extract<DestinationMutation["after"], { kind: "file" }>;
type ObservedObjectState = Exclude<V3RepositoryPlanState, { kind: "absent" }>;
type DestinationRefusal = Extract<V3ExtractionDestinationValidationResult, { status: "refused" }>;

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function validateBasicDestinationState(
  mutation: DestinationMutation,
  tree: V3RepositoryPlanTree,
  requireExactBytes: boolean,
): DestinationRefusal | {
  status: "ready";
  after: PlannedFileState;
  observed: ObservedObjectState;
} {
  if (mutation.after.kind !== "file") {
    return { status: "refused", reason: "destination-plan-state", locus: mutation.path };
  }
  const observed = tree[mutation.path];
  if (observed === undefined || observed.kind === "absent") {
    return { status: "refused", reason: "destination-missing", locus: mutation.path };
  }
  if (observed.objectKind !== "blob") {
    return {
      status: "refused",
      reason: "destination-object-kind",
      locus: mutation.path,
      evidence: { expected: "blob", actual: observed.objectKind },
    };
  }
  if (observed.mode !== mutation.after.mode) {
    return {
      status: "refused",
      reason: "destination-mode",
      locus: mutation.path,
      evidence: { expected: mutation.after.mode, actual: observed.mode },
    };
  }
  if (requireExactBytes && digestBytes(observed.bytes) !== mutation.after.contentDigest) {
    return {
      status: "refused",
      reason: "destination-bytes",
      locus: mutation.path,
      evidence: byteComparisonEvidence(mutation.after.contentDigest, observed.bytes),
    };
  }
  return { status: "ready", after: mutation.after, observed };
}

function validateProjectedContent(
  mutation: ComposedDestinationMutation,
  observed: ObservedObjectState,
): DestinationRefusal | null {
  const projections = mutation.contributors.flatMap((contributor) =>
    contributor.kind === "content" ? contributor.sourceProjection : []);
  if (projections.length === 0) return null;
  const artifact = posix.basename(mutation.path);
  const scan = scanV3DecomposeContent(artifact, observed.bytes);
  if (scan.status === "rejected") {
    return { status: "refused", reason: "destination-scan", locus: mutation.path };
  }
  for (const projection of projections) {
    const resolution = resolveV3DecomposeContentLocator(
      scan.units,
      projection.targetLocator,
      artifact,
    );
    if (resolution.status === "rejected") {
      return { status: "refused", reason: "destination-locator", locus: mutation.path };
    }
  }
  return null;
}

function validateMetaContributors(
  mutation: ComposedDestinationMutation,
  observed: ObservedObjectState,
  expectedBytes: Uint8Array | undefined,
): DestinationRefusal | null {
  const metaContributor = mutation.contributors.find((contributor) =>
    contributor.kind === "content"
    && contributor.destinationKind === "new-member"
    && contributor.artifactRole === "meta");
  const dependencyContributor = mutation.contributors.find(({ kind }) => kind === "dependency");
  if ((metaContributor === undefined && dependencyContributor === undefined)
    || expectedBytes === undefined) return null;
  const expectedText = decodeUtf8(expectedBytes);
  const observedText = decodeUtf8(observed.bytes);
  if (expectedText === null || observedText === null) {
    return { status: "refused", reason: "destination-meta", locus: mutation.path };
  }
  try {
    const expectedMeta = parseMetaRecord(expectedText);
    const observedMeta = parseMetaRecord(observedText);
    const fixed = metaContributor === undefined
      ? ["dependsOn"] as const
      : ["state", "owner", "branch", "workClass", "priority", "cohort", "dependsOn", "origin", "design"] as const;
    const differingField = fixed.find((field) =>
      canonicalDigest(expectedMeta[field]) !== canonicalDigest(observedMeta[field]));
    return differingField === undefined
      ? null
      : {
          status: "refused",
          reason: "destination-meta",
          locus: mutation.path,
          evidence: {
            expected: { field: differingField, value: expectedMeta[differingField] },
            actual: { field: differingField, value: observedMeta[differingField] },
          },
        };
  } catch {
    return { status: "refused", reason: "destination-meta", locus: mutation.path };
  }
}

function validateComposedDestinationState(
  mutation: ComposedDestinationMutation,
  observed: ObservedObjectState,
  after: PlannedFileState,
  blobBytes: ReadonlyMap<CanonicalDigest, Uint8Array>,
): DestinationRefusal | null {
  const projected = validateProjectedContent(mutation, observed);
  if (projected !== null) return projected;
  const meta = validateMetaContributors(mutation, observed, blobBytes.get(after.contentDigest));
  if (meta !== null) return meta;
  const semanticallyOwned = mutation.contributors.some((contributor) =>
    contributor.kind === "content" && contributor.sourceProjection.length > 0)
    || mutation.contributors.some((contributor) =>
      contributor.kind === "dependency"
      || (contributor.kind === "content"
        && contributor.destinationKind === "new-member"
        && contributor.artifactRole === "meta"));
  if (!semanticallyOwned
    && mutation.contributors.every(({ kind }) => kind !== "topology")
    && digestBytes(observed.bytes) !== after.contentDigest) {
    return {
      status: "refused",
      reason: "destination-bytes",
      locus: mutation.path,
      evidence: byteComparisonEvidence(after.contentDigest, observed.bytes),
    };
  }
  return null;
}

function validateDependencyClaim(
  map: V3DecomposeCutMap,
  tree: V3RepositoryPlanTree,
  index: number,
): DestinationRefusal | null {
  const edge = map.machine.incomingEdges[index];
  const authored = map.authoring.incomingDispositions[index];
  if (edge === undefined || authored === undefined) {
    return { status: "refused", reason: "dependency-claim", locus: edge?.dependent };
  }
  const expected = authored.disposition.kind === "replace"
    ? replaceDependencySlot(
      edge.currentTargets,
      map.machine.source.origin,
      authored.disposition.replacementTargets,
    )
    : replaceDependencySlot(edge.currentTargets, map.machine.source.origin, []);
  const matches = Object.entries(tree).filter(([path, state]) =>
    posix.basename(path) === `meta-${edge.dependent}.md`
    && state.kind === "object"
    && state.objectKind === "blob");
  const match = matches[0];
  if (matches.length !== 1 || match === undefined || match[1].kind === "absent") {
    return { status: "refused", reason: "dependency-claim", locus: edge.dependent };
  }
  const text = decodeUtf8(match[1].bytes);
  if (text === null) return { status: "refused", reason: "dependency-claim", locus: match[0] };
  try {
    const actual = parseMetaRecord(text).dependsOn;
    const expectedSet = sortByCanonicalBytes(expected);
    const actualSet = sortByCanonicalBytes(actual);
    return canonicalDigest(actualSet) === canonicalDigest(expectedSet)
      ? null
      : {
          status: "refused",
          reason: "dependency-claim",
          locus: match[0],
          evidence: { expected: expectedSet, actual: actualSet },
        };
  } catch {
    return { status: "refused", reason: "dependency-claim", locus: match[0] };
  }
}

function validateDependencyClaims(
  plan: ValidatedDecomposePlan,
  map: V3DecomposeCutMap,
  tree: V3RepositoryPlanTree,
): DestinationRefusal | null {
  const composedDependents = new Set(plan.mutations.flatMap((mutation) =>
    mutation.kind === "composed"
      ? mutation.contributors.flatMap((contributor) =>
          contributor.kind === "dependency" ? [contributor.dependent] : [])
      : []));
  for (const [index, edge] of map.machine.incomingEdges.entries()) {
    if (composedDependents.has(edge.dependent)) continue;
    const refusal = validateDependencyClaim(map, tree, index);
    if (refusal !== null) return refusal;
  }
  return null;
}

function cohortClaims(map: V3DecomposeCutMap): string[] {
  const placement = map.authoring.placement;
  if (placement.kind === "direct-member") return [];
  if (placement.kind === "subcohort") {
    return [placement.cohort.split("/")[0] ?? "", placement.cohort];
  }
  return [placement.kind === "at-cap" ? placement.parent : placement.cohort];
}

function cohortDocumentFacts(text: string, cohort: string): {
  leaf: string | undefined;
  parent: string | null;
  purpose: string | undefined;
  parentLines: string[];
  identity: string | undefined;
} {
  const segments = cohort.split("/");
  return {
    leaf: segments.at(-1),
    parent: segments.length === 2 ? segments[0] ?? null : null,
    purpose: /^\*\*Purpose:\*\*\s*(.+)$/mu.exec(text)?.[1]?.trim(),
    parentLines: [...text.matchAll(/^\*\*Parent:\*\*\s*(.+)$/gmu)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]]),
    identity: /^# Cohort: `([^`\r\n]+)`\r?\n/u.exec(text)?.[1],
  };
}

function validateCohortDocumentClaim(
  tree: V3RepositoryPlanTree,
  cohort: string,
): DestinationRefusal | null {
  const path = v3CohortDocumentPath(cohort);
  const state = tree[path];
  if (state === undefined || state.kind === "absent" || state.objectKind !== "blob") {
    return { status: "refused", reason: "topology-claim", locus: path };
  }
  const text = decodeUtf8(state.bytes);
  if (text === null) return { status: "refused", reason: "topology-claim", locus: path };
  const { leaf, parent, purpose, parentLines, identity } = cohortDocumentFacts(text, cohort);
  if (leaf === undefined || identity === undefined) {
    return { status: "refused", reason: "topology-claim", locus: path };
  }
  if (identity !== leaf) {
    return {
      status: "refused",
      reason: "topology-claim",
      locus: path,
      evidence: { expected: leaf, actual: identity },
    };
  }
  const expectedParents = parent === null ? [] : [parent];
  if (canonicalDigest(parentLines) !== canonicalDigest(expectedParents)) {
    return {
      status: "refused",
      reason: "topology-claim",
      locus: path,
      evidence: { expected: expectedParents, actual: parentLines },
    };
  }
  return purpose === undefined || purpose === "—"
    ? { status: "refused", reason: "topology-claim", locus: path }
    : null;
}

function validateCohortClaims(
  map: V3DecomposeCutMap,
  tree: V3RepositoryPlanTree,
): DestinationRefusal | null {
  for (const cohort of cohortClaims(map)) {
    const refusal = validateCohortDocumentClaim(tree, cohort);
    if (refusal !== null) return refusal;
  }
  return null;
}

function validateAtCapFanout(
  map: V3DecomposeCutMap,
  tree: V3RepositoryPlanTree,
): DestinationRefusal | null {
  const placement = map.authoring.placement;
  if (placement.kind !== "at-cap") return null;
  const path = v3CohortDocumentPath(placement.parent);
  const state = tree[path];
  if (state === undefined || state.kind === "absent" || state.objectKind !== "blob") {
    return { status: "refused", reason: "topology-claim", locus: path };
  }
  const text = decodeUtf8(state.bytes);
  if (text === null) return { status: "refused", reason: "topology-claim", locus: path };
  const members = map.authoring.destinations.flatMap((destination) =>
    destination.kind === "new-member" ? [destination.slug] : []).sort();
  const start = `<!-- arc:decompose-fanout:${map.machine.source.origin}:start -->`;
  const end = `<!-- arc:decompose-fanout:${map.machine.source.origin}:end -->`;
  const expected = [
    start,
    `### \`${map.machine.source.origin}\` decomposition fan-out`,
    "",
    ...members.map((slug) => `- \`${slug}\``),
    end,
  ].join("\n");
  const actual = delimitedBlock(text, start, end);
  if (actual === null) return { status: "refused", reason: "topology-claim", locus: path };
  return actual === expected
    ? null
    : {
        status: "refused",
        reason: "topology-claim",
        locus: path,
        evidence: { expected, actual },
      };
}

function validateRoadmapClaim(
  tree: V3RepositoryPlanTree,
  roadmapPath: string | null,
  expectedRoadmap: Uint8Array,
): DestinationRefusal | null {
  if (roadmapPath === null) {
    return { status: "refused", reason: "roadmap-missing", locus: ROADMAP_PATH };
  }
  const roadmap = tree[roadmapPath];
  if (roadmap === undefined || roadmap.kind === "absent") {
    return { status: "refused", reason: "roadmap-missing", locus: roadmapPath };
  }
  if (roadmap.objectKind === "blob"
    && Buffer.from(roadmap.bytes).equals(Buffer.from(expectedRoadmap))) return null;
  return {
    status: "refused",
    reason: "roadmap-current-render",
    locus: roadmapPath,
    evidence: {
      expected: { objectKind: "blob", ...v3DecomposeByteEvidence(expectedRoadmap) },
      actual: { objectKind: roadmap.objectKind, ...v3DecomposeByteEvidence(roadmap.bytes) },
    },
  };
}

function validateAuthorityClaims(
  plan: ValidatedDecomposePlan,
  tree: V3RepositoryPlanTree,
  authority: V3ExtractionDestinationValidationAuthority,
  roadmapPath: string | null,
): DestinationRefusal | null {
  return validateDependencyClaims(plan, authority.completedMap, tree)
    ?? validateCohortClaims(authority.completedMap, tree)
    ?? validateAtCapFanout(authority.completedMap, tree)
    ?? validateRoadmapClaim(tree, roadmapPath, authority.expectedRoadmap);
}

/**
 * Compare an extraction plan's destination mutations with one pinned base tree.
 *
 * @param plan - Exact additive plan reconstructed from its original base.
 * @param tree - Current configured-base tree pinned at one commit.
 * @returns Proven destination facts or one deterministic mismatch.
 */
export function validateV3ExtractionDestinationStates(
  plan: ValidatedDecomposePlan,
  tree: V3RepositoryPlanTree,
  authority?: V3ExtractionDestinationValidationAuthority,
): V3ExtractionDestinationValidationResult {
  const blobBytes = new Map(authority?.blobs.map(({ contentDigest, bytes }) => [contentDigest, bytes]) ?? []);
  const destinations: V3ExtractionDestinationState[] = [];
  let roadmapPath: string | null = null;
  for (const mutation of plan.mutations) {
    if (mutation.kind === "exclusive" && mutation.role === "roadmap") {
      roadmapPath = mutation.path;
      continue;
    }
    const basic = validateBasicDestinationState(mutation, tree, authority === undefined);
    if (basic.status === "refused") return basic;
    if (mutation.kind === "composed") {
      const composed = validateComposedDestinationState(
        mutation,
        basic.observed,
        basic.after,
        blobBytes,
      );
      if (composed !== null) return composed;
    }
    destinations.push({
      path: mutation.path,
      mode: basic.after.mode,
      contentDigest: digestBytes(basic.observed.bytes),
    });
  }
  if (authority !== undefined) {
    const refusal = validateAuthorityClaims(plan, tree, authority, roadmapPath);
    if (refusal !== null) return refusal;
  }
  if (destinations.length === 0) {
    return { status: "refused", reason: "destination-plan-empty" };
  }
  return { status: "proven", destinations };
}
