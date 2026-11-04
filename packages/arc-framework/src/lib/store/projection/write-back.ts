/** Prepare a projected edit without writing, then send it through the caller-owned take-in port. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../contract.js";
import { HAND_EDIT_VERBS } from "../links.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { FileStat, RecordEntry, RefusedMark } from "./index-schema.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { ProjectionLocation } from "./location.js";
import { gateRead } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import type { TakeInPort, TakeInRead, TakeInRequest, TakeInResult } from "./take-in-port.js";
import type { WriteInput } from "../write.js";
import type { WritePlacement } from "../placement.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { recordWriteBackSent } from "./aside-copies.js";
import { readProjectionIndex, writeProjectionIndex } from "./index-file.js";
import { createHistoryMemo, type HistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import type { StoreRecord } from "../read.js";
import { createKindRegistry } from "../registry.js";
import { recordWriteBack } from "./taken-in.js";
import { restoreWriteBackIds } from "./write-back-ids.js";
import { selectWriteBackBase } from "./base-selection.js";
import { readBaseContent } from "./base-content.js";
import type { RecoveredBase } from "./base-recovery.js";
import { checkWriteBackEdit } from "./check-edit.js";
import { prepareMarkerContent } from "./marker-preparation.js";
import type { MarkerParseResult } from "./marker-parse.js";
import type { RecordReference } from "../identity.js";
import { heldConflictMarks, unshownConflicts } from "./held-conflicts.js";
import { mergeCopyBase } from "./copy-base-merge.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);

/** The store and checkout state used by a caller that already owns the projection lock. */
export interface WriteBackContext {
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly format: ObjectFormat;
  readonly memo?: HistoryMemo;
  readonly verb?: typeof HAND_EDIT_VERBS[number];
  readonly report?: (diagnostic: WriteBackDiagnostic) => void;
  readonly reportResolution?: (resolution: WriteBackResolution) => void;
}

/** A file-specific diagnostic retained for the command's report. */
export interface WriteBackDiagnostic {
  readonly path: string;
  readonly copy: string | null;
  readonly mark: RefusedMark;
}

/** A conflict resolved by an accepted hand-edit write. */
export interface WriteBackResolution {
  readonly path: string;
  readonly copy: string | null;
  readonly reference: RecordReference;
}

/** An edit ready for its own store write, or the reason the file stays where it is. */
export type PreparedWriteBack =
  | { readonly kind: "ready"; readonly write: Extract<WriteInput, { action: "put" }>; readonly read: TakeInRead;
      readonly stamp: string; readonly takenIn: string; readonly random?: () => number; readonly retained?: RefusedMark }
  | { readonly kind: "held"; readonly result: TakeInResult; readonly diagnostic?: RefusedMark;
      readonly diagnostics?: readonly RefusedMark[] };

