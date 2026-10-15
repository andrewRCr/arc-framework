/**
 * Runtime contracts for session-init and recovery status envelopes.
 *
 * Value slots compose their producer-owned strict schemas and retain
 * envelope-level routing and conditional-presence checks.
 */

import { CurrentWuReconcileSessionResultSchema } from "../../lib/session-init/current-wu-reconcile-schema.js";
import { UserReferenceReconcileSessionResultSchema } from "../../lib/user-reference-reconcile-schema.js";
import { WorkUnitStateResultSchema } from "../../lib/session-init/work-unit-state-schema.js";
import { ErrandStateResultSchema } from "../../lib/session-init/errand-state-schema.js";
import { StaleWorktreeSweepResultSchema } from "../../lib/session-init/stale-worktree-sweep-schema.js";
import { DerivedLocusFrameSchema } from "../../lib/locus/derived-schema.js";
import { SessionInitUserValueSchema } from "../user/session-init-schema.js";
import { isDeepStrictEqual } from "node:util";

import { z } from "zod";
import { RemoteFailureReasonSchema, withRemoteEvidence } from "../../lib/kernel/index.js";
import { ActiveSessionInitResultSchema } from "../active/schema.js";
import { ConfigSessionInitResultSchema } from "../config/status.js";
import { DomainRulesSessionInitResultSchema } from "../constitution/status.js";

import type { SessionInitBaseDistanceValue, SessionInitProbeResult, SessionRecoverProbeResult } from "./types.js";
import { probe } from "./types.js";
import { BaseBranchSnapshotAnalysisResultSchema } from "../../lib/git/base-branch-sync.js";
import { DirtyStateResultSchema } from "../../lib/git/dirty-state.js";
import {
  BaseDistanceNotApplicableResultSchema,
  BaseDistanceSnapshotAnalysisResultSchema,
} from "../../lib/git/base-distance.js";
import {
  BaseDriftCoordinatesSchema,
  BaseDriftResultCommonFields,
  BaseDriftTerminalContinuationSchema,
  BaseDriftUnavailableReasonSchema,
  BaseDriftVerdictSchema,
  BaseMovementSchema,
} from "../../lib/git/base-drift-types.js";
import { WorktreeSyncStatusFields } from "../../lib/git/worktree-sync.js";
import { WorktreeIdentitySchema } from "../../lib/git/worktree-identity.js";
import { WorktreeRosterResultSchema } from "../../lib/git/worktree-roster.js";
import {
  SupersessionResultSchema,
  SupersessionSnapshotAnalysisResultSchema,
} from "../../lib/git/supersession.js";
import { LoadSetManifestSchema, LoadSetPathSchema } from "../../lib/load-set/types.js";
import { SessionInitRecoveryValueSchema } from "../../lib/session-init/branch-gone-cascade.js";
import { ErrandStalenessSweepResultSchema } from "../../lib/session-init/errand-staleness-sweep.js";
import { HooksPathSessionAdvisorySchema } from "../../lib/session-init/hooks-path-advisory.js";
import { InboxStateResultSchema } from "../../lib/session-init/inbox-state.js";
import { MaterializableWorkUnitDiscoveryResultSchema } from "../../lib/session-init/materializable-work-units.js";
import { NotesCompactionSessionAdvisoryResultSchema } from "../../lib/session-init/notes-compaction-advisory.js";
import { CurrentHuskAdvisorySchema } from "../../lib/session-init/current-husk-advisory.js";
import { OrphanBranchSweepResultSchema } from "../../lib/session-init/orphan-branch-sweep.js";
import { PartialPushMarkerSurfaceResultSchema } from "../../lib/session-init/partial-push-marker-surface.js";
import { RetiredSubdirDetectionResultSchema } from "../../lib/session-init/retired-subdir-detection.js";
import { ClassCompositionSchema } from "../../lib/status/class-composition.js";
import { TaskListCursorFileResultSchema } from "../../lib/task-list/file-cursor.js";
import { LocusSessionGuidanceSchema } from "../../lib/locus/session-guidance.js";
import { RecoveryLocusFrameSchema } from "../../lib/recover/locus-context.js";
import { ReleaseRoutingValueSchema } from "../../lib/release/routing.js";
import { assertSessionEnvelopeContract } from "../../lib/session-envelope/validation.js";
import { DeliveryPositionViewSchema } from "../../lib/session-init/delivery-position.js";
import { IntegrationBoundaryLocusSchema } from "../../scripts/review-gate/policy/integration-boundary-locus.js";

