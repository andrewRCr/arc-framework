/** Closed version-3 decomposition preparation evidence and identity helpers. */

import { z } from "zod";

import {
  canonicalDigest,
  canonicalize,
  digestBytes,
  isCanonicalDigest,
  sortByCanonicalBytes,
  type CanonicalDigest,
} from "../canonical/canonical-json.js";
import { isManagedPath } from "../canonical/managed-path.js";
import { SlugSchema } from "../kernel/schema/slug.js";
import {
  V3DecomposeCutMapSchema,
  V3DecomposeLocatorSchema,
  parseV3DecomposeCutMap,
  v3AllowedPathsDigest,
  v3CutMapDigest,
  v3IncomingEdgeInventoryDigest,
  v3OutgoingEdgeInventoryDigest,
  v3PreflightId,
  v3ReceiptId,
  v3SourceArtifactDigest,
  v3SourceInventoryDigest,
  type V3DecomposeCutMap,
  type V3SourceArtifactEntry,
} from "./decompose-v3-schema.js";
import type { ValidatedDecomposePlan } from "./decompose-v3-plan.js";
import {
  v3CohortDocumentPath,
  type V3TopologyAction,
  type V3TopologyPlan,
  type V3TopologyTreeState,
} from "./decompose-v3-topology.js";

const DigestSchema = z.custom<CanonicalDigest>(isCanonicalDigest, "must be a canonical digest");
const ROADMAP_PATH = ".arc/backlog/ROADMAP.md";
const DecomposeSlugSchema = SlugSchema.transform((value): string => value);
const ManagedPathSchema = z.string().refine(
  (value: string): boolean => isManagedPath(value),
  "must be a managed repository-relative path",
);
const NonEmptyStringSchema = z.string().refine((value) => value.trim() !== "", "must be non-empty");

/** Canonical managed path for one finalized v3 decomposition receipt. */
export function v3DecomposeReceiptPath(receiptId: CanonicalDigest): string {
  return `.arc/system/.internal/retirement-receipts/${receiptId.replace(":", "-")}.json`;
}

