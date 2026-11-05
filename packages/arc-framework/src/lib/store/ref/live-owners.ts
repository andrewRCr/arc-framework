/** Capture addressable owner refs and their currently present primary claims. */

import { RecordReferenceSchema, type OwnerIdentity } from "../identity.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { expandStoredPath, holdsNoRecord } from "../stored-path.js";
import { readBatchObjects, readRefTrees, type RefTreeEntry } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { readRefMetadata, type RefMetadata, type RefMetadataRead } from "./metadata.js";
import type { RefBackendContext } from "./context.js";
import { refObjectFault } from "./object-fault.js";
import { missingHistoryRefs } from "./missing-history.js";
import type { Slug } from "../../kernel/schema/slug.js";
import type { LiveRefOwner } from "./namespace-admission.js";

/** Internal name authority retains aliases alongside proof that their primary is still present. */
export interface LiveRefOwnerEvidence extends LiveRefOwner { formerSlugs: readonly Slug[] }

/** Logical owners, readable record-free metadata, and omitted refs from one captured namespace. */
export interface LiveRefOwners { owners: LiveRefOwnerEvidence[]; recordFree: LiveRefOwner[]; unreadable: ReadonlyMap<string, StoreRefusal> }

/** Read owner names and primary presence from exactly the caller's captured tips; saved tips name historical repair. */
export async function readLiveRefOwners(context: RefBackendContext, tips: ReadonlyMap<string, string>, saved = false): Promise<StoreResult<LiveRefOwners>> {
  const refs = [...tips].filter(([ref]) => matchesFamilyRef(ref, "work-item") || matchesFamilyRef(ref, "cohort"));
  const trees = refs.length > 0 ? await readRefTrees(context, new Map(refs)) : new Map<string, RefTreeEntry[]>();
  const metadataEntries = new Map(refs.flatMap(([ref]) => {
    const entry = trees.get(ref)?.find(({ path }) => path === `metadata-${ref.split("/").at(-1)}.json`);
    return entry ? [[ref, entry] as const] : [];
  }));
  const objects = await readBatchObjects(context, [...metadataEntries.values()].map(({ oid }) => oid));
  const owners: LiveRefOwnerEvidence[] = [];
  const recordFree: LiveRefOwner[] = [];
  const unreadable = new Map<string, StoreRefusal>();
  for (const [ref] of refs) {
    const captured = await decodeLiveOwner(context, { ref, entries: trees.get(ref),
      read: readRefMetadata(ref, metadataEntries.get(ref), objects), saved, current: saved ? undefined : tips });
    if (captured.kind === "live") owners.push(captured.owner);
    else if (captured.kind === "record-free") recordFree.push(...captured.owners);
    else unreadable.set(ref, captured.refusal);
  }
  return { status: "ok", result: { owners, recordFree, unreadable } };
}

interface LiveOwnerRead {
  ref: string; entries?: readonly RefTreeEntry[]; read: RefMetadataRead; saved: boolean; current?: ReadonlyMap<string, string>;
}
type LiveOwnerCapture = { kind: "live"; owner: LiveRefOwnerEvidence }
  | { kind: "record-free"; owners: LiveRefOwner[] } | { kind: "unreadable"; refusal: StoreRefusal };

async function decodeLiveOwner(context: RefBackendContext, { ref, entries, read, saved, current }: LiveOwnerRead): Promise<LiveOwnerCapture> {
  const family = matchesFamilyRef(ref, "work-item") ? "work-item" : "cohort";
  const shell = expandStoredPath(RecordReferenceSchema.parse({ kind: family === "work-item" ? "work-item/meta" : "cohort/document",
    owner: { type: family, name: "unresolved", uid: ref.split("/").at(-1) } }), { registry: context.registry });
  if (entries && holdsNoRecord(shell, entries.map(({ path }) => path))) return { kind: "record-free",
    owners: capturedRecordFreeOwners(ref, family, read.kind === "parsed" ? read.metadata : null) };
  if (!entries) return { kind: "unreadable", refusal: refObjectFault(ref, "missing", {
    condition: `The tip or a tree of ${ref} is unavailable locally.`,
    historyRefs: await missingHistoryRefs(context, [ref], current),
  }).refusal };
  if (read.kind !== "parsed") return { kind: "unreadable", refusal: refObjectFault(ref,
    read.kind === "absent" ? "no-metadata" : read.kind, { saved,
      historyRefs: read.kind === "missing" ? await missingHistoryRefs(context, [ref], current) : undefined,
    }).refusal };
  return { kind: "live", owner: captureLiveRefOwner(context, ref, family, entries, read.metadata) };
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
