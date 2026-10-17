/** Capture addressable owner refs and their currently present primary claims. */

import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { parseRefMetadata, metadataFailure, type RefMetadata } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import type { LiveRefOwner } from "./namespace-admission.js";

/** Read owner names and primary presence from exactly the caller's captured tips. */
export async function readLiveRefOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<LiveRefOwner[]>> {
  const refs = [...tips].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort"));
  const query = (ref: string, tip: string) => `${tip}:metadata-${ref.split("/").at(-1)}.json`;
  const objects = await readBatchObjects(context, refs.map(([ref, tip]) => query(ref, tip)));
  const trees = refs.length > 0 ? await readRefTrees(context, new Map(refs)) : new Map<string, RefTreeEntry[]>();
  const owners: LiveRefOwner[] = [];
  for (const [ref, tip] of refs) {
    const metadata = parseRefMetadata(objects.get(query(ref, tip)), ref);
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
      namespace: ref, ...metadataFailure(ref) } };
    const owner = refOwner(ref, matchesFamilyRef(ref, "work-item") ? "work-item" : "cohort", metadata);
    const state: LiveRefOwner = { owner };
    owners.push(state);
    const primary = capturedPrimary(owner, metadata);
    if (!primary) continue;
    const home = expandStoredPath(primary.reference, { registry: context.registry });
    if (trees.get(ref)?.some((entry) => entry.path === home.path)) state.primary = primary;
  }
  return { status: "ok", result: owners };
}

function capturedPrimary(owner: OwnerIdentity, metadata: RefMetadata): LiveRefOwner["primary"] {
  const work = owner.type === "work-item";
  const kind = work ? metadata.primary?.role : "cohort/document";
  if (!kind) return undefined;
  const reference = RecordReferenceSchema.parse({ owner, kind });
  const placement = work ? metadata.primary?.placement : metadata.placement;
  return { reference, ...(placement === undefined ? {} : { placement }) };
}
