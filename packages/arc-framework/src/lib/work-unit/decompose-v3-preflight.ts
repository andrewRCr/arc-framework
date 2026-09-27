/**
 * Pure tree-pinned source selection and revalidation for v3 decomposition.
 *
 * Git, configuration, and metadata readers normalize their observations into
 * the inputs below. This module deliberately owns no I/O: it turns one exact
 * committed-tree observation into a canonical starter map, or returns one
 * closed refusal reason without changing the observation it was given.
 */

import { posix } from "node:path";

import { canonicalDigest, digestBytes } from "../canonical/canonical-json.js";
import {
  createV3DecomposeStarterMap,
  parseV3DecomposeStarterMap,
  v3IncomingEdgeId,
  v3OutgoingEdgeId,
  v3PreflightId,
  v3SourceArtifactDigest,
  v3SourceId,
  type V3DecomposeMachine,
  type V3DecomposeCutMap,
  type V3DecomposeStarterMap,
  type V3SourceArtifactEntry,
} from "./decompose-v3-schema.js";
import {
  resolveV3DecomposeSourceUnit,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import type {
  V3DecomposeEvidenceValue,
  V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";

type PlanningProfile = V3DecomposeMachine["planningProfile"];

type SelectedV3DecomposeSource = {
  snapshot: V3DecomposeTreeSnapshot;
  meta: V3DecomposeSourceMeta;
  kind: V3DecomposeMachine["source"]["kind"];
};

/** A local branch ref and the exact commit it resolved to in one adapter read. */
export interface V3DecomposePinnedRef {
  ref: string;
  head: string;
}

/** Normalized metadata for one possible source predecessor in a committed tree. */
export interface V3DecomposeSourceMeta {
  path: string;
  origin: string;
  location: "active" | "backlog";
  state: string;
  branch: string | null;
  design: readonly string[];
  taskList: string | null;
}

/** Exact Git-stored source artifact bytes. */
export interface V3DecomposeStoredArtifact {
  path: string;
  objectKind: "blob";
  mode: "100644" | "100755";
  bytes: Uint8Array;
}

/**
 * One local branch tree after its metadata, artifacts, and dependency facts
 * have all been read from that same tree.
 */
export interface V3DecomposeTreeSnapshot extends V3DecomposePinnedRef {
  origins: readonly V3DecomposeSourceMeta[];
  sourceArtifacts: readonly V3DecomposeStoredArtifact[];
  incomingEdges: readonly { dependent: string; currentTargets: readonly string[] }[];
  outgoingEdges: readonly { prerequisite: string }[];
}

/** Normalized branch/base observations needed to select one source tree. */
export interface V3DecomposePreflightInput {
  origin: string;
  sourceBase: V3DecomposeTreeSnapshot;
  resultBase: V3DecomposePinnedRef;
  localBranches: readonly V3DecomposeTreeSnapshot[];
}

/** Closed refusal vocabulary for source derivation and preflight revalidation. */
export type V3DecomposePreflightMismatch =
  | "source-base-ref"
  | "result-base-ref"
  | "source-candidate-ref"
  | "source-candidate-duplicate"
  | "source-origin-duplicate"
  | "source-self-identity"
  | "source-ambiguous"
  | "source-predecessor"
  | "source-artifact-duplicate"
  | "source-artifact-mode"
  | "planning-profile"
  | "source-scan"
  | "source-unit-duplicate"
  | "incoming-edge"
  | "incoming-edge-duplicate"
  | "outgoing-edge-duplicate"
  | "machine-envelope"
  | "starter-map"
  | "source-logical-branch"
  | "source-ref"
  | "source-head"
  | "result-ref"
  | "result-head"
  | "source-artifact-inventory"
  | "source-units"
  | "incoming-edges"
  | "outgoing-edges"
  | "preflight-id";

export interface V3DecomposePreflight {
  sourceOriginPath: string;
  sourceArtifactInventory: V3SourceArtifactEntry[];
  sourceArtifactDigest: ReturnType<typeof digestBytes>;
  starterMap: V3DecomposeStarterMap;
}

export type V3DecomposePreflightResult =
  | { status: "ready"; preflight: V3DecomposePreflight }
  | {
      status: "rejected";
      reason: V3DecomposePreflightMismatch;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

export type V3DecomposePreflightRevalidationResult =
  | { status: "current"; preflight: V3DecomposePreflight }
  | {
      status: "stale";
      reason: V3DecomposePreflightMismatch;
      locus?: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

export type V3DecomposeCutMapBindingResult =
  | { status: "current"; preflight: V3DecomposePreflight }
  | {
      status: "stale";
      reason: V3DecomposePreflightMismatch;
      locus: string;
      evidence?: V3DecomposeRefusalEvidence;
    };

function compareBytes(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalDigest(left) === canonicalDigest(right);
}

function firstArrayMismatchLocus(
  left: readonly unknown[],
  right: readonly unknown[],
  locus: string,
): string {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= left.length || index >= right.length) return `${locus}.${index}`;
    if (!sameCanonicalValue(left[index], right[index])) return `${locus}.${index}`;
  }
  return locus;
}

function firstArrayMismatchEvidence<T extends V3DecomposeEvidenceValue>(
  expected: readonly T[],
  actual: readonly T[],
): V3DecomposeRefusalEvidence {
  const length = Math.max(expected.length, actual.length);
  for (let index = 0; index < length; index += 1) {
    if (index >= expected.length || index >= actual.length
      || !sameCanonicalValue(expected[index], actual[index])) {
      return {
        expected: expected[index] ?? { kind: "absent" },
        actual: actual[index] ?? { kind: "absent" },
      };
    }
  }
  return { expected: [...expected], actual: [...actual] };
}

function artifactInventoryEvidence(entries: readonly V3SourceArtifactEntry[]): V3DecomposeEvidenceValue[] {
  return entries.map(({ path, objectKind, mode, contentDigest }) => ({
    path,
    objectKind,
    mode,
    contentDigest,
  }));
}

function isLocalBranchRef(ref: string): boolean {
  return ref.startsWith("refs/heads/") && ref.slice("refs/heads/".length).length > 0;
}

function branchName(ref: string): string {
  return ref.slice("refs/heads/".length);
}

function isCanonicalIdentityList(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined && compareBytes(previous, value) >= 0) return false;
    previous = value;
  }
  return true;
}

