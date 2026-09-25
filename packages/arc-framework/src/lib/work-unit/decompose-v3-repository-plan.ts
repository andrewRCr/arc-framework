/** Repository-tree projection for one immutable v3 decomposition result plan. */

import { posix } from "node:path";

import { digestBytes } from "../canonical/canonical-json.js";
import {
  formatValue,
  parseMetaRecord,
  setMetaBulletFields,
  type ParsedMetaRecord,
} from "../active/meta-reader.js";
import { MetaPrioritySchema, type MetaPriority } from "../active/meta-schema.js";
import { SlugSchema } from "../kernel/index.js";
import { resolveArcPath, type WorkUnitPlacement } from "../layout/index.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "./decompose-content.js";
import {
  validateV3DecomposeConservation,
  type V3ValidatedDependencyEdit,
} from "./decompose-v3-conservation.js";
import {
  composeV3DecomposePlan,
  renderV3NewLeafMeta,
  type V3PlanBlob,
  type V3PlannedContentContribution,
  type V3PlannedDependencyContribution,
  type V3PlannedExclusivePath,
} from "./decompose-v3-plan-composer.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import type { V3ExtractionReportFacts } from "./decompose-v3-result-report.js";
import type { V3DecomposePreflight } from "./decompose-v3-preflight.js";
import type {
  V3DecomposeRefusalEvidence,
} from "./decompose-v3-refusal.js";
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
  planInternalV3DecomposeTopology,
  planV3DecomposeTopology,
  type V3InternalTopologyPlanInput,
  type V3TopologyAction,
  type V3TopologyPlanInput,
} from "./decompose-v3-topology.js";
import type { ProspectiveTransitionOverlay } from "./transition-overlay.js";
import {
  ABSENT,
  applyPlannedProjection,
  applyState,
  cloneTree,
  compareUtf8,
  completedWorkUnitSlugs,
  decodeText,
  originArtifactPaths,
  readTreeMetas,
  regularFile,
  regularTree,
  sourceArtifactEvidence,
  stateAt,
  uniqueMeta,
  type TreeMeta,
  type V3RepositoryPlanState,
  type V3RepositoryPlanTree,
} from "./decompose-v3-repository-tree.js";
import {
  extractionFacts,
  liveWorkUnits,
  memberPlacement,
} from "./decompose-v3-repository-projections.js";

export type {
  V3RepositoryPlanState,
  V3RepositoryPlanTree,
} from "./decompose-v3-repository-tree.js";

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
    overlay?: ProspectiveTransitionOverlay,
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

export type V3RepositoryPlanDependencyRecipient =
  | { dependent: string }
  | { dependent: string; path: string; targets: string[] };

export interface V3RepositoryPlanRefusal {
  stage: V3RepositoryPlanRefusalStage;
  reason: string;
  locus?: string;
  evidence?: V3DecomposeRefusalEvidence;
  /** Logical recipient fact reserved for base-advancement conflict classification. */
  dependencyRecipient?: V3RepositoryPlanDependencyRecipient;
}

export type V3RepositoryPlanResult =
  | {
      status: "composed";
      plan: ValidatedDecomposePlan;
      blobs: V3PlanBlob[];
      sourceArtifactInventory: V3SourceArtifactEntry[];
      extractionFacts?: V3ExtractionReportFacts;
    }
  | { status: "refused"; refusal: V3RepositoryPlanRefusal };

