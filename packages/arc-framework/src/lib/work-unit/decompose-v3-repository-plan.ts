/** Repository-tree projection for one immutable v3 decomposition result plan. */

import { posix } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import {
  formatValue,
  parseMetaRecord,
  setMetaBulletFields,
  type ParsedMetaRecord,
} from "../active/meta-reader.js";
import { MetaPrioritySchema } from "../active/meta-schema.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath, type WorkUnitPlacement } from "../layout/index.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import {
  validateV3DecomposeConservation,
  type V3DecomposeLiveWorkUnit,
  type V3ValidatedDependencyEdit,
} from "./decompose-v3-conservation.js";
import {
  composeV3DecomposePlan,
  renderV3NewLeafMeta,
  type V3PlanBlob,
  type V3PlannedByteState,
  type V3PlannedContentContribution,
  type V3PlannedDependencyContribution,
  type V3PlannedExclusivePath,
} from "./decompose-v3-plan-composer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import type { V3DecomposePreflight } from "./decompose-v3-preflight.js";
import {
  decodeV3DecomposeCutMap,
  v3CutMapDigest,
  type V3DecomposeCutMap,
  type V3SourceArtifactEntry,
} from "./decompose-v3-schema.js";
import {
  planV3RetirementDelta,
  type V3RetirementDeltaResult,
} from "./decompose-v3-retirement-delta.js";
import {
  planV3DecomposeTopology,
  type V3TopologyAction,
} from "./decompose-v3-topology.js";
import type { ProspectiveTransitionOverlay } from "./transition-overlay.js";

/** Exact regular-file or absence states read from pinned repository trees. */
export type V3RepositoryPlanState = V3PlannedByteState;

/** Complete repository-relative tree projection used by the plan builder. */
export type V3RepositoryPlanTree = Record<string, V3RepositoryPlanState>;

/** Inputs a Git adapter derives from exact commits before any occupation. */
export interface V3RepositoryPlanInput {
  completedMap: unknown;
  currentPreflight: V3DecomposePreflight;
  sourceTree: V3RepositoryPlanTree;
  mergeBaseTree: V3RepositoryPlanTree;
  resultBaseTree: V3RepositoryPlanTree;
  mergeBases: string[];
  cohortTemplate: Uint8Array;
  renderRoadmap(
    projectedTree: V3RepositoryPlanTree,
    overlay: ProspectiveTransitionOverlay,
  ): Promise<Uint8Array>;
}

export type V3RepositoryPlanRefusalStage =
  | "map"
  | "source"
  | "conservation"
  | "retirement"
  | "topology"
  | "content"
  | "dependency"
  | "roadmap"
  | "composition";

export interface V3RepositoryPlanRefusal {
  stage: V3RepositoryPlanRefusalStage;
  reason: string;
  locus?: string;
}

export type V3RepositoryPlanResult =
  | {
      status: "composed";
      plan: ValidatedDecomposePlan;
      blobs: V3PlanBlob[];
      sourceArtifactInventory: V3SourceArtifactEntry[];
    }
  | { status: "refused"; refusal: V3RepositoryPlanRefusal };

type Destination = V3DecomposeCutMap["authoring"]["destinations"][number];
type NewMember = Extract<Destination, { kind: "new-member" }>;
type Allocation = V3DecomposeCutMap["authoring"]["sourceAllocations"][number];
type TargetAllocation = Allocation & { disposition: Extract<Allocation["disposition"], { kind: "target" }> };

const ABSENT = { kind: "absent" } as const;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

