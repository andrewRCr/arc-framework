/** Persist landed cleanup effects beside the retained copy, including deletions interrupted before report storage. */
import { MigrateReportSchema, type MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readSyncRefs } from "./sync-graph.js";
import { writeRefBlob } from "./tree-write.js";
import { requireLayoutTransaction } from "./migrate-layout-build.js";
import { remoteCopyReport } from "./migrate-remote-copy.js";
import type { RefChange } from "../../git/ref-transaction.js";

const reportRef = "refs/arc/tmp/migrate/copied/report", pendingRoot = "refs/arc/tmp/migrate/copied/deleting/";

/** Report actions and remedies once even when a leased round is retried. */
export function appendCleanupReport(report: MigrateReport, addition: Pick<MigrateReport, "refs" | "notices">): void {
  appendUnique(report.refs, addition.refs);
  appendUnique(report.notices, addition.notices);
}

function appendUnique<T>(target: T[], addition: readonly T[]): void {
  const known = new Set(target.map(row => JSON.stringify(row)));
  for (const row of addition) {
    const key = JSON.stringify(row);
    if (!known.has(key)) { target.push(row); known.add(key); }
  }
}

/** Persist only actual report effects, atomically with their local journal transition. */
export async function retainCleanupReport(context: RefBackendContext, report: MigrateReport, changes: RefChange[] = []): Promise<void> {
  const expected = (await readSyncRefs(context, reportRef)).get(reportRef) ?? null;
  const next = await writeRefBlob(context, JSON.stringify(MigrateReportSchema.parse(report)));
  await requireLayoutTransaction(context, [...changes, { ref: reportRef, expected, next }]);
}

/** Retain deletion leases separately from reported effects before issuing the remote transaction. */
export async function retainCleanupDeleteBasis(context: RefBackendContext, source: ReadonlyMap<string, string>): Promise<void> {
  const prior = await readSyncRefs(context, pendingRoot);
  const next = new Map([...source].map(([ref, tip]) => [pendingRoot + ref.slice("refs/arc/".length), tip]));
  await requireLayoutTransaction(context, [...[...next].map(([ref, next]) => ({ ref, next, expected: prior.get(ref) ?? null })),
    ...[...prior].filter(([ref]) => !next.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const }))]);
}

/** Promote attempted deletions to landed actions only after the source is observed without those refs. */
export async function settleCleanupDeletes(context: RefBackendContext, source: ReadonlyMap<string, string>, report: MigrateReport): Promise<void> {
  const pending = await readSyncRefs(context, pendingRoot);
  const absent = new Map([...pending].filter(([ref]) => !source.has("refs/arc/" + ref.slice(pendingRoot.length))));
  if (!absent.size) return;
  const deleted = new Map([...absent].map(([ref, tip]) => ["refs/arc/" + ref.slice(pendingRoot.length), tip]));
  appendCleanupReport(report, { refs: remoteCopyReport(deleted, new Map(), []).refs.map(row => ({ ...row, action: "delete" })), notices: [] });
  await retainCleanupReport(context, report, [...absent].map(([ref, expected]) => ({ ref, expected, delete: true })));
}
