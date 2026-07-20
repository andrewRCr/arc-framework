/**
 * Runtime contracts for session-init and recovery status envelopes.
 *
 * Shared and deep value views in this module deliberately validate only the
 * fields that drive workflow routing. Every view is pass-through so unowned
 * payload fields remain under their handwritten home-module authorities.
 */

import { z } from "zod";

import type { SessionInitProbeResult, SessionRecoverProbeResult } from "./types.js";
import { probe } from "./types.js";
import { BaseBranchSyncStatusResultSchema } from "../../lib/git/base-branch-sync.js";
import { LoadSetManifestSchema, LoadSetPathSchema } from "../../lib/load-set/types.js";
import { CascadeResolutionSchema } from "../../lib/session-init/branch-gone-cascade.js";
import { ErrandStalenessSweepResultSchema } from "../../lib/session-init/errand-staleness-sweep.js";
import { InboxStateResultSchema } from "../../lib/session-init/inbox-state.js";
import { MaterializableWorkUnitsResultSchema } from "../../lib/session-init/materializable-work-units.js";
import { NotesCompactionSessionAdvisoryResultSchema } from "../../lib/session-init/notes-compaction-advisory.js";
import { OrphanBranchSweepResultSchema } from "../../lib/session-init/orphan-branch-sweep.js";
import { PartialPushMarkerSurfaceResultSchema } from "../../lib/session-init/partial-push-marker-surface.js";
import { RetiredSubdirDetectionResultSchema } from "../../lib/session-init/retired-subdir-detection.js";
import { ClassCompositionSchema } from "../../lib/status/class-composition.js";
import { TaskListCursorFileResultSchema } from "../../lib/task-list/file-cursor.js";
import { assertSessionEnvelopeContract } from "../../lib/session-envelope/validation.js";

const NON_EMPTY_TEXT = z.string().refine((value) => value.trim().length > 0, "value must not be empty");

/** Thin routing view of a working-tree dirty-state result. */
export const DirtyStateValueViewSchema = z.object({ state: z.enum(["clean", "dirty"]) }).loose();

/** Thin routing view of a worktree synchronization result. */
export const WorktreeSyncValueViewSchema = z
  .object({
    state: z.enum([
      "skipped",
      "clean",
      "remote-ahead",
      "local-ahead",
      "diverged",
      "no-upstream",
      "detached-head",
      "no-remote",
      "branch-gone",
      "remote-unavailable",
    ]),
    supersession: z.object({ superseded: z.boolean() }).loose().nullable().optional(),
  })
  .loose();

/** Thin routing view of a base-distance advisory. */
export const BaseDistanceValueViewSchema = z
  .object({ verdict: z.enum(["clean", "reconcile", "unavailable", "skipped"]) })
  .loose();

/** Object-only view of the worktree roster, whose nested fields do not route workflows. */
export const WorktreeRosterValueViewSchema = z.object({}).loose();

const WorktreeSubjectViewSchema = z
  .object({ kind: z.enum(["work-unit", "errand", "branch"]) })
  .loose();
const HuskStampViewSchema = z
  .object({ kind: z.enum(["legacy", "current", "manual-only"]) })
  .loose();

/** Thin routing view of the current-worktree husk advisory. */
export const CurrentHuskAdvisoryViewSchema = z
  .object({
    subject: z.object({ kind: z.literal("work-unit") }).loose(),
    stamp: HuskStampViewSchema,
  })
  .loose();

const BranchedCleanupDecisionViewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("removable") }).loose(),
  z
    .object({ action: z.literal("blocked"), reason: z.enum(["uncommitted", "user-surfaces", "unmerged"]) })
    .loose(),
  z.object({ action: z.literal("external") }).loose(),
]);
const HuskCleanupDecisionViewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("removable") }).loose(),
  z
    .object({ action: z.literal("blocked"), reason: z.enum(["uncommitted", "head-moved", "evidence-mismatch"]) })
    .loose(),
  z
    .object({ action: z.literal("outside"), reason: z.enum(["untrusted-marker", "missing-stamp"]) })
    .loose(),
]);
const StaleWorktreeReportViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("branched"), decision: BranchedCleanupDecisionViewSchema }).loose(),
  z
    .object({
      kind: z.literal("husk"),
      subject: WorktreeSubjectViewSchema,
      stamp: HuskStampViewSchema,
      decision: HuskCleanupDecisionViewSchema,
    })
    .loose(),
]);

/** Thin routing view of the stale-worktree cleanup advisory. */
export const StaleWorktreeSweepValueViewSchema = z
  .object({ worktrees: z.array(StaleWorktreeReportViewSchema) })
  .loose();

