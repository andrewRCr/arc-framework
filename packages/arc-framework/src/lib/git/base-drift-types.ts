/**
 * Storage-neutral contracts for base-drift analysis.
 *
 * @module
 */

import { WorktreeSyncStatusFields } from "./worktree-sync.js";
import { z } from "zod";
import type { PathTreatment } from "../evidence-applicability/index.js";

export const BaseDriftModeSchema = z.enum(["advisory", "authoritative"]);
export type BaseDriftMode = z.infer<typeof BaseDriftModeSchema>;
export const BaseDriftVerdictSchema = z.enum(["clean", "reconcile", "unavailable", "skipped"]);
export type BaseDriftVerdict = z.infer<typeof BaseDriftVerdictSchema>;
export const BaseMovementSchema = z.enum(["disjoint", "overlapping", "unknown"]);
export type BaseMovement = z.infer<typeof BaseMovementSchema>;

export const BaseDriftUnavailableReasonSchema = z.enum([
  "config-unavailable", "invalid-base", "detached-head", "no-remote", "fetch-timeout",
  "fetch-failed", "base-object-pending-fetch", "remote-evidence-unreachable",
  "remote-base-absent", "fetched-base-unresolved", "distance-read-failed",
]);
export type BaseDriftUnavailableReason = z.infer<typeof BaseDriftUnavailableReasonSchema>;

export const IntegrationEvidenceLimitationSchema = z.enum([
  "unclassified-commits", "resolver-unavailable", "resolver-invalid", "scan-truncated",
]);
export type IntegrationEvidenceLimitation = z.infer<typeof IntegrationEvidenceLimitationSchema>;

export const IntegrationIdentityFields = {
  slug: z.string().optional(),
  prNumber: z.number().optional(),
  prUrl: z.string().optional(),
} as const;
export const IntegrationIdentitySchema = z.strictObject(IntegrationIdentityFields);
export type IntegrationIdentity = z.infer<typeof IntegrationIdentitySchema>;

export const IntegrationEventSchema = z.strictObject({
  ...IntegrationIdentityFields,
  commits: z.array(z.string()),
  proof: z.enum(["topology", "resolver"]),
});
export type IntegrationEvent = z.infer<typeof IntegrationEventSchema>;

export const IntegrationEvidenceSchema = z.discriminatedUnion("coverage", [
  z.strictObject({
    coverage: z.literal("complete"),
    scannedCommitCount: z.number().int().nonnegative(),
    events: z.array(IntegrationEventSchema),
    unclassifiedCommitCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    limitations: z.array(IntegrationEvidenceLimitationSchema),
  }),
  z.strictObject({
    coverage: z.literal("partial"),
    scannedCommitCount: z.number().int().nonnegative(),
    events: z.array(IntegrationEventSchema),
    unclassifiedCommitCount: z.number().int().nonnegative(),
    truncated: z.boolean(),
    limitations: z.array(IntegrationEvidenceLimitationSchema),
  }),
  z.strictObject({ coverage: z.literal("unavailable"), reason: z.literal("history-scan-failed") }),
]);
export type IntegrationEvidence = z.infer<typeof IntegrationEvidenceSchema>;

export const OverlapEvidenceSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("available"),
    substantivePaths: z.array(z.string()),
    regenerablePaths: z.array(z.string()),
  }),
  z.strictObject({ status: z.literal("ambiguous") }),
  z.strictObject({ status: z.literal("unrelated") }),
  z.strictObject({
    status: z.literal("unavailable"),
    reason: z.enum(["merge-base-failed", "branch-diff-failed", "base-diff-failed", "classification-failed"]),
  }),
]);
export type OverlapEvidence = z.infer<typeof OverlapEvidenceSchema>;

export const BaseDriftRegisterSchema = z.strictObject({
  kind: z.enum(["calm", "attention", "degraded"]),
  text: z.string(),
}).nullable();
export type BaseDriftRegister = z.infer<typeof BaseDriftRegisterSchema>;

export const BaseDriftCoordinatesSchema = z.strictObject({
  base: z.string().nullable(),
  baseOid: z.string().nullable(),
  headOid: z.string().nullable(),
});
export type BaseDriftCoordinates = z.infer<typeof BaseDriftCoordinatesSchema>;

export const BaseDriftTerminalContinuationSchema = z.strictObject({
  kind: z.literal("terminal-explanation"),
  terminalExplanation: z.string(),
});
export type BaseDriftTerminalContinuation = z.infer<typeof BaseDriftTerminalContinuationSchema>;

export const BaseDriftResultCommonFields = {
  mode: BaseDriftModeSchema,
  state: WorktreeSyncStatusFields.state,
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  base: z.string().nullable(),
  baseOid: z.string().nullable(),
  /** Exact local commit analyzed by a healthy reading; null when no graph reading was available. */
  headOid: z.string().nullable(),
  integrationEvidence: IntegrationEvidenceSchema.nullable(),
  overlap: OverlapEvidenceSchema.nullable(),
  register: BaseDriftRegisterSchema,
  /** Compatibility failure category retained while status consumers migrate. */
  failureReason: z.enum(["timeout", "error"]).optional(),
} as const;

const NoUnavailableFields = {
  unavailableReason: z.never().optional(),
  detail: z.never().optional(),
  coordinates: z.never().optional(),
  continuation: z.never().optional(),
} as const;

/** Public base-drift result with a complete non-success explanation at the unavailable boundary. */
export const BaseDriftResultSchema = z.discriminatedUnion("verdict", [
  z.strictObject({ ...BaseDriftResultCommonFields, ...NoUnavailableFields,
    verdict: z.literal("clean"), movement: BaseMovementSchema }),
  z.strictObject({ ...BaseDriftResultCommonFields, ...NoUnavailableFields,
    verdict: z.literal("reconcile"), movement: BaseMovementSchema }),
  z.strictObject({
    ...BaseDriftResultCommonFields,
    verdict: z.literal("unavailable"),
    movement: z.never().optional(),
    unavailableReason: BaseDriftUnavailableReasonSchema,
    detail: z.string(),
    coordinates: BaseDriftCoordinatesSchema,
    continuation: BaseDriftTerminalContinuationSchema,
  }),
  z.strictObject({ ...BaseDriftResultCommonFields, ...NoUnavailableFields,
    verdict: z.literal("skipped"), movement: z.never().optional() }),
]);
export type BaseDriftResult = z.infer<typeof BaseDriftResultSchema>;

export interface BaseDriftCommitInput {
  oid: string;
  parents: string[];
  subject: string;
  acceptedPrNumber?: number;
}

export type ResolverRead<T> =
  | { status: "available"; value: T }
  | { status: "partial"; value: T }
  | { status: "unavailable" };

export interface ResolverEvent extends IntegrationIdentity {
  commits: string[];
}

export interface IntegrationEvidenceResolver {
  enrichTopologyEvent(
    event: IntegrationEvent,
    input: BaseDriftCommitInput,
  ): Promise<ResolverRead<IntegrationIdentity | null>>;
  proveSingleParentEvents(
    inputs: BaseDriftCommitInput[],
  ): Promise<ResolverRead<ResolverEvent[]>>;
}

export type IntegrationEvidenceResolverFactory = (
  baseOid: string,
) => IntegrationEvidenceResolver;

export type PathTreatmentClassifier = (path: string) => PathTreatment;