export const V3PathStateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("absent") }),
  z.strictObject({
    kind: z.literal("file"),
    mode: z.enum(["100644", "100755"]),
    contentDigest: DigestSchema,
  }),
]);
const ExistingTargetSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("work-unit"), slug: DecomposeSlugSchema }),
  z.strictObject({ kind: z.literal("draft-block"), slug: DecomposeSlugSchema, locator: V3DecomposeLocatorSchema }),
  z.strictObject({ kind: z.literal("document"), path: ManagedPathSchema }),
]);
const LogicalAnchorSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("direct-member"), slug: DecomposeSlugSchema }),
  z.strictObject({ kind: z.literal("cohort"), cohort: NonEmptyStringSchema }),
  z.strictObject({ kind: z.literal("subcohort"), cohort: NonEmptyStringSchema }),
  z.strictObject({
    kind: z.literal("at-cap-fanout"),
    parent: NonEmptyStringSchema,
    origin: DecomposeSlugSchema,
  }),
]);
const PublicationEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("new-leaf"), slug: DecomposeSlugSchema }),
  z.strictObject({
    kind: z.literal("existing-destination"),
    destinationId: NonEmptyStringSchema,
    target: ExistingTargetSchema,
  }),
]);
export const V3CandidatePublicationSchema = z.strictObject({
  logicalAnchor: LogicalAnchorSchema,
  entries: z.array(PublicationEntrySchema),
});
const CandidateOwnershipSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("claimed"),
    protection: z.literal("full"),
    claimId: NonEmptyStringSchema,
    generation: z.number().int().positive(),
    candidateBranch: NonEmptyStringSchema,
    candidateWorktree: DigestSchema,
  }),
  z.strictObject({ kind: z.literal("not-applicable"), protection: z.literal("partial") }),
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
const ProspectiveProjectionSchema = z.strictObject({
  overlay: z.strictObject({
    origin: DecomposeSlugSchema,
    sourceBranch: NonEmptyStringSchema,
    planId: DigestSchema,
  }),
  roadmap: z.strictObject({
    path: ManagedPathSchema,
    before: V3PathStateSchema,
    after: V3PathStateSchema,
  }),
});
const PlanIdentityInputSchema = z.strictObject({
  preflightId: DigestSchema,
  cutMapDigest: DigestSchema,
  allowedPathsDigest: DigestSchema,
  candidatePublication: V3CandidatePublicationSchema,
  topologyDigest: DigestSchema,
});
const PreparationIdentityInputSchema = z.strictObject({
  receiptId: DigestSchema,
  planId: DigestSchema,
  resultBaseHead: NonEmptyStringSchema,
  sourceArtifactDigest: DigestSchema,
  sourceInventoryDigest: DigestSchema,
  incomingEdgeInventoryDigest: DigestSchema,
  outgoingEdgeInventoryDigest: DigestSchema,
  cutMapDigest: DigestSchema,
  allowedPathsDigest: DigestSchema,
  candidateOwnership: CandidateOwnershipSchema,
  candidatePublication: V3CandidatePublicationSchema,
  topologyDigest: DigestSchema,
  prospectiveProjection: ProspectiveProjectionSchema,
});
export const V3DecomposePreparationFactsSchema = z.strictObject({
  preflightId: DigestSchema,
  completedMap: V3DecomposeCutMapSchema,
  cutMapDigest: DigestSchema,
  sourceArtifactDigest: DigestSchema,
  sourceInventoryDigest: DigestSchema,
  incomingEdgeInventoryDigest: DigestSchema,
  outgoingEdgeInventoryDigest: DigestSchema,
  allowedPaths: z.array(ManagedPathSchema),
  allowedPathsDigest: DigestSchema,
  candidateOwnership: CandidateOwnershipSchema,
  candidatePublication: V3CandidatePublicationSchema,
  topology: z.strictObject({ facts: z.array(TopologyFactSchema), digest: DigestSchema }),
  prospectiveProjection: ProspectiveProjectionSchema,
});
export const V3DecomposePreparationSchema = z.strictObject({
  kind: z.literal("prepared-decompose"),
  schemaVersion: z.literal(3),
  receiptId: DigestSchema,
  preparationId: DigestSchema,
  facts: V3DecomposePreparationFactsSchema,
});

export type V3CandidatePublication = z.infer<typeof V3CandidatePublicationSchema>;
export type V3DecomposePreparationFacts = z.infer<typeof V3DecomposePreparationFactsSchema>;
export type V3DecomposePreparation = z.infer<typeof V3DecomposePreparationSchema>;
export type V3TopologyFact = z.infer<typeof TopologyFactSchema>;

export interface CreateV3DecomposePreparationInput {
  completedMap: V3DecomposeCutMap;
  sourceArtifactInventory: V3SourceArtifactEntry[];
  candidateOwnership: V3DecomposePreparationFacts["candidateOwnership"];
  candidateAuthority: V3ProjectedCandidateAuthority;
  plan: ValidatedDecomposePlan;
}

export type CreateV3DecomposePreparationResult =
  | { status: "ready"; preparation: V3DecomposePreparation }
  | { status: "rejected"; reason: string };

export interface V3ProjectedCandidateAuthority {
  candidatePublication: V3CandidatePublication;
  topology: {
    facts: V3TopologyFact[];
    digest: CanonicalDigest;
  };
}

export type ProjectV3CandidateAuthorityResult =
  | { status: "projected"; authority: V3ProjectedCandidateAuthority }
  | {
    status: "refused";
    refusal: {
      code:
        | "invalid-map"
        | "logical-anchor-mismatch"
        | "constituent-mismatch"
        | "topology-action-mismatch"
        | "topology-state-invalid";
      path?: string;
    };
  };

function ordered(values: readonly string[]): boolean {
  let previous: string | undefined;
  for (const value of values) {
    if (previous !== undefined
      && Buffer.compare(Buffer.from(previous, "utf8"), Buffer.from(value, "utf8")) >= 0) return false;
    previous = value;
  }
  return true;
}

/** Bind a stable opaque candidate-worktree identity to one claim generation. */
export function v3CandidateWorktreeId(claimId: string, generation: number): CanonicalDigest {
  return canonicalDigest({ schemaVersion: 1, kind: "decomposition-candidate-worktree", claimId, generation });
}

