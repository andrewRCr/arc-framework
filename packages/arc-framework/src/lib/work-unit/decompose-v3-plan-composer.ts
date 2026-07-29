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
} from "./decompose-v3-plan.js";
import type { V3CandidatePublication } from "./decompose-v3-preparation.js";
import { v3TopologyDigest, type V3TopologyFact } from "./decompose-v3-preparation.js";
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
  | "coordination"
  | "existing-home";

export type V3ContentContributorKind =
  | "scaffold"
  | "allocation"
  | "provisional-task"
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
  candidatePublication: V3CandidatePublication;
  topologyDigest: CanonicalDigest;
  origin: string;
  sourceBranch: string;
  receiptId: CanonicalDigest;
  planningProfile: V3DecomposeMachine["planningProfile"];
  destinations: Destination[];
  validatedAllocations: Allocation[];
  expectedPaths: string[];
  content: V3PlannedContentContribution[];
  topology: V3TopologyAction[];
  dependencies: V3PlannedDependencyContribution[];
  receiptEvidence: V3PlannedExclusivePath;
  predecessorRetirement: V3PlannedExclusivePath;
  sourceRetirements: V3PlannedExclusivePath[];
  roadmap: V3PlannedExclusivePath;
}

export interface V3PlanBlob {
  contentDigest: CanonicalDigest;
  bytes: Uint8Array;
}

export type V3PlanCompositionRefusalCode =
  | "invalid-receipt-id"
  | "unknown-destination"
  | "incompatible-content-role"
  | "incomplete-profile-artifacts"
  | "allocation-projection-mismatch"
  | "dependency-projection-mismatch"
  | "receipt-marker-missing"
  | "receipt-marker-forbidden"
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

function markerCount(value: V3PlannedByteState, receiptId: string): number {
  if (value.kind !== "object" || value.objectKind !== "blob") return 0;
  try {
    const marker = `- **Decomposition Receipt:** \`${receiptId}\``;
    return decoder.decode(value.bytes).split(/\r?\n/u).filter((line) => line === marker).length;
  } catch {
    return 0;
  }
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
  const roles: V3ContentArtifactRole[] = input.planningProfile.kind === "draft"
    ? ["draft"]
    : input.planningProfile.kind === "single-spec"
      ? ["spec"]
      : ["spec", "rfc"];
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
  if (contribution.contributorKind === "scaffold") {
    return contribution.artifactRole !== "coordination"
      && contribution.artifactRole !== "existing-home"
      && contribution.artifactRole !== "tasks"
      && contribution.disposition === "whole-file";
  }
  return contribution.contributorKind === "allocation" && contribution.disposition === "patch";
}

function projectionKey(sourceId: string, destinationId: string, targetLocator: TargetLocator): string {
  return canonicalDigest({ sourceId, destinationId, targetLocator });
}

/**
 * Render a canonical decomposition-created leaf meta with its prepared receipt identity.
 *
 * @param slug - New leaf work-unit slug.
 * @param receiptId - Stable prepared decomposition receipt identity.
 * @param overrides - Ordinary semantic meta overrides.
 * @returns UTF-8 bytes containing the canonical optional receipt field.
 */
export function renderV3NewLeafMeta(
  slug: string,
  receiptId: CanonicalDigest,
  overrides: MetaRenderOverrides,
): Uint8Array {
  if (!isCanonicalDigest(receiptId)) throw new Error("invalid v3 decomposition receipt identity");
  return new TextEncoder().encode(renderMetaFile(slug, {
    ...overrides,
    decompositionReceipt: receiptId,
  }));
}

/**
 * Bind every typed plan contribution into one canonical managed-path mutation table.
 *
 * @param input - Tree-derived profile, validated allocation projection, and exact byte claims.
 * @returns The closed plan plus its content-addressed final blobs, or the first refusal.
 */
