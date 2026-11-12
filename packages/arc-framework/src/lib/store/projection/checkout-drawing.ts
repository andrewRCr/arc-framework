/** Install a checkout-only clash through the same guarded swap as a stored read-back. */
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import type { ReadBackContext } from "./read-back.js";
import { createWriteBackPort, type WriteBackSend } from "./write-back.js";
import { stageRecordFile } from "./staging.js";
import { holdReadBack, readBackSwapResult } from "./read-back-outcome.js";
import { guardReplacement } from "./replace-guard.js";
import { readReference } from "./change-detection.js";
import { swapBatch } from "./swap.js";
import { createRecordRenderer } from "./record-render.js";
import { unshownConflicts } from "./held-conflicts.js";
import { randomUUID } from "node:crypto";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { formatConflictToken } from "../../status/conflict-token.js";

/** Draw only at the file's own path; the take-in port and aside settlement never draw. */
export async function drawCheckoutClash(context: ReadBackContext, index: ProjectionIndex, request: TakeInRequest,
  sent: Extract<WriteBackSend, { kind: "clashed" }>): Promise<{ result: TakeInResult; index: ProjectionIndex }> {
  if (request.copy !== null) return { result: sent.result, index };
  const { drawing } = sent;
  const mark = drawing.basesDisagree ? disagreementMark(request.entry.reference) : undefined;
  const refused = mark ?? (sent.result.entry.refused?.reason === "bases-disagree" ? sent.result.entry.refused : null);
  const renderer = createRecordRenderer(context);
  const staged = await stageRecordFile({ checkout: request.checkout, path: request.path, record: drawing.record,
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format, checkpoint: context.checkpoint,
    content: drawing.content, markerLength: drawing.length, readOnly: sent.result.entry.protected,
    renderer, rendering: { keepPending: true, refused } });
  if (staged.status === "refused") {
    const entry = { ...sent.result.entry, pending: true, unshown: unshownConflicts(sent.result.entry, drawing.record.conflicts) };
    context.report?.({ path: request.path, copy: null, mark: {
      reason: `The checkout clash could not be drawn: ${staged.refusal.condition}`, remedy: staged.refusal.remedy } });
    return { result: { answer: "pending", entry }, index: { ...index, entries: { ...index.entries, [request.path]: entry } } };
  }
  const takeIn = context.takeIn ?? createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged: staged.result, renderer, baseline: sent.read, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, checkpoint: context.checkpoint, takeIn });
  if (guarded.kind === "unreplaced") {
    return { result: holdReadBack(context, request, sent.result, guarded),
      index: { ...index, entries: { ...index.entries, [request.path]: guarded.entry } } };
  }
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks, checkpoint: context.checkpoint });
  context.recordBatch?.(swapped);
  const result = readBackSwapResult(context, request, sent.result, swapped);
  const { entry } = result;
  if (mark !== undefined && entry.refused?.remedy.argv?.at(-1) === mark.remedy.argv?.at(-1)) {
    context.report?.({ path: request.path, copy: null, mark });
  }
  return { result, index: swapped.index };
}

function disagreementMark(reference: RecordReference): RefusedMark {
  const token = formatConflictToken(RecordReferenceSchema.parse({ owner: reference.owner,
    kind: `${reference.kind.split("/")[0]}/conflict-record`, key: randomUUID() }));
  return { reason: "bases-disagree", remedy: {
    text: `The save's possible bases give different merges. Keep the stored side, or resolve with arc save --resolve ${token}.`,
    argv: ["arc", "save", "--resolve", token],
  } };
}
