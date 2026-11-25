/** Batched, path-limited historical states with record-specific version metadata. */

import { StoreCreationReceiptReader } from "../commit-creation-receipt.js";
import { captureCommitReceipts, capturedCommitMessage } from "./history-receipts.js";
import type { HistoryEntry } from "../contract.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { expandStoredPath, type StoredRecordHome } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { decodeReference, refOwner } from "./codec.js";
import { readRefContent } from "./content-read.js";
import { canonicalPrimaryKind, readRefMetadata, type RefMetadata, type RefMetadataRead } from "./metadata.js";
import { checkRefKey } from "./path-admission.js";
import { refFormatKey } from "./format-key.js";
import { refRecordVersion } from "./record-version.js";
import { withCompletedPlacement } from "./archive-refresh.js";
import type { ReadPlacement } from "../placement.js";
import { captureHistoricalNamespaces, type HistoricalNamespaceEvidence } from "./historical-namespace.js";
import { refObjectFault } from "./object-fault.js";
import { missingHistoryRefs } from "./missing-history.js";

/** Exact state at a commit before attaching the commit's provenance. */
export type HistoricalState = Pick<HistoryEntry, "reference" | "version" | "content">;
/** Captured record state and verbatim commit message. */
export interface HistoricalSnapshot { state: HistoricalState; message: string; creationReceipt?: HistoryEntry["creationReceipt"] }

/** Read candidate and parent states without confusing an absent path with an unavailable blob. */
export async function readHistorySnapshots(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, revisions: readonly string[], paths: readonly string[] = [home.path, home.metadataPath],
  evidence = new StoreCreationReceiptReader(), ended?: ReadPlacement, tip?: string, current?: ReadonlyMap<string, string>): Promise<StoreResult<Map<string, HistoricalSnapshot>>> {
  if (revisions.length === 0) return { status: "ok", result: new Map() };
  const trees = await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])), paths);
  const objects = await readBatchObjects(context, [...new Set([...revisions, ...[...trees.values()].flatMap((entries) => entries.map((entry) => entry.oid))])]);
  const receipts = captureCommitReceipts(objects, home.ref, evidence, reference);
  if (receipts.status === "refused") return receipts;
  const captured = await readSnapshotNamespaces(context, reference, home, trees, objects, current);
  if (captured.status === "refused") return captured;
  const namespaces = captured.result;
  const snapshots = new Map<string, HistoricalSnapshot>();
  for (const revision of revisions) {
    const tree = trees.get(revision);
    const commit = objects.get(revision);
    if (!tree || commit?.type !== "commit") return { status: "refused", refusal: await unavailableHistory(context, reference, home, revision, current) };
    const state = await historicalState(context, reference, home, tree, objects, revision === tip ? ended : undefined,
      namespaces.recordFree.has(revision), current);
    if (state.status === "refused") return state;
    const creationReceipt = receipts.result.get(revision);
    snapshots.set(revision, { state: state.result, message: capturedCommitMessage(commit),
      ...(creationReceipt ? { creationReceipt } : {}) });
  }
  return { status: "ok", result: snapshots };
}

async function readSnapshotNamespaces(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  trees: ReadonlyMap<string, readonly RefTreeEntry[]>, objects: ReadonlyMap<string, BatchObject | null>, current?: ReadonlyMap<string, string>): Promise<StoreResult<HistoricalNamespaceEvidence>> {
  const namespaces = await captureHistoricalNamespaces(context, home, trees, objects, false);
  const unavailable = [...namespaces.unavailable][0];
  if (unavailable) return { status: "refused", refusal: await unavailableHistory(context, reference, home, unavailable, current) };
  const missing = [...namespaces.missing].find(revision => !namespaces.recordFree.has(revision));
  if (missing) {
    const object = trees.get(missing)?.find(({ path }) => path === home.metadataPath)?.oid ?? missing;
    return { status: "refused", refusal: await unavailableHistory(context, reference, home, object, current) };
  }
  return { status: "ok", result: namespaces };
}

/**
 * Decode one logical record from its historical tree without applying current semantic parsers. A state read at a version
 * whose latest folder defined it takes that folder's placement, as read did.
 */