// Keep composition declarations bounded while retaining each producer-owned inferred payload.
const DerivedLocusFrameWireSchema: z.ZodType<
  import("../../lib/locus/derived-reader.js").DerivedLocusFrame
> = DerivedLocusFrameSchema;
const SessionInitUserValueWireSchema: z.ZodType<
  import("./types.js").SessionInitUserValue
> = SessionInitUserValueSchema;
const CurrentWuReconcileSessionResultWireSchema: z.ZodType<
  import("../../lib/session-init/current-wu-reconcile.js").CurrentWuReconcileSessionResult
> = CurrentWuReconcileSessionResultSchema;
const UserReferenceReconcileSessionResultWireSchema: z.ZodType<
  import("../../lib/user-reference-reconcile.js").UserReferenceReconcileSessionResult
> = UserReferenceReconcileSessionResultSchema;
const StaleWorktreeSweepResultWireSchema: z.ZodType<
  import("../../lib/session-init/stale-worktree-sweep.js").StaleWorktreeSweepResult
> = StaleWorktreeSweepResultSchema;
const ErrandStateResultWireSchema: z.ZodType<
  import("../../lib/session-init/errand-state.js").ErrandStateResult
> = ErrandStateResultSchema;
const WorkUnitStateResultWireSchema: z.ZodType<
  import("../../lib/session-init/work-unit-state.js").WorkUnitStateResult
> = WorkUnitStateResultSchema;

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, "value must not be empty");
const CleanupRemoteEvidenceViewFields = {
  remoteEvidence: z.enum(["exact", "pending-fetch", "unreachable", "not-applicable"]),
  failureReason: z.enum(["timeout", "network", "auth", "error"]).optional(),
};

function requireRemoteFailureReason(
  value: { remoteEvidence: "exact" | "pending-fetch" | "unreachable" | "not-applicable"; failureReason?: string },
  context: z.RefinementCtx,
): void {
  if (value.remoteEvidence === "unreachable" && value.failureReason === undefined) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "unreachable evidence requires a reason" });
  }
  if (value.remoteEvidence !== "unreachable" && value.failureReason !== undefined) {
    context.addIssue({ code: "custom", path: ["failureReason"], message: "only unreachable evidence carries a reason" });
  }
}


/** Closed workflow recommendation action. */
export const RecommendedActionSchema = z.enum(["pull", "prompt", "surface", "skip"]);
const RECOMMENDATION_SHAPE = {
  recommendedAction: RecommendedActionSchema,
  recommendedPromptText: z.string(),
};

const SupersessionValueSchema = z.strictObject({
  ...SupersessionResultSchema.shape,
  remoteEvidence: z.enum(["exact", "pending-fetch", "unreachable"]).optional(),
  failureReason: RemoteFailureReasonSchema.optional(),
}).pipe(z.union([SupersessionResultSchema, SupersessionSnapshotAnalysisResultSchema]));