/** Read and parse an edit without writing a file, publishing an index, or acquiring a lock. */
export async function prepareWriteBack(context: WriteBackContext, request: TakeInRequest): Promise<PreparedWriteBack> {
  const file = await readEdit(context, request);
  if (file.kind === "held") return file;
  const selected = await selectWriteBackBase(context, request, file.content, file.stamp);
  if (selected.status === "refused") return refusedPreparation(request.entry, selected.refusal);
  if (selected.result.kind === "held") return { kind: "held", result: {
    answer: "pending", entry: { ...request.entry, pending: true },
  }, diagnostic: selected.result.mark };
  const { base, stamp } = selected.result;
  if (base.kind === "empty") return { kind: "held", result: { answer: "pending", entry: { ...request.entry, pending: true } },
    diagnostic: { reason: "checkout-merge-required", remedy: { text: "The edit needs a merge from a local or empty base before it can be sent." } } };
  const markers = await prepareMarkers(context, request, file.content, base);
  if (markers.status === "refused") return refusedPreparation(request.entry, markers.refusal);
  if (markers.result.kind === "held") return { kind: "held",
    diagnostics: [markers.result.mark, ...heldConflictMarks(markers.result.unshown ?? [], markers.result.mark)],
    result: { answer: "refused", mark: markers.result.mark,
      entry: { ...request.entry, pending: true, refused: markers.result.mark, unshown: [...(markers.result.unshown ?? request.entry.unshown)] } } };
  const restored = await restoreIds(context, request, markers.result.content, base);
  if (restored.status === "refused") return refusedPreparation(request.entry, restored.refusal);
  const { content: takenIn, random } = restored.result;
  const merged = await prepareContent(context, request, base, takenIn, random);
  if (merged.status === "refused") return refusedPreparation(request.entry, merged.refusal);
  if (merged.result.clashed) return { kind: "held", result: { answer: "clashed", entry: { ...request.entry, pending: true } } };
  const { content, version } = merged.result;
  const invalid = await checkContent(context, request, { kind: "stored", version }, content, random);
  if (invalid !== null) return invalid;
  const placement = await currentWritePlacement(context.store, request);
  if (placement.status === "refused") return refusedPreparation(request.entry, placement.refusal);
  return { kind: "ready", read: file.read, stamp, takenIn, ...(random === undefined ? {} : { random }),
    ...(markers.result.retained === undefined ? {} : { retained: markers.result.retained }), write: {
    action: "put", reference: request.entry.reference, content, expected: version,
    ...(markers.result.resolves.length === 0 ? {} : { resolves: [...markers.result.resolves] }),
    ...(placement.result === undefined ? {} : { placement: placement.result }),
    provenance: { verb: context.verb ?? HAND_EDIT_VERBS[0], lifecycleAction: "edit" },
  } };
}

type HeldWriteBack = Extract<PreparedWriteBack, { readonly kind: "held" }>;
type ReadEdit = { readonly kind: "read"; readonly content: string; readonly read: TakeInRead; readonly stamp: string | null } | HeldWriteBack;

async function checkContent(context: WriteBackContext, request: TakeInRequest, base: RecoveredBase, content: string, random?: () => number): Promise<HeldWriteBack | null> {
  const parser = kinds[request.entry.reference.kind].parser;
  const parsed = parser?.(content);
  if (parsed?.success === false) {
    const mark: RefusedMark = { reason: parsed.error, remedy: { text: `Repair ${request.path} so its record parser accepts the edit, then save again.` } };
    return { kind: "held", result: { answer: "unparseable", entry: { ...request.entry, refused: mark }, mark } };
  }
  const checked = await checkWriteBackEdit({ context, request, base, content, random });
  if (checked.status === "refused") return refusedPreparation(request.entry, checked.refusal);
  const mark = checked.result[0];
  if (mark !== undefined) return { kind: "held", diagnostics: checked.result,
    result: { answer: "refused", entry: { ...request.entry, refused: mark }, mark } };
  return null;
}

async function prepareMarkers(context: WriteBackContext, request: TakeInRequest, content: string, base: RecoveredBase): Promise<StoreResult<MarkerParseResult>> {
  const grammar = kinds[request.entry.reference.kind].entry;
  if (grammar === undefined || request.entry.markers === null) return prepareMarkerContent(context.store, request.entry, content, context.memo);
  const selected = await readBaseContent(context, request.entry, base);
  if (selected.status === "refused") return selected;
  return prepareMarkerContent(context.store, request.entry, content, context.memo,
    { grammar, base: selected.result, aside: request.copy !== null });
}

async function prepareContent(context: WriteBackContext, request: TakeInRequest, base: Exclude<RecoveredBase, { kind: "empty" }>, content: string, random?: () => number) {
  if (base.kind === "stored") return { status: "ok" as const, result: { content, version: base.version, clashed: false } };
  return mergeCopyBase({ store: context.store, reference: request.entry.reference, base: base.content, content,
    grammar: kinds[request.entry.reference.kind].entry, random });
}

