/**
 * Composed schema discovery for the session-init, recovery, and seed family.
 *
 * Registration records stable subsystem identities without publishing them to
 * the kernel JSON Schema bundle; build projection remains a separate concern.
 */

import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import { SessionInitProbeResultSchema } from "../../commands/status/schema.js";
import { CompactionSeedSchema } from "../compaction-seed/schema.js";
import { LoadSetManifestSchema } from "../load-set/types.js";
import { LoadSetAuditVerdictSchema } from "../load-set/audit.js";
import { RecoveryAuditVerdictSchema } from "../recover/audit.js";
import { BaseBranchSyncStatusResultSchema } from "../git/base-branch-sync.js";
import { CascadeResolutionSchema } from "../session-init/branch-gone-cascade.js";
import { ErrandStalenessSweepResultSchema } from "../session-init/errand-staleness-sweep.js";
import { InboxStateResultSchema } from "../session-init/inbox-state.js";
import { MaterializableWorkUnitsResultSchema } from "../session-init/materializable-work-units.js";
import { NotesCompactionSessionAdvisoryResultSchema } from "../session-init/notes-compaction-advisory.js";
import { OrphanBranchSweepResultSchema } from "../session-init/orphan-branch-sweep.js";
import { PartialPushMarkerSurfaceResultSchema } from "../session-init/partial-push-marker-surface.js";
import { RetiredSubdirDetectionResultSchema } from "../session-init/retired-subdir-detection.js";
import { ClassCompositionSchema } from "../status/class-composition.js";
import { TaskListCursorSchema } from "../task-list/cursor.js";
import { TaskListCursorFileResultSchema } from "../task-list/file-cursor.js";

/** Stable identities for the currently registered session-envelope roots. */
export const SESSION_ENVELOPE_SCHEMA_IDS = {
  baseBranchSync: "base-branch-sync",
  cascadeResolution: "cascade-resolution",
  classComposition: "class-composition",
  compactionSeed: "compaction-seed",
  errandStalenessSweep: "errand-staleness-sweep",
  inboxState: "inbox-state",
  loadSetAuditVerdict: "load-set-audit-verdict",
  loadSetManifest: "load-set-manifest",
  materializableWorkUnits: "materializable-work-units",
  notesCompactionSessionAdvisory: "notes-compaction-session-advisory",
  orphanBranchSweep: "orphan-branch-sweep",
  partialPushMarkerSurface: "partial-push-marker-surface",
  recoveryAuditVerdict: "recovery-audit-verdict",
  retiredSubdirDetection: "retired-subdir-detection",
  sessionInitEnvelope: "session-init-envelope",
  taskListCursor: "task-list-cursor",
  taskListCursorFileResult: "task-list-cursor-file-result",
} as const;

const STRICT_CURRENT_V1 = {
  version: 1,
  migrationPosture: "strict-current",
} as const;

/**
 * Create a fresh kernel registry extended with session-envelope family roots.
 *
 * @returns Isolated registry containing kernel vocabulary and family schemas
 */
export function createSessionEnvelopeRegistry(): KernelRegistry {
  const registry = createKernelRegistry();
  registry.register(BaseBranchSyncStatusResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.baseBranchSync,
    ...STRICT_CURRENT_V1,
  });
  registry.register(CascadeResolutionSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.cascadeResolution,
    ...STRICT_CURRENT_V1,
  });
  registry.register(ClassCompositionSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.classComposition,
    ...STRICT_CURRENT_V1,
  });
  registry.register(CompactionSeedSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.compactionSeed,
    ...STRICT_CURRENT_V1,
  });
  registry.register(ErrandStalenessSweepResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.errandStalenessSweep,
    ...STRICT_CURRENT_V1,
  });
  registry.register(InboxStateResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.inboxState,
    ...STRICT_CURRENT_V1,
  });
  registry.register(LoadSetAuditVerdictSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.loadSetAuditVerdict,
    ...STRICT_CURRENT_V1,
  });
  registry.register(LoadSetManifestSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest,
    ...STRICT_CURRENT_V1,
  });
  registry.register(MaterializableWorkUnitsResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.materializableWorkUnits,
    ...STRICT_CURRENT_V1,
  });
  registry.register(NotesCompactionSessionAdvisoryResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.notesCompactionSessionAdvisory,
    ...STRICT_CURRENT_V1,
  });
  registry.register(OrphanBranchSweepResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.orphanBranchSweep,
    ...STRICT_CURRENT_V1,
  });
  registry.register(PartialPushMarkerSurfaceResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.partialPushMarkerSurface,
    ...STRICT_CURRENT_V1,
  });
  registry.register(TaskListCursorSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.taskListCursor,
    ...STRICT_CURRENT_V1,
  });
  registry.register(TaskListCursorFileResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.taskListCursorFileResult,
    ...STRICT_CURRENT_V1,
  });
  registry.register(RecoveryAuditVerdictSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.recoveryAuditVerdict,
    ...STRICT_CURRENT_V1,
  });
  registry.register(RetiredSubdirDetectionResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.retiredSubdirDetection,
    ...STRICT_CURRENT_V1,
  });
  registry.register(SessionInitProbeResultSchema, {
    id: SESSION_ENVELOPE_SCHEMA_IDS.sessionInitEnvelope,
    ...STRICT_CURRENT_V1,
  });
  return registry;
}
