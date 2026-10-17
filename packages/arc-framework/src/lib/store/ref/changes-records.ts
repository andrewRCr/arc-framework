/** Decode logical record events without treating copied archive entries as new writes. */
import type { HistoryEntry } from "../contract.js";
import type { OwnerIdentity, RecordReference, RecordVersion } from "../identity.js";
import type { StoreResult } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import { parseStoreCommitProvenance } from "../commit-provenance.js";
import type { RefBackendContext } from "./context.js";
import type { CapturedChangeWindow } from "./changes-graph.js";
import { changeCommitMessage } from "./changes-graph.js";
import { viewRefFamily } from "./view-state.js";
import { rootFamily, refOwner, decodeReference } from "./codec.js";
import { refPrototype } from "./read.js";
import { historicalMetadataFailure, parseRefMetadata } from "./metadata.js";
import { historicalState, type HistoricalState } from "./history-snapshots.js";

/** Keep the record's location and prior version until cross-ref batch grouping is complete. */
export interface RefChangeEvent { entry: HistoryEntry; before: RecordVersion | null; revision: string; ref: string; order: number }

/** Stable logical identity retains exact key strings and normalizes a UID primary's two roles. */
export function changeRecordKey(reference: RecordReference): string {
  const owner = reference.owner;
  const primary = owner.type === "work-item" && owner.uid !== undefined && ["work-item/meta", "work-item/record"].includes(reference.kind);
  return JSON.stringify([owner.type, "uid" in owner ? owner.uid ?? owner.name : owner.name,
    primary ? "work-item/primary" : reference.kind, reference.key ?? null]);
}

/** Enumerate references from every captured state, including records removed by the upper tip. */
export function changeWindowReferences(context: RefBackendContext, captured: CapturedChangeWindow, projectOwner?: OwnerIdentity): StoreResult<RecordReference[]> {
  const liveRef = captured.window.ref.replace("refs/arc/history/", "refs/arc/");
  const family = viewRefFamily(liveRef);
  if (!family) throw new Error("A record window has no registered family");
  const prototype = refPrototype(context, liveRef, rootFamily(family));
  const home = expandStoredPath(prototype, { registry: context.registry });
  const references = new Map<string, RecordReference>();
  for (const entries of captured.trees.values()) {
    const records = entries.filter(({ path }) => path !== home.metadataPath && path !== home.manifestPath.slice(0, -1) && !path.startsWith(home.manifestPath));
    if (!records.length) continue;
    const metadataEntry = entries.find(({ path }) => path === home.metadataPath);
    const metadata = parseRefMetadata(metadataEntry ? captured.objects.get(metadataEntry.oid) : null, liveRef);
    if (!metadata) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: captured.window.ref, ...historicalMetadataFailure(captured.window.ref) } };
    const storedOwner = refOwner(liveRef, family, metadata);
    const owner = storedOwner.type === "project" ? projectOwner ?? storedOwner : storedOwner;
    for (const entry of records) {
      const reference = decodeReference(context, owner, family, entry.path, metadata, captured.objects.get(entry.oid));
      if (!reference || !("owner" in reference)) return { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: captured.window.ref,
        condition: `The saved path ${entry.path} does not decode as an admitted record.`, remedy: { text: "Repair the path and its metadata forward, then retry the comparison." } } };
      references.set(changeRecordKey(reference), reference);
    }
  }
  return { status: "ok", result: [...references.values()] };
}

/** Filter each record by its own version, using ordered state for merge commits. */
export function changeWindowEvents(context: RefBackendContext, captured: CapturedChangeWindow, references: readonly RecordReference[]): StoreResult<RefChangeEvent[]> {
  const events: RefChangeEvent[] = [];
  for (const reference of references) {
    const own = recordWindowEvents(context, captured, reference);
    if (own.status === "refused") return own;
    events.push(...own.result);
  }
  return { status: "ok", result: events.sort((left, right) => left.order - right.order) };
}

function recordWindowEvents(context: RefBackendContext, captured: CapturedChangeWindow, reference: RecordReference): StoreResult<RefChangeEvent[]> {
  const events: RefChangeEvent[] = [];
  const loaded = recordWindowStates(context, captured, reference);
  if (loaded.status === "refused") return loaded;
  const states = loaded.result;
  let previous: HistoricalState | undefined;
  for (const [order, row] of captured.rows.entries()) {
    const after = states.get(row.revision);
    if (!after) throw new Error("A changed commit has no captured record state");
    const parent = row.parents[0] ? states.get(row.parents[0]) : undefined;
    const before = row.parents.length > 1 ? previous ?? (captured.window.lower ? states.get(captured.window.lower) : parent) : parent;
    if (after.version === (before?.version ?? null)) continue;
    const selected = after.version === null ? before?.reference ?? after.reference : after.reference;
    const entry = { ...after, reference: selected, provenance: parseStoreCommitProvenance(changeCommitMessage(captured, row.revision), selected) };
    events.push({ entry, before: before?.version ?? null, revision: row.revision, ref: captured.window.ref, order });
    previous = after;
  }
  return { status: "ok", result: events };
}

function recordWindowStates(context: RefBackendContext, captured: CapturedChangeWindow, reference: RecordReference): StoreResult<Map<string, HistoricalState>> {
  const home = { ...expandStoredPath(reference, { registry: context.registry }), ref: captured.window.ref };
  const states = new Map<string, HistoricalState>();
  for (const [revision, entries] of captured.trees) {
    const state = historicalState(context, reference, home, entries, captured.objects);
    if (state.status === "refused") return state;
    states.set(revision, state.result);
  }
  return { status: "ok", result: states };
}

/** Keep one final record result per real batch and omit batches that restore their starting version. */
export function groupChangeBatches(events: readonly RefChangeEvent[]): HistoryEntry[] {
  const grouped = new Map<string, { first: RefChangeEvent; last: RefChangeEvent }>();
  for (const event of events) {
    const provenance = event.entry.provenance;
    const batch = "batchId" in provenance ? provenance.batchId ?? event.revision : event.revision;
    const key = JSON.stringify([changeRecordKey(event.entry.reference), batch]);
    const previous = grouped.get(key);
    grouped.set(key, { first: previous?.first ?? event, last: event });
  }
  return [...grouped.values()].filter(({ first, last }) => first.before !== last.entry.version).map(({ last }) => last.entry);
}