export function composeV3DecomposePlan(input: V3PlanCompositionInput): V3PlanCompositionResult {
  if (!isCanonicalDigest(input.receiptId)) {
    return { status: "refused", refusal: { code: "invalid-receipt-id" } };
  }
  const destinations = new Map(input.destinations.map((entry) => [entry.destinationId, entry]));
  const allocationProjections = new Map<string, number>();
  for (const allocation of input.validatedAllocations) {
    if (allocation.disposition.kind !== "target") continue;
    const key = projectionKey(
      allocation.sourceId,
      allocation.disposition.destinationId,
      allocation.disposition.targetLocator,
    );
    allocationProjections.set(key, (allocationProjections.get(key) ?? 0) + 1);
  }

  for (const contribution of input.content) {
    const destination = destinations.get(contribution.destinationId);
    if (destination === undefined || destination.kind !== contribution.destinationKind) {
      return {
        status: "refused",
        refusal: {
          code: "unknown-destination",
          path: contribution.path,
          destinationId: contribution.destinationId,
        },
      };
    }
    if (!destinationRoleIsApplicable(contribution)) {
      return {
        status: "refused",
        refusal: {
          code: "incompatible-content-role",
          path: contribution.path,
          destinationId: contribution.destinationId,
          artifactRole: contribution.artifactRole,
        },
      };
    }
    const expectedIdentity = contentIdentity(contribution);
    if (contribution.contributorIdentity !== undefined
      && contribution.contributorIdentity !== expectedIdentity) {
      return {
        status: "refused",
        refusal: {
          code: "incompatible-content-role",
          path: contribution.path,
          destinationId: contribution.destinationId,
          artifactRole: contribution.artifactRole,
        },
      };
    }
    if (contribution.contributorKind === "allocation") {
      if (contribution.sourceProjection.length !== 1) {
        return {
          status: "refused",
          refusal: {
            code: "allocation-projection-mismatch",
            path: contribution.path,
            destinationId: contribution.destinationId,
          },
        };
      }
      const projection = contribution.sourceProjection[0];
      if (projection === undefined
        || !contribution.path.endsWith(`/${projection.targetLocator.artifact}`)
        || allocationProjections.get(projectionKey(
          projection.sourceId,
          contribution.destinationId,
          projection.targetLocator,
        )) !== 1) {
        return {
          status: "refused",
          refusal: {
            code: "allocation-projection-mismatch",
            path: contribution.path,
            destinationId: contribution.destinationId,
          },
        };
      }
      allocationProjections.set(projectionKey(
        projection.sourceId,
        contribution.destinationId,
        projection.targetLocator,
      ), 0);
    } else if (contribution.sourceProjection.length !== 0) {
      return {
        status: "refused",
        refusal: {
          code: "allocation-projection-mismatch",
          path: contribution.path,
          destinationId: contribution.destinationId,
        },
      };
    }
    const receiptMarkers = markerCount(contribution.after, input.receiptId);
    if (contribution.destinationKind === "new-member" && contribution.artifactRole === "meta") {
      if (receiptMarkers !== 1) {
        return {
          status: "refused",
          refusal: {
            code: "receipt-marker-missing",
            path: contribution.path,
            destinationId: contribution.destinationId,
          },
        };
      }
    } else if (receiptMarkers > 0) {
      return {
        status: "refused",
        refusal: {
          code: "receipt-marker-forbidden",
          path: contribution.path,
          destinationId: contribution.destinationId,
        },
      };
    }
  }
  const missingProjection = [...allocationProjections.values()].some((count) => count !== 0);
  if (missingProjection) {
    return { status: "refused", refusal: { code: "allocation-projection-mismatch" } };
  }

  const requiredRoles = expectedArtifactRoles(input.planningProfile);
  for (const destination of input.destinations) {
    if (destination.kind !== "new-member") continue;
    const incompatibleScaffold = input.content.find((entry) =>
      entry.destinationId === destination.destinationId
      && entry.contributorKind === "scaffold"
      && !requiredRoles.includes(entry.artifactRole));
    if (incompatibleScaffold !== undefined) {
      return {
        status: "refused",
        refusal: {
          code: "incompatible-content-role",
          path: incompatibleScaffold.path,
          destinationId: destination.destinationId,
          artifactRole: incompatibleScaffold.artifactRole,
        },
      };
    }
    for (const artifactRole of requiredRoles) {
      const matches = input.content.filter((entry) =>
        entry.destinationId === destination.destinationId
        && entry.contributorKind === "scaffold"
        && entry.artifactRole === artifactRole);
      if (matches.length !== 1) {
        return {
          status: "refused",
          refusal: {
            code: "incomplete-profile-artifacts",
            destinationId: destination.destinationId,
            artifactRole,
          },
        };
      }
    }
  }
  for (const destination of input.destinations) {
    if (destination.kind === "new-member"
      && !validNewMemberProfileMeta(input, destination.destinationId)) {
      return {
        status: "refused",
        refusal: {
          code: "profile-meta-mismatch",
          destinationId: destination.destinationId,
        },
      };
    }
  }
  for (const dependency of input.dependencies) {
    if (!isCanonicalDigest(dependency.edgeId)
      || dependency.dependent.trim() === ""
      || (dependency.destinationId !== null && !destinations.has(dependency.destinationId))) {
      return {
        status: "refused",
        refusal: {
          code: "dependency-projection-mismatch",
          path: dependency.path,
          destinationId: dependency.destinationId ?? undefined,
        },
      };
    }
  }

  const blobs = new Map<CanonicalDigest, Uint8Array>();
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
  const exclusive = (
    entry: V3PlannedExclusivePath,
    role: "receipt-evidence" | "predecessor-retirement" | "retiring-source" | "roadmap",
  ): void => {
    claims.push({
      kind: "exclusive",
      role,
      path: entry.path,
      base: state(entry.before, blobs),
      after: state(entry.after, blobs),
    });
  };
  exclusive(input.receiptEvidence, "receipt-evidence");
  exclusive(input.predecessorRetirement, "predecessor-retirement");
  for (const retirement of input.sourceRetirements) exclusive(retirement, "retiring-source");
  exclusive(input.roadmap, "roadmap");

  const expectedPaths = sortByCanonicalBytes(input.expectedPaths);
  const claimedPaths = sortByCanonicalBytes([...new Set(claims.map(({ path }) => path))]);
  if (new Set(input.expectedPaths).size !== input.expectedPaths.length
    || expectedPaths.length !== claimedPaths.length
    || expectedPaths.some((path, index) => path !== claimedPaths[index])) {
    return { status: "refused", refusal: { code: "managed-path-set-mismatch" } };
  }

  let topologyFacts: V3TopologyFact[];
  try {
    topologyFacts = input.topology.map((action): V3TopologyFact => action.kind === "none"
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
  let observedTopologyDigest: CanonicalDigest;
  try {
    observedTopologyDigest = v3TopologyDigest(topologyFacts);
  } catch {
    return { status: "refused", refusal: { code: "invalid-plan-operand" } };
  }
  if (observedTopologyDigest !== input.topologyDigest) {
    return { status: "refused", refusal: { code: "invalid-plan-operand" } };
  }

  const result = buildValidatedDecomposePlan({
    preflightId: input.preflightId,
    cutMapDigest: input.cutMapDigest,
    sourceHead: input.sourceHead,
    expectedBaseHead: input.expectedBaseHead,
    candidatePublication: input.candidatePublication,
    topology: {
      facts: topologyFacts,
      digest: input.topologyDigest,
    },
    origin: input.origin,
    sourceBranch: input.sourceBranch,
    claims,
  });
  if (!result.ok) return { status: "refused", refusal: result.refusal };

  const finalBlobs = new Map<CanonicalDigest, Uint8Array>();
  for (const mutation of result.plan.mutations) {
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
    status: "composed",
    plan: result.plan,
    blobs: [...finalBlobs.entries()]
      .sort(([left], [right]) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
      .map(([contentDigest, bytes]) => ({ contentDigest, bytes: new Uint8Array(bytes) })),
  };
}
