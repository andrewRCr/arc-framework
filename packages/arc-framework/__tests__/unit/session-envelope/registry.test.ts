/** Unit coverage for session-envelope schema registry composition. */

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { SchemaError } from "../../../src/lib/kernel/index.js";
import {
  SESSION_ENVELOPE_SCHEMA_IDS,
  createSessionEnvelopeRegistry,
} from "../../../src/lib/session-envelope/registry.js";
import { LoadSetManifestSchema } from "../../../src/lib/load-set/types.js";
import { LoadSetAuditVerdictSchema } from "../../../src/lib/load-set/audit.js";
import { CompactionSeedSchema } from "../../../src/lib/compaction-seed/schema.js";
import { RecoveryAuditVerdictSchema } from "../../../src/lib/recover/audit.js";
import { RecoverAuditReportSchema } from "../../../src/lib/recover/report.js";
import { BaseBranchSyncStatusResultSchema } from "../../../src/lib/git/base-branch-sync.js";
import { CascadeResolutionSchema } from "../../../src/lib/session-init/branch-gone-cascade.js";
import { ErrandStalenessSweepResultSchema } from "../../../src/lib/session-init/errand-staleness-sweep.js";
import { InboxStateResultSchema } from "../../../src/lib/session-init/inbox-state.js";
import { MaterializableWorkUnitsResultSchema } from "../../../src/lib/session-init/materializable-work-units.js";
import { NotesCompactionSessionAdvisoryResultSchema } from "../../../src/lib/session-init/notes-compaction-advisory.js";
import { OrphanBranchSweepResultSchema } from "../../../src/lib/session-init/orphan-branch-sweep.js";
import { PartialPushMarkerSurfaceResultSchema } from "../../../src/lib/session-init/partial-push-marker-surface.js";
import { RetiredSubdirDetectionResultSchema } from "../../../src/lib/session-init/retired-subdir-detection.js";
import { ClassCompositionSchema } from "../../../src/lib/status/class-composition.js";
import { LOCUS_SCHEMA_IDS } from "../../../src/lib/locus/registry.js";
import { LocusEnvelopeV1Schema, LocusStateV1Schema } from "../../../src/lib/locus/schema/index.js";
import { TaskListCursorSchema } from "../../../src/lib/task-list/cursor.js";
import { TaskListCursorFileResultSchema } from "../../../src/lib/task-list/file-cursor.js";
import {
  SessionInitProbeResultSchema,
  SessionRecoverProbeResultSchema,
} from "../../../src/commands/status/schema.js";

describe("session-envelope schema registry", () => {
  it("composes fresh kernel registries with the shared family records", () => {
    const first = createSessionEnvelopeRegistry();
    const second = createSessionEnvelopeRegistry();

    expect(first.ids()).toEqual([
      "base-branch-sync",
      "cascade-resolution",
      "class-composition",
      "compaction-seed",
      "errand-staleness-sweep",
      "inbox-state",
      "load-set-audit-verdict",
      "load-set-manifest",
      "locus-envelope",
      "locus-identity",
      "locus-mutation-result",
      "locus-record",
      "locus-state",
      "materializable-work-units",
      "notes-compaction-session-advisory",
      "orphan-branch-sweep",
      "partial-push-marker-surface",
      "priority",
      "recovery-audit-report",
      "recovery-audit-verdict",
      "retired-subdir-detection",
      "session-init-envelope",
      "session-recover-envelope",
      "slug",
      "task-list-cursor",
      "task-list-cursor-file-result",
      "work-class",
      "work-unit-state",
    ]);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest)).toBe(LoadSetManifestSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.taskListCursor)).toBe(TaskListCursorSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.taskListCursorFileResult))
      .toBe(TaskListCursorFileResultSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.compactionSeed)).toBe(CompactionSeedSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.loadSetAuditVerdict)).toBe(LoadSetAuditVerdictSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.recoveryAuditVerdict)).toBe(RecoveryAuditVerdictSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.recoveryAuditReport)).toBe(RecoverAuditReportSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.sessionInitEnvelope)).toBe(SessionInitProbeResultSchema);
    expect(first.get(SESSION_ENVELOPE_SCHEMA_IDS.sessionRecoverEnvelope)).toBe(SessionRecoverProbeResultSchema);
    expect(first.get(LOCUS_SCHEMA_IDS.envelope)).toBe(LocusEnvelopeV1Schema);
    expect(first.get(LOCUS_SCHEMA_IDS.state)).toBe(LocusStateV1Schema);
    const advisorySchemas = [
      [SESSION_ENVELOPE_SCHEMA_IDS.inboxState, InboxStateResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.errandStalenessSweep, ErrandStalenessSweepResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.notesCompactionSessionAdvisory, NotesCompactionSessionAdvisoryResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.materializableWorkUnits, MaterializableWorkUnitsResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.orphanBranchSweep, OrphanBranchSweepResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.retiredSubdirDetection, RetiredSubdirDetectionResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.partialPushMarkerSurface, PartialPushMarkerSurfaceResultSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.classComposition, ClassCompositionSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.cascadeResolution, CascadeResolutionSchema],
      [SESSION_ENVELOPE_SCHEMA_IDS.baseBranchSync, BaseBranchSyncStatusResultSchema],
    ] as const;
    for (const [id, schema] of advisorySchemas) {
      expect(first.get(id)).toBe(schema);
    }

    first.register(z.boolean(), {
      id: "fixture-extension",
      version: 1,
      migrationPosture: "strict-current",
    });
    expect(second.get("fixture-extension")).toBeUndefined();
  });

  it("registers every family root at version 1 with strict-current posture", () => {
    const registry = createSessionEnvelopeRegistry();
    for (const id of Object.values(SESSION_ENVELOPE_SCHEMA_IDS)) {
      expect(registry.meta(id)).toEqual({ id, version: 1, migrationPosture: "strict-current" });
    }
  });

  it("retains kernel duplicate protection", () => {
    const registry = createSessionEnvelopeRegistry();
    expect(() => registry.register(z.string(), {
      id: SESSION_ENVELOPE_SCHEMA_IDS.loadSetManifest,
      version: 1,
      migrationPosture: "strict-current",
    })).toThrow(SchemaError);
  });
});
