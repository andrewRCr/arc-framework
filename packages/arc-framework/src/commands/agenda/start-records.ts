/** Authoritative record evidence for the Start readiness method. */
import type { Store } from "../../lib/store/contract.js";
import { recordReferences } from "../../lib/store/identity.js";
import type { StoreRecord } from "../../lib/store/read.js";
import type { StoreResult } from "../../lib/store/refusal.js";

/** Exact target metadata and its optional logical task-list record. */
export interface AgendaStartRecords { meta: StoreRecord; taskList: StoreRecord | null }

/** Read the selected owner's task evidence without consulting checkout projections. */
export async function readAgendaStartRecords(store: Store, meta: StoreRecord): Promise<StoreResult<AgendaStartRecords>> {
  const tasks = await store.read({ reference: recordReferences["work-item/task-list"](meta.reference.owner) });
  if (tasks.status === "refused") return tasks.refusal.code === "not-found"
    ? { status: "ok", result: { meta, taskList: null } } : tasks;
  if (tasks.result.conflicts.length > 0) return { status: "refused", refusal: {
    code: "record-malformed", class: "recoverable", reference: tasks.result.reference, rule: "agenda.start-task-conflict",
    condition: `The Start target's task-list record has unresolved conflicts: ${tasks.result.conflicts.map(reference => JSON.stringify(reference)).join(", ")}.`,
    remedy: { text: "Resolve the named task-list conflicts, then retry Start readiness." },
  } };
  return { status: "ok", result: { meta, taskList: tasks.result } };
}

/** Carry record contents and exact read identities through existing scalar method arguments. */
export function compileStartRecordArguments({ meta, taskList }: AgendaStartRecords): Record<string, string | null> {
  return { evidenceBackend: "store", metaReference: JSON.stringify(meta.reference), metaVersion: meta.version, metaContent: meta.content,
    taskListStatus: taskList === null ? "absent" : "present",
    taskListReference: JSON.stringify(taskList?.reference ?? recordReferences["work-item/task-list"](meta.reference.owner)),
    taskListVersion: taskList?.version ?? null, taskListContent: taskList?.content ?? null };
}