/** Strict recommendation-enriched session worktree slot. */
export const SessionInitWorktreeValueSchema = withRemoteEvidence({
  ...WorktreeSyncStatusFields,
  ...RECOMMENDATION_SHAPE,
  identity: WorktreeIdentitySchema,
  supersession: SupersessionValueSchema.nullable(),
}).superRefine((value, context) => {
  requireRemoteFailureReason(value, context);
  const exactStates = new Set(["clean", "remote-ahead", "local-ahead", "diverged", "branch-gone"]);
  const inapplicableStates = new Set(["skipped", "no-upstream", "detached-head", "no-remote"]);
  const evidenceMatches = exactStates.has(value.state)
    ? value.remoteEvidence === "exact"
    : inapplicableStates.has(value.state)
      ? value.remoteEvidence === "not-applicable"
      : value.remoteEvidence === "pending-fetch" || value.remoteEvidence === "unreachable";
  if (!evidenceMatches) {
    context.addIssue({ code: "custom", path: ["remoteEvidence"], message: "must match worktree state" });
  }
  const countsMatch = value.state === "remote-ahead"
    ? value.ahead === 0 && value.behind > 0
    : value.state === "local-ahead"
      ? value.ahead > 0 && value.behind === 0
      : value.state === "diverged"
        ? value.ahead > 0 && value.behind > 0
        : value.ahead === 0 && value.behind === 0;
  if (!countsMatch) {
    context.addIssue({ code: "custom", path: ["ahead"], message: "counts must match worktree state" });
  }
  const branchMatches = value.state === "detached-head" ? value.branch === null : value.branch !== null;
  if (!branchMatches) {
    context.addIssue({ code: "custom", path: ["branch"], message: "must match worktree state" });
  }
  const supersessionMatches = value.state === "diverged" || value.supersession === null;
  if (!supersessionMatches) {
    context.addIssue({ code: "custom", path: ["supersession"], message: "requires a diverged worktree" });
  }
  const recommendationMatches = value.state === "remote-ahead"
    ? (value.recommendedAction === "prompt" && value.recommendedPromptText !== "")
      || (value.recommendedAction === "surface" && value.recommendedPromptText === "")
    : value.state === "diverged"
      ? value.recommendedAction === "surface"
        && ((value.supersession?.superseded === true) === (value.recommendedPromptText !== ""))
      : ["local-ahead", "branch-gone", "remote-unavailable"].includes(value.state)
        ? value.recommendedAction === "surface" && value.recommendedPromptText === ""
        : value.recommendedAction === "skip" && value.recommendedPromptText === "";
  if (!recommendationMatches) {
    context.addIssue({ code: "custom", path: ["recommendedAction"], message: "must match worktree state" });
  }
});


const BaseDistanceSlotArms = [
  ...BaseDistanceSnapshotAnalysisResultSchema.options,
  ...BaseDistanceNotApplicableResultSchema.options,
];
const baseDistanceSlotSchemas = BaseDistanceSlotArms.map(
  (arm) => z.strictObject({ ...arm.shape, ...RECOMMENDATION_SHAPE }),
);
const firstBaseDistanceSlotSchema = baseDistanceSlotSchemas[0];
if (firstBaseDistanceSlotSchema === undefined) throw new Error("base-distance requires a slot arm");
const BaseDistanceSlotUnionSchema = z.union(
  [firstBaseDistanceSlotSchema, ...baseDistanceSlotSchemas.slice(1)],
);

/** Full base-distance slot with recommendation fields and existing routing refinements. */
export const SessionInitBaseDistanceValueSchema = z.strictObject({
  ...BaseDriftResultCommonFields,
  verdict: BaseDriftVerdictSchema,
  movement: BaseMovementSchema.optional(),
  unavailableReason: BaseDriftUnavailableReasonSchema.optional(),
  detail: z.string().optional(),
  coordinates: BaseDriftCoordinatesSchema.optional(),
  continuation: BaseDriftTerminalContinuationSchema.optional(),
  ...CleanupRemoteEvidenceViewFields,
  ...RECOMMENDATION_SHAPE,
}).pipe(BaseDistanceSlotUnionSchema).superRefine((parsed, context) => {
  const value = parsed as SessionInitBaseDistanceValue;
  requireRemoteFailureReason(value, context);
  const healthy = ["clean", "remote-ahead", "local-ahead", "diverged"].includes(value.state);
  const evidenceMatches = healthy
    ? value.remoteEvidence === "exact" && ["clean", "reconcile"].includes(value.verdict)
    : value.state === "skipped"
      ? value.remoteEvidence === "not-applicable"
      // Detachment and an absent remote both resolve before any snapshot evidence is
      // consulted, so each reports the not-applicable qualifier rather than omitting it.
      : value.state === "no-remote" || value.state === "detached-head"
        ? value.remoteEvidence === "not-applicable"
        : value.state === "remote-unavailable"
          && value.verdict === "unavailable"
          && ["exact", "pending-fetch", "unreachable"].includes(value.remoteEvidence);
  if (!evidenceMatches) {
    context.addIssue({ code: "custom", path: ["remoteEvidence"], message: "must match base-distance state" });
  }
  if (healthy !== (value.movement !== undefined)) {
    context.addIssue({ code: "custom", path: ["movement"], message: "must be present only for healthy readings" });
  }
  const countsMatch = value.state === "remote-ahead"
    ? value.ahead === 0 && value.behind > 0
    : value.state === "local-ahead"
      ? value.ahead > 0 && value.behind === 0
      : value.state === "diverged"
        ? value.ahead > 0 && value.behind > 0
        : value.ahead === 0 && value.behind === 0;
  if (!countsMatch || (value.verdict === "clean" && value.behind !== 0) || (value.verdict === "reconcile" && value.behind === 0)) {
    context.addIssue({ code: "custom", path: ["ahead"], message: "counts must match base-distance verdict" });
  }
  // Keyed on state, falling through to evidence only for `remote-unavailable`, the one
  // state that admits several readings. Indentation tracks nesting depth exactly: the
  // arms previously sat at mixed depths and read as a grouping other than the one that
  // executed, which is how a state came to be missing from the ladder above.
  const unavailableShapeMatches = value.state === "no-remote"
    ? value.unavailableReason === "no-remote" && value.baseOid === null
    : value.state === "detached-head"
      ? value.unavailableReason === "detached-head" && value.baseOid === null
      : healthy
        ? value.unavailableReason === undefined && value.baseOid !== null
        : value.state === "skipped"
          ? value.unavailableReason === undefined && value.baseOid === null
          : value.remoteEvidence === "exact"
            ? value.unavailableReason === "remote-base-absent" && value.baseOid === null
            : value.remoteEvidence === "pending-fetch"
              ? value.unavailableReason === "base-object-pending-fetch" && value.baseOid !== null
              : value.unavailableReason === "remote-evidence-unreachable" && value.baseOid === null;
  if (!unavailableShapeMatches) {
    context.addIssue({ code: "custom", path: ["unavailableReason"], message: "must match base-distance evidence" });
  }
  const recommendationMatches = value.verdict === "reconcile"
    ? value.recommendedAction === "surface" && value.recommendedPromptText !== ""
    : value.recommendedAction === "skip" && value.recommendedPromptText === "";
  if (!recommendationMatches) {
    context.addIssue({ code: "custom", path: ["recommendedAction"], message: "must match base-distance verdict" });
  }
});

