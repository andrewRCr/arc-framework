/** Pure canonical managed-path registry for one immutable v3 decomposition plan. */

import {
  canonicalDigest,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import {
  createProspectiveTransitionOverlay,
  type ProspectiveTransitionOverlay,
} from "./transition-overlay.js";
import {
  V3PathStateSchema,
  v3PlanId,
  type V3CandidatePublication,
} from "./decompose-v3-preparation.js";

export type V3PlanFileState = {
  kind: "file";
  mode: "100644" | "100755";
  contentDigest: CanonicalDigest;
};
export type V3PlanCanonicalPathState = { kind: "absent" } | V3PlanFileState;
export type V3PlanObservedPathState = V3PlanCanonicalPathState | {
  kind: "object";
  objectKind: string;
  mode: string;
  contentDigest: CanonicalDigest;
};

export type V3PlanExclusiveRole =
  | "receipt-evidence"
  | "retiring-source"
  | "predecessor-retirement"
  | "roadmap";

interface V3PlanContributorBase {
  before: V3PlanObservedPathState;
  after: V3PlanObservedPathState;
}

export interface V3PlanTopologyContributor extends V3PlanContributorBase {
  kind: "topology";
  contributorIdentity: string;
}

export interface V3PlanContentContributor extends V3PlanContributorBase {
  kind: "content";
  destinationId: string;
  contributorKind: string;
  contributorIdentity: string;
  disposition: "whole-file" | "patch";
}

export interface V3PlanDependencyContributor extends V3PlanContributorBase {
  kind: "dependency";
  edgeId: string;
}

export type V3PlanContributor =
  | V3PlanTopologyContributor
  | V3PlanContentContributor
  | V3PlanDependencyContributor;

interface V3PlanClaimBase {
  path: string;
  base: V3PlanObservedPathState;
}

export interface V3PlanExclusiveClaim extends V3PlanClaimBase {
  kind: "exclusive";
  role: V3PlanExclusiveRole;
  after: V3PlanObservedPathState;
}

export interface V3PlanContributorClaim extends V3PlanClaimBase {
  kind: "contributor";
  contributor: V3PlanContributor;
}

export type V3PlanPathClaim = V3PlanExclusiveClaim | V3PlanContributorClaim;

export interface BuildValidatedDecomposePlanInput {
  preflightId: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
  candidatePublication: V3CandidatePublication;
  topologyDigest: CanonicalDigest;
  origin: string;
  sourceBranch: string;
  claims: readonly V3PlanPathClaim[];
}

export interface V3ValidatedExclusiveMutation {
  kind: "exclusive";
  path: string;
  role: V3PlanExclusiveRole;
  before: V3PlanCanonicalPathState;
  after: V3PlanCanonicalPathState;
}

export interface V3ValidatedComposedMutation {
  kind: "composed";
  path: string;
  before: V3PlanCanonicalPathState;
  after: V3PlanCanonicalPathState;
  contributors: V3PlanContributor[];
}

export type V3ValidatedPathMutation =
  | V3ValidatedExclusiveMutation
  | V3ValidatedComposedMutation;

export interface ValidatedDecomposePlan {
  planId: CanonicalDigest;
  allowedPaths: string[];
  allowedPathsDigest: CanonicalDigest;
  prospectiveOverlay: ProspectiveTransitionOverlay;
  roadmap: {
    path: string;
    before: V3PlanCanonicalPathState;
    after: V3PlanCanonicalPathState;
  } | null;
  mutations: V3ValidatedPathMutation[];
}

export type V3PlanRefusalCode =
  | "invalid-plan-operand"
  | "invalid-managed-path"
  | "unsupported-path-state"
  | "incompatible-base-prestate"
  | "exclusive-role-collision"
  | "duplicate-role-owner"
  | "duplicate-whole-file-owner"
  | "incompatible-mode-transition"
  | "contributor-prestate-discontinuity";

export interface V3PlanRefusal {
  code: V3PlanRefusalCode;
  path?: string;
  contributorIdentity?: string;
}

export type BuildValidatedDecomposePlanResult =
  | { ok: true; plan: ValidatedDecomposePlan }
  | { ok: false; refusal: V3PlanRefusal };

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function compareTuple(left: readonly string[], right: readonly string[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const comparison = compareUtf8(left[index] ?? "", right[index] ?? "");
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function normalizeState(state: V3PlanObservedPathState): V3PlanCanonicalPathState | null {
  const direct = V3PathStateSchema.safeParse(state);
  if (direct.success) return direct.data;
  if (state.kind !== "object"
    || state.objectKind !== "blob"
    || (state.mode !== "100644" && state.mode !== "100755")
    || !isCanonicalDigest(state.contentDigest)) return null;
  return {
    kind: "file",
    mode: state.mode,
    contentDigest: state.contentDigest,
  };
}

function statesEqual(left: V3PlanCanonicalPathState, right: V3PlanCanonicalPathState): boolean {
  return canonicalDigest(left) === canonicalDigest(right);
}

function contributorIdentity(contributor: V3PlanContributor): string {
  return contributor.kind === "dependency"
    ? contributor.edgeId
    : contributor.contributorIdentity;
}

function contributorKey(contributor: V3PlanContributor): readonly string[] {
  if (contributor.kind === "topology") return ["0", contributor.contributorIdentity];
  if (contributor.kind === "content") {
    return [
      "1",
      contributor.destinationId,
      contributor.contributorKind,
      contributor.contributorIdentity,
    ];
  }
  return ["2", contributor.edgeId];
}

function validIdentity(value: string): boolean {
  return value.trim() !== "" && !value.includes("\0");
}

function contributorIsStructurallyValid(contributor: V3PlanContributor): boolean {
  if (contributor.kind === "topology") return validIdentity(contributor.contributorIdentity);
  if (contributor.kind === "dependency") return validIdentity(contributor.edgeId);
  return validIdentity(contributor.destinationId)
    && validIdentity(contributor.contributorKind)
    && validIdentity(contributor.contributorIdentity);
}

function modeTransitionIsCompatible(
  before: V3PlanCanonicalPathState,
  after: V3PlanCanonicalPathState,
): boolean {
  return before.kind !== "file" || after.kind !== "file" || before.mode === after.mode;
}

interface NormalizedClaim {
  claim: V3PlanPathClaim;
  base: V3PlanCanonicalPathState;
}

function invalidOperand(input: BuildValidatedDecomposePlanInput): boolean {
  return !isCanonicalDigest(input.preflightId)
    || !isCanonicalDigest(input.cutMapDigest)
    || !isCanonicalDigest(input.topologyDigest)
    || !validIdentity(input.origin)
    || !validIdentity(input.sourceBranch);
}

/**
 * Close independently planned path claims into one deterministic mutation table.
 *
 * The function is intentionally side-effect free: a refusal cannot leave a partial
 * plan or authorize any repository mutation.
 */
export function buildValidatedDecomposePlan(
  input: BuildValidatedDecomposePlanInput,
): BuildValidatedDecomposePlanResult {
  if (invalidOperand(input)) return { ok: false, refusal: { code: "invalid-plan-operand" } };

  const grouped = new Map<string, NormalizedClaim[]>();
  for (const claim of input.claims) {
    if (!isManagedPath(claim.path)) {
      return { ok: false, refusal: { code: "invalid-managed-path", path: claim.path } };
    }
    const base = normalizeState(claim.base);
    if (base === null) {
      return { ok: false, refusal: { code: "unsupported-path-state", path: claim.path } };
    }
    const claims = grouped.get(claim.path) ?? [];
    claims.push({ claim, base });
    grouped.set(claim.path, claims);
  }

  const allowedPaths = sortByCanonicalBytes([...grouped.keys()]);
  const mutations: V3ValidatedPathMutation[] = [];
  const exclusiveRoleOwners = new Set<V3PlanExclusiveRole>();
  let roadmap: ValidatedDecomposePlan["roadmap"] = null;

  for (const path of allowedPaths) {
    const entries = grouped.get(path);
    const firstEntry = entries?.at(0);
    if (entries === undefined || firstEntry === undefined) {
      return { ok: false, refusal: { code: "invalid-plan-operand" } };
    }
    const base = firstEntry.base;
    if (entries.some((entry) => !statesEqual(entry.base, base))) {
      return { ok: false, refusal: { code: "incompatible-base-prestate", path } };
    }

    const exclusive = entries.filter(
      (entry): entry is NormalizedClaim & { claim: V3PlanExclusiveClaim } =>
        entry.claim.kind === "exclusive",
    );
    if (exclusive.length > 0) {
      if (entries.length !== 1) {
        return { ok: false, refusal: { code: "exclusive-role-collision", path } };
      }
      const exclusiveEntry = exclusive.at(0);
      if (exclusiveEntry === undefined) {
        return { ok: false, refusal: { code: "invalid-plan-operand" } };
      }
      const after = normalizeState(exclusiveEntry.claim.after);
      if (after === null) {
        return { ok: false, refusal: { code: "unsupported-path-state", path } };
      }
      if (!modeTransitionIsCompatible(base, after)) {
        return { ok: false, refusal: { code: "incompatible-mode-transition", path } };
      }
      if (exclusiveRoleOwners.has(exclusiveEntry.claim.role)) {
        return { ok: false, refusal: { code: "duplicate-role-owner", path } };
      }
      exclusiveRoleOwners.add(exclusiveEntry.claim.role);
      const mutation: V3ValidatedExclusiveMutation = {
        kind: "exclusive",
        path,
        role: exclusiveEntry.claim.role,
        before: base,
        after,
      };
      mutations.push(mutation);
      if (mutation.role === "roadmap") {
        roadmap = { path, before: base, after };
      }
      continue;
    }

    const contributors = entries.map((entry) => (entry.claim as V3PlanContributorClaim).contributor);
    if (contributors.some((contributor) => !contributorIsStructurallyValid(contributor))) {
      return { ok: false, refusal: { code: "invalid-plan-operand", path } };
    }
    contributors.sort((left, right) => compareTuple(contributorKey(left), contributorKey(right)));

    const roleKeys = contributors.map((contributor) => contributorKey(contributor).join("\0"));
    if (new Set(roleKeys).size !== roleKeys.length) {
      return { ok: false, refusal: { code: "duplicate-role-owner", path } };
    }
    if (contributors.filter(
      (contributor) => contributor.kind === "content" && contributor.disposition === "whole-file",
    ).length > 1) {
      return { ok: false, refusal: { code: "duplicate-whole-file-owner", path } };
    }

    let current = base;
    const normalizedContributors: V3PlanContributor[] = [];
    for (const contributor of contributors) {
      const before = normalizeState(contributor.before);
      const after = normalizeState(contributor.after);
      if (before === null || after === null) {
        return { ok: false, refusal: { code: "unsupported-path-state", path } };
      }
      const identity = contributorIdentity(contributor);
      if (!statesEqual(current, before)) {
        return {
          ok: false,
          refusal: {
            code: "contributor-prestate-discontinuity",
            path,
            contributorIdentity: identity,
          },
        };
      }
      if (!modeTransitionIsCompatible(before, after)) {
        return {
          ok: false,
          refusal: {
            code: "incompatible-mode-transition",
            path,
            contributorIdentity: identity,
          },
        };
      }
      normalizedContributors.push({ ...contributor, before, after });
      current = after;
    }
    mutations.push({
      kind: "composed",
      path,
      before: base,
      after: current,
      contributors: normalizedContributors,
    });
  }

  const allowedPathsDigest = canonicalDigest(allowedPaths);
  const planId = v3PlanId({
    preflightId: input.preflightId,
    cutMapDigest: input.cutMapDigest,
    allowedPathsDigest,
    candidatePublication: input.candidatePublication,
    topologyDigest: input.topologyDigest,
  });
  return {
    ok: true,
    plan: {
      planId,
      allowedPaths,
      allowedPathsDigest,
      prospectiveOverlay: createProspectiveTransitionOverlay({
        origin: input.origin,
        sourceBranch: input.sourceBranch,
        planId,
      }),
      roadmap,
      mutations,
    },
  };
}
