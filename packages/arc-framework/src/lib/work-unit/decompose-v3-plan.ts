/** Pure canonical managed-path registry for one immutable v3 decomposition plan. */

import { z } from "zod";

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

const DigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);

/** Canonical regular-file or absence state retained by a validated plan. */
export const V3PathStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("absent") }),
  z.strictObject({
    kind: z.literal("file"),
    mode: z.enum(["100644", "100755"]),
    contentDigest: DigestSchema,
  }),
]);

const TopologyFactSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("none") }),
  ...(["create", "ensure", "backfill", "reuse", "append"] as const).map((kind) => z.strictObject({
    kind: z.literal(kind),
    path: ManagedPathSchema,
    before: V3PathStateSchema,
    after: V3PathStateSchema,
  })),
]);

export type V3TopologyFact = z.infer<typeof TopologyFactSchema>;

function ordered(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined
      && Buffer.compare(Buffer.from(previous, "utf8"), Buffer.from(value, "utf8")) >= 0) return false;
    previous = value;
  }
  return true;
}

/** Decode one canonical topology fact set. */
export function parseV3TopologyFacts(input: unknown): V3TopologyFact[] | null {
  const parsed = z.array(TopologyFactSchema).safeParse(input);
  if (!parsed.success || parsed.data.length === 0) return null;
  if (parsed.data.length === 1 && parsed.data[0]?.kind === "none") return parsed.data;
  if (parsed.data.some(({ kind }) => kind === "none")) return null;
  const actions = parsed.data as Array<Exclude<V3TopologyFact, { kind: "none" }>>;
  if (!ordered(actions.map(({ path }) => path))) return null;
  for (const action of actions) {
    const equal = canonicalDigest(action.before) === canonicalDigest(action.after);
    if ((action.kind === "reuse" || action.kind === "ensure") !== equal) return null;
  }
  return parsed.data;
}

/** Digest the exact closed constitutive-topology fact array. */
export function v3TopologyDigest(facts: readonly V3TopologyFact[]): CanonicalDigest {
  const parsed = parseV3TopologyFacts(facts);
  if (parsed === null) throw new Error("invalid-v3-topology-facts");
  return canonicalDigest(parsed);
}

/** Bind a completed map's immutable operands into its mutation-plan identity. */
export function v3PlanId(input: {
  preflightId: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
  allowedPathsDigest: CanonicalDigest;
  topologyDigest: CanonicalDigest;
}): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 3, ...input });
}

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
  | "retiring-source"
  | "predecessor-retirement"
  | "roadmap";

interface V3PlanContributorBase {
  before: V3PlanObservedPathState;
  after: V3PlanObservedPathState;
}

export interface V3PlanTopologyContributor extends V3PlanContributorBase {
  kind: "topology";
  action: "create" | "ensure" | "backfill" | "reuse" | "append";
  contributorIdentity: string;
}

export interface V3PlanContentContributor extends V3PlanContributorBase {
  kind: "content";
  destinationId: string;
  destinationKind: "new-member" | "existing-home" | "cohort-coordination";
  artifactRole: string;
  contributorKind: string;
  contributorIdentity: string;
  sourceProjection: Array<{ sourceId: string; targetLocator: unknown }>;
  disposition: "whole-file" | "patch";
}

export interface V3PlanDependencyContributor extends V3PlanContributorBase {
  kind: "dependency";
  edgeId: string;
  destinationId: string | null;
  dependent: string;
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
  sourceHead: string;
  expectedBaseHead: string;
  topology: {
    facts: V3TopologyFact[];
    digest: CanonicalDigest;
  };
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
  cutMapDigest: CanonicalDigest;
  sourceHead: string;
  expectedBaseHead: string;
  topology: {
    facts: V3TopologyFact[];
    digest: CanonicalDigest;
  };
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
    const kindOrder: Record<string, string> = {
      scaffold: "0",
      "provisional-task": "0",
      allocation: "1",
      "existing-home-edit": "1",
    };
    return [
      "1",
      contributor.destinationId,
      kindOrder[contributor.contributorKind] ?? contributor.contributorKind,
      contributor.contributorKind,
      contributor.contributorIdentity,
    ];
  }
  return ["2", contributor.edgeId];
}

function validIdentity(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !value.includes("\0");
}

function contributorIsStructurallyValid(contributor: V3PlanContributor): boolean {
  if (contributor.kind === "topology") return validIdentity(contributor.contributorIdentity);
  if (contributor.kind === "dependency") {
    return validIdentity(contributor.edgeId)
      && validIdentity(contributor.dependent)
      && (contributor.destinationId === null || validIdentity(contributor.destinationId));
  }
  return validIdentity(contributor.destinationId)
    && validIdentity(contributor.destinationKind)
    && validIdentity(contributor.artifactRole)
    && validIdentity(contributor.contributorKind)
    && validIdentity(contributor.contributorIdentity)
    && contributor.sourceProjection.every(({ sourceId, targetLocator }) =>
      validIdentity(sourceId) && typeof targetLocator === "object" && targetLocator !== null);
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
  const topologyFacts = parseV3TopologyFacts(input.topology.facts);
  return !isCanonicalDigest(input.preflightId)
    || !isCanonicalDigest(input.cutMapDigest)
    || !isCanonicalDigest(input.topology.digest)
    || topologyFacts === null
    || input.topology.digest !== v3TopologyDigest(topologyFacts)
    || !validIdentity(input.sourceHead)
    || !validIdentity(input.expectedBaseHead)
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
  const topologyFactKeys = input.topology.facts.flatMap((fact) =>
    fact.kind === "none" ? [] : [`${fact.kind}\0${fact.path}`]);
  const topologyClaimKeys = input.claims.flatMap((claim) =>
    claim.kind === "contributor" && claim.contributor.kind === "topology"
      ? [`${claim.contributor.action}\0${claim.path}`]
      : []);
  if (new Set(topologyFactKeys).size !== topologyFactKeys.length
    || (input.topology.facts.some(({ kind }) => kind === "none")
      && input.topology.facts.length !== 1)
    || input.topology.facts.some((fact) => fact.kind !== "none" && !isManagedPath(fact.path))
    || canonicalDigest([...topologyFactKeys].sort()) !== canonicalDigest([...topologyClaimKeys].sort())) {
    return { ok: false, refusal: { code: "invalid-plan-operand" } };
  }

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
      if (exclusiveEntry.claim.role !== "retiring-source") {
        if (exclusiveRoleOwners.has(exclusiveEntry.claim.role)) {
          return { ok: false, refusal: { code: "duplicate-role-owner", path } };
        }
        exclusiveRoleOwners.add(exclusiveEntry.claim.role);
      }
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
    if (contributors.filter(({ kind }) => kind === "topology").length > 1) {
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
    topologyDigest: input.topology.digest,
  });
  return {
    ok: true,
    plan: {
      planId,
      cutMapDigest: input.cutMapDigest,
      sourceHead: input.sourceHead,
      expectedBaseHead: input.expectedBaseHead,
      topology: structuredClone(input.topology),
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
