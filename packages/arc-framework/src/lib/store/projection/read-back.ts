/** Install a write-back's read-back through the guarded swap owned by the file walk. */
import type { AsideWriterInput } from "./aside.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { createWriteBackPort, sendWriteBack, type WriteBackContext } from "./write-back.js";
import { readReference } from "./change-detection.js";
import { guardReplacement } from "./replace-guard.js";
import { stageRecordFile } from "./staging.js";
import { swapBatch, type SwapBatchResult, type SwapHooks } from "./swap.js";
import { createRecordRenderer } from "./record-render.js";
import { unshownConflicts } from "./held-conflicts.js";
import { drawCheckoutClash } from "./checkout-drawing.js";

/** The write-back walk supplies its writer in addition to the send context. */
export interface ReadBackContext extends WriteBackContext {
  readonly writer: AsideWriterInput;
  readonly takeIn?: import("./take-in-port.js").TakeInPort;
  readonly hooks?: SwapHooks;
  readonly recordBatch?: (batch: SwapBatchResult) => void;
}

/** Take in one file and install its landed record, leaving index publication to the guarded batch. */
export async function writeBackFile(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest): Promise<{
  result: TakeInResult; index: ProjectionIndex;
}> {
  const sent = await sendWriteBack(context, request);
  let updated = { ...index, entries: { ...index.entries, [request.path]: sent.result.entry } };
  if (sent.kind === "clashed") return drawCheckoutClash(context, updated, request, sent);
  if (sent.kind !== "landed") return { result: sent.result, index: updated };
  const renderer = createRecordRenderer(context);
  const staged = await stageRecordFile({ checkout: request.checkout, path: request.path, record: sent.record,
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format, checkpoint: context.checkpoint, readOnly: sent.result.entry.protected, renderer });
  if (staged.status === "refused") {
    const entry = { ...sent.result.entry, pending: true, unshown: unshownConflicts(sent.result.entry, sent.record.conflicts) };
    context.report?.({ path: request.path, copy: request.copy, mark: {
      reason: `The edit landed, but read-back rendering failed: ${staged.refusal.condition}`, remedy: staged.refusal.remedy } });
    return { result: { answer: "pending", entry }, index: { ...updated, entries: { ...updated.entries, [request.path]: entry } } };
  }
  const takeIn = context.takeIn ?? createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged: staged.result, renderer, baseline: sent.result.read, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, checkpoint: context.checkpoint, takeIn });
  if (guarded.kind === "unreplaced") {
    if (guarded.cause === "refresh-refused") context.report?.({ path: request.path, copy: null, mark: {
      reason: `The edit landed, but restaging failed: ${guarded.refusal.condition}`, remedy: guarded.refusal.remedy } });
    return { result: { ...sent.result, entry: guarded.entry }, index: {
      ...updated, entries: { ...updated.entries, [request.path]: guarded.entry },
    } };
  }
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index: updated,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks, checkpoint: context.checkpoint });
  context.recordBatch?.(swapped);
  updated = swapped.index;
  const entry = updated.entries[request.path];
  if (entry?.kind !== "record") throw new Error(`Read-back lost the projected entry for ${request.path}`);
  return { result: { ...sent.result, entry }, index: updated };
}
