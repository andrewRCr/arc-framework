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

/** The store and checkout state used by a caller that already owns the projection lock. */
export interface WriteBackContext {
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly format: ObjectFormat;
  readonly memo?: HistoryMemo;
  readonly report?: (diagnostic: WriteBackDiagnostic) => void;
}

/** A file-specific diagnostic retained for the command's report. */
export interface WriteBackDiagnostic {
  readonly path: string;
  readonly copy: string | null;
  readonly mark: RefusedMark;
}

/** An edit ready for its own store write, or the reason the file stays where it is. */
export type PreparedWriteBack =
  | { readonly kind: "ready"; readonly write: WriteInput; readonly read: TakeInRead }
  | { readonly kind: "held"; readonly result: TakeInResult; readonly diagnostic?: RefusedMark };

/** Read and parse an edit without writing a file, publishing an index, or acquiring a lock. */
export async function prepareWriteBack(context: WriteBackContext, request: TakeInRequest): Promise<PreparedWriteBack> {
  const file = await readEdit(context, request);
  if (file.kind === "held") return file;
  const { content } = file;
  const parser = PRODUCTION_REGISTRATIONS.find(({ kind }) => kind === request.entry.reference.kind)?.parser;
  const parsed = parser?.(content);
  if (parsed?.success === false) {
    const mark: RefusedMark = { reason: parsed.error, remedy: { text: `Repair ${request.path} so its record parser accepts the edit, then save again.` } };
    return { kind: "held", result: { answer: "unparseable", entry: { ...request.entry, refused: mark }, mark } };
  }
  const placement = await currentWritePlacement(context.store, request);
  if (placement.status === "refused") {
    const mark = { reason: placement.refusal.condition, remedy: placement.refusal.remedy };
    return { kind: "held", result: { answer: "refused", entry: { ...request.entry, refused: mark }, mark } };
  }
  return { kind: "ready", read: file.read, write: {
    action: "put", reference: request.entry.reference, content, expected: request.entry.base.version,
    ...(placement.result === undefined ? {} : { placement: placement.result }),
    provenance: { verb: HAND_EDIT_VERBS[0], lifecycleAction: "edit" },
  } };
}

type HeldWriteBack = Extract<PreparedWriteBack, { readonly kind: "held" }>;
type ReadEdit = { readonly kind: "read"; readonly content: string; readonly read: TakeInRead } | HeldWriteBack;

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
  const content = request.path.endsWith(".md") ? parseStampedFile(text).content : text;
  return { kind: "read", content, read: { stat: gate.stat, blob: gitBlobId(bytes, context.format) } };
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
  return async (request) => {
    const prepared = await prepareWriteBack(context, request);
    if (prepared.kind === "held") {
      const mark = "mark" in prepared.result ? prepared.result.mark : prepared.diagnostic;
      if (mark !== undefined) context.report?.({ path: request.path, copy: request.copy, mark });
      return prepared.result;
    }
    const entry = await markOtherCopies(context, request);
    const sent = await context.store.write(prepared.write);
    if (sent.status === "refused") {
      const mark = { reason: sent.refusal.condition, remedy: sent.refusal.remedy };
      context.report?.({ path: request.path, copy: request.copy, mark });
      return { answer: "refused", entry: { ...entry, refused: mark }, mark };
    }
    return { answer: "taken-in", entry: { ...entry, copies: entry.copies.map(copy => (
      copy.name === request.copy ? { ...copy, landed: prepared.read.blob } : copy
    )) }, read: prepared.read };
  };
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
