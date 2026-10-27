/** Capture addressable owner refs and their currently present primary claims. */

import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { expandStoredPath, holdsNoRecord } from "../stored-path.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { parseRefMetadata, type RefMetadata } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import { corruptRef } from "./namespace-health.js";
import type { Slug } from "../../kernel/schema/slug.js";
import type { LiveRefOwner } from "./namespace-admission.js";

/** Internal name authority retains aliases alongside proof that their primary is still present. */
export interface LiveRefOwnerEvidence extends LiveRefOwner { formerSlugs: readonly Slug[] }

/** Logical owners, readable record-free metadata, and omitted refs from one captured namespace. */
export interface LiveRefOwners { owners: LiveRefOwnerEvidence[]; recordFree: LiveRefOwner[]; unreadable: ReadonlyMap<string, StoreRefusal> }

/** Read owner names and primary presence from exactly the caller's captured tips; saved tips name historical repair. */
export async function readLiveRefOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>, saved = false): Promise<StoreResult<LiveRefOwners>> {
  const refs = [...tips].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort"));
  const query = (ref: string, tip: string) => `${tip}:metadata-${ref.split("/").at(-1)}.json`;
  const objects = await readBatchObjects(context, refs.map(([ref, tip]) => query(ref, tip)));
  const trees = refs.length > 0 ? await readRefTrees(context, new Map(refs)) : new Map<string, RefTreeEntry[]>();
  const owners: LiveRefOwnerEvidence[] = [];
  const recordFree: LiveRefOwner[] = [];
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref, tip] of refs) {
    const entries = trees.get(ref);
    const family = matchesFamilyRef(ref, "work-item") ? "work-item" : "cohort";
    const shell = expandStoredPath(RecordReferenceSchema.parse({ kind: family === "work-item" ? "work-item/meta" : "cohort/document",
      owner: { type: family, name: "unresolved", uid: ref.split("/").at(-1) } }), { registry: context.registry });
    const metadata = parseRefMetadata(objects.get(query(ref, tip)), ref);
    if (entries && holdsNoRecord(shell, entries.map(({ path }) => path))) {
      recordFree.push(...capturedRecordFreeOwners(ref, family, metadata));
      continue;
    }
    if (!entries || !metadata) { unreadable.set(ref, corruptRef(ref, !entries, saved)); continue; }
    owners.push(captureLiveRefOwner(context, ref, family, entries, metadata));
  }
  return { status: "ok", result: { owners, recordFree, unreadable } };
}

/** Apply the same actual-primary evidence rule to a live Git capture and an already captured lookup tree. */
export function captureLiveRefOwner(context: Pick<RefBackendContext, "registry">, ref: string, family: "work-item" | "cohort",
  entries: readonly RefTreeEntry[], metadata: RefMetadata): LiveRefOwnerEvidence {
  const owner = refOwner(ref, family, metadata), primary = capturedPrimary(owner, metadata);
  const state: LiveRefOwnerEvidence = { owner, formerSlugs: metadata.formerSlugs ?? [] };
  if (primary && entries.some(({ path }) => path === expandStoredPath(primary.reference, { registry: context.registry }).path)) state.primary = primary;
  return state;
}

function capturedRecordFreeOwners(ref: string, family: "work-item" | "cohort", metadata: RefMetadata | null): LiveRefOwner[] {
  return metadata ? [{ owner: refOwner(ref, family, metadata) }] : [];
}

function capturedPrimary(owner: OwnerIdentity, metadata: RefMetadata): LiveRefOwner["primary"] {
  const work = owner.type === "work-item";
  const kind = work ? metadata.primary?.role : "cohort/document";
  if (!kind) return undefined;
  const reference = RecordReferenceSchema.parse({ owner, kind });
  const placement = work ? metadata.primary?.placement : metadata.placement;
  return { reference, ...(placement === undefined ? {} : { placement }) };
}
