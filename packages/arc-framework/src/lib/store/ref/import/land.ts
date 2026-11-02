/** Gather the import privately and expose its complete destination through one ref transaction. */
import type { RefBackendContext } from "../context.js";
import type { RefTransactionOutcome } from "../../../git/ref-transaction.js";
import { updateStoreRefTransaction } from "../ref-transaction.js";
import { readSyncRefs } from "../sync-graph.js";
import { IMPORT_KEPT_PREFIX, importTransientDeletes } from "./transient-cleanup.js";
import { readRefRepository } from "../repository.js";
import { isStateRef } from "../manifest.js";

/** Distinguish a changed destination layout or occupied store from the transaction's lost ref expectations. */
export type ImportLandingOutcome = RefTransactionOutcome | { status: "layout-mismatch" } | { status: "occupied" };

/** Rebuild private gathering refs on a retry, or drop the same build for a trial. */
export async function landImportRefs(context: RefBackendContext, refs: ReadonlyMap<string, string>, trial: boolean,
  transients: ReadonlyMap<string, string>): Promise<ImportLandingOutcome> {
  const gathered = new Map([...refs].map(([ref, next]) => [`refs/arc/tmp/migrate/import/${ref.slice("refs/arc/".length)}`, next]));
  const held = new Map([...await readSyncRefs(context, "refs/arc/tmp/migrate/import/")].filter(([ref]) => !ref.startsWith(IMPORT_KEPT_PREFIX)));
  const gathering = await updateStoreRefTransaction(context, [
    ...[...gathered].map(([ref, next]) => ({ ref, next, expected: held.get(ref) ?? null })),
    ...[...held].filter(([ref]) => !gathered.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const })),
  ], { cwd: context.checkoutRoot });
  if (gathering.status !== "committed") throw new Error("The private import build changed unexpectedly");
  if (!trial) await context.migrateStep?.("import.land");
  const release = await context.lock("layout");
  try {
    if (!trial) {
      const current = await readRefRepository(context.repository?.source ?? context);
      if (current.repository?.gitDir !== context.repository?.gitDir) return { status: "layout-mismatch" };
      if ([...await readSyncRefs(current, "refs/arc/")].some(([ref]) => isStateRef(ref))) return { status: "occupied" };
    }
    const changes = [...gathered].map(([ref, expected]) => ({ ref, expected, delete: true as const }));
    const landed = await updateStoreRefTransaction(context, trial ? changes : [
      ...[...refs].map(([ref, next]) => ({ ref, next, expected: null })), ...changes,
      ...(context.repository?.gitDir ? [] : importTransientDeletes(transients)),
    ], { cwd: context.checkoutRoot });
    return landed;
  } finally { await release(); }
}
