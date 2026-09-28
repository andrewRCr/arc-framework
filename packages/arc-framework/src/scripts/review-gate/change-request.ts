/** Exact-head change-request resolution independent of the invoking checkout's ref freshness. */

import { z } from "zod";

import { SpineRemedySchema, spineRemedy } from "../integration/spine-refusal.js";
import { GitObjectIdSchema } from "./core/gate-contract-v2-schema.js";

export const ChangeRequestCandidateSchema = z.object({
  number: z.number().int().positive(),
  url: z.url(),
  state: z.enum(["OPEN", "CLOSED", "MERGED"]),
  baseRefName: z.string().min(1),
  headRefName: z.string().min(1),
  headRefOid: GitObjectIdSchema,
}).strict();

export type ChangeRequestCandidate = z.infer<typeof ChangeRequestCandidateSchema>;

export interface ChangeRequestResolutionPort {
  resolveRepository(): Promise<string>;
  readHeadRef(headRef: string): Promise<{ local: string | null; remote: string | null }>;
  listByHead(repository: string, headRef: string): Promise<readonly ChangeRequestCandidate[]>;
  searchByHeadSha(repository: string, headSha: string): Promise<readonly ChangeRequestCandidate[]>;
}

export const ChangeRequestMergeCoordinatesSchema = z.strictObject({
  repository: z.string().trim().min(1),
  changeRequest: z.number().int().positive(),
  baseRef: z.string().trim().min(1),
  base: GitObjectIdSchema,
  head: GitObjectIdSchema,
});
export type ChangeRequestMergeCoordinates = z.infer<typeof ChangeRequestMergeCoordinatesSchema>;

const MergeObservationCoordinatesShape = ChangeRequestMergeCoordinatesSchema.shape;
const MergeObservationEvidenceShape = { evidenceRef: z.string().trim().min(1).optional() };

/** A host admission refusal that another observation of the same coordinates cannot change. */
export const HostAdmissionRefusalConditionSchema = z.enum(["head-moved", "base-ref-mismatch", "not-mergeable"]);
export type HostAdmissionRefusalCondition = z.infer<typeof HostAdmissionRefusalConditionSchema>;

/** Provider-neutral, exact-coordinate host admission observation. */
export const ChangeRequestMergeObservationSchema = z.discriminatedUnion("state", [
  z.strictObject({
    ...MergeObservationCoordinatesShape,
    ...MergeObservationEvidenceShape,
    state: z.literal("mergeable"),
  }),
  z.strictObject({
    ...MergeObservationCoordinatesShape,
    ...MergeObservationEvidenceShape,
    state: z.literal("base-currentness-required"),
    detail: z.string().trim().min(1),
  }),
  z.strictObject({
    ...MergeObservationCoordinatesShape,
    ...MergeObservationEvidenceShape,
    state: z.literal("refused"),
    detail: z.string().trim().min(1),
    condition: HostAdmissionRefusalConditionSchema.optional(),
  }),
  z.strictObject({
    ...MergeObservationCoordinatesShape,
    ...MergeObservationEvidenceShape,
    state: z.literal("unresolved"),
    detail: z.string().trim().min(1),
  }),
]);
export type ChangeRequestMergeObservation = z.infer<typeof ChangeRequestMergeObservationSchema>;

const HOST_ADMISSION_REFUSAL_CORRECTIONS: Record<HostAdmissionRefusalCondition, string> = {
  "head-moved": "Publish the approved head to the change request, or recompose over the head it now carries",
  "base-ref-mismatch": "Retarget the change request to the approved base branch",
  "not-mergeable": "Reconcile the branch with its current base and resolve the conflicts the host reports",
};

/**
 * Name the correction a typed host admission refusal asks for.
 *
 * @param admission - The normalized host admission observation.
 * @returns The refusal condition's correction, or `null` when the observation carries no typed condition.
 */
export function hostAdmissionRefusalCorrection(admission: ChangeRequestMergeObservation): string | null {
  return admission.state === "refused" && admission.condition !== undefined
    ? HOST_ADMISSION_REFUSAL_CORRECTIONS[admission.condition]
    : null;
}

export interface ChangeRequestMergeObservationPort {
  observe(
    coordinates: ChangeRequestMergeCoordinates,
    options?: { signal?: AbortSignal; baseContained?: boolean },
  ): Promise<unknown>;
}