function sourceMetaFor(
  snapshot: V3DecomposeTreeSnapshot,
  origin: string,
): { meta: V3DecomposeSourceMeta | null; reason: V3DecomposePreflightMismatch | null } {
  const matches = snapshot.origins
    .filter((candidate) => candidate.origin === origin)
    .slice()
    .sort((left, right) => compareBytes(left.path, right.path));
  if (matches.length > 1) return { meta: null, reason: "source-origin-duplicate" };
  return { meta: matches[0] ?? null, reason: null };
}

/**
 * Return every design filename accepted by the v3 planning-profile boundary.
 *
 * @param origin - Canonical work-unit slug used by the artifact family.
 * @returns Draft, single-spec, and paired-spec filename identities.
 */
export function v3PlanningDesignNames(origin: string): {
  draft: string;
  singleSpec: string;
  pairedSpec: readonly [string, string];
} {
  return {
    draft: `draft-${origin}.md`,
    singleSpec: `spec-${origin}.md`,
    pairedSpec: [`spec-${origin}-prd.md`, `spec-${origin}-rfc.md`],
  };
}

function inferPlanningProfile(
  meta: V3DecomposeSourceMeta,
  artifacts: readonly V3DecomposeStoredArtifact[],
): { profile: PlanningProfile } | { locus: string } {
  const designLocus = `${meta.path}#Design`;
  const designNames = v3PlanningDesignNames(meta.origin);
  if (meta.design.some((pointer) => posix.basename(pointer) !== pointer)) {
    return { locus: designLocus };
  }
  let profile: PlanningProfile;
  if (meta.design.length === 1 && meta.design[0] === designNames.draft) {
    profile = { kind: "draft", sourceDesign: [meta.design[0]] };
  } else if (meta.design.length === 1 && meta.design[0] === designNames.singleSpec) {
    profile = { kind: "single-spec", sourceDesign: [meta.design[0]] };
  } else if (
    meta.design.length === 2
    && meta.design[0] === designNames.pairedSpec[0]
    && meta.design[1] === designNames.pairedSpec[1]
  ) {
    profile = { kind: "paired-spec", sourceDesign: [meta.design[0], meta.design[1]] };
  } else {
    return { locus: designLocus };
  }

  const sourceDir = posix.dirname(meta.path);
  for (const pointer of profile.sourceDesign) {
    const matches = artifacts.filter(({ path }) => posix.basename(path) === pointer);
    if (matches.length !== 1) return { locus: posix.join(sourceDir, pointer) };
  }

  if (meta.taskList !== null) {
    const expectedTaskList = `tasks-${meta.origin}.md`;
    if (profile.kind === "draft" || meta.taskList !== expectedTaskList) {
      return { locus: `${meta.path}#Task List` };
    }
    const matches = artifacts.filter(({ path }) => posix.basename(path) === expectedTaskList);
    if (matches.length !== 1) return { locus: posix.join(sourceDir, expectedTaskList) };
  }
  return { profile };
}