const RecommendationValueViewSchema = z.object(RECOMMENDATION_SHAPE).loose();

function withoutRecommendation(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== "recommendedAction" && key !== "recommendedPromptText",
    ),
  );
}

function forwardRootIssues(issues: readonly z.core.$ZodIssue[], context: z.RefinementCtx): void {
  for (const issue of issues) {
    context.addIssue({ ...issue });
    // Envelope diagnostics render top-level issues, so expose union details there too.
    if (issue.code === "invalid_union") {
      for (const branchIssues of issue.errors) forwardRootIssues(branchIssues, context);
    }
  }
}

/** Full base-sync authority composed with recommendation routing fields. */
export const SessionInitBaseBranchSyncValueViewSchema = RecommendationValueViewSchema.superRefine((value, context) => {
  const result = BaseBranchSnapshotAnalysisResultSchema.safeParse(withoutRecommendation(value));
  if (!result.success) forwardRootIssues(result.error.issues, context);
});

/** Full retired-subdirectory authority composed with recommendation routing fields. */
export const SessionInitRetiredSubdirsValueViewSchema = RecommendationValueViewSchema.superRefine((value, context) => {
  const result = RetiredSubdirDetectionResultSchema.safeParse(withoutRecommendation(value));
  if (!result.success) forwardRootIssues(result.error.issues, context);
});

/** Complete identity record shared by session envelope roots. */
export const StatusIdentitySchema = z.strictObject({
  identity: NON_EMPTY_TEXT.nullable(),
  role: NON_EMPTY_TEXT.nullable(),
});

/** Complete invocation-only compaction-seed write result. */
export const CompactionSeedWriteStatusSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("written"), path: NON_EMPTY_TEXT }),
  z.strictObject({
    status: z.literal("skipped"),
    reason: z.enum(["identity-missing", "load-set-unresolved"]),
  }),
  z.strictObject({
    status: z.literal("failed"),
    reason: z.enum(["git-failed", "identity-invalid", "seed-invalid", "write-failed"]),
    message: z.string(),
  }),
]);

