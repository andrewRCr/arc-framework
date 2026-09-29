/** Source-graph proofs for schema-owned and deliberately handwritten envelope types. */

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const SOURCE_ROOT = resolve(import.meta.dirname, "../../../src");

interface TypeLocus {
    file: string;
    type: string;
}

const SCHEMA_OWNED_TYPES: readonly TypeLocus[] = [
    { file: "lib/load-set/types.ts", type: "LoadSetManifest" },
    { file: "lib/task-list/cursor.ts", type: "TaskListCursor" },
    { file: "lib/task-list/file-cursor.ts", type: "TaskListCursorFileResult" },
    { file: "lib/compaction-seed/schema.ts", type: "CompactionSeed" },
    { file: "lib/load-set/audit.ts", type: "LoadSetAuditVerdict" },
    { file: "lib/recover/audit.ts", type: "RecoveryAuditVerdict" },
    { file: "lib/recover/report.ts", type: "RecoverAuditReport" },
    { file: "lib/session-init/inbox-state.ts", type: "InboxStateResult" },
    {
        file: "lib/session-init/errand-staleness-sweep.ts",
        type: "ErrandStalenessSweepResult",
    },
    {
        file: "lib/session-init/notes-compaction-advisory.ts",
        type: "NotesCompactionSessionAdvisoryResult",
    },
    {
        file: "lib/session-init/materializable-work-units.ts",
        type: "MaterializableWorkUnitDiscoveryResult",
    },
    {
        file: "lib/session-init/orphan-branch-sweep.ts",
        type: "OrphanBranchSweepResult",
    },
    {
        file: "lib/session-init/retired-subdir-detection.ts",
        type: "RetiredSubdirDetectionResult",
    },
    {
        file: "lib/session-init/partial-push-marker-surface.ts",
        type: "PartialPushMarkerSurfaceResult",
    },
    { file: "lib/status/class-composition.ts", type: "ClassComposition" },
    {
        file: "lib/session-init/branch-gone-cascade.ts",
        type: "CascadeResolution",
    },
    { file: "lib/git/base-branch-sync.ts", type: "BaseBranchSnapshotAnalysisResult" },
    { file: "lib/git/dirty-state.ts", type: "DirtyStateResult" },
    { file: "lib/session-init/current-husk-advisory.ts", type: "CurrentHuskAdvisory" },
    { file: "commands/extensions/types.ts", type: "ExtensionsSessionInitResult" },
    { file: "commands/active/types.ts", type: "ActiveSessionInitResult" },
    { file: "commands/config/types.ts", type: "ConfigSessionInitResult" },
    { file: "lib/release/routing.ts", type: "ReleaseRoutingValue" },
    { file: "commands/constitution/types.ts", type: "DomainRulesSessionInitResult" },
    { file: "commands/status/types.ts", type: "StatusIdentity" },
    { file: "commands/status/types.ts", type: "CompactionSeedWriteStatus" },
];

const HANDWRITTEN_TAIL_TYPES: readonly TypeLocus[] = [
    { file: "lib/git/worktree-sync.ts", type: "WorktreeSyncStatusResult" },
    { file: "lib/git/base-distance.ts", type: "BaseDistanceStatusResult" },
    { file: "lib/git/worktree-roster.ts", type: "WorktreeRosterResult" },
    {
        file: "lib/session-init/stale-worktree-sweep.ts",
        type: "StaleWorktreeSweepResult",
    },
    {
        file: "lib/session-init/work-unit-state.ts",
        type: "WorkUnitStateResult",
    },
    { file: "lib/session-init/errand-state.ts", type: "ErrandStateResult" },
    { file: "commands/user/types.ts", type: "UserSessionInitStatusResult" },
    { file: "commands/status/types.ts", type: "SessionInitProbeResult" },
    { file: "commands/status/types.ts", type: "SessionRecoverProbeResult" },
];

function exportedTypeDeclaration({ file, type }: TypeLocus): string {
    const path = join(SOURCE_ROOT, file);
    const source = readFileSync(path, "utf8");
    const sourceFile = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const declaration = sourceFile.statements.find(
        (statement) =>
            (ts.isTypeAliasDeclaration(statement) ||
                ts.isInterfaceDeclaration(statement)) &&
            statement.name.text === type &&
            statement.modifiers?.some(
                ({ kind }) => kind === ts.SyntaxKind.ExportKeyword,
            ) === true,
    );
    if (declaration === undefined)
        throw new Error(`missing exported type ${type} in ${file}`);
    return source.slice(declaration.getStart(sourceFile), declaration.getEnd());
}

describe("session-envelope type authority", () => {
    it.each(SCHEMA_OWNED_TYPES)(
        "derives $type from its runtime schema",
        (locus) => {
            expect(exportedTypeDeclaration(locus)).toContain("z.infer<");
        },
    );

    it.each(HANDWRITTEN_TAIL_TYPES)(
        "keeps $type under handwritten authority",
        (locus) => {
            expect(exportedTypeDeclaration(locus)).not.toContain("z.infer<");
        },
    );

    it("retains one-way producer compatibility proofs beside the thin top-level schemas", () => {
        const schemaSource = readFileSync(
            join(SOURCE_ROOT, "commands/status/schema.ts"),
            "utf8",
        );
        expect(schemaSource).toContain("type SessionInitDeclaredInput =");
        expect(schemaSource).toContain("type SessionRecoverDeclaredInput =");
        expect(schemaSource).toContain(
            "SessionInitProbeResultSchemaInputCompatibility<",
        );
        expect(schemaSource).toContain(
            "SessionRecoverProbeResultSchemaInputCompatibility<",
        );
    });
});