function artifactInventory(
  artifacts: readonly V3DecomposeStoredArtifact[],
): { entries: V3SourceArtifactEntry[]; reason: V3DecomposePreflightMismatch | null } {
  const entries = artifacts.map(({ path, objectKind, mode, bytes }) => ({
    path,
    objectKind,
    mode,
    contentDigest: digestBytes(bytes),
  })).slice().sort((left, right) => compareBytes(left.path, right.path));
  if (!isCanonicalIdentityList(entries.map(({ path }) => path))) {
    return { entries: [], reason: "source-artifact-duplicate" };
  }
  return { entries, reason: null };
}

function sourceUnits(
  artifacts: readonly V3DecomposeStoredArtifact[],
  profile: PlanningProfile,
  sourceKind: V3DecomposeMachine["source"]["kind"],
  sourceMetaPath: string,
): {
  units: V3DecomposeMachine["sourceUnits"];
  reason: V3DecomposePreflightMismatch | null;
  locus?: string;
} {
  const units: V3DecomposeMachine["sourceUnits"] = [];
  const designNames = new Set(profile.sourceDesign);
  for (const artifact of artifacts) {
    const isDesign = designNames.has(posix.basename(artifact.path));
    if (artifact.path === sourceMetaPath || (sourceKind === "active-origin" && !isDesign)) continue;
    const scan = scanV3DecomposeContent(posix.basename(artifact.path), artifact.bytes);
    if (scan.status === "rejected") {
      return { units: [], reason: "source-scan", locus: artifact.path };
    }
    for (const unit of scan.units) {
      units.push({
        sourceId: v3SourceId({ sourcePath: artifact.path, sourceLocator: unit.locator }),
        sourcePath: artifact.path,
        sourceLocator: unit.locator,
        contentDigest: digestBytes(unit.bytes),
      });
    }
  }
  units.sort((left, right) => compareBytes(left.sourceId, right.sourceId));
  if (!isCanonicalIdentityList(units.map(({ sourceId }) => sourceId))) {
    return { units: [], reason: "source-unit-duplicate" };
  }
  return { units, reason: null };
}

function incomingEdges(
  edges: readonly { dependent: string; currentTargets: readonly string[] }[],
): { edges: V3DecomposeMachine["incomingEdges"]; reason: V3DecomposePreflightMismatch | null } {
  const normalized: V3DecomposeMachine["incomingEdges"] = [];
  for (const edge of edges) {
    if (!isCanonicalIdentityList(edge.currentTargets)) return { edges: [], reason: "incoming-edge" };
    const currentTargets = [...edge.currentTargets];
    normalized.push({
      edgeId: v3IncomingEdgeId({ dependent: edge.dependent, currentTargets }),
      dependent: edge.dependent,
      currentTargets,
    });
  }
  normalized.sort((left, right) => compareBytes(left.edgeId, right.edgeId));
  if (!isCanonicalIdentityList(normalized.map(({ edgeId }) => edgeId))) {
    return { edges: [], reason: "incoming-edge-duplicate" };
  }
  return { edges: normalized, reason: null };
}