const SessionInitEnvelopeObjectSchema = z.strictObject({
  mode: z.literal("session-init"),
  identity: StatusIdentitySchema,
  derivedLocusState: probe(DerivedLocusFrameWireSchema),
  locusGuidance: LocusSessionGuidanceSchema,
  user: probe(SessionInitUserValueWireSchema),
  worktree: probe(SessionInitWorktreeValueSchema),
  baseDistance: probe(SessionInitBaseDistanceValueSchema),
  baseBranchSync: probe(SessionInitBaseBranchSyncValueViewSchema),
  dirty: probe(DirtyStateResultSchema),
  config: probe(ConfigSessionInitResultSchema),
  active: probe(ActiveSessionInitResultSchema),
  domainRules: probe(DomainRulesSessionInitResultSchema),
  releaseRouting: probe(ReleaseRoutingValueSchema),
  hooksPath: probe(HooksPathSessionAdvisorySchema),
  currentWuReconcile: probe(CurrentWuReconcileSessionResultWireSchema).optional(),
  deliveryPosition: probe(DeliveryPositionViewSchema.nullable()).optional(),
  userReferenceReconcile: probe(UserReferenceReconcileSessionResultWireSchema).optional(),
  roster: probe(WorktreeRosterResultSchema).optional(),
  recovery: probe(SessionInitRecoveryValueSchema).optional(),
  sweep: probe(StaleWorktreeSweepResultWireSchema).optional(),
  currentHusk: probe(CurrentHuskAdvisorySchema.nullable()).optional(),
  orphanBranchSweep: probe(OrphanBranchSweepResultSchema).optional(),
  retiredSubdirs: probe(SessionInitRetiredSubdirsValueViewSchema).optional(),
  errandSweep: probe(ErrandStalenessSweepResultSchema).optional(),
  errandState: probe(ErrandStateResultWireSchema).optional(),
  materializableWorkUnits: probe(MaterializableWorkUnitDiscoveryResultSchema).optional(),
  workUnitState: probe(WorkUnitStateResultWireSchema).optional(),
  inboxState: probe(InboxStateResultSchema).optional(),
  partialPushMarker: probe(PartialPushMarkerSurfaceResultSchema).optional(),
  compactionAdvisory: probe(NotesCompactionSessionAdvisoryResultSchema).optional(),
  inFlightComposition: ClassCompositionSchema.optional(),
  cohortDocPath: LoadSetPathSchema.optional(),
  loadSet: probe(LoadSetManifestSchema),
  taskCursor: probe(TaskListCursorFileResultSchema).optional(),
  compactionSeedWrite: CompactionSeedWriteStatusSchema.optional(),
  recommendedCombinedPrompt: z.string().nullable(),
});

type SessionInitEnvelopeValue = z.infer<typeof SessionInitEnvelopeObjectSchema>;

function hasOwn(value: SessionInitEnvelopeValue, key: keyof SessionInitEnvelopeValue): boolean {
  return Object.hasOwn(value, key);
}

function addPresenceIssue(
  context: z.core.$RefinementCtx<SessionInitEnvelopeValue>,
  key: keyof SessionInitEnvelopeValue,
  message: string,
): void {
  context.addIssue({ code: "custom", path: [key], message });
}

function requireExactPresence(
  value: SessionInitEnvelopeValue,
  context: z.core.$RefinementCtx<SessionInitEnvelopeValue>,
  key: keyof SessionInitEnvelopeValue,
  expected: boolean,
): void {
  if (hasOwn(value, key) !== expected) {
    addPresenceIssue(context, key, expected ? "required by visible envelope state" : "forbidden by visible envelope state");
  }
}

function activeValue(value: SessionInitEnvelopeValue): Record<string, unknown> | null {
  return value.active.ok ? value.active.value : null;
}

function worktreeValue(value: SessionInitEnvelopeValue): Record<string, unknown> | null {
  return value.worktree.ok ? value.worktree.value : null;
}

function phaseAcceptsBoundary(
  sessionType: "planning" | "execution" | "prepublication" | "integration" | null,
  boundary: z.infer<typeof IntegrationBoundaryLocusSchema> | null,
  workflow: string | null,
  completedRecovery = false,
): boolean {
  const candidateLoci = [
    "candidate-review-pending",
    "candidate-fix-pending",
    "candidate-convergence-verification-pending",
    "candidate-publish-ready",
  ];
  if (sessionType === "prepublication") {
    return boundary !== null && candidateLoci.includes(boundary.locus);
  }
  if (sessionType === "integration") {
    return completedRecovery
      ? boundary === null
      : boundary === null
        ? workflow === "verify-work-unit"
        : [
            ...candidateLoci,
            "publication-pending",
            "hosted-review-pending",
            "delivery-status-required",
          ].includes(boundary.locus);
  }
  return boundary === null;
}

