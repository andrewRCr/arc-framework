/** Runtime and TypeScript authority for release audit entries. */

import { z } from "zod";

import { createResolvedConfigOverrideSchema } from "../config/resolve-override.js";

const CommitInterlockSchema = z.enum(["manual", "on-task-approval", "on-workflow"]);
const PushInterlockSchema = z.enum(["manual", "on-sync", "on-workflow"]);
const SyncInterlockSchema = z.enum(["manual", "on-handoff", "on-workflow"]);
const NotesPushPolicySchema = z.enum(["manual", "prompt", "on-sync"]);

/** Audit-log JSONL command discriminator. */
export const AuditCommandSchema = z.enum(["release-commit", "release-push", "sync"]);

/** Numeric refusal codes persisted by release audit entries. */
export const RefusalCodeSchema = z.union([
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
  z.literal(15),
  z.literal(16),
]);

/** Active-work-unit identity persisted with an audit entry. */
export const AuditWorkUnitSchema = z.strictObject({ name: z.string() });

const CommitInterlockStateSchema = z.strictObject({
  command: z.literal("release-commit"),
  commitInterlock: createResolvedConfigOverrideSchema(CommitInterlockSchema),
  pushInterlock: createResolvedConfigOverrideSchema(PushInterlockSchema),
});

const PushInterlockStateSchema = z.strictObject({
  command: z.literal("release-push"),
  pushInterlock: createResolvedConfigOverrideSchema(PushInterlockSchema),
  syncInterlock: createResolvedConfigOverrideSchema(SyncInterlockSchema),
});

const SyncInterlockStateSchema = z.strictObject({
  command: z.literal("sync"),
  pushInterlock: createResolvedConfigOverrideSchema(PushInterlockSchema),
  notesPush: createResolvedConfigOverrideSchema(NotesPushPolicySchema),
  syncInterlock: createResolvedConfigOverrideSchema(SyncInterlockSchema),
});

/** Per-command interlock snapshot persisted with an audit entry. */
export const AuditInterlockStateSchema = z.discriminatedUnion("command", [
  CommitInterlockStateSchema,
  PushInterlockStateSchema,
  SyncInterlockStateSchema,
]);

const CommitOutcomeSchema = z.strictObject({ kind: z.literal("commit"), hash: z.string() });
const PushOutcomeSchema = z.strictObject({ kind: z.literal("push"), refStatus: z.string() });
const SyncOutcomeSchema = z.strictObject({
  kind: z.literal("sync"),
  cell: z.string(),
  worktree: z.string(),
  notes: z.string(),
  exitCode: z.number(),
});
const HookFailedOutcomeSchema = z.strictObject({
  kind: z.literal("hook-failed"),
  hook: z.string(),
  exitCode: z.number(),
});
const PreflightFailedOutcomeSchema = z.strictObject({
  kind: z.literal("preflight-failed"),
  reason: z.enum(["validation", "input"]),
});
const RefusedOutcomeSchema = z.strictObject({ kind: z.literal("refused") });

/** Outcome variants represented in the version-2 audit log. */
export const AuditOutcomeSchema = z.discriminatedUnion("kind", [
  CommitOutcomeSchema,
  PushOutcomeSchema,
  SyncOutcomeSchema,
  HookFailedOutcomeSchema,
  PreflightFailedOutcomeSchema,
  RefusedOutcomeSchema,
]);

const commonShape = {
  schemaVersion: z.literal(2),
  timestamp: z.string(),
  args: z.array(z.string()),
  wu: AuditWorkUnitSchema.nullable(),
} as const;

const commitShape = {
  ...commonShape,
  command: z.literal("release-commit"),
  interlockState: CommitInterlockStateSchema,
} as const;
const pushShape = {
  ...commonShape,
  command: z.literal("release-push"),
  interlockState: PushInterlockStateSchema,
} as const;
const syncShape = {
  ...commonShape,
  command: z.literal("sync"),
  interlockState: SyncInterlockStateSchema,
} as const;

const commitRefusalCodeSchema = z.union([z.literal(10), z.literal(11), z.literal(12), z.literal(13)]);
const pushRefusalCodeSchema = z.union([
  z.literal(10),
  z.literal(11),
  z.literal(12),
  z.literal(13),
  z.literal(14),
  z.literal(15),
]);

/** Complete structural authority for version-2 audit entries. */
export const AuditEntrySchema = z.union([
  z.strictObject({
    ...commitShape,
    decision: z.literal("proceeded"),
    refusalCode: z.null(),
    outcome: z.union([CommitOutcomeSchema, HookFailedOutcomeSchema]),
  }),
  z.strictObject({
    ...commitShape,
    decision: z.literal("refused"),
    refusalCode: commitRefusalCodeSchema,
    outcome: RefusedOutcomeSchema,
  }),
  z.strictObject({
    ...commitShape,
    decision: z.literal("refused"),
    refusalCode: z.literal(16),
    outcome: PreflightFailedOutcomeSchema,
  }),
  z.strictObject({
    ...pushShape,
    decision: z.literal("proceeded"),
    refusalCode: z.null(),
    outcome: z.union([PushOutcomeSchema, HookFailedOutcomeSchema]),
  }),
  z.strictObject({
    ...pushShape,
    decision: z.literal("refused"),
    refusalCode: pushRefusalCodeSchema,
    outcome: RefusedOutcomeSchema,
  }),
  z.strictObject({
    ...syncShape,
    decision: z.literal("proceeded"),
    refusalCode: z.null(),
    outcome: SyncOutcomeSchema,
  }),
  z.strictObject({
    ...syncShape,
    decision: z.literal("refused"),
    refusalCode: z.literal(14),
    outcome: SyncOutcomeSchema,
  }),
]);

export type AuditCommand = z.infer<typeof AuditCommandSchema>;
export type RefusalCode = z.infer<typeof RefusalCodeSchema>;
export type AuditWorkUnit = z.infer<typeof AuditWorkUnitSchema>;
export type AuditInterlockState = z.infer<typeof AuditInterlockStateSchema>;
export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
