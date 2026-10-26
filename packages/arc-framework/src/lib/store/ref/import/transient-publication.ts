/** Retain and verify the exact imported claim tips before their source identity refs can retire. */
import { z } from "zod";
import type { RefBackendContext } from "../context.js";
import { readSyncRefs, syncRefIsAncestor } from "../sync-graph.js";
import { readBatchObjects } from "../batch-read.js";
import { writeRefBlob } from "../tree-write.js";
import { requireLayoutTransaction } from "../migrate-layout-build.js";
import { readRefRepository } from "../repository.js";
import { readRefDesignation } from "../designation.js";
import { captureMoveRemote } from "../migrate-remote-target.js";
import { clearMigrationRefs, fetchMigrationRemote } from "../migrate-remote-fetch.js";

/** Code-repository journal, independent of destination layout and source-generation keepers. */
export const IMPORT_PUBLICATION_REF = "refs/arc/tmp/migrate/import-required";
const RequirementsSchema = z.record(z.string().regex(/^refs\/arc\/user\/[^/]+\/claims$/u), z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u));

/** Write the landing's immutable requirements before it can expose imported state or remove a source. */
export async function keepImportPublication(context: RefBackendContext, refs: ReadonlyMap<string, string>): Promise<void> {
  const claims = Object.fromEntries([...refs].filter(([ref]) => /^refs\/arc\/user\/[^/]+\/claims$/u.test(ref)));
  const expected = (await readSyncRefs(context, IMPORT_PUBLICATION_REF)).get(IMPORT_PUBLICATION_REF) ?? null;
  const next = await writeRefBlob(context, JSON.stringify(RequirementsSchema.parse(claims)));
  await requireLayoutTransaction(context, [{ ref: IMPORT_PUBLICATION_REF, next, expected }]);
}

/** A successful project push cannot authorize deleting an identity's still-unpublished imported claims. */
export async function unpublishedImportClaims(context: RefBackendContext, identities: ReadonlySet<string>): Promise<{ condition: string; remedy: string } | undefined> {
  if (!identities.size) return;
  const tip = (await readSyncRefs(context, IMPORT_PUBLICATION_REF)).get(IMPORT_PUBLICATION_REF);
  if (!tip) return { condition: "The import's retained publication requirements are unavailable; source retirement is not authorized.",
    remedy: `Restore ${IMPORT_PUBLICATION_REF} from this import's retained journal, then rerun arc store migrate --import. Preserve the kept source tips until it finishes.` };
  const object = (await readBatchObjects(context, [tip])).get(tip);
  if (object?.type !== "blob") throw new Error("The import's publication requirements are unavailable; preserve its source keepers.");
  const required = Object.fromEntries(Object.entries(RequirementsSchema.parse(JSON.parse(new TextDecoder().decode(object.bytes))))
    .filter(([ref]) => identities.has(ref.split("/")[3] ?? "")));
  if (!Object.keys(required).length) return;
  const designation = await readRefDesignation(context), publisher = designation.pushes[0];
  if (!publisher) return;
  const physical = await readRefRepository(context), remote = await captureMoveRemote(context, context, publisher);
  const prefix = "refs/arc/tmp/migrate/import-published/";
  try {
    const published = await fetchMigrationRemote(physical, { ...remote, fetchUrl: remote.pushUrl }, true, { prefix });
    for (const [ref, expected] of Object.entries(required)) {
      const actual = published.get(ref);
      if (actual && await syncRefIsAncestor(physical, expected, actual)) continue;
      const person = ref.split("/")[3];
      return { condition: `The imported claims for ${person} have not published to ${publisher.name}; origin's transient source remains retained.`,
        remedy: `Publish the imported store with arc.identity set to ${person}, then rerun arc store migrate --import. Preserve the kept source tips until it finishes.` };
    }
  } finally { await clearMigrationRefs(physical, prefix); }
}