function refuse(
  stage: V3RepositoryPlanRefusalStage,
  reason: string,
  locus?: string,
): V3RepositoryPlanResult {
  return {
    status: "refused",
    refusal: { stage, reason, ...(locus === undefined ? {} : { locus }) },
  };
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function stateAt(tree: V3RepositoryPlanTree, path: string): V3RepositoryPlanState {
  return tree[path] ?? ABSENT;
}

function regularFile(state: V3RepositoryPlanState): state is Exclude<V3RepositoryPlanState, { kind: "absent" }> {
  return state.kind === "object"
    && state.objectKind === "blob"
    && (state.mode === "100644" || state.mode === "100755");
}

function cloneState(state: V3RepositoryPlanState): V3RepositoryPlanState {
  return state.kind === "absent"
    ? state
    : { ...state, bytes: new Uint8Array(state.bytes) };
}

function cloneTree(tree: V3RepositoryPlanTree): V3RepositoryPlanTree {
  return Object.fromEntries(
    Object.entries(tree).map(([path, state]) => [path, cloneState(state)]),
  );
}

function regularTree(tree: V3RepositoryPlanTree): Record<
  string,
  Exclude<V3RepositoryPlanState, { kind: "absent" }>
> {
  return Object.fromEntries(
    Object.entries(tree).filter(
      (entry): entry is [string, Exclude<V3RepositoryPlanState, { kind: "absent" }>] =>
        entry[1].kind === "object",
    ),
  );
}

function applyState(
  tree: V3RepositoryPlanTree,
  path: string,
  state: V3RepositoryPlanState,
): void {
  tree[path] = cloneState(state);
}

function decodeText(state: V3RepositoryPlanState): string | null {
  if (!regularFile(state)) return null;
  try {
    return decoder.decode(state.bytes);
  } catch {
    return null;
  }
}

function metaSlug(path: string): string | null {
  const match = /(?:^|\/)meta-(.+)\.md$/u.exec(path);
  return match?.[1] ?? null;
}

function supportedMetaPath(path: string): boolean {
  return path.startsWith(".arc/active/")
    || path.startsWith(".arc/backlog/planned/")
    || path.startsWith(".arc/backlog/provisional/");
}

interface TreeMeta {
  slug: string;
  path: string;
  record: ParsedMetaRecord;
}

function readTreeMetas(tree: V3RepositoryPlanTree): TreeMeta[] | null {
  const records: TreeMeta[] = [];
  for (const path of Object.keys(tree).sort(compareUtf8)) {
    const slug = metaSlug(path);
    if (slug === null || !supportedMetaPath(path)) continue;
    const text = decodeText(stateAt(tree, path));
    if (text === null) return null;
    try {
      records.push({ slug, path, record: parseMetaRecord(text) });
    } catch {
      return null;
    }
  }
  return records;
}

function uniqueMeta(records: readonly TreeMeta[], slug: string): TreeMeta | null {
  const matches = records.filter((record) => record.slug === slug);
  return matches.length === 1 ? matches[0] ?? null : null;
}

function originArtifactPaths(
  tree: V3RepositoryPlanTree,
  metaPath: string,
  origin: string,
): string[] {
  const directory = posix.dirname(metaPath);
  const ordinary = new RegExp(`^(?:meta|draft|spec|tasks|notes)-${origin.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}\\.md$`, "u");
  const layered = new Set([`spec-${origin}-prd.md`, `spec-${origin}-rfc.md`]);
  return Object.keys(tree)
    .filter((path) => posix.dirname(path) === directory)
    .filter((path) => ordinary.test(posix.basename(path)) || layered.has(posix.basename(path)))
    .sort(compareUtf8);
}

function memberPlacement(map: V3DecomposeCutMap): WorkUnitPlacement {
  const placement = map.authoring.placement;
  const cohort = placement.kind === "direct-member"
    ? []
    : (placement.kind === "at-cap" ? placement.parent : placement.cohort).split("/");
  return {
    kind: "backlog",
    commitment: "planned",
    cohort: cohort.length === 0
      ? []
      : cohort.length === 1
        ? [SlugSchema.parse(cohort[0])]
        : [SlugSchema.parse(cohort[0]), SlugSchema.parse(cohort[1])],
  };
}

function memberArtifactPath(
  placement: WorkUnitPlacement,
  slugInput: string,
  artifact: "meta" | "draft" | "spec" | "tasks",
): string {
  return resolveArcPath({
    kind: "work-unit-artifact",
    placement,
    slug: SlugSchema.parse(slugInput),
    artifact,
  });
}

function memberProfileArtifacts(
  map: V3DecomposeCutMap,
  member: NewMember,
): Array<{ role: "draft" | "spec" | "rfc"; path: string; sourceName: string }> {
  const placement = memberPlacement(map);
  const profile = map.machine.planningProfile;
  if (profile.kind === "draft") {
    return [{
      role: "draft",
      path: memberArtifactPath(placement, member.slug, "draft"),
      sourceName: profile.sourceDesign[0] ?? `draft-${map.machine.source.origin}.md`,
    }];
  }
  if (profile.kind === "single-spec") {
    return [{
      role: "spec",
      path: memberArtifactPath(placement, member.slug, "spec"),
      sourceName: profile.sourceDesign[0],
    }];
  }
  const container = posix.dirname(memberArtifactPath(placement, member.slug, "spec"));
  return [
    {
      role: "spec",
      path: posix.join(container, `spec-${member.slug}-prd.md`),
      sourceName: profile.sourceDesign[0],
    },
    {
      role: "rfc",
      path: posix.join(container, `spec-${member.slug}-rfc.md`),
      sourceName: profile.sourceDesign[1],
    },
  ];
}

function retitleScaffold(bytes: Uint8Array, origin: string, member: string): Uint8Array | null {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return null;
  }
  const lines = text.split("\n");
  const first = lines[0];
  if (first === undefined || !first.startsWith("# ")) return null;
  lines[0] = first.includes(origin) ? first.replace(origin, member) : first;
  return encoder.encode(lines.join("\n"));
}