/** Bind a completed map's immutable operands into its mutation plan identity. */
export function v3PlanId(input: {
  preflightId: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
  allowedPathsDigest: CanonicalDigest;
  candidatePublication: V3CandidatePublication;
  topologyDigest: CanonicalDigest;
}): CanonicalDigest {
  const preimage = PlanIdentityInputSchema.parse(input);
  return canonicalDigest({ schemaVersion: 3, ...preimage });
}

/** Bind every prepared v3 fact into the compare-and-set preparation identity. */
export function v3PreparationId(input: {
  receiptId: CanonicalDigest;
  planId: CanonicalDigest;
  resultBaseHead: string;
  sourceArtifactDigest: CanonicalDigest;
  sourceInventoryDigest: CanonicalDigest;
  incomingEdgeInventoryDigest: CanonicalDigest;
  outgoingEdgeInventoryDigest: CanonicalDigest;
  cutMapDigest: CanonicalDigest;
  allowedPathsDigest: CanonicalDigest;
  candidateOwnership: V3DecomposePreparationFacts["candidateOwnership"];
  candidatePublication: V3CandidatePublication;
  topologyDigest: CanonicalDigest;
  prospectiveProjection: V3DecomposePreparationFacts["prospectiveProjection"];
}): CanonicalDigest {
  const preimage = PreparationIdentityInputSchema.parse(input);
  return canonicalDigest({ schemaVersion: 3, ...preimage });
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
    const equal = canonicalize(action.before) === canonicalize(action.after);
    if ((action.kind === "reuse" || action.kind === "ensure") !== equal) return null;
  }
  return parsed.data;
}

/** Digest the exact closed constitutive-topology fact array. */
export function v3TopologyDigest(
  facts: V3DecomposePreparationFacts["topology"]["facts"],
): CanonicalDigest {
  const parsed = parseV3TopologyFacts(facts);
  if (parsed === null) throw new Error("invalid-v3-topology-facts");
  return canonicalDigest(parsed);
}

/** Derive the exact preparation-bound publication from canonical destination order. */
export function v3CandidatePublication(
  map: V3DecomposeCutMap,
  logicalAnchor: V3CandidatePublication["logicalAnchor"],
): V3CandidatePublication {
  const entries: V3CandidatePublication["entries"] = [];
  for (const destination of map.authoring.destinations) {
    if (destination.kind === "cohort-coordination") continue;
    entries.push(destination.kind === "new-member"
      ? { kind: "new-leaf", slug: destination.slug }
      : {
          kind: "existing-destination",
          destinationId: destination.destinationId,
          target: destination.target,
        });
  }
  return {
    logicalAnchor,
    entries,
  };
}

function expectedLogicalAnchor(
  map: V3DecomposeCutMap,
): V3CandidatePublication["logicalAnchor"] | null {
  const newMembers = map.authoring.destinations
    .filter((destination): destination is Extract<typeof destination, { kind: "new-member" }> =>
      destination.kind === "new-member")
    .map(({ slug }) => slug);
  const { placement } = map.authoring;
  if (placement.kind === "direct-member") {
    const slug = newMembers[0];
    return newMembers.length === 1 && slug !== undefined ? { kind: "direct-member", slug } : null;
  }
  if (placement.kind === "cohort") return { kind: "cohort", cohort: placement.cohort };
  if (placement.kind === "subcohort") return { kind: "subcohort", cohort: placement.cohort };
  return {
    kind: "at-cap-fanout",
    parent: placement.parent,
    origin: map.machine.source.origin,
  };
}

function topologyState(
  state: V3TopologyTreeState,
): z.infer<typeof V3PathStateSchema> | null {
  if (state.kind === "absent") return state;
  if (state.objectKind !== "blob" || (state.mode !== "100644" && state.mode !== "100755")) return null;
  return { kind: "file", mode: state.mode, contentDigest: digestBytes(state.bytes) };
}

function topologyFact(action: V3TopologyAction): V3TopologyFact | null {
  if (action.kind === "none") return action;
  const before = topologyState(action.before);
  const after = topologyState(action.after);
  return before === null || after === null ? null : {
    kind: action.kind,
    path: action.path,
    before,
    after,
  };
}