function outgoingEdges(
  edges: readonly { prerequisite: string }[],
): { edges: V3DecomposeMachine["outgoingEdges"]; reason: V3DecomposePreflightMismatch | null } {
  const normalized = edges.map(({ prerequisite }) => ({
    edgeId: v3OutgoingEdgeId({ prerequisite }),
    prerequisite,
  })).sort((left, right) => compareBytes(left.edgeId, right.edgeId));
  if (!isCanonicalIdentityList(normalized.map(({ edgeId }) => edgeId))) {
    return { edges: [], reason: "outgoing-edge-duplicate" };
  }
  return { edges: normalized, reason: null };
}

function finalizeSelectedV3Preflight(
  input: V3DecomposePreflightInput,
  selected: SelectedV3DecomposeSource,
): V3DecomposePreflightResult {
  const inferred = inferPlanningProfile(selected.meta, selected.snapshot.sourceArtifacts);
  if ("locus" in inferred) {
    return { status: "rejected", reason: "planning-profile", locus: inferred.locus };
  }
  const artifacts = artifactInventory(selected.snapshot.sourceArtifacts);
  if (artifacts.reason !== null) return { status: "rejected", reason: artifacts.reason };
  const scanned = sourceUnits(
    selected.snapshot.sourceArtifacts,
    inferred.profile,
    selected.kind,
    selected.meta.path,
  );
  if (scanned.reason !== null) {
    return {
      status: "rejected",
      reason: scanned.reason,
      ...(scanned.locus === undefined ? {} : { locus: scanned.locus }),
    };
  }
  const incoming = incomingEdges(selected.snapshot.incomingEdges);
  if (incoming.reason !== null) return { status: "rejected", reason: incoming.reason };
  const outgoing = outgoingEdges(selected.snapshot.outgoingEdges);
  if (outgoing.reason !== null) return { status: "rejected", reason: outgoing.reason };

  const facts = {
    source: {
      origin: input.origin,
      kind: selected.kind,
      logicalBranch: branchName(selected.snapshot.ref),
      ref: selected.snapshot.ref,
      head: selected.snapshot.head,
    },
    resultBase: { ref: input.resultBase.ref, head: input.resultBase.head },
    planningProfile: inferred.profile,
    sourceUnits: scanned.units,
    incomingEdges: incoming.edges,
    outgoingEdges: outgoing.edges,
  };
  const machine: V3DecomposeMachine = { preflightId: v3PreflightId(facts), ...facts };
  const starterMap = createV3DecomposeStarterMap(machine);
  const sourceArtifactDigest = v3SourceArtifactDigest(artifacts.entries);
  if (starterMap === null || sourceArtifactDigest === null) {
    return { status: "rejected", reason: "machine-envelope" };
  }
  return {
    status: "ready",
    preflight: {
      sourceOriginPath: selected.meta.path,
      sourceArtifactInventory: artifacts.entries,
      sourceArtifactDigest,
      starterMap,
    },
  };
}

/**
 * Select one self-authenticating local source tree and construct its immutable
 * v3 starter map. Input order never selects a candidate.
 */
