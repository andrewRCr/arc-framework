/** Store-backed handoff anchors and operational change candidates. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { decodeMetaHistoryContent } from "../store/meta-history.js";
import type { HistoryEntry } from "../store/contract.js";
import type { StateVersion } from "../store/identity.js";
import { scanTaskListStructure } from "../task-list/scanner.js";
import type { Store } from "../store/contract.js";
import { recordReferences, sameReference, type RecordReference } from "../store/identity.js";
import { WorkUnitReadPlacementSchema } from "../store/placement.js";
import { workItemArtifactPath } from "../store/lifecycle-storage.js";
import type { StoreSyncPort } from "../store/operational-sync.js";
import type { StoreRecord } from "../store/read.js";
import { readStateHistory } from "./state-history.js";

/** Operational candidates plus the independently resolvable Git anchor. */
export interface StoreRestateCandidates {
  commit: string | null;
  tasks: string[];
  notes: string[];
}
/** Derive operational changes from this work item's exact saved identity.
 * @param input - Selected store, work item, restating person and synchronization port.
 * @returns Null before the first stored handoff, otherwise operational changes.
 */
export async function deriveStoreRestateCandidates(input: { store: Store; workUnit: RecordReference; identity: string; sync?: StoreSyncPort }): Promise<StoreRestateCandidates | null> {
  const { store, workUnit, sync } = input;
  const current = await readStateHistory(() => store.version(), sync);
  const meta = await readStateHistory(() => store.read({ reference: workUnit, asOf: current }), sync);
  const fields = ParsedMetaRecordSchema.parse(meta.fields);
  const anchor = fields.stateAtHandoff;
  if (anchor === null) return null;
  const history = await readStateHistory(() => store.history({ reference: workUnit }), sync);
  const anchorOwner = readAnchorOwner(history, anchor);
  const task = recordReferences["work-item/task-list"](meta.reference.owner);
  const notes = recordReferences["work-item/notes"](meta.reference.owner);
  const changes = await readStateHistory(() => store.changes({ from: anchor, to: current,
    ...(anchorOwner === input.identity ? {} : { references: [task, notes] }) }), sync);
  const before = await readStateHistory<StoreRecord | null>(async () => {
    const value = await store.read({ reference: task, asOf: anchor });
    return value.status === "refused" && value.refusal.code === "not-found" ? { status: "ok" as const, result: null } : value;
  }, sync);
  const closedBefore = closedTasks(before?.content ?? "");
  const tasks = new Set<string>();
  for (const entry of changes) {
    if (!sameReference(entry.reference, task) || entry.content === null) continue;
    for (const id of closedTasks(entry.content)) if (!closedBefore.has(id)) tasks.add(id);
  }
  return { commit: fields.commitAtHandoff, tasks: [...tasks],
    notes: changes.some((entry) => sameReference(entry.reference, notes))
      ? [workItemArtifactPath(meta.reference.owner.name, "notes", WorkUnitReadPlacementSchema.parse(meta.placement), fields.cohort)] : [] };
}
function closedTasks(content: string): Set<string> {
  const scan = scanTaskListStructure(content);
  if (scan.status === "malformed") throw new Error(`Cannot restate malformed tasks at line ${String(scan.error.line)}: ${scan.error.message}. Repair the task list and retry.`);
  return new Set(scan.events.flatMap((event) => (event.type === "parent" || event.type === "subtask") && event.marker === "x" ? [event.item.id] : []));
}

function readAnchorOwner(history: HistoryEntry[], anchor: StateVersion): string {
  let owner: string | null = null;
  for (const entry of history) {
    if (entry.content === null) break;
    const previous = decodeMetaHistoryContent(entry.content);
    if (previous.stateAtHandoff !== anchor) break;
    owner = previous.owner;
  }
  if (owner === null) throw new Error("The handoff anchor's Owner cannot be read. Repair the meta history, then retry handoff.");
  return owner;
}