const WorkUnitReportViewSchema = z
  .object({
    state: z.enum(["awaiting-review", "stale", "blocked", "mergeable", "merged-needs-archival"]),
    behindBase: z.boolean(),
  })
  .loose();

/** Thin routing view of the work-unit state advisory. */
export const WorkUnitStateValueViewSchema = z
  .object({
    inFlight: z.object({ workUnits: z.array(WorkUnitReportViewSchema) }).loose(),
    nudge: z.object({ shouldNudge: z.boolean() }).loose(),
  })
  .loose();

const ErrandReportViewSchema = z
  .object({ state: z.enum(["in-progress", "awaiting-merge", "stale", "merged-cleanup"]) })
  .loose();
const MaterializableErrandViewSchema = z
  .object({ slug: NON_EMPTY_TEXT, branch: NON_EMPTY_TEXT })
  .loose();

/** Thin routing view of the errand state advisory. */
export const ErrandStateValueViewSchema = z
  .object({
    resume: z.object({ resumable: z.boolean() }).loose(),
    inFlight: z.object({ errands: z.array(ErrandReportViewSchema) }).loose(),
    materializable: z.object({ candidates: z.array(MaterializableErrandViewSchema) }).loose(),
    nudge: z.object({ shouldNudge: z.boolean() }).loose(),
  })
  .loose();

/** Thin routing view of the extension session-init result. */
export const ExtensionsSessionInitValueViewSchema = z
  .object({ mode: z.literal("session-init") })
  .loose();

/** Thin routing view of the twelve session-init policy settings. */
export const ConfigSessionInitValueViewSchema = z
  .object({
    mode: z.literal("session-init"),
    settings: z
      .object({
        "session.remote_sync": z.enum(["enabled", "disabled"]),
        "session.init_pull.worktree": z.enum(["manual", "prompt"]),
        "session.init_pull.notes": z.enum(["manual", "prompt", "always"]),
        "session.init_pull.base": z.enum(["manual", "prompt", "always"]),
        "session.init_load.notes": z.enum(["manual", "prompt", "always"]),
        "user.notes_push": z.enum(["manual", "prompt", "on-sync"]),
        "branch.protection": z.enum(["partial", "full"]),
        "pm.mode": z.enum(["none", "arc-in-git", "external"]),
        "commit.format": z.enum(["conventional", "custom", "any"]),
        "commit.context_footer": z.enum(["required", "recommended", "custom", "disabled"]),
        "commit.interlock": z.enum(["manual", "on-task-approval", "on-workflow"]),
        "push.interlock": z.enum(["manual", "on-sync", "on-workflow"]),
      })
      .loose(),
  })
  .loose();

/** Thin routing view of active work-unit resolution for a session. */
export const ActiveSessionInitValueViewSchema = z
  .object({
    mode: z.literal("session-init"),
    layout: z.enum(["full", "lite"]),
    resolution: z.enum(["none", "single", "multiple"]),
    sessionType: z.enum(["planning", "execution", "integration"]).nullable(),
    planningStage: z.enum(["draft-design", "create-spec", "generate-tasks"]).nullable(),
  })
  .loose();

/** Thin routing view of the domain-rule session-init result. */
export const DomainRulesSessionInitValueViewSchema = z
  .object({ mode: z.literal("session-init") })
  .loose();

const USER_REF_STATE = z.enum(["same", "local-ahead", "remote-ahead", "diverged", "remote-unavailable"]);
const USER_CONTENT_RELATION = z.enum([
  "remote-subset",
  "local-subset",
  "equal",
  "mixed-uncontested",
  "conflicting",
]);
const USER_DRIFT_DIRECTION = z.enum(["edits", "missing", "modified", "mixed", "behind"]);

/** Thin routing view of the user session-init result before recommendation enrichment. */
export const UserSessionInitValueViewSchema = z
  .object({
    state: z.enum(["disabled", "clean", "remote-ahead", "conflict", "remote-unavailable"]),
    refState: USER_REF_STATE.optional(),
    contentRelation: USER_CONTENT_RELATION.optional(),
    coherenceState: z.enum(["partial-push", "partial-push-unverified"]).optional(),
    qualifier: z.literal("clean-at-current-head").optional(),
    localNoteFreshness: z
      .object({ state: z.enum(["missing", "current-head", "ancestor", "outside-head-ancestry"]) })
      .loose()
      .optional(),
    notesDrift: z.object({ direction: USER_DRIFT_DIRECTION }).loose().optional(),
    loadNeeded: z.boolean().optional(),
  })
  .loose();

