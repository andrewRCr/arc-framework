/** Reproducible evidence checks for completed GFM table migrations. */

import type { ManagedPath } from "../kernel/index.js";
import type { MarkdownChangedRange } from "./contracts.js";
import { validateMarkdownPath } from "./authority.js";
import {
  prepareMarkdownMigrationInputs,
  type PrepareMarkdownMigrationAuditOptions,
} from "./migration-audit.js";
import { transformGfmTables, verifyGfmTableRewrite } from "./table-transform.js";

/** Inputs captured for one migrated Markdown file. */
export interface AuditTableMigrationFileInput {
  readonly path: string;
  readonly baseline: Uint8Array;
  readonly candidate: Uint8Array;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

/** Reproducible per-file migration evidence. */
export interface TableMigrationFileAudit {
  readonly path: ManagedPath;
  readonly changedRanges: readonly MarkdownChangedRange[];
}

/** Complete audit evidence pinned to one immutable baseline commit. */
export interface TableMigrationAudit {
  readonly head: string;
  readonly files: readonly TableMigrationFileAudit[];
}

/** Filesystem and Git boundaries for preparing a migration audit. */
export type PrepareTableMigrationAuditOptions = PrepareMarkdownMigrationAuditOptions;

/** Verify and retain the complete range evidence for one table-only migration. */
export function auditTableMigrationFile(input: AuditTableMigrationFileInput): TableMigrationFileAudit {
  const path = validateMarkdownPath(input.path);
  verifyGfmTableRewrite({ ...input, path });
  return { path, changedRanges: input.changedRanges };
}

/** Pin HEAD, load exact Git baselines, and audit current bytes for the complete selected scope. */
export async function prepareTableMigrationAudit(
  options: PrepareTableMigrationAuditOptions,
): Promise<TableMigrationAudit> {
  const inputs = await prepareMarkdownMigrationInputs(options);
  const files: TableMigrationFileAudit[] = [];
  for (const { path, baseline, candidate } of inputs.files) {
    const transformed = transformGfmTables({ path, bytes: baseline });
    files.push(auditTableMigrationFile({
      path,
      baseline,
      candidate,
      changedRanges: transformed.changedRanges,
    }));
  }
  return { head: inputs.head, files };
}