function expectedTopologyActions(
  map: V3DecomposeCutMap,
): Array<{ path?: string; kinds: V3TopologyAction["kind"][] }> {
  const { placement } = map.authoring;
  if (placement.kind === "direct-member") return [{ kinds: ["none"] }];
  if (placement.kind === "cohort") {
    return [{ path: v3CohortDocumentPath(placement.cohort), kinds: ["create", "reuse"] }];
  }
  if (placement.kind === "subcohort") {
    const parent = placement.cohort.split("/")[0];
    return [
      { path: v3CohortDocumentPath(parent ?? ""), kinds: ["backfill", "ensure"] },
      { path: v3CohortDocumentPath(placement.cohort), kinds: ["create", "reuse"] },
    ];
  }
  return [{ path: v3CohortDocumentPath(placement.parent), kinds: ["append", "reuse"] }];
}

/**
 * Project a validated destination map and topology plan into one preparation-bound authority.
 *
 * @param mapInput - Closed v3 map whose canonical destination order owns publication order.
 * @param topology - Pure topology plan over exact base states.
 * @returns Exact publication and digest-bound topology facts, or a typed pre-occupation refusal.
 */
export function projectV3CandidateAuthority(
  mapInput: unknown,
  topology: V3TopologyPlan,
): ProjectV3CandidateAuthorityResult {
  const map = parseV3DecomposeCutMap(mapInput);
  if (map === null) return { status: "refused", refusal: { code: "invalid-map" } };
  const logicalAnchor = expectedLogicalAnchor(map);
  if (logicalAnchor === null
    || canonicalize(logicalAnchor) !== canonicalize(topology.logicalAnchor)) {
    return { status: "refused", refusal: { code: "logical-anchor-mismatch" } };
  }
  const newMembers = map.authoring.destinations
    .filter((destination): destination is Extract<typeof destination, { kind: "new-member" }> =>
      destination.kind === "new-member")
    .map(({ slug }) => slug);
  if (canonicalize(sortByCanonicalBytes(newMembers))
    !== canonicalize(sortByCanonicalBytes(topology.constituents))) {
    return { status: "refused", refusal: { code: "constituent-mismatch" } };
  }
  const expectedActions = expectedTopologyActions(map);
  if (topology.actions.length !== expectedActions.length) {
    return { status: "refused", refusal: { code: "topology-action-mismatch" } };
  }
  for (const [index, expected] of expectedActions.entries()) {
    const action = topology.actions[index];
    if (action === undefined || !expected.kinds.includes(action.kind)
      || (expected.path !== undefined && ("path" in action ? action.path : undefined) !== expected.path)) {
      return {
        status: "refused",
        refusal: {
          code: "topology-action-mismatch",
          ...(expected.path === undefined ? {} : { path: expected.path }),
        },
      };
    }
  }
  const facts = topology.actions.map(topologyFact);
  if (facts.some((fact) => fact === null)) {
    return { status: "refused", refusal: { code: "topology-state-invalid" } };
  }
  const parsedFacts = parseV3TopologyFacts(facts);
  if (parsedFacts === null) {
    return { status: "refused", refusal: { code: "topology-action-mismatch" } };
  }
  return {
    status: "projected",
    authority: {
      candidatePublication: v3CandidatePublication(map, logicalAnchor),
      topology: {
        facts: parsedFacts,
        digest: v3TopologyDigest(parsedFacts),
      },
    },
  };
}

function candidateOwnershipIsBound(
  ownership: V3DecomposePreparationFacts["candidateOwnership"],
): boolean {
  return ownership.kind === "not-applicable"
    || ownership.candidateWorktree === v3CandidateWorktreeId(ownership.claimId, ownership.generation);
}

function publicationIsBound(
  map: V3DecomposeCutMap,
  publication: V3CandidatePublication,
): boolean {
  return canonicalize(v3CandidatePublication(map, publication.logicalAnchor)) === canonicalize(publication);
}