/** Closed workflow recommendation action. */
export const RecommendedActionSchema = z.enum(["pull", "prompt", "surface", "skip"]);
const RECOMMENDATION_SHAPE = {
  recommendedAction: RecommendedActionSchema,
  recommendedPromptText: z.string(),
};

/** Thin view of primary/linked worktree identity. */
export const WorktreeIdentityViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("primary") }).loose(),
  z.object({ kind: z.literal("linked"), path: NON_EMPTY_TEXT }).loose(),
]);

/** Recommendation-enriched session worktree view. */
export const SessionInitWorktreeValueViewSchema = WorktreeSyncValueViewSchema.extend({
  ...RECOMMENDATION_SHAPE,
  identity: WorktreeIdentityViewSchema,
}).loose();

/** Recommendation-enriched user session view. */
export const SessionInitUserValueViewSchema = UserSessionInitValueViewSchema.extend({
  ...RECOMMENDATION_SHAPE,
  notesDriftSurface: z
    .object({
      direction: z.enum(["edits", "missing", "modified", "mixed"]),
      register: z.enum(["expected", "caution"]),
    })
    .loose()
    .optional(),
}).loose();

/** Recommendation-enriched base-distance view. */
export const SessionInitBaseDistanceValueViewSchema = BaseDistanceValueViewSchema.extend(
  RECOMMENDATION_SHAPE,
).loose();

const RecommendationValueViewSchema = z.object(RECOMMENDATION_SHAPE).loose();

function withoutRecommendation(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => key !== "recommendedAction" && key !== "recommendedPromptText",
    ),
  );
}

/** Full base-sync authority composed with recommendation routing fields. */
export const SessionInitBaseBranchSyncValueViewSchema = RecommendationValueViewSchema.refine((value) => {
  return BaseBranchSyncStatusResultSchema.safeParse(withoutRecommendation(value)).success;
}, "invalid base-branch-sync value");

/** Full retired-subdirectory authority composed with recommendation routing fields. */
export const SessionInitRetiredSubdirsValueViewSchema = RecommendationValueViewSchema.refine((value) => {
  return RetiredSubdirDetectionResultSchema.safeParse(withoutRecommendation(value)).success;
}, "invalid retired-subdirectory value");

/** Thin routing view of release-wrapper class decisions. */
export const ReleaseRoutingValueViewSchema = z
  .object({
    taskCommit: z.enum(["wrapper", "raw"]),
    workflowCommit: z.enum(["wrapper", "raw"]),
    workflowPush: z.enum(["wrapper", "raw"]),
  })
  .loose();

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
  user: probe(SessionInitUserValueViewSchema),
  worktree: probe(SessionInitWorktreeValueViewSchema),
  baseDistance: probe(SessionInitBaseDistanceValueViewSchema),
  baseBranchSync: probe(SessionInitBaseBranchSyncValueViewSchema),
  dirty: probe(DirtyStateValueViewSchema),
  extensions: probe(ExtensionsSessionInitValueViewSchema),
  config: probe(ConfigSessionInitValueViewSchema),
  active: probe(ActiveSessionInitValueViewSchema),
  domainRules: probe(DomainRulesSessionInitValueViewSchema),
  releaseRouting: probe(ReleaseRoutingValueViewSchema),
  roster: probe(WorktreeRosterValueViewSchema).optional(),
  recovery: probe(CascadeResolutionSchema).optional(),
  sweep: probe(StaleWorktreeSweepValueViewSchema).optional(),
  currentHusk: probe(CurrentHuskAdvisoryViewSchema.nullable()).optional(),
  orphanBranchSweep: probe(OrphanBranchSweepResultSchema).optional(),
  retiredSubdirs: probe(SessionInitRetiredSubdirsValueViewSchema).optional(),
  errandSweep: probe(ErrandStalenessSweepResultSchema).optional(),
  errandState: probe(ErrandStateValueViewSchema).optional(),
  materializableWorkUnits: probe(MaterializableWorkUnitsResultSchema).optional(),
  workUnitState: probe(WorkUnitStateValueViewSchema).optional(),
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