export async function historicalState(context: RefBackendContext, requested: RecordReference, home: StoredRecordHome,
  tree: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>, ended?: ReadPlacement,
  recordFree = false, current?: ReadonlyMap<string, string>): Promise<StoreResult<HistoricalState>> {
  const metadataEntry = tree.find((entry) => entry.path === home.metadataPath);
  const read = stateMetadata(home.ref, metadataEntry, objects, ended);
  if (read.kind !== "parsed") {
    if (recordFree) return { status: "ok", result: { reference: requested, version: null, content: null } };
    if (read.kind === "missing") return { status: "refused", refusal: await unavailableHistory(context, requested, home, metadataEntry?.oid ?? home.ref, current) };
    return { status: "refused", refusal: refObjectFault(home.ref, read.kind === "absent" ? "no-metadata" : "unparseable", { saved: true }).refusal };
  }
  return historicalRecordState(context, requested, home, tree, objects, read.metadata, current);
}

async function historicalRecordState(context: RefBackendContext, requested: RecordReference, home: StoredRecordHome,
  tree: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>, metadata: RefMetadata,
  current?: ReadonlyMap<string, string>): Promise<StoreResult<HistoricalState>> {
  requested = historicalReference(context, requested, home, metadata);
  const path = expandStoredPath(requested, { registry: context.registry }).path;
  const entry = tree.find((entry) => entry.path === path);
  if (!entry || checkRefKey(requested, context.registry)) return { status: "ok", result: { reference: requested, version: null, content: null } };
  const object = objects.get(entry.oid);
  if (object?.type !== "blob") return { status: "refused", refusal: await unavailableHistory(context, requested, home, entry.oid, current) };
  const family = context.registry[requested.kind].family;
  const decoded = family === "lineage" ? decodeReference(context, requested.owner, family, entry.path, metadata, object) : null;
  if (family === "lineage" && (!decoded || !("owner" in decoded))) return { status: "refused", refusal: malformedHistory(requested, "The historical lineage owner cannot be decoded") };
  const reference = decoded && "owner" in decoded ? decoded : RecordReferenceSchema.parse({ ...requested, owner: requested.owner.type === "project" ? requested.owner : refOwner(home.ref, family, metadata) });
  const definition = context.registry[reference.kind];
  const formatVersion = metadata.formats[refFormatKey(reference)] ?? 1;
  if (formatVersion > definition.formatVersion) return { status: "refused", refusal: malformedHistory(reference, "Stored format version is newer than this build supports.") };
  // Historical bytes do not acquire today's semantic parser requirements.
  const content = readRefContent({ ...definition, parser: null }, object.bytes);
  if ("condition" in content) return { status: "refused", refusal: malformedHistory(reference, content.condition) };
  return { status: "ok", result: { reference, content: content.content, version: refRecordVersion(reference, object.oid, metadata, formatVersion) } };
}

/** Parse a state's metadata, taking the placement of the folder that defined it at its version where one did. */
function stateMetadata(namespace: string, entry: RefTreeEntry | undefined,
  objects: ReadonlyMap<string, BatchObject | null>, ended?: ReadPlacement): RefMetadataRead {
  const read = readRefMetadata(namespace, entry, objects);
  return read.kind === "parsed" && ended ? { kind: "parsed", metadata: withCompletedPlacement(read.metadata, ended) } : read;
}

async function unavailableHistory(context: RefBackendContext, reference: RecordReference, home: StoredRecordHome,
  object: string, current?: ReadonlyMap<string, string>): Promise<StoreRefusal> {
  return refObjectFault(home.ref, "missing", { reference, historyRefs: await missingHistoryRefs(context, [home.ref], current),
    condition: `The historical object ${object} is not available locally.`,
    remedy: { text: "Restore or fetch the missing history objects in the store repository, then retry." },
  }).refusal;
}

function malformedHistory(reference: RecordReference, condition: string): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule: "history.format-or-content", condition,
    remedy: { text: "Rebuild with support for the historical format or repair its stored metadata and content, then retry." } };
}

function historicalReference(context: RefBackendContext, requested: RecordReference, home: StoredRecordHome, metadata: RefMetadata): RecordReference {
  const family = context.registry[requested.kind].family;
  const owner = requested.owner.type === "project" || family === "lineage" ? requested.owner : refOwner(home.ref, family, metadata);
  const kind = canonicalPrimaryKind(requested.kind, metadata);
  return RecordReferenceSchema.parse({ ...requested, owner, kind });
}
