/** Batched, path-limited historical states with record-specific version metadata. */

import type { HistoryEntry } from "../contract.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import type { StoredRecordHome } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, readRefTrees, type BatchObject, type RefTreeEntry } from "./batch-read.js";
import { decodeReference, refOwner } from "./codec.js";
import { readRefContent } from "./content-read.js";
import { metadataFailure, parseRefMetadata } from "./metadata.js";
import { refFormatKey } from "./format-key.js";
import { refRecordVersion } from "./record-version.js";

/** Exact state at a commit before attaching the commit's provenance. */
export type HistoricalState = Pick<HistoryEntry, "reference" | "version" | "content">;
/** Captured record state and verbatim commit message. */
export interface HistoricalSnapshot { state: HistoricalState; message: string }

/** Read candidate and parent states without confusing an absent path with an unavailable blob. */
export async function readHistorySnapshots(context: RefBackendContext, reference: RecordReference,
  home: StoredRecordHome, revisions: readonly string[]): Promise<StoreResult<Map<string, HistoricalSnapshot>>> {
  if (revisions.length === 0) return { status: "ok", result: new Map() };
  const trees = await readRefTrees(context, new Map(revisions.map((revision) => [revision, revision])), [home.path, home.metadataPath]);
  const objects = await readBatchObjects(context, [...new Set([...revisions, ...[...trees.values()].flatMap((entries) => entries.map((entry) => entry.oid))])]);
  const snapshots = new Map<string, HistoricalSnapshot>();
  for (const revision of revisions) {
    const tree = trees.get(revision);
    const commit = objects.get(revision);
    if (!tree || commit?.type !== "commit") return { status: "refused", refusal: unavailableHistory(reference, revision) };
    const state = historicalState(context, reference, home, tree, objects);
    if (state.status === "refused") return state;
    const raw = new TextDecoder().decode(commit.bytes);
    const boundary = raw.indexOf("\n\n");
    if (boundary < 0) throw new Error("Git returned a commit without a header boundary");
    snapshots.set(revision, { state: state.result, message: raw.slice(boundary + 2) });
  }
  return { status: "ok", result: snapshots };
}

function historicalState(context: RefBackendContext, requested: RecordReference, home: StoredRecordHome,
  tree: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>): StoreResult<HistoricalState> {
  const entry = tree.find((entry) => entry.path === home.path);
  if (!entry) return { status: "ok", result: { reference: requested, version: null, content: null } };
  const metadataEntry = tree.find((entry) => entry.path === home.metadataPath);
  const metadata = parseRefMetadata(metadataEntry ? objects.get(metadataEntry.oid) : null, home.ref);
  if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: home.ref, ...metadataFailure(home.ref) } };
  const object = objects.get(entry.oid);
  if (object?.type !== "blob") return { status: "refused", refusal: unavailableHistory(requested, entry.oid) };
  const family = context.registry[requested.kind].family;
  const decoded = family === "lineage" ? decodeReference(context, requested.owner, family, entry.path, metadata, object) : null;
  if (family === "lineage" && (!decoded || !("owner" in decoded))) return { status: "refused", refusal: malformedHistory(requested, "The historical lineage owner cannot be decoded") };
  const reference = decoded && "owner" in decoded ? decoded : RecordReferenceSchema.parse({ ...requested, owner: refOwner(home.ref, family, metadata) });
  const definition = context.registry[reference.kind];
  const formatVersion = metadata.formats[refFormatKey(reference)] ?? 1;
  if (formatVersion > definition.formatVersion) return { status: "refused", refusal: malformedHistory(reference, "Stored format version is newer than this build supports.") };
  // Historical bytes do not acquire today's semantic parser requirements.
  const content = readRefContent({ ...definition, parser: null }, object.bytes);
  if ("condition" in content) return { status: "refused", refusal: malformedHistory(reference, content.condition) };
  return { status: "ok", result: { reference, content: content.content, version: refRecordVersion(reference, object.oid, metadata, formatVersion) } };
}

function unavailableHistory(reference: RecordReference, object: string): StoreRefusal {
  return { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: `The historical object ${object} is not available locally.`,
    remedy: { text: "Restore or fetch the missing history objects in the store repository, then retry." } };
}

function malformedHistory(reference: RecordReference, condition: string): StoreRefusal {
  return { code: "record-malformed", class: "recoverable", reference, rule: "history.format-or-content", condition,
    remedy: { text: "Rebuild with support for the historical format or repair its stored metadata and content, then retry." } };
}
