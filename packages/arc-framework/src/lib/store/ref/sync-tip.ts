/** Validate a captured group endpoint before moving a local ref onto it. */

import { expandStoredPath } from "../stored-path.js";
import type { StoreRefusal } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { archivedFolders, isArchiveRef } from "./archive-read.js";
import { readBatchObjects, readRefTrees } from "./batch-read.js";
import { checkRefTip, corruptRef } from "./namespace-health.js";
import { refPrototype } from "./read.js";
import { viewRefFamily } from "./view-state.js";

/** Group metadata must decode even when a fast-forward needs no record merge. */
export async function checkSyncRefTip(context: RefBackendContext, ref: string, tip: string): Promise<StoreRefusal | undefined> {
  if (isArchiveRef(ref)) return checkArchiveTip(context, ref, tip);
  const live = ref.replace("refs/arc/history/", "refs/arc/"), family = viewRefFamily(live);
  if (!family) return corruptRef(ref);
  const home = expandStoredPath(refPrototype(context, live, family), { registry: context.registry });
  return checkRefTip(context, ref, tip, home.metadataPath);
}

async function checkArchiveTip(context: RefBackendContext, ref: string, tip: string): Promise<StoreRefusal | undefined> {
  const entries = (await readRefTrees(context, new Map([[ref, tip]]))).get(ref);
  if (!entries) return corruptRef(ref, true);
  const objects = await readBatchObjects(context, entries.filter(({ path }) => /\/metadata-[^/]+\.json$/u.test(path)).map(({ oid }) => oid));
  const diagnostic = (["work-item", "cohort"] as const)
    .flatMap((family) => archivedFolders(family, ref, entries, objects).diagnostics)[0];
  return diagnostic ? { code: "namespace-corrupt", class: "terminal", namespace: ref,
    condition: diagnostic.condition, remedy: diagnostic.remedy } : undefined;
}