function sourceArtifactState(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  sourceName: string,
): V3RepositoryPlanState {
  const sourceDir = posix.dirname(map.machine.sourceUnits[0]?.sourcePath ?? "");
  return stateAt(sourceTree, posix.join(sourceDir, sourceName));
}

function newMemberScaffolds(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  sourceRecord: ParsedMetaRecord,
): { content: V3PlannedContentContribution[]; states: V3RepositoryPlanTree } | null {
  const priority = MetaPrioritySchema.safeParse(sourceRecord.priority);
  if (sourceRecord.owner === null || !priority.success || sourceRecord.origin === null) return null;
  const placement = memberPlacement(map);
  const cohort = placement.kind === "backlog" && placement.cohort.length > 0
    ? placement.cohort.join("/")
    : null;
  const content: V3PlannedContentContribution[] = [];
  const states: V3RepositoryPlanTree = {};
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "new-member") continue;
    const artifacts = memberProfileArtifacts(map, destination);
    const workflow = map.machine.planningProfile.kind === "draft" ? "draft-design" : "generate-tasks";
    const metaPath = memberArtifactPath(placement, destination.slug, "meta");
    const metaBytes = renderV3NewLeafMeta(destination.slug, {
      state: "Planning",
      owner: sourceRecord.owner,
      workClass: destination.workClass,
      priority: priority.data,
      cohort,
      origin: sourceRecord.origin,
      design: artifacts.map(({ path }) => posix.basename(path)),
      currentWorkflow: workflow,
      nextAction: `Begin ${workflow}`,
    });
    const metaAfter = {
      kind: "object" as const,
      objectKind: "blob",
      mode: "100644",
      bytes: metaBytes,
    };
    content.push({
      path: metaPath,
      destinationId: destination.destinationId,
      destinationKind: destination.kind,
      artifactRole: "meta",
      contributorKind: "scaffold",
      disposition: "whole-file",
      sourceProjection: [],
      base: ABSENT,
      before: ABSENT,
      after: metaAfter,
    });
    states[metaPath] = metaAfter;
    for (const artifact of artifacts) {
      const source = sourceArtifactState(map, sourceTree, artifact.sourceName);
      if (!regularFile(source)) return null;
      const bytes = retitleScaffold(source.bytes, map.machine.source.origin, destination.slug);
      if (bytes === null) return null;
      const after = { ...source, bytes };
      content.push({
        path: artifact.path,
        destinationId: destination.destinationId,
        destinationKind: destination.kind,
        artifactRole: artifact.role,
        contributorKind: "scaffold",
        disposition: "whole-file",
        sourceProjection: [],
        base: ABSENT,
        before: ABSENT,
        after,
      });
      states[artifact.path] = after;
    }
    const taskPath = memberArtifactPath(placement, destination.slug, "tasks");
    const taskTargeted = map.authoring.sourceAllocations.some((allocation) =>
      allocation.disposition.kind === "target"
      && allocation.disposition.destinationId === destination.destinationId
      && allocation.disposition.targetLocator.artifact === posix.basename(taskPath));
    if (taskTargeted) {
      const source = sourceArtifactState(
        map,
        sourceTree,
        `tasks-${map.machine.source.origin}.md`,
      );
      if (!regularFile(source)) return null;
      const bytes = retitleScaffold(source.bytes, map.machine.source.origin, destination.slug);
      if (bytes === null) return null;
      const after = { ...source, bytes };
      content.push({
        path: taskPath,
        destinationId: destination.destinationId,
        destinationKind: destination.kind,
        artifactRole: "tasks",
        contributorKind: "provisional-task",
        disposition: "whole-file",
        sourceProjection: [],
        base: ABSENT,
        before: ABSENT,
        after,
      });
      states[taskPath] = after;
    }
  }
  return { content, states };
}