type Destination = V3DecomposeCutMap["authoring"]["destinations"][number];
type NewMember = Extract<Destination, { kind: "new-member" }>;
type Allocation = V3DecomposeCutMap["authoring"]["sourceAllocations"][number];
type TargetAllocation = Allocation & { disposition: Extract<Allocation["disposition"], { kind: "target" }> };
type V3ContentProjectionRefusal = {
  status: "refused";
  reason:
    | "scaffold-source-meta-incomplete"
    | "scaffold-source-missing"
    | "scaffold-source-invalid-encoding"
    | "scaffold-title-missing"
    | "existing-home-unresolvable"
    | "target-artifact-absent"
    | "target-locator-unresolved";
  locus: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const ROADMAP_PATH = resolveArcPath({ kind: "project-document", document: "roadmap" });

function refuse(
  stage: V3RepositoryPlanRefusalStage,
  reason: string,
  locus?: string,
  evidence?: V3DecomposeRefusalEvidence,
  dependencyRecipient?: V3RepositoryPlanDependencyRecipient,
): V3RepositoryPlanResult {
  return {
    status: "refused",
    refusal: {
      stage,
      reason,
      ...(locus === undefined ? {} : { locus }),
      ...(evidence === undefined ? {} : { evidence }),
      ...(dependencyRecipient === undefined ? {} : { dependencyRecipient }),
    },
  };
}

function memberArtifactPath(
  placement: WorkUnitPlacement,
  slugInput: string,
  artifact: "meta" | "draft" | "spec" | "tasks" | "notes",
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

function retitleScaffold(
  bytes: Uint8Array,
  origin: string,
  member: string,
):
  | { status: "retitled"; bytes: Uint8Array }
  | { status: "invalid-encoding" }
  | { status: "title-missing" } {
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return { status: "invalid-encoding" };
  }
  const lines = text.split("\n");
  const first = lines[0];
  if (first === undefined || !first.startsWith("# ")) return { status: "title-missing" };
  lines[0] = first.includes(origin) ? first.replace(origin, member) : first;
  return { status: "retitled", bytes: encoder.encode(lines.join("\n")) };
}

function sourceArtifactState(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  sourceName: string,
): { path: string; state: V3RepositoryPlanState } {
  const sourceDir = posix.dirname(map.machine.sourceUnits[0]?.sourcePath ?? "");
  const path = posix.join(sourceDir, sourceName);
  return { path, state: stateAt(sourceTree, path) };
}

function scaffoldSource(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  destination: NewMember,
  sourceName: string,
):
  | {
      status: "ready";
      source: Exclude<V3RepositoryPlanState, { kind: "absent" }>;
      bytes: Uint8Array;
    }
  | V3ContentProjectionRefusal {
  const sourceArtifact = sourceArtifactState(map, sourceTree, sourceName);
  if (!regularFile(sourceArtifact.state)) {
    return {
      status: "refused",
      reason: "scaffold-source-missing",
      locus: `${destination.slug}:${sourceArtifact.path}`,
    };
  }
  const retitled = retitleScaffold(
    sourceArtifact.state.bytes,
    map.machine.source.origin,
    destination.slug,
  );
  if (retitled.status !== "retitled") {
    return {
      status: "refused",
      reason: retitled.status === "invalid-encoding"
        ? "scaffold-source-invalid-encoding"
        : "scaffold-title-missing",
      locus: `${destination.slug}:${sourceArtifact.path}`,
    };
  }
  return { status: "ready", source: sourceArtifact.state, bytes: retitled.bytes };
}

type V3ScaffoldedContent = {
  status: "scaffolded";
  content: V3PlannedContentContribution[];
  states: V3RepositoryPlanTree;
};

type V3ScaffoldResult = V3ScaffoldedContent | V3ContentProjectionRefusal;

function scaffoldMemberProfile(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  destination: NewMember,
  placement: WorkUnitPlacement,
  source: { owner: string; priority: MetaPriority; origin: string; cohort: string | null },
): V3ScaffoldResult {
  const artifacts = memberProfileArtifacts(map, destination);
  const workflow = map.machine.planningProfile.kind === "draft" ? "draft-design" : "generate-tasks";
  const metaPath = memberArtifactPath(placement, destination.slug, "meta");
  const metaAfter = {
    kind: "object" as const,
    objectKind: "blob",
    mode: "100644",
    bytes: renderV3NewLeafMeta(destination.slug, {
      state: "Planning",
      owner: source.owner,
      workClass: destination.workClass,
      priority: source.priority,
      cohort: source.cohort,
      origin: source.origin,
      design: artifacts.map(({ path }) => posix.basename(path)),
      currentWorkflow: workflow,
      nextAction: `Begin ${workflow}`,
    }),
  };
  const content: V3PlannedContentContribution[] = [{
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
  }];
  const states: V3RepositoryPlanTree = { [metaPath]: metaAfter };
  for (const artifact of artifacts) {
    const scaffold = scaffoldSource(map, sourceTree, destination, artifact.sourceName);
    if (scaffold.status === "refused") return scaffold;
    const after = { ...scaffold.source, bytes: scaffold.bytes };
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
  return { status: "scaffolded", content, states };
}

function scaffoldOptionalMemberArtifact(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  destination: NewMember,
  placement: WorkUnitPlacement,
  role: "tasks" | "notes",
): V3ScaffoldResult {
  const path = memberArtifactPath(placement, destination.slug, role);
  const targeted = map.authoring.sourceAllocations.some((allocation) =>
    allocation.disposition.kind === "target"
    && allocation.disposition.destinationId === destination.destinationId
    && allocation.disposition.targetLocator.artifact === posix.basename(path));
  if (!targeted) return { status: "scaffolded", content: [], states: {} };
  const scaffold = scaffoldSource(
    map,
    sourceTree,
    destination,
    `${role}-${map.machine.source.origin}.md`,
  );
  if (scaffold.status === "refused") return scaffold;
  const after = { ...scaffold.source, bytes: scaffold.bytes };
  return {
    status: "scaffolded",
    content: [{
      path,
      destinationId: destination.destinationId,
      destinationKind: destination.kind,
      artifactRole: role,
      contributorKind: role === "tasks" ? "provisional-task" : "provisional-notes",
      disposition: "whole-file",
      sourceProjection: [],
      base: ABSENT,
      before: ABSENT,
      after,
    }],
    states: { [path]: after },
  };
}

function scaffoldNewMember(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  destination: NewMember,
  placement: WorkUnitPlacement,
  source: { owner: string; priority: MetaPriority; origin: string; cohort: string | null },
): V3ScaffoldResult {
  const profile = scaffoldMemberProfile(map, sourceTree, destination, placement, source);
  if (profile.status === "refused") return profile;
  const tasks = scaffoldOptionalMemberArtifact(map, sourceTree, destination, placement, "tasks");
  if (tasks.status === "refused") return tasks;
  const notes = scaffoldOptionalMemberArtifact(map, sourceTree, destination, placement, "notes");
  if (notes.status === "refused") return notes;
  return {
    status: "scaffolded",
    content: [...profile.content, ...tasks.content, ...notes.content],
    states: { ...profile.states, ...tasks.states, ...notes.states },
  };
}

function newMemberScaffolds(
  map: V3DecomposeCutMap,
  sourceTree: V3RepositoryPlanTree,
  sourceMetaPath: string,
  sourceRecord: ParsedMetaRecord,
): V3ScaffoldResult {
  const priority = MetaPrioritySchema.safeParse(sourceRecord.priority);
  const firstMember = map.authoring.destinations.find(
    (destination): destination is NewMember => destination.kind === "new-member",
  );
  if (firstMember === undefined) return { status: "scaffolded", content: [], states: {} };
  if (sourceRecord.owner === null || !priority.success || sourceRecord.origin === null) {
    return {
      status: "refused",
      reason: "scaffold-source-meta-incomplete",
      locus: `${firstMember.slug}:${sourceMetaPath}`,
    };
  }
  const placement = memberPlacement(map);
  const source = {
    owner: sourceRecord.owner,
    priority: priority.data,
    origin: sourceRecord.origin,
    cohort: placement.kind === "backlog" && placement.cohort.length > 0
      ? placement.cohort.join("/")
      : null,
  };
  const content: V3PlannedContentContribution[] = [];
  const states: V3RepositoryPlanTree = {};
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "new-member") continue;
    const scaffold = scaffoldNewMember(map, sourceTree, destination, placement, source);
    if (scaffold.status === "refused") return scaffold;
    content.push(...scaffold.content);
    Object.assign(states, scaffold.states);
  }
  return { status: "scaffolded", content, states };
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

function destinationIdentity(destination: Destination): string {
  if (destination.kind === "new-member") return destination.slug;
  if (destination.kind === "cohort-coordination") return destination.cohort;
  return destination.target.kind === "document"
    ? destination.destinationId
    : destination.target.slug;
}

function projectionLocus(destination: Destination, path: string): string {
  return `${destinationIdentity(destination)}:${path}`;
}

function unresolvedExistingPath(
  destination: Extract<Destination, { kind: "existing-home" }>,
): string {
  if (destination.target.kind === "document") return destination.target.path;
  if (destination.target.kind === "draft-block") return destination.target.locator.artifact;
  return `meta-${destination.target.slug}.md`;
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

function projectExistingHomeContributions(
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  baseMetas: readonly TreeMeta[],
  states: V3RepositoryPlanTree,
  content: V3PlannedContentContribution[],
): V3ContentProjectionRefusal | null {
  for (const destination of map.authoring.destinations) {
    if (destination.kind !== "existing-home") continue;
    const path = existingDestinationPath(destination, baseMetas);
    if (path === null) {
      return {
        status: "refused",
        reason: "existing-home-unresolvable",
        locus: projectionLocus(destination, unresolvedExistingPath(destination)),
      };
    }
    const current = stateAt(states, path);
    if (!regularFile(current)) {
      return {
        status: "refused",
        reason: "existing-home-unresolvable",
        locus: projectionLocus(destination, path),
      };
    }
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
  return null;
}

function targetArtifactRole(
  destination: Destination,
  target: string,
): V3PlannedContentContribution["artifactRole"] {
  if (destination.kind === "cohort-coordination") return "coordination";
  if (destination.kind === "existing-home") return "existing-home";
  const basename = posix.basename(target);
  if (basename === `meta-${destination.slug}.md`) return "meta";
  if (basename === `draft-${destination.slug}.md`) return "draft";
  if (basename === `tasks-${destination.slug}.md`) return "tasks";
  if (basename === `notes-${destination.slug}.md`) return "notes";
  return basename.endsWith("-rfc.md") ? "rfc" : "spec";
}

function projectAllocationContributions(
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  baseMetas: readonly TreeMeta[],
  states: V3RepositoryPlanTree,
  content: V3PlannedContentContribution[],
): V3ContentProjectionRefusal | null {
  const destinations = new Map(map.authoring.destinations.map((entry) => [entry.destinationId, entry]));
  for (const allocation of map.authoring.sourceAllocations) {
    if (allocation.disposition.kind !== "target") continue;
    const destination = destinations.get(allocation.disposition.destinationId);
    if (destination === undefined) {
      throw new Error("Validated allocation references an unknown destination.");
    }
    const target = allocationPath(destination, allocation as TargetAllocation, baseMetas, map);
    if (target === null) {
      const unresolvedPath = destination.kind === "existing-home"
        ? unresolvedExistingPath(destination)
        : allocation.disposition.targetLocator.artifact;
      return {
        status: "refused",
        reason: "existing-home-unresolvable",
        locus: projectionLocus(destination, unresolvedPath),
      };
    }
    const current = stateAt(states, target);
    if (current.kind === "absent") {
      return {
        status: "refused",
        reason: "target-artifact-absent",
        locus: projectionLocus(destination, target),
      };
    }
    if (!targetLocatorResolves(target, current, allocation.disposition.targetLocator)) {
      return {
        status: "refused",
        reason: "target-locator-unresolved",
        locus: projectionLocus(destination, target),
      };
    }
    content.push({
      path: target,
      destinationId: destination.destinationId,
      destinationKind: destination.kind,
      artifactRole: targetArtifactRole(destination, target),
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
  return null;
}

function contentContributions(
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  baseMetas: readonly TreeMeta[],
  topology: readonly V3TopologyAction[],
  scaffolds: V3ScaffoldedContent,
):
  | {
      status: "projected";
      content: V3PlannedContentContribution[];
      states: V3RepositoryPlanTree;
    }
  | V3ContentProjectionRefusal {
  const content = [...scaffolds.content];
  const states = cloneTree(baseTree);
  for (const action of topology) {
    if (action.kind !== "none") applyState(states, action.path, action.after);
  }
  for (const [path, state] of Object.entries(scaffolds.states)) applyState(states, path, state);
  const existingHomeRefusal = projectExistingHomeContributions(
    map,
    baseTree,
    baseMetas,
    states,
    content,
  );
  if (existingHomeRefusal !== null) return existingHomeRefusal;
  const allocationRefusal = projectAllocationContributions(
    map,
    baseTree,
    baseMetas,
    states,
    content,
  );
  return allocationRefusal ?? { status: "projected", content, states };
}

type V3DependencyProjectionResult =
  | { status: "projected"; contributions: V3PlannedDependencyContribution[] }
  | {
      status: "refused";
      reason: "dependency-projection-failed" | "unchanged-dependency-slot";
      locus?: string;
      dependencyRecipient?: V3RepositoryPlanDependencyRecipient;
    };

function dependencies(
  edits: V3ValidatedDependencyEdit[],
  map: V3DecomposeCutMap,
  baseTree: V3RepositoryPlanTree,
  states: V3RepositoryPlanTree,
): V3DependencyProjectionResult {
  const placement = memberPlacement(map);
  const output: V3PlannedDependencyContribution[] = [];
  for (const edit of edits) {
    const path = edit.writablePath
      ?? memberArtifactPath(placement, edit.dependent, "meta");
    const before = stateAt(states, path);
    const text = decodeText(before);
    if (text === null) return { status: "refused", reason: "dependency-projection-failed" };
    let afterText: string;
    try {
      const currentTargets = parseMetaRecord(text).dependsOn;
      const pinnedText = decodeText(stateAt(baseTree, path));
      const pinnedTargets = pinnedText === null ? null : parseMetaRecord(pinnedText).dependsOn;
      const removedTargets = new Set(edit.beforeTargets.filter((target) =>
        !edit.afterTargets.includes(target)));
      const addedTargets = edit.afterTargets.filter((target) =>
        !edit.beforeTargets.includes(target));
      const afterTargets = currentTargets.filter((target) => !removedTargets.has(target));
      for (const target of addedTargets) {
        if (!afterTargets.includes(target)) afterTargets.push(target);
      }
      if (currentTargets.length === afterTargets.length
        && currentTargets.every((target, index) => target === afterTargets[index])) {
        return {
          status: "refused",
          reason: "unchanged-dependency-slot",
          locus: edit.locus,
          ...(pinnedTargets === null
            ? {}
            : {
                dependencyRecipient: {
                  dependent: edit.dependent,
                  path,
                  targets: [...pinnedTargets],
                },
              }),
        };
      }
      afterText = setMetaBulletFields(text, {
        "Depends On": afterTargets.length === 0
          ? "[none]"
          : formatValue(afterTargets.join(", "), "identifier-list"),
      });
    } catch {
      return { status: "refused", reason: "dependency-projection-failed" };
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
  return { status: "projected", contributions: output };
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

type V3RepositoryPlanMode = "retirement" | "extraction";

async function composeRepositoryPlan(
  input: V3RepositoryPlanInput,
  mode: V3RepositoryPlanMode,
): Promise<V3RepositoryPlanResult> {
  const decoded = decodeV3DecomposeCutMap(input.completedMap);
  if (decoded.status === "rejected") {
    return refuse("map", decoded.issue.code, decoded.issue.path);
  }
  const map = decoded.value;
  const extraction = map.authoring.shape === "extraction";
  if ((mode === "extraction") !== extraction) {
    return refuse("map", "authoring-shape", "authoring.shape");
  }
  const sourceMetas = readTreeMetas(input.sourceTree);
  const baseMetas = readTreeMetas(input.resultBaseTree);
  if (sourceMetas === null || baseMetas === null) return refuse("source", "invalid-meta");
  const sourceMeta = uniqueMeta(sourceMetas, map.machine.source.origin);
  if (sourceMeta === null || sourceMeta.path !== input.currentPreflight.sourceOriginPath) {
    return refuse(
      "source",
      "source-meta-mismatch",
      input.currentPreflight.sourceOriginPath,
      {
        expected: input.currentPreflight.sourceOriginPath,
        actual: sourceMeta?.path ?? { kind: "absent" },
      },
    );
  }

  for (const artifact of input.currentPreflight.sourceArtifactInventory) {
    const observed = stateAt(input.sourceTree, artifact.path);
    if (!regularFile(observed)
      || observed.objectKind !== artifact.objectKind
      || observed.mode !== artifact.mode
      || digestBytes(observed.bytes) !== artifact.contentDigest) {
      return refuse(
        "source",
        "source-artifact-mismatch",
        artifact.path,
        {
          expected: {
            path: artifact.path,
            objectKind: artifact.objectKind,
            mode: artifact.mode,
            contentDigest: artifact.contentDigest,
          },
          actual: sourceArtifactEvidence(artifact.path, observed),
        },
      );
    }
  }

  const conservation = validateV3DecomposeConservation({
    completedMap: map,
    currentPreflight: input.currentPreflight,
    originDependsOn: [...sourceMeta.record.dependsOn],
    workUnits: liveWorkUnits(sourceMetas, baseMetas),
    resultBaseLiveSlugs: baseMetas.map(({ slug }) => slug),
    resultBaseCompletedSlugs: completedWorkUnitSlugs(input.resultBaseTree),
    ...(mode === "retirement"
      ? {
          retiringArtifacts: input.currentPreflight.sourceArtifactInventory.map(({ path }) => {
            const state = stateAt(input.sourceTree, path);
            return { path, byteLength: regularFile(state) ? state.bytes.byteLength : 0 };
          }),
        }
      : {}),
  });
  if (conservation.status === "refused") {
    return refuse(
      "conservation",
      `${conservation.refusal.stage}:${conservation.refusal.reason}`,
      conservation.refusal.locus,
      conservation.refusal.evidence,
      conservation.refusal.dependencyRecipient,
    );
  }

  let retirements: ReturnType<typeof exclusiveRetirements> | undefined;
  if (mode === "retirement") {
    const sourceKind = map.machine.source.kind;
    if (sourceKind === "active-origin") return refuse("retirement", "source-kind");
    const predecessorMeta = uniqueMeta(baseMetas, map.machine.source.origin);
    if (predecessorMeta === null) return refuse("retirement", "ambiguous-predecessor");
    const retirement = planV3RetirementDelta({
      sourceKind,
      mergeBases: input.mergeBases,
      predecessorCandidates: [predecessorMeta.path],
      predecessorArtifactPaths: originArtifactPaths(
        input.resultBaseTree,
        predecessorMeta.path,
        map.machine.source.origin,
      ),
      originArtifactPaths: input.currentPreflight.sourceArtifactInventory.map(({ path }) => path),
      roadmapPath: ROADMAP_PATH,
      baseTree: regularTree(input.mergeBaseTree),
      sourceTree: regularTree(input.sourceTree),
      resultTree: regularTree(input.resultBaseTree),
    });
    if (retirement.status === "refused") {
      return refuse(
        "retirement",
        retirement.refusal.code,
        retirement.refusal.path,
        retirement.refusal.evidence,
      );
    }
    const firstRider = retirement.riders[0];
    if (firstRider !== undefined) {
      return refuse("retirement", firstRider.reason, firstRider.path);
    }
    retirements = exclusiveRetirements(retirement, input.resultBaseTree);
  }

  const topologyInput: V3TopologyPlanInput = {
    origin: map.machine.source.origin,
    placement: map.authoring.placement,
    destinations: map.authoring.destinations,
    baseTree: Object.fromEntries(
      Object.entries(input.resultBaseTree)
        .filter((entry): entry is [string, Exclude<V3RepositoryPlanState, { kind: "absent" }>] =>
          entry[1].kind === "object"),
    ),
    cohortTemplate: input.cohortTemplate,
  };
  const topology = mode === "extraction"
    ? planInternalV3DecomposeTopology({
        ...topologyInput,
        survivingOrigin: map.machine.source.origin,
      } satisfies V3InternalTopologyPlanInput)
    : planV3DecomposeTopology(topologyInput);
  if (topology.status === "refused") {
    return refuse("topology", topology.refusal.code, topology.refusal.path);
  }
  const scaffolds = newMemberScaffolds(
    map,
    input.sourceTree,
    sourceMeta.path,
    sourceMeta.record,
  );
  if (scaffolds.status === "refused") {
    return refuse("content", scaffolds.reason, scaffolds.locus);
  }
  const projectedContent = contentContributions(
    map,
    input.resultBaseTree,
    baseMetas,
    topology.plan.actions,
    scaffolds,
  );
  if (projectedContent.status === "refused") {
    return refuse("content", projectedContent.reason, projectedContent.locus);
  }
  const dependencyProjection = dependencies(
    conservation.dependencyEdits,
    map,
    input.resultBaseTree,
    projectedContent.states,
  );
  if (dependencyProjection.status === "refused") {
    return refuse(
      "dependency",
      dependencyProjection.reason,
      dependencyProjection.locus,
      undefined,
      dependencyProjection.dependencyRecipient,
    );
  }
  const dependencyContributions = dependencyProjection.contributions;

  const roadmapBefore = stateAt(input.resultBaseTree, ROADMAP_PATH);
  if (!regularFile(roadmapBefore)) return refuse("roadmap", "roadmap-missing", ROADMAP_PATH);
  const expectedPaths = [...new Set([
    ...topology.plan.actions.flatMap((action) => action.kind === "none" ? [] : [action.path]),
    ...projectedContent.content.map(({ path }) => path),
    ...dependencyContributions.map(({ path }) => path),
    ...(retirements === undefined ? [] : [retirements.predecessor.path]),
    ...(retirements?.source.map(({ path }) => path) ?? []),
    ROADMAP_PATH,
  ])].sort(compareUtf8);

  const compose = (roadmapAfter: V3RepositoryPlanState) => composeV3DecomposePlan({
    preflightId: map.machine.preflightId,
    cutMapDigest: v3CutMapDigest(map),
    sourceHead: map.machine.source.head,
    expectedBaseHead: map.machine.resultBase.head,
    ...(mode === "retirement" ? {
      prospectiveTransition: {
        origin: map.machine.source.origin,
        sourceBranch: map.machine.source.logicalBranch,
      },
    } : {}),
    planningProfile: map.machine.planningProfile,
    destinations: map.authoring.destinations,
    validatedAllocations: conservation.allocations,
    expectedPaths,
    content: projectedContent.content,
    topology: topology.plan.actions,
    dependencies: dependencyContributions,
    ...(retirements === undefined ? {} : {
      predecessorRetirement: retirements.predecessor,
      sourceRetirements: retirements.source,
    }),
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
    retirements?.predecessor,
    retirements?.source,
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
    ...(mode === "extraction" ? {
      extractionFacts: extractionFacts(map, sourceMeta.path),
    } : {}),
  };
}

/**
 * Derive one retirement plan from a completed map and exact repository trees.
 *
 * @param input - Revalidated preflight, pinned trees, cohort template, and ROADMAP renderer.
 * @returns One content-addressed retirement plan or a typed pre-occupation refusal.
 */
export async function composeV3RepositoryPlan(
  input: V3RepositoryPlanInput,
): Promise<V3RepositoryPlanResult> {
  return await composeRepositoryPlan(input, "retirement");
}

/**
 * Derive one additive extraction plan from a completed map and exact repository trees.
 *
 * @param input - Revalidated preflight, pinned trees, cohort template, and ROADMAP renderer.
 * @returns One content-addressed additive plan or a typed pre-occupation refusal.
 */
export async function composeV3ExtractionRepositoryPlan(
  input: V3RepositoryPlanInput,
): Promise<V3RepositoryPlanResult> {
  return await composeRepositoryPlan(input, "extraction");
}