export function createV3DecomposePreflight(input: V3DecomposePreflightInput): V3DecomposePreflightResult {
  if (!isLocalBranchRef(input.sourceBase.ref)) return { status: "rejected", reason: "source-base-ref" };
  if (!isLocalBranchRef(input.resultBase.ref)) return { status: "rejected", reason: "result-base-ref" };

  const candidates = input.localBranches.slice().sort((left, right) => compareBytes(left.ref, right.ref));
  const refs = new Set<string>();
  for (const candidate of candidates) {
    if (!isLocalBranchRef(candidate.ref) || candidate.ref === input.sourceBase.ref) {
      return { status: "rejected", reason: "source-candidate-ref" };
    }
    if (refs.has(candidate.ref)) return { status: "rejected", reason: "source-candidate-duplicate" };
    refs.add(candidate.ref);
  }

  const qualifying: Array<{ snapshot: V3DecomposeTreeSnapshot; meta: V3DecomposeSourceMeta }> = [];
  for (const candidate of candidates) {
    const observed = sourceMetaFor(candidate, input.origin);
    if (observed.reason !== null) return { status: "rejected", reason: observed.reason };
    const meta = observed.meta;
    if (meta === null || meta.location !== "active"
      || (meta.state !== "Planning" && meta.state !== "Active")) continue;
    if (meta.branch !== branchName(candidate.ref)) return { status: "rejected", reason: "source-self-identity" };
    qualifying.push({ snapshot: candidate, meta });
  }
  if (qualifying.length > 1) return { status: "rejected", reason: "source-ambiguous" };

  let selected: SelectedV3DecomposeSource;
  if (qualifying.length === 1) {
    const winner = qualifying[0];
    if (winner === undefined) return { status: "rejected", reason: "source-predecessor" };
    selected = {
      ...winner,
      kind: winner.meta.state === "Active" ? "active-origin" : "started-planning",
    };
  } else {
    const observed = sourceMetaFor(input.sourceBase, input.origin);
    if (observed.reason !== null || observed.meta === null) {
      return { status: "rejected", reason: observed.reason ?? "source-predecessor" };
    }
    const meta = observed.meta;
    if (meta.location === "active"
      && (meta.state === "Planning" || meta.state === "Active")
      && meta.branch === branchName(input.sourceBase.ref)) {
      selected = {
        snapshot: input.sourceBase,
        meta,
        kind: meta.state === "Active" ? "active-origin" : "started-planning",
      };
    } else if (
      meta.location === "backlog"
      && (meta.state === "Planning" || meta.state === "Provisional")
      && meta.branch === null
    ) {
      selected = { snapshot: input.sourceBase, meta, kind: "backlog-stub" };
    } else {
      return { status: "rejected", reason: "source-predecessor" };
    }
  }

  return finalizeSelectedV3Preflight(input, selected);
}

/**
 * Compare one decoded completed map with a freshly rederived committed source.
 *
 * The completed-map decoder owns structure and authoring identity conservation;
 * this comparison owns the fixed machine-binding order before planning begins.
 */