function existingDestinationPath(
  destination: Extract<Destination, { kind: "existing-home" }>,
  baseMetas: readonly TreeMeta[],
): string | null {
  if (destination.target.kind === "document") return destination.target.path;
  const meta = uniqueMeta(baseMetas, destination.target.slug);
  if (meta === null) return null;
  return destination.target.kind === "draft-block"
    ? posix.join(posix.dirname(meta.path), destination.target.locator.artifact)
    : meta.path;
}

function allocationPath(
  destination: Destination,
  allocation: TargetAllocation,
  baseMetas: readonly TreeMeta[],
  map: V3DecomposeCutMap,
): string | null {
  if (destination.kind === "new-member") {
    const placement = memberPlacement(map);
    return posix.join(
      posix.dirname(memberArtifactPath(placement, destination.slug, "meta")),
      allocation.disposition.targetLocator.artifact,
    );
  }
  if (destination.kind === "cohort-coordination") {
    const action = map.authoring.placement;
    const cohort = action.kind === "at-cap" ? action.parent : destination.cohort;
    const segments = cohort.split("/");
    return resolveArcPath({
      kind: "cohort-document",
      placement: { kind: "planned" },
      cohort: segments.length === 1
        ? [SlugSchema.parse(segments[0])]
        : [SlugSchema.parse(segments[0]), SlugSchema.parse(segments[1])],
    });
  }
  if (destination.target.kind === "document") return destination.target.path;
  const meta = uniqueMeta(baseMetas, destination.target.slug);
  return meta === null
    ? null
    : posix.join(posix.dirname(meta.path), allocation.disposition.targetLocator.artifact);
}

function targetLocatorResolves(path: string, state: V3RepositoryPlanState, locator: unknown): boolean {
  if (!regularFile(state)) return false;
  const scan = scanV3DecomposeContent(posix.basename(path), state.bytes);
  return scan.status === "scanned"
    && resolveV3DecomposeContentLocator(scan.units, locator, posix.basename(path)).status === "resolved";
}

