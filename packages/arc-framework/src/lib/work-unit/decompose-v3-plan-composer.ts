/** Typed byte-level composition for one immutable v3 decomposition result plan. */

import {
  canonicalDigest,
  digestBytes,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import {
  parseMetaRecord,
  renderMetaFile,
  type MetaRenderOverrides,
} from "../active/meta-reader.js";
import type { V3DecomposeCutMap, V3DecomposeMachine } from "./decompose-v3-schema.js";
import {
  buildValidatedDecomposePlan,
  type ValidatedDecomposePlan,
  type V3PlanObservedPathState,
  type V3PlanPathClaim,
  v3TopologyDigest,
  type V3TopologyFact,
} from "./decompose-v3-plan.js";
import type { V3TopologyAction, V3TopologyTreeState } from "./decompose-v3-topology.js";

export type V3PlannedByteState =
  | { kind: "absent" }
  | {
    kind: "object";
    objectKind: string;
    mode: string;
    bytes: Uint8Array;
  };

export type V3ContentArtifactRole =
  | "meta"
  | "draft"
  | "spec"
  | "rfc"
  | "tasks"
  | "notes"
  | "coordination"
  | "existing-home";

export type V3ContentContributorKind =
  | "scaffold"
  | "allocation"
  | "provisional-task"
  | "provisional-notes"
  | "existing-home-edit";

type Destination = V3DecomposeCutMap["authoring"]["destinations"][number];
type Allocation = V3DecomposeCutMap["authoring"]["sourceAllocations"][number];
type TargetLocator = Extract<Allocation["disposition"], { kind: "target" }>["targetLocator"];

export interface V3ContentSourceProjection {
  sourceId: CanonicalDigest;
  targetLocator: TargetLocator;
}

export interface V3PlannedContentContribution {
  path: string;
  destinationId: string;
  destinationKind: Destination["kind"];
  artifactRole: V3ContentArtifactRole;
  contributorKind: V3ContentContributorKind;
  contributorIdentity?: string;
  disposition: "whole-file" | "patch";
  sourceProjection: V3ContentSourceProjection[];
  base: V3PlannedByteState;
  before: V3PlannedByteState;
  after: V3PlannedByteState;
}

export interface V3PlannedDependencyContribution {
  path: string;
  edgeId: string;
  destinationId: string | null;
  dependent: string;
  base: V3PlannedByteState;
  before: V3PlannedByteState;
  after: V3PlannedByteState;
}

export interface V3PlannedExclusivePath {
  path: string;
  before: V3PlannedByteState;
  after: V3PlannedByteState;
}

export interface V3PlanCompositionInput {
  preflightId: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
  sourceHead: string;
  expectedBaseHead: string;
  prospectiveTransition?: {
    origin: string;
    sourceBranch: string;
  };
  planningProfile: V3DecomposeMachine["planningProfile"];
  destinations: Destination[];
  validatedAllocations: Allocation[];
  expectedPaths: string[];
  content: V3PlannedContentContribution[];
  topology: V3TopologyAction[];
  dependencies: V3PlannedDependencyContribution[];
  predecessorRetirement?: V3PlannedExclusivePath;
  sourceRetirements?: V3PlannedExclusivePath[];
  roadmap: V3PlannedExclusivePath;
}

export interface V3PlanBlob {
  contentDigest: CanonicalDigest;
  bytes: Uint8Array;
}

export type V3PlanCompositionRefusalCode =
  | "unknown-destination"
  | "incompatible-content-role"
  | "incomplete-profile-artifacts"
  | "allocation-projection-mismatch"
  | "dependency-projection-mismatch"
  | "profile-meta-mismatch"
  | "managed-path-set-mismatch"
  | "unsupported-path-state"
  | "incompatible-base-prestate"
  | "exclusive-role-collision"
  | "duplicate-role-owner"
  | "duplicate-whole-file-owner"
  | "incompatible-mode-transition"
  | "contributor-prestate-discontinuity"
  | "invalid-plan-operand"
  | "invalid-managed-path";

export interface V3PlanCompositionRefusal {
  code: V3PlanCompositionRefusalCode;
  path?: string;
  destinationId?: string;
  artifactRole?: V3ContentArtifactRole;
  contributorIdentity?: string;
}

export type V3PlanCompositionResult =
  | { status: "composed"; plan: ValidatedDecomposePlan; blobs: V3PlanBlob[] }
  | { status: "refused"; refusal: V3PlanCompositionRefusal };

const decoder = new TextDecoder("utf-8", { fatal: true });

function state(
  value: V3PlannedByteState,
  blobs: Map<CanonicalDigest, Uint8Array>,
): V3PlanObservedPathState {
  if (value.kind === "absent") return value;
  const contentDigest = digestBytes(value.bytes);
  blobs.set(contentDigest, new Uint8Array(value.bytes));
  return {
    kind: "object",
    objectKind: value.objectKind,
    mode: value.mode,
    contentDigest,
  };
}

function topologyPreparationState(
  value: V3TopologyTreeState,
): Exclude<V3TopologyFact, { kind: "none" }>["before"] {
  if (value.kind === "absent") return value;
  if (value.objectKind !== "blob" || (value.mode !== "100644" && value.mode !== "100755")) {
    throw new Error("unsupported-topology-state");
  }
  return { kind: "file", mode: value.mode, contentDigest: digestBytes(value.bytes) };
}

function expectedArtifactRoles(
  profile: V3DecomposeMachine["planningProfile"],
): V3ContentArtifactRole[] {
  if (profile.kind === "draft") return ["meta", "draft"];
  if (profile.kind === "single-spec") return ["meta", "spec"];
  return ["meta", "spec", "rfc"];
}

function contentIdentity(contribution: V3PlannedContentContribution): string {
  if (contribution.contributorKind === "allocation") {
    const projection = contribution.sourceProjection[0];
    return projection === undefined ? "" : canonicalDigest(projection);
  }
  return contribution.artifactRole;
}

function artifactBasename(path: string): string {
  return path.split("/").at(-1) ?? "";
}

function validNewMemberProfileMeta(
  input: V3PlanCompositionInput,
  destinationId: string,
): boolean {
  const contributions = input.content.filter((entry) =>
    entry.destinationId === destinationId && entry.destinationKind === "new-member");
  const meta = contributions.filter(({ artifactRole }) => artifactRole === "meta");
  if (meta.length !== 1 || meta[0]?.after.kind !== "object"
    || meta[0].after.objectKind !== "blob") return false;
  let record;
  try {
    record = parseMetaRecord(decoder.decode(meta[0].after.bytes));
  } catch {
    return false;
  }
  const roles = expectedArtifactRoles(input.planningProfile).filter((role) => role !== "meta");
  const design = roles.map((role) => {
    const paths = [...new Set(
      contributions.filter((entry) => entry.artifactRole === role).map(({ path }) => path),
    )];
    return paths.length === 1 ? artifactBasename(paths[0] ?? "") : "";
  });
  const workflow = input.planningProfile.kind === "draft" ? "draft-design" : "generate-tasks";
  return design.every((path) => path !== "")
    && canonicalDigest(record.design) === canonicalDigest(design)
    && record.state === "Planning"
    && record.taskList === null
    && record.currentWorkflow === workflow
    && record.nextAction === `Begin ${workflow}`;
}

function scaffoldRoleIsApplicable(contribution: V3PlannedContentContribution): boolean {
  return contribution.artifactRole !== "coordination"
    && contribution.artifactRole !== "existing-home"
    && contribution.artifactRole !== "tasks"
    && contribution.disposition === "whole-file";
}

function destinationRoleIsApplicable(contribution: V3PlannedContentContribution): boolean {
  if (contribution.destinationKind === "cohort-coordination") {
    return contribution.artifactRole === "coordination"
      && contribution.contributorKind === "allocation"
      && contribution.disposition === "patch";
  }
  if (contribution.destinationKind === "existing-home") {
    return contribution.artifactRole === "existing-home"
      && (contribution.contributorKind === "allocation"
        || contribution.contributorKind === "existing-home-edit")
      && contribution.disposition === "patch";
  }
  if (contribution.contributorKind === "provisional-task") {
    return contribution.artifactRole === "tasks" && contribution.disposition === "whole-file";
  }
  if (contribution.contributorKind === "provisional-notes") {
    return contribution.artifactRole === "notes" && contribution.disposition === "whole-file";
  }
  if (contribution.contributorKind === "scaffold") {
    return scaffoldRoleIsApplicable(contribution);
  }
  return contribution.contributorKind === "allocation" && contribution.disposition === "patch";
}

function projectionKey(sourceId: string, destinationId: string, targetLocator: TargetLocator): string {
  return canonicalDigest({ sourceId, destinationId, targetLocator });
}

function allocationProjectionCounts(input: V3PlanCompositionInput): Map<string, number> {
  const projections = new Map<string, number>();
  for (const allocation of input.validatedAllocations) {
    if (allocation.disposition.kind !== "target") continue;
    const key = projectionKey(
      allocation.sourceId,
      allocation.disposition.destinationId,
      allocation.disposition.targetLocator,
    );
    projections.set(key, (projections.get(key) ?? 0) + 1);
  }
  return projections;
}

function consumeAllocationProjection(
  contribution: V3PlannedContentContribution,
  projections: Map<string, number>,
): V3PlanCompositionRefusal | null {
  if (contribution.contributorKind !== "allocation") {
    return contribution.sourceProjection.length === 0
      ? null
      : {
          code: "allocation-projection-mismatch",
          path: contribution.path,
          destinationId: contribution.destinationId,
        };
  }
  const projection = contribution.sourceProjection[0];
  if (contribution.sourceProjection.length !== 1
    || projection === undefined
    || !contribution.path.endsWith(`/${projection.targetLocator.artifact}`)) {
    return {
      code: "allocation-projection-mismatch",
      path: contribution.path,
      destinationId: contribution.destinationId,
    };
  }
  const key = projectionKey(
    projection.sourceId,
    contribution.destinationId,
    projection.targetLocator,
  );
  if (projections.get(key) !== 1) {
    return {
      code: "allocation-projection-mismatch",
      path: contribution.path,
      destinationId: contribution.destinationId,
    };
  }
  projections.set(key, 0);
  return null;
}

function validateContentContributions(
  input: V3PlanCompositionInput,
  destinations: ReadonlyMap<string, Destination>,
): V3PlanCompositionRefusal | null {
  const projections = allocationProjectionCounts(input);
  for (const contribution of input.content) {
    const destination = destinations.get(contribution.destinationId);
    if (destination === undefined || destination.kind !== contribution.destinationKind) {
      return {
        code: "unknown-destination",
        path: contribution.path,
        destinationId: contribution.destinationId,
      };
    }
    if (!destinationRoleIsApplicable(contribution)) {
      return {
        code: "incompatible-content-role",
        path: contribution.path,
        destinationId: contribution.destinationId,
        artifactRole: contribution.artifactRole,
      };
    }
    const expectedIdentity = contentIdentity(contribution);
    if (contribution.contributorIdentity !== undefined
      && contribution.contributorIdentity !== expectedIdentity) {
      return {
        code: "incompatible-content-role",
        path: contribution.path,
        destinationId: contribution.destinationId,
        artifactRole: contribution.artifactRole,
      };
    }
    const projectionMismatch = consumeAllocationProjection(contribution, projections);
    if (projectionMismatch !== null) return projectionMismatch;
  }
  return [...projections.values()].some((count) => count !== 0)
    ? { code: "allocation-projection-mismatch" }
    : null;
}

function validateNewMemberDestinations(
  input: V3PlanCompositionInput,
): V3PlanCompositionRefusal | null {
  const requiredRoles = expectedArtifactRoles(input.planningProfile);
  for (const destination of input.destinations) {
    if (destination.kind !== "new-member") continue;
    const incompatibleScaffold = input.content.find((entry) =>
      entry.destinationId === destination.destinationId
      && entry.contributorKind === "scaffold"
      && !requiredRoles.includes(entry.artifactRole));
    if (incompatibleScaffold !== undefined) {
      return {
        code: "incompatible-content-role",
        path: incompatibleScaffold.path,
        destinationId: destination.destinationId,
        artifactRole: incompatibleScaffold.artifactRole,
      };
    }
    for (const artifactRole of requiredRoles) {
      const matches = input.content.filter((entry) =>
        entry.destinationId === destination.destinationId
        && entry.contributorKind === "scaffold"
        && entry.artifactRole === artifactRole);
      if (matches.length !== 1) {
        return {
          code: "incomplete-profile-artifacts",
          destinationId: destination.destinationId,
          artifactRole,
        };
      }
    }
    if (!validNewMemberProfileMeta(input, destination.destinationId)) {
      return { code: "profile-meta-mismatch", destinationId: destination.destinationId };
    }
  }
  return null;
}

function validateDependencyProjections(
  dependencies: readonly V3PlannedDependencyContribution[],
  destinations: ReadonlyMap<string, Destination>,
): V3PlanCompositionRefusal | null {
  for (const dependency of dependencies) {
    if (!isCanonicalDigest(dependency.edgeId)
      || dependency.dependent.trim() === ""
      || (dependency.destinationId !== null && !destinations.has(dependency.destinationId))) {
      return {
        code: "dependency-projection-mismatch",
        path: dependency.path,
        destinationId: dependency.destinationId ?? undefined,
      };
    }
  }
  return null;
}

/**
 * Render a canonical decomposition-created leaf meta.
 *
 * @param slug - New leaf work-unit slug.
 * @param overrides - Ordinary semantic meta overrides.
 * @returns UTF-8 bytes containing the ordinary planning metadata.
 */
export function renderV3NewLeafMeta(
  slug: string,
  overrides: MetaRenderOverrides,
): Uint8Array {
  return new TextEncoder().encode(renderMetaFile(slug, overrides));
}

function pushExclusiveClaim(
  claims: V3PlanPathClaim[],
  blobs: Map<CanonicalDigest, Uint8Array>,
  entry: V3PlannedExclusivePath,
  role: "predecessor-retirement" | "retiring-source" | "roadmap",
): void {
  claims.push({
    kind: "exclusive",
    role,
    path: entry.path,
    base: state(entry.before, blobs),
    after: state(entry.after, blobs),
  });
}

function composePathClaims(
  input: V3PlanCompositionInput,
  blobs: Map<CanonicalDigest, Uint8Array>,
): V3PlanPathClaim[] {
  const claims: V3PlanPathClaim[] = [];
  for (const action of input.topology) {
    if (action.kind === "none") continue;
    claims.push({
      kind: "contributor",
      path: action.path,
      base: state(action.before, blobs),
      contributor: {
        kind: "topology",
        action: action.kind,
        contributorIdentity: `${action.kind}:${action.path}`,
        before: state(action.before, blobs),
        after: state(action.after, blobs),
      },
    });
  }
  for (const contribution of input.content) {
    claims.push({
      kind: "contributor",
      path: contribution.path,
      base: state(contribution.base, blobs),
      contributor: {
        kind: "content",
        destinationId: contribution.destinationId,
        destinationKind: contribution.destinationKind,
        artifactRole: contribution.artifactRole,
        contributorKind: contribution.contributorKind,
        contributorIdentity: contentIdentity(contribution),
        sourceProjection: structuredClone(contribution.sourceProjection),
        disposition: contribution.disposition,
        before: state(contribution.before, blobs),
        after: state(contribution.after, blobs),
      },
    });
  }
  for (const dependency of input.dependencies) {
    claims.push({
      kind: "contributor",
      path: dependency.path,
      base: state(dependency.base, blobs),
      contributor: {
        kind: "dependency",
        edgeId: dependency.edgeId,
        destinationId: dependency.destinationId,
        dependent: dependency.dependent,
        before: state(dependency.before, blobs),
        after: state(dependency.after, blobs),
      },
    });
  }
  if (input.predecessorRetirement !== undefined) {
    pushExclusiveClaim(claims, blobs, input.predecessorRetirement, "predecessor-retirement");
  }
  for (const retirement of input.sourceRetirements ?? []) {
    pushExclusiveClaim(claims, blobs, retirement, "retiring-source");
  }
  pushExclusiveClaim(claims, blobs, input.roadmap, "roadmap");
  return claims;
}

function managedPathMismatch(
  expectedPathInput: readonly string[],
  claims: readonly V3PlanPathClaim[],
): V3PlanCompositionRefusal | null {
  const expectedPaths = sortByCanonicalBytes(expectedPathInput);
  const claimedPaths = sortByCanonicalBytes([...new Set(claims.map(({ path }) => path))]);
  return new Set(expectedPathInput).size !== expectedPathInput.length
    || expectedPaths.length !== claimedPaths.length
    || expectedPaths.some((path, index) => path !== claimedPaths[index])
    ? { code: "managed-path-set-mismatch" }
    : null;
}

type PreparedTopology = {
  status: "ready";
  facts: V3TopologyFact[];
  digest: CanonicalDigest;
} | { status: "refused"; refusal: V3PlanCompositionRefusal };

function prepareTopologyFacts(topology: readonly V3TopologyAction[]): PreparedTopology {
  let facts: V3TopologyFact[];
  try {
    facts = topology.map((action): V3TopologyFact => action.kind === "none"
      ? action
      : {
          kind: action.kind,
          path: action.path,
          before: topologyPreparationState(action.before),
          after: topologyPreparationState(action.after),
        });
  } catch {
    return { status: "refused", refusal: { code: "unsupported-path-state" } };
  }
  try {
    return { status: "ready", facts, digest: v3TopologyDigest(facts) };
  } catch {
    return { status: "refused", refusal: { code: "invalid-plan-operand" } };
  }
}

type CollectedBlobs = {
  status: "collected";
  blobs: V3PlanBlob[];
} | { status: "refused"; refusal: V3PlanCompositionRefusal };

function collectFinalPlanBlobs(
  plan: ValidatedDecomposePlan,
  blobs: ReadonlyMap<CanonicalDigest, Uint8Array>,
): CollectedBlobs {
  const finalBlobs = new Map<CanonicalDigest, Uint8Array>();
  for (const mutation of plan.mutations) {
    if (mutation.after.kind === "absent") continue;
    const bytes = blobs.get(mutation.after.contentDigest);
    if (bytes === undefined) {
      return {
        status: "refused",
        refusal: { code: "unsupported-path-state", path: mutation.path },
      };
    }
    finalBlobs.set(mutation.after.contentDigest, bytes);
  }
  return {
    status: "collected",
    blobs: [...finalBlobs.entries()]
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([contentDigest, bytes]) => ({ contentDigest, bytes: new Uint8Array(bytes) })),
  };
}

