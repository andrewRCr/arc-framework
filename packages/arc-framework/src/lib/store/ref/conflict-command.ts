/** Exact history inspection and explicit resolution of a retained alternative. */
import { StoreConflictInputSchema, type StoreConflictInput, type StoreConflictResult } from "../commands.js";
import { ConflictRecordSchema } from "../conflict.js";
import type { HistoryEntry } from "../contract.js";
import type { StoreResult } from "../refusal.js";
import type { Store } from "../contract.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";

/** Inspect through the same history contract as every caller, preserving typed refusals. */
export async function runRefConflict(store: Store, input: StoreConflictInput): Promise<StoreConflictResult> {
  const parsed = StoreConflictInputSchema.safeParse(input);
  if (!parsed.success) return { status: "refused", refusal: { code: "unsupported", class: "terminal", case: "unhomed-kind",
    condition: parsed.error.message, remedy: { text: "Use arc store conflict --help and provide an owner UID, registered work-item conflict kind, and exact ID." } } };
  const reference = RecordReferenceSchema.parse({ owner: { type: "work-item", name: parsed.data.uid, uid: parsed.data.uid },
    kind: parsed.data.kind, key: parsed.data.id });
  const inspected = await inspectConflict(store, reference);
  if (!parsed.data.discard || inspected.status === "refused" || inspected.result.status !== "present") return inspected;
  const current = inspected.result;
  const removed = await store.write({ action: "remove", reference: current.reference, expected: current.version,
    resolves: [current.reference], provenance: { verb: "resolve", lifecycleAction: "resolve" } });
  if (removed.status === "ok") return { status: "ok", result: { status: "discarded", reference: current.reference } };
  if (removed.refusal.code === "version-conflict") {
    const latest = await store.history({ reference: current.reference });
    if (latest.status === "ok" && (!latest.result.length || latest.result[0]?.version === null)) {
      return { status: "ok", result: { status: "absent", reference: current.reference } };
    }
  }
  return removed;
}

async function inspectConflict(store: Store, reference: RecordReference): Promise<StoreConflictResult> {
  const history = await conflictHistory(store, reference);
  if (history.status === "refused") return history;
  const latest = history.result[0];
  if (!latest || latest.version === null || latest.content === null) return { status: "ok", result: { status: "absent", reference: latest?.reference ?? reference } };
  let value: unknown;
  try { value = JSON.parse(latest.content); }
  catch { return malformedConflict(latest.reference, "The retained conflict content is not JSON."); }
  const parsed = ConflictRecordSchema.safeParse(value);
  if (!parsed.success) return malformedConflict(latest.reference, parsed.error.message);
  return { status: "ok", result: { status: "present", reference: latest.reference, version: latest.version, conflict: parsed.data } };
}

function malformedConflict(reference: RecordReference, condition: string): StoreConflictResult {
  return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference, rule: "conflict.content",
    condition, remedy: { text: "Repair the exact retained conflict's content using a clone holding its valid history, then retry inspection." } } };
}

async function conflictHistory(store: Store, reference: RecordReference): Promise<StoreResult<HistoryEntry[]>> {
  const history = await store.history({ reference });
  if (history.status === "ok" || !("historyRefs" in history.refusal) || !history.refusal.historyRefs.length) return history;
  const pulled = await store.pull({ history: history.refusal.historyRefs });
  if (pulled.status === "refused" || pulled.result.pulls.some((outcome) => outcome.status === "failed")) return history;
  return store.history({ reference });
}