function contentContributions(
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  baseMetas: readonly TreeMeta[],
  topology: readonly V3TopologyAction[],
  scaffolds: NonNullable<ReturnType<typeof newMemberScaffolds>>,
): { content: V3PlannedContentContribution[]; states: V3RepositoryPlanTree } | null {
  const content = [...scaffolds.content];
  const states = cloneTree(baseTree);
  for (const action of topology) {
    if (action.kind !== "none") applyState(states, action.path, action.after);
  }
  for (const [path, state] of Object.entries(scaffolds.states)) applyState(states, path, state);

  const destinationById = new Map(map.authoring.destinations.map((entry) => [entry.destinationId, entry]));
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "existing-home") continue;
    const path = existingDestinationPath(destination, baseMetas);
    if (path === null) return null;
    const current = stateAt(states, path);
    if (!regularFile(current)) return null;
    content.push({
      path,
      destinationId: destination.destinationId,
      destinationKind: destination.kind,
      artifactRole: "existing-home",
      contributorKind: "existing-home-edit",
      disposition: "patch",
      sourceProjection: [],
      base: stateAt(baseTree, path),
      before: current,
      after: current,
    });
  }

  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind !== "target") continue;
    const destination = destinationById.get(allocation.disposition.destinationId);
    if (destination === undefined) return null;
    const target = allocationPath(destination, allocation as TargetAllocation, baseMetas, map);
    if (target === null) return null;
    const current = stateAt(states, target);
    if (!targetLocatorResolves(target, current, allocation.disposition.targetLocator)) return null;
    const artifactRole = destination.kind === "cohort-coordination"
      ? "coordination"
      : destination.kind === "existing-home"
        ? "existing-home"
        : posix.basename(target) === `meta-${destination.slug}.md`
          ? "meta"
          : posix.basename(target) === `draft-${destination.slug}.md`
            ? "draft"
            : posix.basename(target) === `tasks-${destination.slug}.md`
              ? "tasks"
              : posix.basename(target).endsWith("-rfc.md")
                ? "rfc"
                : "spec";
    content.push({
      path: target,
      destinationId: destination.destinationId,
      destinationKind: destination.kind,
      artifactRole,
      contributorKind: "allocation",
      disposition: "patch",
      sourceProjection: [{
        sourceId: allocation.sourceId,
        targetLocator: allocation.disposition.targetLocator,
      }],
      base: stateAt(baseTree, target),
      before: current,
      after: current,
    });
  }
  return { content, states };
}

function liveWorkUnits(
  sourceMetas: readonly TreeMeta[],
  baseMetas: readonly TreeMeta[],
): V3DecomposeLiveWorkUnit[] {
  const writable = new Map(baseMetas.map((meta) => [meta.slug, meta.path]));
  return sourceMetas.map((meta) => ({
    slug: meta.slug,
    dependsOn: [...meta.record.dependsOn],
    ...(writable.get(meta.slug) === undefined ? {} : { writablePath: writable.get(meta.slug) }),
  }));
}

function dependencies(
  edits: V3ValidatedDependencyEdit[],
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  states: V3RepositoryPlanTree,
): V3PlannedDependencyContribution[] | null {
  const placement = memberPlacement(map);
  const output: V3PlannedDependencyContribution[] = [];
  for (const edit of edits) {
    const path = edit.writablePath
      ?? memberArtifactPath(placement, edit.dependent, "meta");
    const before = stateAt(states, path);
    const text = decodeText(before);
    if (text === null) return null;
    let afterText: string;
    try {
      afterText = setMetaBulletFields(text, {
        "Depends On": edit.afterTargets.length === 0
          ? "[none]"
          : formatValue(edit.afterTargets.join(", "), "identifier-list"),
      });
    } catch {
      return null;
    }
    const after = { ...before, bytes: encoder.encode(afterText) } as Exclude<
      V3RepositoryPlanState,
      { kind: "absent" }
    >;
    output.push({
      path,
      edgeId: edit.edgeId,
      destinationId: edit.destinationId,
      dependent: edit.dependent,
      base: stateAt(baseTree, path),
      before,
      after,
    });
    applyState(states, path, after);
  }
  return output;
}

function exclusiveRetirements(
  retirement: Extract<V3RetirementDeltaResult, { status: "planned" }>,
  resultBaseTree: V3RepositoryPlanTree,
): { predecessor: V3PlannedExclusivePath; source: V3PlannedExclusivePath[] } {
  const predecessor = retirement.predecessor;
  const predecessorPaths = new Set(retirement.predecessorRetirements.map(({ path }) => path));
  const source = [
    ...retirement.predecessorRetirements.filter(({ path }) => path !== predecessor.path),
    ...retirement.retirements.filter(({ path }) => !predecessorPaths.has(path)),
  ].map(({ path }): V3PlannedExclusivePath => ({
    path,
    before: stateAt(resultBaseTree, path),
    after: ABSENT,
  }));
  return {
    predecessor: {
      path: predecessor.path,
      before: stateAt(resultBaseTree, predecessor.path),
      after: ABSENT,
    },
    source,
  };
}