const SessionInitProbeResultRuntimeSchema = SessionInitEnvelopeObjectSchema.superRefine((value, context) => {
  const active = activeValue(value);
  const worktree = worktreeValue(value);
  const rosterSuccessful = value.roster?.ok === true;
  const identityKnown = value.identity.identity !== null;

  if (worktree !== null) {
    const worktreeIdentity = worktree.identity as { kind: "primary" | "linked" };
    const rosterRequired = worktree.state === "branch-gone"
      || active?.resolution === "none"
      || worktreeIdentity.kind === "primary";
    requireExactPresence(value, context, "roster", rosterRequired);

    if (worktreeIdentity.kind === "primary") {
      requireExactPresence(value, context, "sweep", rosterSuccessful);
    }

    if (hasOwn(value, "currentHusk")) {
      const validLocus = worktreeIdentity.kind === "linked" && worktree.branch === null;
      if (!validLocus || value.currentHusk?.ok !== true) {
        addPresenceIssue(context, "currentHusk", "requires a successful linked branchless worktree advisory");
      }
    }

    if (!identityKnown) {
      requireExactPresence(value, context, "orphanBranchSweep", worktreeIdentity.kind === "primary");
    }
  }

  const recoveryRequired = worktree?.state === "branch-gone" && rosterSuccessful;
  requireExactPresence(value, context, "recovery", recoveryRequired);

  if (identityKnown) {
    requireExactPresence(value, context, "orphanBranchSweep", true);
  }

  for (const key of ["retiredSubdirs", "errandSweep", "inboxState", "partialPushMarker"] as const) {
    requireExactPresence(value, context, key, identityKnown);
  }

  requireExactPresence(value, context, "errandState", value.worktree.ok && value.active.ok);
  requireExactPresence(value, context, "workUnitState", rosterSuccessful);
  requireExactPresence(
    value,
    context,
    "materializableWorkUnits",
    value.active.ok && value.active.value.resolution === "none",
  );

  if (hasOwn(value, "compactionAdvisory") && !identityKnown) {
    addPresenceIssue(context, "compactionAdvisory", "requires a resolved identity");
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

/** Thin worktree view used by the lean recovery envelope. */
export const SessionRecoverWorktreeValueViewSchema = WorktreeSyncValueViewSchema.extend({
  identity: WorktreeIdentityViewSchema,
}).loose();

const SessionRecoverEnvelopeObjectSchema = z.strictObject({
  mode: z.literal("recover"),
  identity: StatusIdentitySchema,
  worktree: probe(SessionRecoverWorktreeValueViewSchema),
  dirty: probe(DirtyStateValueViewSchema),
  extensions: probe(ExtensionsSessionInitValueViewSchema),
  config: probe(ConfigSessionInitValueViewSchema),
  active: probe(ActiveSessionInitValueViewSchema),
  releaseRouting: probe(ReleaseRoutingValueViewSchema),
  cohortDocPath: LoadSetPathSchema.optional(),
  loadSet: probe(LoadSetManifestSchema),
  taskCursor: probe(TaskListCursorFileResultSchema).optional(),
});

const SessionRecoverProbeResultRuntimeSchema = SessionRecoverEnvelopeObjectSchema.superRefine(
  (value, context) => {
    if (
      Object.hasOwn(value, "cohortDocPath")
      && !(value.active.ok
        && value.active.value.resolution === "single"
        && typeof value.active.value.path === "string"
        && value.active.value.path.trim().length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["cohortDocPath"],
        message: "requires one active work unit with a path",
      });
    }

    const taskListPath = value.active.ok ? value.active.value.taskListPath : null;
    const taskCursorRequired = typeof taskListPath === "string"
      && LoadSetPathSchema.safeParse(taskListPath).success;
    if (Object.hasOwn(value, "taskCursor") !== taskCursorRequired) {
      context.addIssue({
        code: "custom",
        path: ["taskCursor"],
        message: taskCursorRequired
          ? "required by the safe active task-list path"
          : "forbidden without a safe active task-list path",
      });
    }
  },
);

/** Strict lean recovery wire contract with shared cohort and cursor rules. */
export const SessionRecoverProbeResultSchema = SessionRecoverProbeResultRuntimeSchema as z.ZodType<
  SessionRecoverProbeResult
>;

type DeclaredInput<Value> = Value extends readonly (infer Item)[]
  ? DeclaredInput<Item>[]
  : Value extends object
    ? { [Key in keyof Value as string extends Key ? never : Key]: DeclaredInput<Value[Key]> }
    : Value;

type SessionInitDeclaredInput = Omit<
  DeclaredInput<z.input<typeof SessionInitProbeResultRuntimeSchema>>,
  "config"
> & Pick<SessionInitProbeResult, "config">;

type SessionRecoverDeclaredInput = Omit<
  DeclaredInput<z.input<typeof SessionRecoverProbeResultRuntimeSchema>>,
  "config"
> & Pick<SessionRecoverProbeResult, "config">;

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