/**
 * Bind every typed plan contribution into one canonical managed-path mutation table.
 *
 * @param input - Tree-derived profile, validated allocation projection, and exact byte claims.
 * @returns The closed plan plus its content-addressed final blobs, or the first refusal.
 */
export function composeV3DecomposePlan(input: V3PlanCompositionInput): V3PlanCompositionResult {
  const destinations = new Map(input.destinations.map((entry) => [entry.destinationId, entry]));
  const contentRefusal = validateContentContributions(input, destinations);
  if (contentRefusal !== null) return { status: "refused", refusal: contentRefusal };
  const destinationRefusal = validateNewMemberDestinations(input);
  if (destinationRefusal !== null) return { status: "refused", refusal: destinationRefusal };
  const dependencyRefusal = validateDependencyProjections(input.dependencies, destinations);
  if (dependencyRefusal !== null) return { status: "refused", refusal: dependencyRefusal };

  const blobs = new Map<CanonicalDigest, Uint8Array>();
  const claims = composePathClaims(input, blobs);
  const pathRefusal = managedPathMismatch(input.expectedPaths, claims);
  if (pathRefusal !== null) return { status: "refused", refusal: pathRefusal };
  const topology = prepareTopologyFacts(input.topology);
  if (topology.status === "refused") return topology;
  const result = buildValidatedDecomposePlan({
    preflightId: input.preflightId,
    cutMapDigest: input.cutMapDigest,
    sourceHead: input.sourceHead,
    expectedBaseHead: input.expectedBaseHead,
    topology: {
      facts: topology.facts,
      digest: topology.digest,
    },
    prospectiveTransition: input.prospectiveTransition,
    claims,
  });
  if (!result.ok) return { status: "refused", refusal: result.refusal };
  const collected = collectFinalPlanBlobs(result.plan, blobs);
  if (collected.status === "refused") return collected;
  return { status: "composed", plan: result.plan, blobs: collected.blobs };
}
