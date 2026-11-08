/** Resolve the base carried by a projected save before its entry identities or content are interpreted. */
import { requiresStubNormalization } from "./stub-normalization.js";
import type { StoreResult } from "../refusal.js";
import { createHistoryMemo, recoverBase, type HistoryMemo, type RecoveredBase } from "./base-recovery.js";
import { gitBlobId } from "./blob-id.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";
import { readBaseContent, type BaseSelectionContext } from "./base-content.js";
import { selectStamplessBase } from "./stampless-base.js";
import { readRetainedBase, RetainedBaseUnavailable, selectPersistedBase } from "./taken-in.js";
import type { TakeInRequest } from "./take-in-port.js";

import { unfinishedRecordingRefusal } from "./recording-state.js";

/** A resolved base and the stamp recorded for this take-in. */
export interface SelectedWriteBackBase {
  readonly kind: "selected";
  readonly base: RecoveredBase;
  readonly stamp: string;
}

/** Either a selected base or an ambiguity that keeps the file pending. */
export type WriteBackBaseDecision = SelectedWriteBackBase | { readonly kind: "held"; readonly mark: RefusedMark };

/** Select a file's base from its actual stamp, including the content its last persisted write-back took in. */
export async function selectWriteBackBase(
  context: BaseSelectionContext, request: TakeInRequest, content: string, stamp: string | null,
): Promise<StoreResult<WriteBackBaseDecision>> {
  const unfinished = unfinishedRecordingRefusal(request.entry);
  if (unfinished !== null) return { status: "refused", refusal: unfinished };
  try {
    return await selectBase(context, request, content, stamp);
  } catch (error) {
    if (!(error instanceof RetainedBaseUnavailable)) throw error;
    return { status: "ok", result: { kind: "held", mark: error.mark } };
  }
}

async function selectBase(
  context: BaseSelectionContext, request: TakeInRequest, content: string, stamp: string | null,
): Promise<StoreResult<WriteBackBaseDecision>> {
  const memo = context.memo ?? createHistoryMemo(context.store);
  if (request.resolution?.kind === "hold") return selectHeldBase(context, request.entry, stamp);
  if (requiresStubNormalization(request.entry)) return { status: "ok", result: { kind: "selected",
    base: { kind: "stored", version: request.entry.base.version }, stamp: request.entry.base.blob } };
  if (!request.path.endsWith(".md")) return selectStamplessBase({ ...context, memo }, request, content);
  if (context.recoveringBase) return recoverSelectedBase({ ...context, memo }, request, content, stamp);
  const persisted = await selectPersistedBase({ location: context.location, entry: request.entry, stamp, readCopy: context.readCopy });
  if (persisted.status === "refused") return persisted;
  if (persisted.result !== null && stamp !== null) return { status: "ok", result: { kind: "selected", base: persisted.result, stamp } };
  if (stamp === request.entry.base.blob) return { status: "ok", result: {
    kind: "selected", base: { kind: "stored", version: request.entry.base.version }, stamp,
  } };
  if (stamp !== null) {
    const history = await memo.read(request.entry.reference);
    if (history.status === "refused") return history;
    const found = history.result.find(each => each.content !== null && gitBlobId(each.content, context.format) === stamp);
    if (found?.version !== null && found?.version !== undefined) return { status: "ok", result: {
      kind: "selected", base: { kind: "stored", version: found.version }, stamp,
    } };
  }
  return recoverSelectedBase({ ...context, memo }, request, content, stamp);
}

async function selectHeldBase(context: BaseSelectionContext, entry: RecordEntry, stamp: string | null): Promise<StoreResult<SelectedWriteBackBase>> {
  const current = await context.store.read({ reference: entry.reference });
  return current.status === "refused" ? current : { status: "ok", result: { kind: "selected",
    base: { kind: "stored", version: current.result.version }, stamp: stamp ?? entry.base.blob } };
}

async function recoverSelectedBase(
  context: BaseSelectionContext & { memo: HistoryMemo }, request: TakeInRequest, content: string, stamp: string | null,
): Promise<StoreResult<SelectedWriteBackBase>> {
  const recovered = await recoverBase({ content, entry: request.entry, format: context.format, memo: context.memo,
    readCopy: name => context.readCopy?.(name) ?? readRetainedBase(context.location, name), ignoreIndexedMatch: context.recoveringBase });
  if (recovered.status === "refused") return recovered;
  if (stamp !== null) return { status: "ok", result: { kind: "selected", base: recovered.result, stamp } };
  const blob = recovered.result.kind === "stored" && recovered.result.version === request.entry.base.version
    ? { status: "ok" as const, result: request.entry.base.blob }
    : await recoveredBlob(context, request.entry, recovered.result);
  return blob.status === "refused" ? blob : { status: "ok", result: { kind: "selected", base: recovered.result, stamp: blob.result } };
}

async function recoveredBlob(context: BaseSelectionContext, entry: RecordEntry, base: RecoveredBase): Promise<StoreResult<string>> {
  const content = await readBaseContent(context, entry, base);
  return content.status === "refused" ? content : { status: "ok", result: gitBlobId(content.result, context.format) };
}
