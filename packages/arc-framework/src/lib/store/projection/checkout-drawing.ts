/** Install a checkout-only clash through the same guarded swap as a stored read-back. */
import type { ProjectionIndex, RefusedMark } from "./index-schema.js";
import type { TakeInRequest, TakeInResult } from "./take-in-port.js";
import type { ReadBackContext } from "./read-back.js";
import { createWriteBackPort, type WriteBackSend } from "./write-back.js";
import { stageRenderedRecordFile } from "./staging.js";
import { guardReplacement } from "./replace-guard.js";
import { readReference } from "./change-detection.js";
import { swapBatch } from "./swap.js";
import { scanMarkerSets } from "./marker-scan.js";
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
  const staged = await stageRenderedRecordFile({ checkout: request.checkout, path: request.path, record: drawing.record,
    replacing: sent.result.entry.base.blob, writer: context.writer, format: context.format,
    content: drawing.content, markerLength: drawing.length, readOnly: sent.result.entry.protected,
    rendering: { markers: { length: drawing.length, sets: scanMarkerSets(drawing.content, drawing.length).map(() => ({ shows: "checkout" as const })) }, notices: [],
      unshown: drawing.record.conflicts, keepPending: true, refused } });
  const takeIn = createWriteBackPort(context);
  const guarded = await guardReplacement({ checkout: request.checkout, path: request.path, entry: sent.result.entry,
    staged, baseline: sent.read, reference: await readReference(request.checkout), format: context.format,
    store: context.store, writer: context.writer, takeIn });
  if (guarded.kind === "unreplaced") return { result: { ...sent.result, entry: guarded.entry },
    index: { ...index, entries: { ...index.entries, [request.path]: guarded.entry } } };
  const swapped = await swapBatch({ location: context.location, checkout: request.checkout, index,
    files: [{ path: request.path, replace: guarded }], readBack: true, writer: context.writer,
    format: context.format, takeIn, hooks: context.hooks });
  const entry = swapped.index.entries[request.path];
  if (entry?.kind !== "record") throw new Error(`Drawing lost the projected entry for ${request.path}`);
  if (mark !== undefined && entry.refused?.remedy.argv?.at(-1) === mark.remedy.argv?.at(-1)) {
    context.report?.({ path: request.path, copy: null, mark });
  }
  return { result: { ...sent.result, entry }, index: swapped.index };
}

function disagreementMark(reference: RecordReference): RefusedMark {
  const token = formatConflictToken(RecordReferenceSchema.parse({ owner: reference.owner,
    kind: `${reference.kind.split("/")[0]}/conflict-record`, key: randomUUID() }));
  return { reason: "bases-disagree", remedy: {
    text: `The save's possible bases give different merges. Keep the stored side, or resolve with arc save --resolve ${token}.`,
    argv: ["arc", "save", "--resolve", token],
  } };
}
