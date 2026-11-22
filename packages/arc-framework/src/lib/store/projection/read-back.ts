/** Install a write-back's read-back through the guarded swap owned by the file walk. */
import { projectionLayMode, isOwnSaveLanding } from "./lay-mode.js";
import { withProjectionEntry } from "./index-memory.js";
import type { AsideWriterInput } from "./aside.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { createWriteBackPort, sendWriteBack, type WriteBackContext, type WriteBackSend } from "./write-back.js";
import { readReference } from "./change-detection.js";
import { holdReadBack, readBackSwapResult } from "./read-back-outcome.js";
import { guardReplacement, type ReplaceGuardInput } from "./replace-guard.js";
import { stageRecordFile } from "./staging.js";
import { swapBatch, type SwapBatchResult, type SwapHooks } from "./swap.js";
import { createRecordRenderer } from "./record-render.js";
import { unshownConflicts } from "./held-conflicts.js";
import { pendingObservedRefusal } from "./recording-state.js";
import { drawCheckoutClash } from "./checkout-drawing.js";
import type { ProjectionProtection } from "./protection.js";

/** The write-back walk supplies its writer in addition to the send context. */
export interface ReadBackContext extends WriteBackContext {
  readonly protection?: ProjectionProtection;
  readonly writer: AsideWriterInput;
  readonly takeIn?: import("./take-in-port.js").TakeInPort;
  readonly hooks?: SwapHooks;
  readonly recordBatch?: (batch: SwapBatchResult) => void;
}

/** Take in one file and install its landed record, leaving index publication to the guarded batch. */
export async function writeBackFile(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest): Promise<{
  result: TakeInResult; index: ProjectionIndex; rebuilt?: boolean;
}> {
  const sent = await sendWriteBack(context, request);
  const updated = withProjectionEntry(index, request.path, sent.result.entry);
  if (sent.kind === "clashed") return drawCheckoutClash(context, updated, request, sent);
  if (sent.kind !== "landed") return { result: sent.result, index: updated };
  return installWriteBack(context, updated, request, sent);
}

/** Install an accepted write, including a newly adopted record, through the ordinary guarded replacement. */
export async function installWriteBack(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest,
  sent: Extract<WriteBackSend, { kind: "landed" }>, baseline: ReplaceGuardInput["baseline"] = sent.result.read,
): Promise<{ result: TakeInResult; index: ProjectionIndex; rebuilt?: boolean }> {
  let updated = index;
  const renderer = createRecordRenderer(context);
  const staged = await stageRecordFile({ checkout: request.checkout, path: request.path, record: sent.record,
    layMode: projectionLayMode(request.path, sent.result.entry, isOwnSaveLanding(context.verb, request.checkout)),
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format, checkpoint: context.checkpoint, readOnly: sent.result.entry.protected, renderer });
  if (staged.status === "refused") {
    const pending = { ...sent.result.entry, pending: true, unshown: unshownConflicts(sent.result.entry, sent.record.conflicts) };
    const blocked = staged.archiveBlock;
    const mark = blocked?.mark ?? {
      reason: `The edit landed, but read-back rendering failed: ${staged.refusal.condition}`, remedy: staged.refusal.remedy };
    if (blocked !== undefined) (context.refuseArchiveChange ?? context.report)?.({ path: request.path, copy: request.copy, mark }, blocked.access);
    else context.report?.({ path: request.path, copy: request.copy, mark });
    const entry = blocked === undefined ? pending : pendingObservedRefusal(pending, mark);
    return { result: { answer: "pending", entry, ...(blocked?.access ? { archiveAccess: mark } : {}) },
      index: withProjectionEntry(updated, request.path, entry) };
  }
  const takeIn = context.takeIn ?? createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged: staged.result, renderer, saveLanding: isOwnSaveLanding(context.verb, request.checkout),
    baseline, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, checkpoint: context.checkpoint, takeIn });
  if (guarded.kind === "unreplaced") {
    return { result: holdReadBack(context, request, sent.result, guarded), index: withProjectionEntry(updated, request.path, guarded.entry) };
  }
  await context.hooks?.afterSaveGuard?.(request.path);
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index: updated,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks, checkpoint: context.checkpoint,
    refuseChange: context.refuseArchiveChange ?? context.report });
  context.recordBatch?.(swapped);
  updated = swapped.index;
  return { ...readBackSwapResult(context, request, sent.result, swapped), index: updated };
}
