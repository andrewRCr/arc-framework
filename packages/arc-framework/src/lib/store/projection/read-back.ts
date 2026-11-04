/** Install a write-back's read-back through the guarded swap owned by the file walk. */
import type { AsideWriterInput } from "./aside.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import { createWriteBackPort, sendWriteBack, type WriteBackContext } from "./write-back.js";
import { readReference } from "./change-detection.js";
import { guardReplacement } from "./replace-guard.js";
import { stageRecordFile } from "./staging.js";
import { swapBatch, type SwapHooks } from "./swap.js";
import { drawCheckoutClash } from "./checkout-drawing.js";

/** The write-back walk supplies its writer in addition to the send context. */
export interface ReadBackContext extends WriteBackContext {
  readonly writer: AsideWriterInput;
  readonly hooks?: SwapHooks;
}

/** Take in one file and install its landed record, leaving index publication to the guarded batch. */
export async function writeBackFile(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest): Promise<{
  result: TakeInResult; index: ProjectionIndex;
}> {
  const sent = await sendWriteBack(context, request);
  let updated = { ...index, entries: { ...index.entries, [request.path]: sent.result.entry } };
  if (sent.kind === "clashed") return drawCheckoutClash(context, updated, request, sent);
  if (sent.kind !== "landed") return { result: sent.result, index: updated };
  const staged = await stageRecordFile({ checkout: request.checkout, path: request.path, record: sent.record,
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format, readOnly: sent.result.entry.protected });
  const takeIn = createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged, baseline: sent.result.read, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, takeIn });
  if (guarded.kind === "unreplaced") {
    return { result: { ...sent.result, entry: guarded.entry }, index: {
      ...updated, entries: { ...updated.entries, [request.path]: guarded.entry },
    } };
  }
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index: updated,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks });
  updated = swapped.index;
  const entry = updated.entries[request.path];
  if (entry?.kind !== "record") throw new Error(`Read-back lost the projected entry for ${request.path}`);
  return { result: { ...sent.result, entry }, index: updated };
}