function candidateAuthorityIsBound(
  map: V3DecomposeCutMap,
  authority: V3ProjectedCandidateAuthority,
): boolean {
  const logicalAnchor = expectedLogicalAnchor(map);
  if (logicalAnchor === null
    || canonicalize(authority.candidatePublication.logicalAnchor) !== canonicalize(logicalAnchor)
    || !publicationIsBound(map, authority.candidatePublication)) return false;
  const facts = parseV3TopologyFacts(authority.topology.facts);
  if (facts === null || authority.topology.digest !== v3TopologyDigest(facts)) return false;
  const expected = expectedTopologyActions(map);
  return facts.length === expected.length && expected.every((expectation, index) => {
    const fact = facts[index];
    return fact !== undefined
      && expectation.kinds.includes(fact.kind)
      && (expectation.path === undefined
        ? fact.kind === "none"
        : fact.kind !== "none" && fact.path === expectation.path);
  });
}

/**
 * Seal authenticated plan, inventory, ownership, publication, and topology operands
 * into one canonical preparation.
 */
export function createV3DecomposePreparation(
  input: CreateV3DecomposePreparationInput,
): CreateV3DecomposePreparationResult {
  const map = parseV3DecomposeCutMap(input.completedMap);
  const topologyFacts = parseV3TopologyFacts(input.candidateAuthority.topology.facts);
  const sourceArtifactDigest = v3SourceArtifactDigest(input.sourceArtifactInventory);
  if (map === null || topologyFacts === null || sourceArtifactDigest === null) {
    return { status: "rejected", reason: "invalid-preparation-operand" };
  }
  if (!candidateOwnershipIsBound(input.candidateOwnership)
    || !candidateAuthorityIsBound(map, input.candidateAuthority)) {
    return { status: "rejected", reason: "invalid-preparation-binding" };
  }
  const allowedPathsDigest = v3AllowedPathsDigest(input.plan.allowedPaths);
  const topologyDigest = v3TopologyDigest(topologyFacts);
  const cutMapDigest = v3CutMapDigest(map);
  const expectedPlanId = v3PlanId({
    preflightId: map.machine.preflightId,
    cutMapDigest,
    allowedPathsDigest: input.plan.allowedPathsDigest,
    candidatePublication: input.candidateAuthority.candidatePublication,
    topologyDigest,
  });
  if (allowedPathsDigest === null
    || allowedPathsDigest !== input.plan.allowedPathsDigest
    || input.plan.planId !== expectedPlanId
    || input.plan.cutMapDigest !== cutMapDigest
    || input.plan.sourceHead !== map.machine.source.head
    || input.plan.expectedBaseHead !== map.machine.resultBase.head
    || input.plan.prospectiveOverlay.origin !== map.machine.source.origin
    || input.plan.prospectiveOverlay.sourceBranch !== map.machine.source.logicalBranch
    || input.plan.prospectiveOverlay.planId !== expectedPlanId
    || input.plan.roadmap === null
    || input.plan.roadmap.path !== ROADMAP_PATH) {
    return { status: "rejected", reason: "plan-binding-mismatch" };
  }
  const receiptId = v3ReceiptId(map.machine);
  const recordPath = v3DecomposeReceiptPath(receiptId);
  if (!input.plan.allowedPaths.includes(recordPath)) {
    return { status: "rejected", reason: "receipt-path-missing" };
  }
  const prospectiveProjection = {
    overlay: {
      origin: input.plan.prospectiveOverlay.origin,
      sourceBranch: input.plan.prospectiveOverlay.sourceBranch,
      planId: input.plan.planId,
    },
    roadmap: input.plan.roadmap,
  };
  const facts: V3DecomposePreparationFacts = {
    preflightId: map.machine.preflightId,
    completedMap: map,
    cutMapDigest,
    sourceArtifactDigest,
    sourceInventoryDigest: v3SourceInventoryDigest(map.machine),
    incomingEdgeInventoryDigest: v3IncomingEdgeInventoryDigest(map.machine),
    outgoingEdgeInventoryDigest: v3OutgoingEdgeInventoryDigest(map.machine),
    allowedPaths: input.plan.allowedPaths,
    allowedPathsDigest: input.plan.allowedPathsDigest,
    candidateOwnership: input.candidateOwnership,
    candidatePublication: input.candidateAuthority.candidatePublication,
    topology: { facts: topologyFacts, digest: topologyDigest },
    prospectiveProjection,
  };
  const preparationId = v3PreparationId({
    receiptId,
    planId: input.plan.planId,
    resultBaseHead: map.machine.resultBase.head,
    sourceArtifactDigest: facts.sourceArtifactDigest,
    sourceInventoryDigest: facts.sourceInventoryDigest,
    incomingEdgeInventoryDigest: facts.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: facts.outgoingEdgeInventoryDigest,
    cutMapDigest,
    allowedPathsDigest: facts.allowedPathsDigest,
    candidateOwnership: facts.candidateOwnership,
    candidatePublication: facts.candidatePublication,
    topologyDigest,
    prospectiveProjection,
  });
  return {
    status: "ready",
    preparation: {
      kind: "prepared-decompose",
      schemaVersion: 3,
      receiptId,
      preparationId,
      facts,
    },
  };
}

