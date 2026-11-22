/** Install a checkout-only clash through the same guarded swap as a stored read-back. */
import { projectionLayMode, isOwnSaveLanding } from "./lay-mode.js";
import { withProjectionEntry } from "./index-memory.js";
import type { ProjectionIndex } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import type { ReadBackContext } from "./read-back.js";
import { createWriteBackPort, type WriteBackSend } from "./write-back.js";
import { stageRecordFile } from "./staging.js";
import { holdReadBack, readBackSwapResult } from "./read-back-outcome.js";
import { guardReplacement } from "./replace-guard.js";
import { readReference } from "./change-detection.js";
import { swapBatch } from "./swap.js";
import { createRecordRenderer } from "./record-render.js";
import { baseDisagreementMark, unshownConflicts } from "./held-conflicts.js";

/** Draw only at the file's own path; the take-in port and aside settlement never draw. */
export async function drawCheckoutClash(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest,
  sent: Extract<WriteBackSend, { kind: "clashed" }>): Promise<{ result: TakeInResult; index: ProjectionIndex; rebuilt?: boolean }> {
  if (request.copy !== null) return { result: sent.result, index };
  const { drawing } = sent;
  const mark = drawing.basesDisagree ? baseDisagreementMark(request.entry.reference) : undefined;
  const refused = mark ?? (sent.result.entry.refused?.reason === "bases-disagree" ? sent.result.entry.refused : null);
  const renderer = createRecordRenderer(context);
  const staged = await stageRecordFile({ checkout: request.checkout, path: request.path, record: drawing.record,
    layMode: projectionLayMode(request.path, sent.result.entry),
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format, checkpoint: context.checkpoint,
    content: drawing.content, markerLength: drawing.length, readOnly: sent.result.entry.protected,
    renderer, rendering: { keepPending: true, refused } });
  if (staged.status === "refused") {
    const entry = { ...sent.result.entry, pending: true, unshown: unshownConflicts(sent.result.entry, drawing.record.conflicts) };
    if (staged.archiveBlock !== undefined) {
      const { mark, access } = staged.archiveBlock;
      (context.refuseArchiveChange ?? context.report)?.({ path: request.path, copy: null, mark }, access);
      return { result: { answer: "pending", entry, ...(access ? { archiveAccess: mark } : {}) },
        index: withProjectionEntry(index, request.path, entry) };
    }
    context.report?.({ path: request.path, copy: null, mark: {
      reason: `The checkout clash could not be drawn: ${staged.refusal.condition}`, remedy: staged.refusal.remedy } });
    return { result: { answer: "pending", entry }, index: withProjectionEntry(index, request.path, entry) };
  }
  const takeIn = context.takeIn ?? createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged: staged.result, renderer, saveLanding: isOwnSaveLanding(context.verb, request.checkout),
    baseline: sent.read, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, checkpoint: context.checkpoint, takeIn });
  if (guarded.kind === "unreplaced") {
    return { result: holdReadBack(context, request, sent.result, guarded),
      index: withProjectionEntry(index, request.path, guarded.entry) };
  }
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks, checkpoint: context.checkpoint });
  context.recordBatch?.(swapped);
  const { result, rebuilt } = readBackSwapResult(context, request, sent.result, swapped);
  const { entry } = result;
  if (mark !== undefined && entry.refused?.remedy.argv?.at(-1) === mark.remedy.argv?.at(-1)) {
    context.report?.({ path: request.path, copy: null, mark });
  }
  return { result, rebuilt, index: swapped.index };
}