function sessionTypeAcceptsWorkflow(
  sessionType: "planning" | "execution" | "prepublication" | "integration" | null,
  taskCursor: z.infer<typeof TaskListCursorFileResultSchema> | null,
  workflow: string | null,
  completedRecovery = false,
): boolean {
  if (sessionType === "planning") return workflow === "planning";
  if (sessionType === "execution") {
    return workflow === (taskCursor?.status === "no-open-task"
      ? "verify-work-unit"
      : "process-task-loop");
  }
  if (sessionType === "prepublication") return workflow === "prepare-work-unit";
  if (sessionType === "integration") {
    if (completedRecovery) return workflow === "integrate-work-unit";
    if (taskCursor?.status === "found") return workflow === "process-task-loop";
    return workflow === "integrate-work-unit" || workflow === "verify-work-unit";
  }
  return workflow === null;
}

const SessionInitProbeResultRuntimeSchema: z.ZodType<SessionInitEnvelopeValue> =
  SessionInitEnvelopeObjectSchema.superRefine((value, context) => {
  const active = activeValue(value);
  const worktree = worktreeValue(value);
  const rosterSuccessful = value.roster?.ok === true;
  const identityKnown = value.identity.identity !== null;
  const derivedActive = value.derivedLocusState.ok
    ? value.derivedLocusState.value.active
    : null;
  const completedIntegrationRecovery = derivedActive !== null
    && value.derivedLocusState.ok
    && value.derivedLocusState.value.roster.some((row) =>
      row.checkout.path === derivedActive.checkoutPath && row.lifecycleLocation === "completed");

  if (value.active.ok) {
    const activeSession = value.active.value;
    if (!phaseAcceptsBoundary(
      activeSession.sessionType,
      activeSession.integrationBoundary,
      activeSession.currentWorkflow,
      completedIntegrationRecovery,
    )) {
      context.addIssue({
        code: "custom",
        path: ["active", "value", "integrationBoundary"],
        message: "must match the resolved session phase",
      });
    }
    const projectedTaskCursor = value.taskCursor?.ok === true ? value.taskCursor.value : null;
    if (!sessionTypeAcceptsWorkflow(
      activeSession.sessionType,
      projectedTaskCursor,
      activeSession.currentWorkflow,
      completedIntegrationRecovery,
    )) {
      context.addIssue({
        code: "custom",
        path: ["active", "value", "currentWorkflow"],
        message: "must match the resolved session phase",
      });
    }
  }

  if (derivedActive !== null) {
    const { context: derivedContext, subject } = derivedActive;
    if (!phaseAcceptsBoundary(
      derivedContext.sessionType,
      derivedContext.integrationBoundary,
      derivedContext.workflow,
      completedIntegrationRecovery,
    )) {
      context.addIssue({
        code: "custom",
        path: ["derivedLocusState", "value", "active", "context", "integrationBoundary"],
        message: "must match the resolved session phase",
      });
    }
    if (!sessionTypeAcceptsWorkflow(
      derivedContext.sessionType,
      derivedContext.taskCursor,
      derivedContext.workflow,
      completedIntegrationRecovery,
    )) {
      context.addIssue({
        code: "custom",
        path: ["derivedLocusState", "value", "active", "context", "workflow"],
        message: "must match the resolved session phase",
      });
    }
    if (derivedContext.integrationBoundary !== null
      && derivedContext.integrationBoundary.workUnit !== subject.key) {
      context.addIssue({
        code: "custom",
        path: ["derivedLocusState", "value", "active", "context", "integrationBoundary", "workUnit"],
        message: "must match the owning work-unit subject",
      });
    }
    if (value.active.ok) {
      const projected = value.active.value;
      if (projected.sessionType !== derivedContext.sessionType
        || projected.currentWorkflow !== derivedContext.workflow
        || !isDeepStrictEqual(projected.integrationBoundary, derivedContext.integrationBoundary)) {
        context.addIssue({
          code: "custom",
          path: ["active", "value", "integrationBoundary"],
          message: "must match the derived active context",
        });
      }
    }
  }

  if (worktree !== null) {
    const worktreeIdentity = worktree.identity as { kind: "primary" | "linked" };
    const rosterRequired = worktree.state === "branch-gone"
      || active?.resolution === "none"
      || worktreeIdentity.kind === "primary";
    requireExactPresence(value, context, "roster", rosterRequired);

    if (worktreeIdentity.kind === "primary") {
      requireExactPresence(value, context, "sweep", rosterSuccessful);
    }

    // Presence is exact rather than merely permitted: omission means the locus is
    // inapplicable, so an eligible locus that omitted the slot would hide a failed
    // probe as inapplicability instead of publishing it as `{ ok: false }`.
    requireExactPresence(
      value,
      context,
      "currentHusk",
      worktreeIdentity.kind === "linked" && worktree.branch === null,
    );

    if (!identityKnown) {
      requireExactPresence(value, context, "orphanBranchSweep", worktreeIdentity.kind === "primary");
    }
  }

  const primaryCheckout = worktree?.identity !== undefined
    && (worktree.identity as { kind?: string }).kind === "primary";

  const recoveryRequired = worktree?.state === "branch-gone" && rosterSuccessful;
  requireExactPresence(value, context, "recovery", recoveryRequired);

  if (identityKnown) {
    requireExactPresence(value, context, "orphanBranchSweep", true);
  }

  for (const key of ["retiredSubdirs", "partialPushMarker"] as const) {
    requireExactPresence(value, context, key, identityKnown);
  }
  for (const key of ["errandSweep", "inboxState"] as const) {
    requireExactPresence(value, context, key, identityKnown && primaryCheckout);
  }

  requireExactPresence(value, context, "errandState", value.worktree.ok && value.active.ok);
  requireExactPresence(value, context, "currentWuReconcile", active?.resolution === "single");
  const owningSubject = value.derivedLocusState.ok
    && value.derivedLocusState.value.active?.subject.kind === "work-unit"
    ? value.derivedLocusState.value.active.subject
    : null;
  const owningWorkUnit = owningSubject !== null;
  requireExactPresence(value, context, "deliveryPosition", owningWorkUnit);
  if (owningSubject !== null && value.deliveryPosition?.ok === true
    && value.deliveryPosition.value !== null
    && value.deliveryPosition.value.workUnitId !== owningSubject.key) {
    context.addIssue({
      code: "custom",
      path: ["deliveryPosition", "value", "workUnitId"],
      message: "must match the owning work-unit subject",
    });
  }
  requireExactPresence(
    value,
    context,
    "userReferenceReconcile",
    identityKnown && active?.resolution === "single",
  );
  requireExactPresence(value, context, "workUnitState", rosterSuccessful);
  requireExactPresence(
    value,
    context,
    "materializableWorkUnits",
    value.active.ok && value.active.value.resolution === "none",
  );

  if (hasOwn(value, "compactionAdvisory") && (!identityKnown || !primaryCheckout)) {
    addPresenceIssue(
      context,
      "compactionAdvisory",
      identityKnown
        ? "forbidden on a linked worktree"
        : "requires a resolved identity",
    );
  }

  if (
    hasOwn(value, "inFlightComposition")
    && !(value.active.ok && value.active.value.resolution === "none" && rosterSuccessful)
  ) {
    addPresenceIssue(context, "inFlightComposition", "requires no active work unit and a successful roster");
  }

  if (
    hasOwn(value, "cohortDocPath")
    && !(value.active.ok
      && value.active.value.resolution === "single"
      && typeof value.active.value.path === "string"
      && value.active.value.path.trim().length > 0)
  ) {
    addPresenceIssue(context, "cohortDocPath", "requires one active work unit with a path");
  }

  const taskListPath = value.active.ok ? value.active.value.taskListPath : null;
  const taskCursorRequired = typeof taskListPath === "string"
    && LoadSetPathSchema.safeParse(taskListPath).success;
  requireExactPresence(value, context, "taskCursor", taskCursorRequired);
});