export function revalidateV3DecomposeCutMapBinding(
  completedMap: V3DecomposeCutMap,
  currentPreflight: V3DecomposePreflight,
): V3DecomposeCutMapBindingResult {
  const currentMap = parseV3DecomposeStarterMap(currentPreflight.starterMap);
  if (currentMap === null) {
    return { status: "stale", reason: "starter-map", locus: "machine" };
  }
  const prior = completedMap.machine;
  const current = currentMap.machine;
  const scalarMismatches = [
    ["source-logical-branch", "machine.source.logicalBranch", prior.source.logicalBranch, current.source.logicalBranch],
    ["source-ref", "machine.source.ref", prior.source.ref, current.source.ref],
    ["source-head", "machine.source.head", prior.source.head, current.source.head],
    ["result-ref", "machine.resultBase.ref", prior.resultBase.ref, current.resultBase.ref],
    ["result-head", "machine.resultBase.head", prior.resultBase.head, current.resultBase.head],
  ] as const;
  for (const [reason, locus, previous, refreshed] of scalarMismatches) {
    if (previous !== refreshed) {
      return {
        status: "stale",
        reason,
        locus,
        evidence: { expected: previous, actual: refreshed },
      };
    }
  }
  if (!sameCanonicalValue(prior.planningProfile, current.planningProfile)) {
    return {
      status: "stale",
      reason: "planning-profile",
      locus: "machine.planningProfile",
      evidence: { expected: prior.planningProfile, actual: current.planningProfile },
    };
  }
  if (!sameCanonicalValue(prior.sourceUnits, current.sourceUnits)) {
    return {
      status: "stale",
      reason: "source-units",
      locus: firstArrayMismatchLocus(prior.sourceUnits, current.sourceUnits, "machine.sourceUnits"),
      evidence: firstArrayMismatchEvidence(prior.sourceUnits, current.sourceUnits),
    };
  }
  if (!sameCanonicalValue(prior.incomingEdges, current.incomingEdges)) {
    return {
      status: "stale",
      reason: "incoming-edges",
      locus: firstArrayMismatchLocus(prior.incomingEdges, current.incomingEdges, "machine.incomingEdges"),
      evidence: firstArrayMismatchEvidence(prior.incomingEdges, current.incomingEdges),
    };
  }
  if (!sameCanonicalValue(prior.outgoingEdges, current.outgoingEdges)) {
    return {
      status: "stale",
      reason: "outgoing-edges",
      locus: firstArrayMismatchLocus(prior.outgoingEdges, current.outgoingEdges, "machine.outgoingEdges"),
      evidence: firstArrayMismatchEvidence(prior.outgoingEdges, current.outgoingEdges),
    };
  }
  if (prior.preflightId !== current.preflightId) {
    return {
      status: "stale",
      reason: "preflight-id",
      locus: "machine.preflightId",
      evidence: { expected: prior.preflightId, actual: current.preflightId },
    };
  }
  return { status: "current", preflight: currentPreflight };
}

function revalidateSourceIdentity(
  prior: V3DecomposeMachine,
  current: V3DecomposeMachine,
): V3DecomposePreflightRevalidationResult | null {
  if (prior.source.logicalBranch !== current.source.logicalBranch) {
    return {
      status: "stale",
      reason: "source-logical-branch",
      evidence: { expected: prior.source.logicalBranch, actual: current.source.logicalBranch },
    };
  }
  if (prior.source.ref !== current.source.ref) {
    return {
      status: "stale",
      reason: "source-ref",
      evidence: { expected: prior.source.ref, actual: current.source.ref },
    };
  }
  if (prior.source.head !== current.source.head) {
    return {
      status: "stale",
      reason: "source-head",
      evidence: { expected: prior.source.head, actual: current.source.head },
    };
  }
  if (prior.resultBase.ref !== current.resultBase.ref) {
    return {
      status: "stale",
      reason: "result-ref",
      evidence: { expected: prior.resultBase.ref, actual: current.resultBase.ref },
    };
  }
  if (prior.resultBase.head !== current.resultBase.head) {
    return {
      status: "stale",
      reason: "result-head",
      evidence: { expected: prior.resultBase.head, actual: current.resultBase.head },
    };
  }
  if (!sameCanonicalValue(prior.planningProfile, current.planningProfile)) {
    return {
      status: "stale",
      reason: "planning-profile",
      evidence: { expected: prior.planningProfile, actual: current.planningProfile },
    };
  }
  return null;
}

function revalidateStoredSourceUnits(
  prior: V3DecomposeMachine,
  current: V3DecomposeMachine,
  input: V3DecomposePreflightInput,
): V3DecomposePreflightRevalidationResult | null {
  const currentSource = [input.sourceBase, ...input.localBranches].find((snapshot) =>
    snapshot.ref === current.source.ref && snapshot.head === current.source.head);
  if (currentSource === undefined) return { status: "stale", reason: "source-ref" };
  for (let index = 0; index < prior.sourceUnits.length; index += 1) {
    const sourceUnit = prior.sourceUnits[index];
    if (sourceUnit === undefined) continue;
    const artifact = currentSource.sourceArtifacts.find(({ path }) => path === sourceUnit.sourcePath);
    if (artifact === undefined) {
      return {
        status: "stale",
        reason: "source-units",
        locus: `machine.sourceUnits.${index}.sourcePath`,
      };
    }
    const resolution = resolveV3DecomposeSourceUnit(sourceUnit, artifact.bytes);
    if (resolution.status === "rejected") {
      const field = resolution.code === "source-content"
        ? "contentDigest"
        : resolution.code === "source-id"
          ? "sourceId"
          : "sourceLocator";
      const currentUnit = current.sourceUnits[index];
      return {
        status: "stale",
        reason: "source-units",
        locus: `machine.sourceUnits.${index}.${field}`,
        evidence: {
          expected: sourceUnit[field],
          actual: currentUnit?.[field] ?? { kind: "absent" },
        },
      };
    }
  }
  return null;
}

