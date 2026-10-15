/** Cursor-authorized reopening over record identity rather than checkout artifact paths. */
import { posix } from "node:path";
import type { StoreRecord } from "../../store/read.js";
import type { Store } from "../../store/contract.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { recordReferences } from "../../store/identity.js";
import { checkAdvancingPause } from "../../store/lifecycle-pause.js";
import { readWorkUnit, workUnitMetaPath, recordPut } from "../../store/lifecycle-write.js";
import { lifecycleRecordPath } from "../../store/lifecycle-record-path.js";
import { resolveTaskListCursor } from "../../task-list/cursor.js";
import { executeTransition, type ExecuteTransitionContext } from "../lifecycle-executor.js";
import type { ReopenParams, ReopenResult } from "./reopen.js";
/** Refuse non-integrating subjects and retain the task cursor's authority on the store arm. */
export async function runStoreReopen(ctx: ExecuteTransitionContext & { store: Store }, params: ReopenParams): Promise<ReopenResult> {
  const read = await readWorkUnit(ctx.store, params.name);
  if (read.status === "refused") return { status: "rejected", reason: read.refusal.condition, refusal: read.refusal };
  const primary = read.result, meta = ParsedMetaRecordSchema.parse(primary.fields);
  if (meta.state !== "Integrating") return { status: "rejected", reason: `Cannot reopen ${params.name}: its State is ${meta.state}.` };
  const pause = await checkAdvancingPause(ctx.store, params.name);
  if (pause.status === "rejected") return pause;
  const task = await storedTaskAuthority(ctx.store, primary, meta.taskList, params.nextTask);
  if (task.status === "rejected") return task;
  const requested = task.requested;
  const outcome = await executeTransition(ctx, { verb: "reopen", slug: params.name, inputs: {
    storeTransition: { primary, preparedRecords: [task.record], additionalWrites: [recordPut(task.record)] },
    prMerged: params.prMerged, prWithdrawMode: params.withdrawMode ?? "close",
    ...(requested === undefined ? {} : { currentWorkflowOverride: "process-task-loop" }),
  } });
  return outcome.status === "ok" ? { status: "reopened", outcome, metaPath: workUnitMetaPath(primary) }
    : { status: "rejected", reason: outcome.message,
      ...(outcome.status === "rejected" && outcome.refusal !== undefined ? { refusal: outcome.refusal } : {}),
      ...(outcome.status === "rejected" && outcome.remedy !== undefined ? { remedy: outcome.remedy } : {}) };
}

async function storedTaskAuthority(store: Store, primary: StoreRecord, binding: string | null, nextTask?: string): Promise<
  { status: "ready"; requested: string | undefined; record: StoreRecord } | Extract<ReopenResult, { status: "rejected" }>> {
  const task = await store.read({ reference: recordReferences["work-item/task-list"](primary.reference.owner) });
  if (task.status === "refused") return { status: "rejected", reason: task.refusal.condition, refusal: task.refusal };
  const path = lifecycleRecordPath(primary, task.result);
  if (path === null || binding !== posix.basename(path)) return { status: "rejected", reason: "The canonical task-list binding is unavailable." };
  const cursor = resolveTaskListCursor(task.result.content);
  if (cursor.status === "malformed") return { status: "rejected", reason: `Malformed task cursor at line ${cursor.error.line}: ${cursor.error.message}` };
  const requested = nextTask?.trim();
  if (cursor.status === "found") {
    const expected = `Task ${cursor.cursor.leaf.id} — ${cursor.cursor.leaf.title}`;
    if (requested !== expected) return { status: "rejected", reason: `Reopen requires --task '${expected}' for the open executable task.` };
  } else if (requested !== undefined) return { status: "rejected", reason: "The canonical task list has no open task; omit --task." };
  return { status: "ready", requested, record: task.result };
}