/** Strict session-init wire contract with observable slot-presence invariants. */
export const SessionInitProbeResultSchema = SessionInitProbeResultRuntimeSchema as z.ZodType<
  SessionInitProbeResult
>;

/** Strict worktree slot for the lean recovery envelope. */
export const SessionRecoverWorktreeValueSchema = withRemoteEvidence({
  ...WorktreeSyncStatusFields,
  identity: WorktreeIdentitySchema,
}).superRefine((value, context) => {
  const unreachable = value.remoteEvidence === "unreachable";
  if (unreachable !== (value.failureReason !== undefined)) {
    context.addIssue({
      code: "custom",
      path: ["failureReason"],
      message: "must be present exactly when remoteEvidence is unreachable",
    });
  }
});

const SessionRecoverEnvelopeObjectSchema = z.strictObject({
  mode: z.literal("recover"),
  identity: StatusIdentitySchema,
  derivedLocusState: probe(DerivedLocusFrameWireSchema),
  locusGuidance: LocusSessionGuidanceSchema,
  recoveryFrame: probe(RecoveryLocusFrameSchema),
  worktree: probe(SessionRecoverWorktreeValueSchema),
  dirty: probe(DirtyStateResultSchema),
  config: probe(ConfigSessionInitResultSchema),
  releaseRouting: probe(ReleaseRoutingValueSchema),
  loadSet: probe(LoadSetManifestSchema),
  taskCursor: probe(TaskListCursorFileResultSchema).optional(),
});