/** Decode canonical v3 preparation evidence and recompute every bound identity. */
export function parseV3DecomposePreparation(input: unknown): V3DecomposePreparation | null {
  let candidate = input;
  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
      if (canonicalize(candidate) !== input) return null;
    } catch {
      return null;
    }
  }
  const parsed = V3DecomposePreparationSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const record = parsed.data;
  const { facts } = record;
  const map = parseV3DecomposeCutMap(facts.completedMap);
  if (map === null || !ordered(facts.allowedPaths)
    || facts.preflightId !== v3PreflightId({
      source: map.machine.source,
      resultBase: map.machine.resultBase,
      planningProfile: map.machine.planningProfile,
      sourceUnits: map.machine.sourceUnits,
      incomingEdges: map.machine.incomingEdges,
      outgoingEdges: map.machine.outgoingEdges,
    })
    || facts.cutMapDigest !== v3CutMapDigest(map)
    || facts.allowedPathsDigest !== v3AllowedPathsDigest(facts.allowedPaths)
    || facts.sourceInventoryDigest !== v3SourceInventoryDigest(map.machine)
    || facts.incomingEdgeInventoryDigest !== v3IncomingEdgeInventoryDigest(map.machine)
    || facts.outgoingEdgeInventoryDigest !== v3OutgoingEdgeInventoryDigest(map.machine)
    || record.receiptId !== v3ReceiptId(map.machine)
    || !facts.allowedPaths.includes(v3DecomposeReceiptPath(record.receiptId))) return null;
  const topologyFacts = parseV3TopologyFacts(facts.topology.facts);
  if (topologyFacts === null
    || !candidateOwnershipIsBound(facts.candidateOwnership)
    || !candidateAuthorityIsBound(map, {
      candidatePublication: facts.candidatePublication,
      topology: facts.topology,
    })
    || facts.prospectiveProjection.overlay.origin !== map.machine.source.origin
    || facts.prospectiveProjection.overlay.sourceBranch !== map.machine.source.logicalBranch
    || facts.prospectiveProjection.roadmap.path !== ROADMAP_PATH) return null;
  const topologyDigest = v3TopologyDigest(topologyFacts);
  if (facts.topology.digest !== topologyDigest) return null;
  const planId = v3PlanId({
    preflightId: facts.preflightId,
    cutMapDigest: facts.cutMapDigest,
    allowedPathsDigest: facts.allowedPathsDigest,
    candidatePublication: facts.candidatePublication,
    topologyDigest,
  });
  if (facts.prospectiveProjection.overlay.planId !== planId) return null;
  const expected = v3PreparationId({
    receiptId: record.receiptId,
    planId,
    resultBaseHead: map.machine.resultBase.head,
    sourceArtifactDigest: facts.sourceArtifactDigest,
    sourceInventoryDigest: facts.sourceInventoryDigest,
    incomingEdgeInventoryDigest: facts.incomingEdgeInventoryDigest,
    outgoingEdgeInventoryDigest: facts.outgoingEdgeInventoryDigest,
    cutMapDigest: facts.cutMapDigest,
    allowedPathsDigest: facts.allowedPathsDigest,
    candidateOwnership: facts.candidateOwnership,
    candidatePublication: facts.candidatePublication,
    topologyDigest,
    prospectiveProjection: facts.prospectiveProjection,
  });
  return record.preparationId === expected ? record : null;
}