function unresolvedMergeObservation(
  coordinates: ChangeRequestMergeCoordinates,
  detail: string,
): ChangeRequestMergeObservation {
  return { ...coordinates, state: "unresolved", detail };
}

/** Normalize one adapter observation to the provider-neutral exact-coordinate contract. */
export async function observeChangeRequestMergeAdmission(
  input: ChangeRequestMergeCoordinates,
  port: ChangeRequestMergeObservationPort,
  options?: { signal?: AbortSignal; baseContained?: boolean },
): Promise<ChangeRequestMergeObservation> {
  const coordinates = ChangeRequestMergeCoordinatesSchema.parse(input);
  let observed: unknown;
  try {
    observed = await port.observe(coordinates, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const detail = message.replace(/\s+/gu, " ").trim().slice(0, 1_024);
    return unresolvedMergeObservation(
      coordinates,
      detail === "" ? "Host admission observation failed." : `Host admission observation failed: ${detail}`,
    );
  }
  const parsed = ChangeRequestMergeObservationSchema.safeParse(observed);
  if (!parsed.success) {
    return unresolvedMergeObservation(
      coordinates,
      "Host admission evidence was malformed or unavailable.",
    );
  }
  const value = parsed.data;
  if (
    value.repository !== coordinates.repository
    || value.changeRequest !== coordinates.changeRequest
    || value.baseRef !== coordinates.baseRef
    || value.base !== coordinates.base
    || value.head !== coordinates.head
  ) {
    return unresolvedMergeObservation(
      coordinates,
      "Host admission evidence did not match the requested coordinates.",
    );
  }
  return value;
}

export const ChangeRequestResolveCliInputSchema = z.object({
  headRef: z.string().trim().min(1),
  headSha: GitObjectIdSchema,
  requireRemote: z.boolean().optional(),
}).strict();

export const ChangeRequestResolveInputSchema = ChangeRequestResolveCliInputSchema.extend({
  baseRef: z.string().trim().min(1),
  acceptableBaseRefs: z.array(z.string().trim().min(1)).readonly().optional(),
}).strict();
export type ChangeRequestResolveInput = z.infer<typeof ChangeRequestResolveInputSchema>;

export const ChangeRequestTargetRefSchema = z.strictObject({
  repository: z.string().trim().min(1),
  headRef: z.string().trim().min(1),
  headSha: GitObjectIdSchema,
});
export type ChangeRequestTargetRef = z.infer<typeof ChangeRequestTargetRefSchema>;

const ChangeRequestResultBaseShape = {
  schemaVersion: z.literal(1),
  mode: z.literal("review-change-request-resolve"),
  targetRef: ChangeRequestTargetRefSchema,
};

export const ChangeRequestResolveResultSchema = z.union([
  z.strictObject({ ...ChangeRequestResultBaseShape, state: z.literal("none"), nextAction: z.literal("create-change-request") }),
  z.strictObject({ ...ChangeRequestResultBaseShape, state: z.literal("open"), nextAction: z.literal("reuse-change-request"), candidate: ChangeRequestCandidateSchema }),
  z.strictObject({ ...ChangeRequestResultBaseShape, state: z.literal("merged-at-head"), nextAction: z.literal("complete"), candidate: ChangeRequestCandidateSchema }),
  z.strictObject({ ...ChangeRequestResultBaseShape, state: z.literal("merged-stale-head"), nextAction: z.literal("reconcile-head"), candidate: ChangeRequestCandidateSchema }),
  z.strictObject({ ...ChangeRequestResultBaseShape, state: z.literal("closed-unmerged"), nextAction: z.literal("reopen-change-request"), candidate: ChangeRequestCandidateSchema }),
  z.strictObject({
    ...ChangeRequestResultBaseShape,
    state: z.literal("ambiguous"),
    nextAction: z.literal("stop"),
    candidates: z.array(ChangeRequestCandidateSchema),
    remedy: SpineRemedySchema.optional(),
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    mode: z.literal("review-change-request-resolve"),
    targetRef: ChangeRequestTargetRefSchema.nullable(),
    state: z.literal("blocked"),
    nextAction: z.literal("stop"),
    reason: z.enum(["head-mismatch", "base-mismatch", "host-failure", "invalid-input"]),
    detail: z.string().trim().min(1),
    remedy: SpineRemedySchema.optional(),
  }),
]);
export type ChangeRequestResolveResult = z.infer<typeof ChangeRequestResolveResultSchema>;

function classifyCandidates(
  targetRef: ChangeRequestTargetRef,
  candidates: readonly ChangeRequestCandidate[],
  baseRef: string,
  acceptableBaseRefs: readonly string[],
): ChangeRequestResolveResult {
  const base = { schemaVersion: 1, mode: "review-change-request-resolve", targetRef } as const;
  const acceptedBases = new Set([baseRef, ...acceptableBaseRefs]);
  const matching = candidates.filter((candidate) => acceptedBases.has(candidate.baseRefName));
  if (candidates.length > 0 && matching.length === 0) {
    return {
      ...base,
      state: "blocked",
      nextAction: "stop",
      reason: "base-mismatch",
      detail: `The visible change request targets a different base than ${baseRef}.`,
    };
  }
  if (matching.length === 0) return { ...base, state: "none", nextAction: "create-change-request" };
  if (matching.length !== 1) return { ...base, state: "ambiguous", nextAction: "stop", candidates: matching };
  const candidate = matching[0];
  if (candidate === undefined) return { ...base, state: "ambiguous", nextAction: "stop", candidates: matching };
  if (candidate.state === "OPEN" && candidate.headRefOid === targetRef.headSha) {
    return { ...base, state: "open", nextAction: "reuse-change-request", candidate };
  }
  if (candidate.state === "MERGED" && candidate.headRefOid === targetRef.headSha) {
    return { ...base, state: "merged-at-head", nextAction: "complete", candidate };
  }
  if (candidate.state === "MERGED") {
    return { ...base, state: "merged-stale-head", nextAction: "reconcile-head", candidate };
  }
  if (candidate.state === "CLOSED") {
    return { ...base, state: "closed-unmerged", nextAction: "reopen-change-request", candidate };
  }
  return {
    ...base,
    state: "ambiguous",
    nextAction: "stop",
    candidates: matching,
    remedy: spineRemedy(
      "An open change request exists at a different head.",
      "Push the target branch, then re-run exact-head resolution",
      [
        "arc",
        "review",
        "change-request",
        "resolve",
        "--head-ref",
        targetRef.headRef,
        "--head-sha",
        targetRef.headSha,
      ],
    ),
  };
}

/** Resolve host change-request state for one exact proposed head. */
export async function resolveChangeRequest(
  input: ChangeRequestResolveInput,
  port: ChangeRequestResolutionPort,
): Promise<ChangeRequestResolveResult> {
  const request = ChangeRequestResolveInputSchema.parse(input);
  let targetRef: ChangeRequestTargetRef | null = null;
  try {
    const repository = await port.resolveRepository();
    targetRef = ChangeRequestTargetRefSchema.parse({
      repository,
      headRef: request.headRef,
      headSha: request.headSha,
    });
    const refs = await port.readHeadRef(request.headRef);
    if (request.requireRemote === true && refs.remote !== request.headSha) {
      return {
        schemaVersion: 1,
        mode: "review-change-request-resolve",
        targetRef,
        state: "blocked",
        nextAction: "stop",
        reason: "head-mismatch",
        detail: "The remote branch ref does not match the exact head required for change-request creation.",
      };
    }
    const visibleRefs = [refs.local, refs.remote].filter((oid): oid is string => oid !== null);
    if (refs.remote !== null && !visibleRefs.includes(request.headSha)) {
      return {
        schemaVersion: 1,
        mode: "review-change-request-resolve",
        targetRef,
        state: "blocked",
        nextAction: "stop",
        reason: "head-mismatch",
        detail: "The supplied head matches neither the local nor remote branch ref.",
      };
    }
    const byRef = await port.listByHead(repository, request.headRef);
    const acceptableBaseRefs = request.acceptableBaseRefs ?? [];
    if (byRef.length !== 0) return classifyCandidates(targetRef, byRef, request.baseRef, acceptableBaseRefs);
    return classifyCandidates(
      targetRef,
      await port.searchByHeadSha(repository, request.headSha),
      request.baseRef,
      acceptableBaseRefs,
    );
  } catch (error) {
    return {
      schemaVersion: 1,
      mode: "review-change-request-resolve",
      targetRef,
      state: "blocked",
      nextAction: "stop",
      reason: "host-failure",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
