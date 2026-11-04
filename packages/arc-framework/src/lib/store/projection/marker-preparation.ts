/** Supply stored conflict evidence to the projection's pure marker parser. */
import type { Store } from "../contract.js";
import { TextConflictRecordSchema } from "../conflict.js";
import type { StoreResult } from "../refusal.js";
import type { RecordEntry } from "./index-schema.js";
import { parseMarkerContent, type MarkerConflict, type MarkerParseResult, type MarkerEntryPolicy } from "./marker-parse.js";
import { scanMarkerSets } from "./marker-scan.js";
import { sameReference, type RecordReference } from "../identity.js";
import { formatConflictToken } from "../../status/conflict-token.js";
import { createHistoryMemo, type HistoryMemo } from "./base-recovery.js";
import { unshownConflicts } from "./held-conflicts.js";

/** Read indexed text conflicts before interpreting the file's marker sets. */
export async function prepareMarkerContent(store: Store, entry: RecordEntry, content: string, memo = createHistoryMemo(store), entries?: MarkerEntryPolicy): Promise<StoreResult<MarkerParseResult>> {
  if (entry.markers === null) return { status: "ok", result: { kind: "ready", content, resolves: [] } };
  const current = await store.read({ reference: entry.reference });
  if (current.status === "refused") return current;
  const spans = scanMarkerSets(content, entry.markers.length);
  const conflicts: MarkerConflict[] = [];
  for (const set of entry.markers.sets) {
    if (set.shows !== "stored") continue;
    const visible = spans.some(span => span.opening.endsWith(`[arc-conflict: ${JSON.stringify(formatConflictToken(set.conflict))}]`));
    const open = current.result.conflicts.some(reference => sameReference(reference, set.conflict));
    if (!visible && !open) continue;
    const read = await readConflictContent(store, set.conflict, !open, memo);
    if (read.status === "refused") return read;
    let value: unknown;
    try { value = JSON.parse(read.result); } catch { value = null; }
    const parsed = TextConflictRecordSchema.safeParse(value);
    if (!parsed.success) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
      reference: set.conflict, rule: "projection.marker-conflict", condition: "An indexed marker conflict cannot be parsed.",
      remedy: { text: "Repair the indexed conflict record or restore a readable stored conflict before saving again." } } };
    conflicts.push({ reference: set.conflict, data: parsed.data });
  }
  return { status: "ok", result: { ...parseMarkerContent({ content, markers: entry.markers, conflicts, open: current.result.conflicts, entries }),
    unshown: unshownConflicts(entry, current.result.conflicts) } };
}

async function readConflictContent(store: Store, reference: RecordReference, closed: boolean, memo: HistoryMemo): Promise<StoreResult<string>> {
  const read = await store.read({ reference });
  if (read.status === "ok") return { status: "ok", result: read.result.content };
  if (!closed || read.refusal.code !== "not-found") return read;
  const history = await memo.read(reference);
  if (history.status === "refused") return history;
  const content = history.result.find(entry => entry.content !== null)?.content;
  return content === undefined || content === null ? read : { status: "ok", result: content };
}