const SessionRecoverProbeResultRuntimeSchema = SessionRecoverEnvelopeObjectSchema.superRefine(
  (value, context) => {
    const taskCursorRequired = value.loadSet.ok
      && value.loadSet.value.entries.some((entry) => entry.readMode.kind === "partial-strategic");
    const cursorlessPhaseTaskCursorAllowed = value.recoveryFrame.ok
      && value.recoveryFrame.value.kind === "resolved"
      && (value.recoveryFrame.value.sessionType === "prepublication"
        || value.recoveryFrame.value.sessionType === "integration"
        || (value.recoveryFrame.value.sessionType === "execution"
          && value.recoveryFrame.value.workflow === "verify-work-unit"));
    const taskCursorPresent = Object.hasOwn(value, "taskCursor");
    if (!taskCursorPresent && taskCursorRequired) {
      context.addIssue({
        code: "custom",
        path: ["taskCursor"],
        message: "required by the locus-derived strategic task-list entry",
      });
    }
    if (taskCursorPresent && !taskCursorRequired && !cursorlessPhaseTaskCursorAllowed) {
      context.addIssue({
        code: "custom",
        path: ["taskCursor"],
        message: "forbidden without a locus-derived strategic task-list entry or resolved cursorless-phase frame",
      });
    }
  },
);

/** Strict lean recovery wire contract with shared cohort and cursor rules. */
export const SessionRecoverProbeResultSchema = SessionRecoverProbeResultRuntimeSchema as z.ZodType<
  SessionRecoverProbeResult
>;

type DeclaredInput<Value> = Value extends readonly (infer Item)[]
  ? readonly DeclaredInput<Item>[]
  : Value extends object
    ? { [Key in keyof Value as string extends Key ? never : Key]: DeclaredInput<Value[Key]> }
    : Value;

type SessionInitDeclaredInput = DeclaredInput<z.input<typeof SessionInitProbeResultRuntimeSchema>>;

type SessionRecoverDeclaredInput = DeclaredInput<z.input<typeof SessionRecoverProbeResultRuntimeSchema>>;

/** Compile-only proof that the producer satisfies every declared schema input field. */
export type SessionInitProbeResultSchemaInputCompatibility<
  Producer extends SessionInitDeclaredInput = SessionInitProbeResult,
> = Producer;

/** Compile-only proof that the lean producer satisfies every declared schema input field. */
export type SessionRecoverProbeResultSchemaInputCompatibility<
  Producer extends SessionRecoverDeclaredInput = SessionRecoverProbeResult,
> = Producer;

/** Validate a session-init producer for effect while retaining its original object. */
export function assertSessionInitProbeResult(value: unknown): asserts value is SessionInitProbeResult {
  assertSessionEnvelopeContract("session-init-envelope", SessionInitProbeResultSchema, value);
}

/** Validate a lean recovery producer for effect while retaining its original object. */
export function assertSessionRecoverProbeResult(value: unknown): asserts value is SessionRecoverProbeResult {
  assertSessionEnvelopeContract("session-recover-envelope", SessionRecoverProbeResultSchema, value);
}