async function readEdit(context: WriteBackContext, request: TakeInRequest): Promise<ReadEdit> {
  const path = join(request.checkout, request.copy ?? request.path);
  const gate = await gateRead({ path, markdown: request.path.endsWith(".md") });
  if (gate.kind !== "read") {
    return { kind: "held", result: { answer: gate.kind === "pending" ? "pending" : "no-edit",
      entry: gate.kind === "pending" ? { ...request.entry, pending: true } : request.entry },
    ...(gate.kind === "no-edit" && gate.deleted === "not-a-file"
      ? { diagnostic: { reason: "not-a-file", remedy: gate.remedy } } : {}) };
  }
  const bytes = await readFile(path);
  const text = bytes.toString("utf8");
  if (!request.path.endsWith(".md") && request.copy === null) {
    const held = await stamplessVerdict(context, request, text, gate.stat);
    if (held !== null) return held;
  }
  const parsed = request.path.endsWith(".md") ? parseStampedFile(text) : null;
  const stamp = parsed === null ? null : parsed.stamp;
  return { kind: "read", content: parsed?.content ?? text.replaceAll("\r\n", "\n"), stamp, read: { stat: gate.stat, blob: gitBlobId(bytes, context.format) } };
}

async function stamplessVerdict(
  context: WriteBackContext, request: TakeInRequest, text: string, stat: FileStat,
): Promise<HeldWriteBack | null> {
  const read = await readStamplessFile({ entry: request.entry, text, mtimeNs: stat.mtimeNs,
    format: context.format, memo: context.memo ?? createHistoryMemo(context.store) });
  if (read.status === "refused") return pendingRead(request, read.refusal);
  if (read.result.kind === "pending") return pendingRead(request, read.result.refusal);
  if (read.result.kind === "edit") return null;
  const pending = read.result.kind === "wait";
  return { kind: "held", result: { answer: pending ? "pending" : "no-edit",
    entry: pending ? { ...request.entry, pending: true } : request.entry } };
}

function pendingRead(request: TakeInRequest, refusal: StoreRefusal): HeldWriteBack {
  return { kind: "held", result: { answer: "pending", entry: { ...request.entry, pending: true } },
    diagnostic: { reason: refusal.condition, remedy: refusal.remedy } };
}

function refusedPreparation(entry: RecordEntry, refusal: StoreRefusal): HeldWriteBack {
  const mark = markStoreRefusal(refusal);
  return { kind: "held", result: { answer: "refused", entry: { ...entry, refused: mark }, mark } };
}

function markStoreRefusal(refusal: StoreRefusal): RefusedMark {
  return { reason: refusal.code === "record-malformed" ? `${refusal.rule}: ${refusal.condition}` : refusal.condition,
    remedy: refusal.remedy };
}

async function restoreIds(context: WriteBackContext, request: TakeInRequest, content: string, selected: RecoveredBase): Promise<StoreResult<{
  content: string; random?: () => number;
}>> {
  const grammar = kinds[request.entry.reference.kind].entry;
  if (grammar === undefined) return { status: "ok", result: { content } };
  const base = await readBaseContent(context, request.entry, selected);
  return base.status === "refused" ? base : { status: "ok", result: restoreWriteBackIds({
    reference: request.entry.reference, base: base.result, content, grammar,
  }) };
}

async function currentWritePlacement(store: Store, request: TakeInRequest): Promise<StoreResult<WritePlacement | undefined>> {
  if (request.entry.reference.kind !== "work-item/meta") return { status: "ok", result: undefined };
  const read = await store.read({ reference: request.entry.reference });
  if (read.status === "refused") return read;
  const placement = read.result.placement;
  if (placement === undefined) throw new Error("A stored primary record has no placement");
  return { status: "ok", result: placement.kind === "completed"
    ? { kind: placement.kind, quarter: placement.quarter } : placement };
}