function applyPlannedProjection(
  tree: V3RepositoryPlanTree,
  topology: readonly V3TopologyAction[],
  content: readonly V3PlannedContentContribution[],
  dependenciesInput: readonly V3PlannedDependencyContribution[],
  predecessor: V3PlannedExclusivePath,
  sourceRetirements: readonly V3PlannedExclusivePath[],
): V3RepositoryPlanTree {
  const projected = cloneTree(tree);
  for (const action of topology) {
    if (action.kind !== "none") applyState(projected, action.path, action.after);
  }
  for (const contribution of content) applyState(projected, contribution.path, contribution.after);
  for (const dependency of dependenciesInput) applyState(projected, dependency.path, dependency.after);
  applyState(projected, predecessor.path, predecessor.after);
  for (const retirement of sourceRetirements) applyState(projected, retirement.path, retirement.after);
  return projected;
}

/**
 * Derive every immutable plan operand from a completed map and exact repository trees.
 *
 * @param input - Revalidated preflight, pinned trees, cohort template, and ROADMAP renderer.
 * @returns One content-addressed plan or a typed pre-occupation refusal.
 */
export async function composeV3RepositoryPlan(
  input: V3RepositoryPlanInput,
): Promise<V3RepositoryPlanResult> {
  const decoded = decodeV3DecomposeCutMap(input.completedMap);
  if (decoded.status === "rejected") {
    return refuse("map", decoded.issue.code, decoded.issue.path);
  }
  const map = decoded.value;
  const sourceMetas = readTreeMetas(input.sourceTree);
  const baseMetas = readTreeMetas(input.resultBaseTree);
  if (sourceMetas === null || baseMetas === null) return refuse("source", "invalid-meta");
  const sourceMeta = uniqueMeta(sourceMetas, map.machine.source.origin);
  const predecessorMeta = uniqueMeta(baseMetas, map.machine.source.origin);
  if (sourceMeta === null || sourceMeta.path !== input.currentPreflight.sourceOriginPath) {
    return refuse("source", "source-meta-mismatch", input.currentPreflight.sourceOriginPath);
  }
  if (predecessorMeta === null) return refuse("retirement", "ambiguous-predecessor");

  for (const artifact of input.currentPreflight.sourceArtifactInventory) {
    const observed = stateAt(input.sourceTree, artifact.path);
    if (!regularFile(observed)
      || observed.objectKind !== artifact.objectKind
      || observed.mode !== artifact.mode
      || digestBytes(observed.bytes) !== artifact.contentDigest) {
      return refuse("source", "source-artifact-mismatch", artifact.path);
    }
  }

  const conservation = validateV3DecomposeConservation({
    completedMap: map,
    currentPreflight: input.currentPreflight,
    originDependsOn: [...sourceMeta.record.dependsOn],
    workUnits: liveWorkUnits(sourceMetas, baseMetas),
  });
  if (conservation.status === "refused") {
    return refuse(
      "conservation",
      `${conservation.refusal.stage}:${conservation.refusal.reason}`,
      conservation.refusal.locus,
    );
  }

  const predecessorArtifactPaths = originArtifactPaths(
    input.resultBaseTree,
    predecessorMeta.path,
    map.machine.source.origin,
  );
  const retirement = planV3RetirementDelta({
    sourceKind: map.machine.source.kind,
    mergeBases: input.mergeBases,
    predecessorCandidates: [predecessorMeta.path],
    predecessorArtifactPaths,
    originArtifactPaths: input.currentPreflight.sourceArtifactInventory.map(({ path }) => path),
    roadmapPath: ROADMAP_PATH,
    baseTree: regularTree(input.mergeBaseTree),
    sourceTree: regularTree(input.sourceTree),
    resultTree: regularTree(input.resultBaseTree),
  });
  if (retirement.status === "refused") {
    return refuse("retirement", retirement.refusal.code, retirement.refusal.path);
  }
  if (retirement.riders.length > 0) {
    return refuse("retirement", retirement.riders[0]?.reason ?? "source-rider");
  }

  const topology = planV3DecomposeTopology({
    origin: map.machine.source.origin,
    placement: map.authoring.placement,
    destinations: map.authoring.destinations,
    baseTree: Object.fromEntries(
      Object.entries(input.resultBaseTree)
        .filter((entry): entry is [string, Exclude<V3RepositoryPlanState, { kind: "absent" }>] =>
          entry[1].kind === "object"),
    ),
    cohortTemplate: input.cohortTemplate,
  });
  if (topology.status === "refused") {
    return refuse("topology", topology.refusal.code, topology.refusal.path);
  }
  const scaffolds = newMemberScaffolds(map, input.sourceTree, sourceMeta.record);
  if (scaffolds === null) return refuse("content", "profile-scaffold-failed");
  const projectedContent = contentContributions(
    map,
    input.resultBaseTree,
    baseMetas,
    topology.plan.actions,
    scaffolds,
  );
  if (projectedContent === null) return refuse("content", "target-projection-failed");
  const dependencyContributions = dependencies(
    conservation.dependencyEdits,
    map,
    input.resultBaseTree,
    projectedContent.states,
  );
  if (dependencyContributions === null) return refuse("dependency", "dependency-projection-failed");

  const retirements = exclusiveRetirements(retirement, input.resultBaseTree);
  const roadmapBefore = stateAt(input.resultBaseTree, ROADMAP_PATH);
  if (!regularFile(roadmapBefore)) return refuse("roadmap", "roadmap-missing", ROADMAP_PATH);
  const expectedPaths = [...new Set([
    ...topology.plan.actions.flatMap((action) => action.kind === "none" ? [] : [action.path]),
    ...projectedContent.content.map(({ path }) => path),
    ...dependencyContributions.map(({ path }) => path),
    retirements.predecessor.path,
    ...retirements.source.map(({ path }) => path),
    ROADMAP_PATH,
  ])].sort(compareUtf8);

  const compose = (roadmapAfter: V3RepositoryPlanState) => composeV3DecomposePlan({
    preflightId: map.machine.preflightId,
    cutMapDigest: v3CutMapDigest(map),
    sourceHead: map.machine.source.head,
    expectedBaseHead: map.machine.resultBase.head,
    origin: map.machine.source.origin,
    sourceBranch: map.machine.source.logicalBranch,
    planningProfile: map.machine.planningProfile,
    destinations: map.authoring.destinations,
    validatedAllocations: conservation.allocations,
    expectedPaths,
    content: projectedContent.content,
    topology: topology.plan.actions,
    dependencies: dependencyContributions,
    predecessorRetirement: retirements.predecessor,
    sourceRetirements: retirements.source,
    roadmap: { path: ROADMAP_PATH, before: roadmapBefore, after: roadmapAfter },
  });

  const preliminary = compose(roadmapBefore);
  if (preliminary.status === "refused") {
    return refuse("composition", preliminary.refusal.code, preliminary.refusal.path);
  }
  const projectedTree = applyPlannedProjection(
    input.resultBaseTree,
    topology.plan.actions,
    projectedContent.content,
    dependencyContributions,
    retirements.predecessor,
    retirements.source,
  );
  let roadmapBytes: Uint8Array;
  try {
    roadmapBytes = await input.renderRoadmap(projectedTree, preliminary.plan.prospectiveOverlay);
  } catch {
    return refuse("roadmap", "roadmap-render-failed");
  }
  const final = compose({
    kind: "object",
    objectKind: "blob",
    mode: roadmapBefore.mode,
    bytes: roadmapBytes,
  });
  if (final.status === "refused") {
    return refuse("composition", final.refusal.code, final.refusal.path);
  }
  if (final.plan.planId !== preliminary.plan.planId) {
    return refuse("composition", "roadmap-plan-identity-mismatch");
  }
  return {
    status: "composed",
    plan: final.plan,
    blobs: final.blobs,
    sourceArtifactInventory: structuredClone(input.currentPreflight.sourceArtifactInventory),
  };
}