/**
 * Re-read and compare every stored preflight fact in a fixed order. A stale
 * source never yields a partial planning input.
 */
export function revalidateV3DecomposePreflight(
  previous: V3DecomposePreflight,
  input: V3DecomposePreflightInput,
): V3DecomposePreflightRevalidationResult {
  const previousMap = parseV3DecomposeStarterMap(previous.starterMap);
  if (previousMap === null) return { status: "stale", reason: "starter-map" };
  const priorArtifactDigest = v3SourceArtifactDigest(previous.sourceArtifactInventory);
  if (priorArtifactDigest === null || priorArtifactDigest !== previous.sourceArtifactDigest) {
    return { status: "stale", reason: "source-artifact-inventory" };
  }
  const refreshed = createV3DecomposePreflight(input);
  if (refreshed.status === "rejected") {
    return { status: "stale", reason: refreshed.reason, ...(refreshed.locus === undefined ? {} : {
      locus: refreshed.locus,
    }), ...(refreshed.evidence === undefined ? {} : { evidence: refreshed.evidence }) };
  }
  const currentMap = refreshed.preflight.starterMap;
  const prior = previousMap.machine;
  const current = currentMap.machine;
  const identityMismatch = revalidateSourceIdentity(prior, current);
  if (identityMismatch !== null) return identityMismatch;
  const sourceUnitMismatch = revalidateStoredSourceUnits(prior, current, input);
  if (sourceUnitMismatch !== null) return sourceUnitMismatch;
  if (previous.sourceArtifactDigest !== refreshed.preflight.sourceArtifactDigest) {
    return {
      status: "stale",
      reason: "source-artifact-inventory",
      evidence: {
        expected: artifactInventoryEvidence(previous.sourceArtifactInventory),
        actual: artifactInventoryEvidence(refreshed.preflight.sourceArtifactInventory),
      },
    };
  }
  if (!sameCanonicalValue(prior.sourceUnits, current.sourceUnits)) {
    return {
      status: "stale",
      reason: "source-units",
      locus: firstArrayMismatchLocus(prior.sourceUnits, current.sourceUnits, "machine.sourceUnits"),
      evidence: firstArrayMismatchEvidence(prior.sourceUnits, current.sourceUnits),
    };
  }
  if (!sameCanonicalValue(prior.incomingEdges, current.incomingEdges)) {
    return {
      status: "stale",
      reason: "incoming-edges",
      locus: firstArrayMismatchLocus(prior.incomingEdges, current.incomingEdges, "machine.incomingEdges"),
      evidence: firstArrayMismatchEvidence(prior.incomingEdges, current.incomingEdges),
    };
  }
  if (!sameCanonicalValue(prior.outgoingEdges, current.outgoingEdges)) {
    return {
      status: "stale",
      reason: "outgoing-edges",
      locus: firstArrayMismatchLocus(prior.outgoingEdges, current.outgoingEdges, "machine.outgoingEdges"),
      evidence: firstArrayMismatchEvidence(prior.outgoingEdges, current.outgoingEdges),
    };
  }
  if (prior.preflightId !== current.preflightId) {
    return {
      status: "stale",
      reason: "preflight-id",
      evidence: { expected: prior.preflightId, actual: current.preflightId },
    };
  }
  if (!sameCanonicalValue(previousMap, currentMap)) return { status: "stale", reason: "starter-map" };
  return { status: "current", preflight: refreshed.preflight };
}