/** Bind write-back to a caller's store; locking and publication remain with that caller. */
export function createWriteBackPort(context: WriteBackContext): TakeInPort {
  const bound = { ...context, memo: context.memo ?? createHistoryMemo(context.store) };
  return async (request) => (await sendWriteBack(bound, request)).result;
}

/** A send's outcome, retaining the read-back only for the file walk that owns replacement. */
export type WriteBackSend =
  | { readonly kind: "held" | "read-back-refused" | "landed-held"; readonly result: TakeInResult }
  | { readonly kind: "landed"; readonly result: Extract<TakeInResult, { answer: "taken-in" }>; readonly record: StoreRecord };

/** Prepare, send once, and record the landed content without replacing any projected file. */
export async function sendWriteBack(context: WriteBackContext, request: TakeInRequest): Promise<WriteBackSend> {
  const prepared = await prepareWriteBack(context, request);
  if (prepared.kind === "held") {
    const mark = "mark" in prepared.result ? prepared.result.mark : prepared.diagnostic;
    for (const diagnostic of prepared.diagnostics ?? (mark === undefined ? [] : [mark])) {
      context.report?.({ path: request.path, copy: request.copy, mark: diagnostic });
    }
    return { kind: "held", result: prepared.result };
  }
  const entry = await markOtherCopies(context, request);
  const sent = await context.store.write(prepared.write);
  if (sent.status === "refused") {
    const mark = markStoreRefusal(sent.refusal);
    context.report?.({ path: request.path, copy: request.copy, mark });
    return { kind: "held", result: { answer: "refused", entry: { ...entry, refused: mark }, mark } };
  }
  if (sent.result.version === undefined) throw new Error("A landed content put returned no version");
  for (const reference of prepared.write.resolves ?? []) {
    context.reportResolution?.({ path: request.path, copy: request.copy, reference });
  }
  const read = await context.store.read({ reference: sent.result.reference });
  if (read.status === "refused") {
    const mark = { reason: `The edit landed, but read-back failed: ${read.refusal.condition}`, remedy: read.refusal.remedy };
    context.report?.({ path: request.path, copy: request.copy, mark });
    return { kind: "read-back-refused", result: { answer: "pending", entry: { ...entry, pending: true } } };
  }
  const recorded = await recordWriteBack({ location: context.location, entry, stamp: prepared.stamp,
    takenIn: prepared.takenIn, outcome: { kind: "landed", version: sent.result.version }, readBack: read.result,
    grammar: kinds[entry.reference.kind].entry, format: context.format,
    memo: context.memo ?? createHistoryMemo(context.store) });
  if (prepared.retained !== undefined) {
    const unshown = unshownConflicts(recorded.entry, read.result.conflicts);
    for (const mark of [prepared.retained, ...heldConflictMarks(unshown, prepared.retained)]) {
      context.report?.({ path: request.path, copy: request.copy, mark });
    }
    return { kind: "landed-held", result: { answer: "refused", mark: prepared.retained,
      entry: { ...recorded.entry, pending: true, refused: prepared.retained, unshown } } };
  }
  return { kind: "landed", record: read.result, result: { answer: "taken-in", read: prepared.read,
    entry: { ...recorded.entry, refused: null, copies: entry.copies.map(copy => (
      copy.name === request.copy ? { ...copy, landed: prepared.read.blob } : copy
    )) } } };
}

async function markOtherCopies(context: WriteBackContext, request: TakeInRequest): Promise<RecordEntry> {
  if (!request.entry.copies.some(copy => copy.name !== request.copy && !copy.writeBackSent)) return request.entry;
  const disk = await readProjectionIndex(context.location, true);
  if (disk.kind !== "index") return request.entry;
  const entry = disk.index.entries[request.path];
  if (entry?.kind !== "record") return request.entry;
  await writeProjectionIndex(context.location, { ...disk.index, entries: {
    ...disk.index.entries, [request.path]: recordWriteBackSent(entry, request.copy),
  } });
  return recordWriteBackSent(request.entry, request.copy);
}
