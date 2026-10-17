/** Capture addressable owner refs and their currently present primary claims. */

import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import { corruptRef } from "./namespace-health.js";
import type { LiveRefOwner } from "./namespace-admission.js";

/** Readable owners and omitted live refs from one captured namespace. */
export interface LiveRefOwners { owners: LiveRefOwner[]; unreadable: ReadonlyMap<string, StoreRefusal> }

/** Read owner names and primary presence from exactly the caller's captured tips. */
export async function readLiveRefOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>): Promise<StoreResult<LiveRefOwners>> {
  const refs = [...tips].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort"));
  const query = (ref: string, tip: string) => `${tip}:metadata-${ref.split("/").at(-1)}.json`;
  const objects = await readBatchObjects(context, refs.map(([ref, tip]) => query(ref, tip)));
  const trees = refs.length > 0 ? await readRefTrees(context, new Map(refs)) : new Map<string, RefTreeEntry[]>();
  const owners: LiveRefOwner[] = [];
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref, tip] of refs) {
    const entries = trees.get(ref);
    if (entries?.length === 0) continue;
    const metadata = parseRefMetadata(objects.get(query(ref, tip)), ref);
    if (!entries || !metadata) { unreadable.set(ref, corruptRef(ref, !entries)); continue; }
    const owner = refOwner(ref, matchesFamilyRef(ref, "work-item") ? "work-item" : "cohort", metadata);
    const state: LiveRefOwner = { owner };
    owners.push(state);
    const primary = capturedPrimary(owner, metadata);
    if (!primary) continue;
    const home = expandStoredPath(primary.reference, { registry: context.registry });
    if (trees.get(ref)?.some((entry) => entry.path === home.path)) state.primary = primary;
  }
  return { status: "ok", result: { owners, unreadable } };
}

function capturedPrimary(owner: OwnerIdentity, metadata: RefMetadata): LiveRefOwner["primary"] {
  const work = owner.type === "work-item";
  const kind = work ? metadata.primary?.role : "cohort/document";
  if (!kind) return undefined;
  const reference = RecordReferenceSchema.parse({ owner, kind });
  const placement = work ? metadata.primary?.placement : metadata.placement;
  return { reference, ...(placement === undefined ? {} : { placement }) };
}
