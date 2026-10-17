/** Gather the import privately and expose its complete destination through one ref transaction. */
import type { RefBackendContext } from "../context.js";
import { updateRefTransaction } from "../../../git/ref-transaction.js";
import { readSyncRefs } from "../sync-graph.js";

/** Rebuild private gathering refs on a retry, or drop the same build for a trial. */
export async function landImportRefs(context: RefBackendContext, refs: ReadonlyMap<string, string>, trial: boolean): Promise<boolean> {
  const gathered = new Map([...refs].map(([ref, next]) => [`refs/arc/tmp/migrate/import/${ref.slice("refs/arc/".length)}`, next]));
  const held = await readSyncRefs(context, "refs/arc/tmp/migrate/import/");
  const gathering = await updateRefTransaction(context, [
    ...[...gathered].map(([ref, next]) => ({ ref, next, expected: held.get(ref) ?? null })),
    ...[...held].filter(([ref]) => !gathered.has(ref)).map(([ref, expected]) => ({ ref, expected, delete: true as const })),
  ], { cwd: context.checkoutRoot });
  if (gathering.status !== "committed") throw new Error("The private import build changed unexpectedly");
  if (!trial) await context.migrateStep?.("import.land");
  const release = await context.lock("layout");
  try {
    const changes = [...gathered].map(([ref, expected]) => ({ ref, expected, delete: true as const }));
    const landed = await updateRefTransaction(context, trial ? changes : [
      ...[...refs].map(([ref, next]) => ({ ref, next, expected: null })), ...changes,
    ], { cwd: context.checkoutRoot });
    return landed.status === "committed";
  } finally { await release(); }
}
