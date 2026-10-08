/**
 * Composed schema discovery for the session-init, recovery, and seed family.
 *
 * Registration records stable subsystem identities; production composition publishes these roots
 * through the shared contract projection.
 */

import { createKernelRegistry, type KernelRegistry } from "../kernel/index.js";
import { ActiveSessionInitResultSchema } from "../../commands/active/schema.js";
import { ConfigSessionInitResultSchema } from "../../commands/config/status.js";
import { DomainRulesSessionInitResultSchema } from "../../commands/constitution/status.js";
import { ExtensionsSessionInitResultSchema } from "../../commands/extensions/status.js";
import {
  SessionInitProbeResultSchema,
  SessionRecoverProbeResultSchema,
} from "../../commands/status/schema.js";
import { CompactionSeedSchema } from "../compaction-seed/schema.js";
import { LoadSetManifestSchema } from "../load-set/types.js";
import { LoadSetAuditVerdictSchema } from "../load-set/audit.js";
import { RecoveryAuditVerdictSchema } from "../recover/audit.js";
import { ReleaseRoutingValueSchema } from "../release/routing.js";
import { RecoverAuditReportSchema } from "../recover/report.js";
import { BaseBranchSnapshotAnalysisResultSchema } from "../git/base-branch-sync.js";
import { BaseDistanceSnapshotResultSchema } from "../git/base-distance.js";
import { DirtyStateResultSchema } from "../git/dirty-state.js";
import { WorktreeSnapshotAnalysisResultSchema } from "../git/worktree-sync.js";
import { WorktreeRosterResultSchema } from "../git/worktree-roster.js";
import { CurrentHuskAdvisorySchema } from "../session-init/current-husk-advisory.js";
import { CascadeResolutionSchema } from "../session-init/branch-gone-cascade.js";
import { ErrandStalenessSweepResultSchema } from "../session-init/errand-staleness-sweep.js";
import { InboxStateResultSchema } from "../session-init/inbox-state.js";
import { MaterializableWorkUnitDiscoveryResultSchema } from "../session-init/materializable-work-units.js";
import { NotesCompactionSessionAdvisoryResultSchema } from "../session-init/notes-compaction-advisory.js";
import { OrphanBranchSweepResultSchema } from "../session-init/orphan-branch-sweep.js";
import { PartialPushMarkerSurfaceResultSchema } from "../session-init/partial-push-marker-surface.js";
import { RetiredSubdirDetectionResultSchema } from "../session-init/retired-subdir-detection.js";
import { ClassCompositionSchema } from "../status/class-composition.js";
import { TaskListCursorSchema } from "../task-list/cursor.js";
import { TaskListCursorFileResultSchema } from "../task-list/file-cursor.js";

/** Stable identities for the currently registered session-envelope roots. */
export const SESSION_ENVELOPE_SCHEMA_IDS = {
  activeSessionInit: "active-session-init",
  baseBranchSync: "base-branch-sync",
  baseDistance: "base-distance",
  cascadeResolution: "cascade-resolution",
  classComposition: "class-composition",
  compactionSeed: "compaction-seed",
  configSessionInit: "config-session-init",
  currentHuskAdvisory: "current-husk-advisory",
  dirtyState: "dirty-state",
  domainRulesSessionInit: "domain-rules-session-init",
  errandStalenessSweep: "errand-staleness-sweep",
  extensionsSessionInit: "extensions-session-init",
  inboxState: "inbox-state",
  loadSetAuditVerdict: "load-set-audit-verdict",
  loadSetManifest: "load-set-manifest",
  materializableWorkUnits: "materializable-work-units",
  notesCompactionSessionAdvisory: "notes-compaction-session-advisory",
  orphanBranchSweep: "orphan-branch-sweep",
  partialPushMarkerSurface: "partial-push-marker-surface",
  recoveryAuditVerdict: "recovery-audit-verdict",
  recoveryAuditReport: "recovery-audit-report",
  releaseRouting: "release-routing",
  retiredSubdirDetection: "retired-subdir-detection",
  sessionInitEnvelope: "session-init-envelope",
  sessionRecoverEnvelope: "session-recover-envelope",
  taskListCursor: "task-list-cursor",
  taskListCursorFileResult: "task-list-cursor-file-result",
  worktreeRoster: "worktree-roster",
  worktreeSync: "worktree-sync",
} as const;

const STRICT_CURRENT_V1 = {
  version: 1,
  migrationPosture: "strict-current",
} as const;

const SESSION_ENVELOPE_SCHEMAS = [
  [SESSION_ENVELOPE_SCHEMA_IDS.activeSessionInit, ActiveSessionInitResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.baseBranchSync, BaseBranchSnapshotAnalysisResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.baseDistance, BaseDistanceSnapshotResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.cascadeResolution, CascadeResolutionSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.classComposition, ClassCompositionSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.compactionSeed, CompactionSeedSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.configSessionInit, ConfigSessionInitResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.currentHuskAdvisory, CurrentHuskAdvisorySchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.dirtyState, DirtyStateResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.domainRulesSessionInit, DomainRulesSessionInitResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.errandStalenessSweep, ErrandStalenessSweepResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.extensionsSessionInit, ExtensionsSessionInitResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.inboxState, InboxStateResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.loadSetAuditVerdict, LoadSetAuditVerdictSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest, LoadSetManifestSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.materializableWorkUnits, MaterializableWorkUnitDiscoveryResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.notesCompactionSessionAdvisory, NotesCompactionSessionAdvisoryResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.orphanBranchSweep, OrphanBranchSweepResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.partialPushMarkerSurface, PartialPushMarkerSurfaceResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.taskListCursor, TaskListCursorSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.taskListCursorFileResult, TaskListCursorFileResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.recoveryAuditVerdict, RecoveryAuditVerdictSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.recoveryAuditReport, RecoverAuditReportSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.releaseRouting, ReleaseRoutingValueSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.retiredSubdirDetection, RetiredSubdirDetectionResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.sessionInitEnvelope, SessionInitProbeResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.sessionRecoverEnvelope, SessionRecoverProbeResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.worktreeRoster, WorktreeRosterResultSchema],
  [SESSION_ENVELOPE_SCHEMA_IDS.worktreeSync, WorktreeSnapshotAnalysisResultSchema],
] as const;

/**
 * Register the session-envelope family roots in an existing kernel registry.
 *
 * @param registry - Registry receiving the public session-envelope schemas
 * @returns The same registry after registration
 */
export function registerSessionEnvelopeSchemas(registry: KernelRegistry): KernelRegistry {
  for (const [id, schema] of SESSION_ENVELOPE_SCHEMAS) {
    registry.register(schema, { id, ...STRICT_CURRENT_V1 });
  }
  return registry;
}

/**
 * Create a fresh kernel registry extended with session-envelope family roots.
 *
 * @returns Isolated registry containing kernel vocabulary and family schemas
 */
export function createSessionEnvelopeRegistry(): KernelRegistry {
  return registerSessionEnvelopeSchemas(createKernelRegistry());
}
