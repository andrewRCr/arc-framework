/** Prepare a projected edit without writing, then send it through the caller-owned take-in port. */
import { prepareIndexedProjectionSubmission, submitProjectionBatch } from "./submission.js";
import type { ProjectionLocalCapture } from "./local-capture.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Store } from "../contract.js";
import { HAND_EDIT_VERBS } from "../links.js";
import { PRODUCTION_REGISTRATIONS } from "../kinds/registrations.js";
import type { FileStat, RecordEntry, RefusedMark } from "./index-schema.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import type { ProjectionLocation } from "./location.js";
import { gateRead, type ReadGateVerdict } from "./read-gate.js";
import { parseStampedFile } from "./stamp.js";
import type { TakeInPort, TakeInRead, TakeInRequest, TakeInResult, TakeInResolution } from "./take-in-port.js";
import type { WriteInput } from "../write.js";
import type { WritePlacement } from "../placement.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { recordWriteBackSent } from "./aside-copies.js";
import { readProjectionIndex, writeProjectionIndex } from "./index-file.js";
import { createHistoryMemo, type HistoryMemo } from "./base-recovery.js";
import { readStamplessFile } from "./stampless.js";
import type { StoreRecord } from "../read.js";
import { createKindRegistry, type KindDefinition } from "../registry.js";
import type { KindId } from "../catalog.js";
import { recordPendingWriteBack, recordWriteBack } from "./taken-in.js";
import { restoreWriteBackIds } from "./write-back-ids.js";
import { selectWriteBackBase } from "./base-selection.js";
import { readBaseContent } from "./base-content.js";
import type { RecoveredBase } from "./base-recovery.js";
import { checkWriteBackEdit } from "./check-edit.js";
import { prepareMarkerContent } from "./marker-preparation.js";
import { checkStoredResolution } from "./stored-resolution.js";
import type { MarkerParseResult } from "./marker-parse.js";
import { sameReference, type RecordReference, type RecordVersion } from "../identity.js";
import { heldConflictMarks, unshownConflicts } from "./held-conflicts.js";
import { mergeCheckoutBase, prepareAmbiguousDrawing, type CheckoutDrawing, type CheckoutMerge } from "./checkout-merge.js";
import { decideWriteBackRefusal } from "./write-refusal.js";
import { explicitResolutionMarkerRefusal } from "./save-markers.js";
import { normalizeStubEdit } from "./stub-normalization.js";
import { observeProjectionEdit } from "./edit-observation.js";
import { completeWriteBackRecording } from "./write-back-recording.js";
import { readProjectionLinkBoundary, projectionLinkRemedy } from "./discovery-links.js";

const kinds = createKindRegistry(PRODUCTION_REGISTRATIONS);

/** The store and checkout state used by a caller that already owns the projection lock. */
export interface WriteBackContext {
  readonly checkpoint?: () => Promise<void>;
  readonly onWrite?: () => void;
  readonly store: Store;
  readonly location: ProjectionLocation;
  readonly format: ObjectFormat;
  readonly actor: string;
  readonly captureLocal?: (path: string, source: "file" | "aside") => Promise<StoreResult<ProjectionLocalCapture>>;
  readonly registry?: Readonly<Record<KindId, KindDefinition>>;
  readonly readCopy?: (name: string) => Promise<string>;
  readonly now?: () => Date;
  readonly memo?: HistoryMemo;
  readonly verb?: typeof HAND_EDIT_VERBS[number];
  readonly report?: (diagnostic: WriteBackDiagnostic) => void;
  readonly reportResolution?: (resolution: WriteBackResolution) => void;
  readonly reportExplicitResolution?: () => void;
  readonly versionRecoveries?: RecordReference[];
  readonly recoveringBase?: boolean;
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
      readonly stamp: string; readonly takenIn: string; readonly selectedBase: RecoveredBase; readonly captured: CapturedWriteBackFile; readonly random?: () => number; readonly retained?: RefusedMark }
  | { readonly kind: "clashed"; readonly drawing: CheckoutDrawing; readonly read: TakeInRead; readonly result: TakeInResult; readonly diagnostic: RefusedMark }
  | { readonly kind: "held"; readonly result: TakeInResult; readonly diagnostic?: RefusedMark;
      readonly diagnostics?: readonly RefusedMark[]; readonly refusal?: StoreRefusal };

/** Read and parse an edit without writing a file, publishing an index, or acquiring a lock. */
export async function prepareWriteBack(context: WriteBackContext, request: TakeInRequest): Promise<PreparedWriteBack> {
  request = observeProjectionEdit(request);
  const file = await captureWriteBackFile(context, request);
  return file.kind === "held" ? file : prepareCapturedWriteBack(context, request, file);
}

/** Settled authored bytes retained independently of store-derived normalization and base selection. */
export interface CapturedWriteBackFile { readonly kind: "read"; readonly content: string; readonly read: TakeInRead; readonly stamp: string | null }

/** Repeat store-dependent preparation from captured bytes without reading a checkout file. */
export async function prepareCapturedWriteBack(context: WriteBackContext, request: TakeInRequest,
  supplied: CapturedWriteBackFile): Promise<PreparedWriteBack> {
  request = observeProjectionEdit(request);
  if (request.resolution?.kind === "stored") {
    const checked = await checkStoredResolution(context.store, request.entry.reference, request.resolution.reference);
    if (checked.status === "refused") return refusedPreparation(request.entry, checked.refusal);
  }
  if (!request.path.endsWith(".md") && request.copy === null) {
    const held = await stamplessVerdict(context, request, supplied.content, supplied.read.stat);
    if (held !== null) return observedHeldRead(request, held, supplied.read.blob);
  }
  const normalized = await normalizeStubEdit(context, request.entry, supplied.content);
  if (normalized.status === "refused") return refusedPreparation(request.entry, normalized.refusal);
  const file = { ...supplied, content: normalized.result };
  request = observeProjectionEdit(request, file.read.blob);
  const selected = await selectWriteBackBase(context, request, file.content, file.stamp);
  if (selected.status === "refused") return refusedPreparation(request.entry, selected.refusal);
  if (selected.result.kind === "held") return heldBasePreparation(context, request, file, selected.result.mark);
  const { base, stamp } = selected.result;
  const markers = await prepareMarkers(context, request, file.content, base);
  if (markers.status === "refused") return refusedPreparation(request.entry, markers.refusal);
  if (markers.result.kind === "held") return { kind: "held",
    diagnostics: [markers.result.mark, ...heldConflictMarks(markers.result.unshown ?? [], markers.result.mark)],
    result: { answer: "refused", mark: markers.result.mark,
      openConflicts: markers.result.open, entry: { ...request.entry, pending: true, refused: markers.result.mark,
        unshown: currentUnshown(request.entry, markers.result.open) } } };
  const markerRefusal = explicitResolutionMarkerRefusal(request, file.content, markers.result);
  if (markerRefusal !== null) return { kind: "held", result: { answer: "refused", mark: markerRefusal,
    entry: { ...request.entry, pending: true, refused: markerRefusal } } };
  return prepareReadyContent(context, request, file, base, stamp, markers.result, supplied);
}

async function prepareReadyContent(context: WriteBackContext, request: TakeInRequest, file: CapturedWriteBackFile,
  base: RecoveredBase, stamp: string, markers: Extract<MarkerParseResult, { kind: "ready" }>,
  captured: CapturedWriteBackFile): Promise<PreparedWriteBack> {
  const restored = await restoreIds(context, request, markers.content, base);
  if (restored.status === "refused") return refusedPreparation(request.entry, restored.refusal);
  const { content: takenIn, random } = restored.result;
  const merged = await prepareContent(context, request, base, takenIn, file.read, random);
  if (merged.status === "refused") return refusedPreparation(request.entry, merged.refusal);
  if (merged.result.drawing !== undefined) return clashedPreparation(request, merged.result.drawing, file.read, markers);
  const { content, version } = merged.result;
  const invalid = await checkContent(context, request, { kind: "stored", version }, content, random);
  if (invalid !== null) return invalid;
  const placement = await currentWritePlacement(context.store, request);
  if (placement.status === "refused") return refusedPreparation(request.entry, placement.refusal);
  const resolves = resolvingReferences(markers.resolves, request.resolution);
  return { kind: "ready", read: file.read, stamp, takenIn, selectedBase: base, captured, ...(random === undefined ? {} : { random }),
    ...(markers.retained === undefined ? {} : { retained: markers.retained }), write: {
    action: "put", reference: request.entry.reference, content, expected: version,
    ...(resolves.length === 0 ? {} : { resolves }),
    ...(placement.result === undefined ? {} : { placement: placement.result }),
    provenance: { verb: context.verb ?? HAND_EDIT_VERBS[0], lifecycleAction: "edit" },
  } };
}

function resolvingReferences(implicit: readonly RecordReference[], explicit: TakeInResolution | undefined): RecordReference[] {
  const resolves = [...implicit];
  if (explicit?.kind === "stored" && !resolves.some(reference => sameReference(reference, explicit.reference))) resolves.push(explicit.reference);
  return resolves;
}

type HeldWriteBack = Extract<PreparedWriteBack, { readonly kind: "held" }>;
type ReadEdit = { readonly kind: "read"; readonly content: string; readonly read: TakeInRead; readonly stamp: string | null } | HeldWriteBack;

async function checkContent(context: WriteBackContext, request: TakeInRequest, base: RecoveredBase, content: string, random?: () => number): Promise<HeldWriteBack | null> {
  const parser = (context.registry ?? kinds)[request.entry.reference.kind].parser;
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
  const entry = request.rendering === undefined ? request.entry : { ...request.entry, ...request.rendering };
  const grammar = (context.registry ?? kinds)[entry.reference.kind].entry;
  if (grammar === undefined || entry.markers === null) return prepareMarkerContent(context.store, entry, content, context.memo);
  const selected = await readBaseContent(context, request.entry, base);
  if (selected.status === "refused") return selected;
  return prepareMarkerContent(context.store, entry, content, context.memo,
    { grammar, base: selected.result, aside: request.copy !== null });
}

async function prepareContent(context: WriteBackContext, request: TakeInRequest, base: RecoveredBase, content: string, read: TakeInRead, random?: () => number): Promise<StoreResult<CheckoutMerge>> {
  if (base.kind === "stored" && (context.registry ?? kinds)[request.entry.reference.kind].merge !== "single-writer") {
    return { status: "ok", result: { content, version: base.version } };
  }
  const original = await readBaseContent(context, request.entry, base);
  if (original.status === "refused") return original;
  return mergeCheckoutBase({ store: context.store, reference: request.entry.reference, base: original.result,
    baseVersion: base.kind === "stored" ? base.version : null, content,
    grammar: (context.registry ?? kinds)[request.entry.reference.kind].entry, random, actor: context.actor, now: context.now, mtimeNs: read.stat.mtimeNs });
}

function clashedPreparation(request: TakeInRequest, drawing: CheckoutDrawing, read: TakeInRead,
  policy: { retained?: RefusedMark; unshown?: readonly RecordReference[] } = {}): PreparedWriteBack {
  const { retained } = policy;
  const diagnostic = { reason: drawing.basesDisagree ? "ambiguous-base" : "checkout-conflict: The edit clashes with the stored record.",
    remedy: { text: "Resolve the checkout's markers by hand and save again; repair any malformed entry before the clash can be drawn." } };
  const unshown = [...(policy.unshown ?? request.entry.unshown)];
  if (retained !== undefined) return { kind: "held", diagnostics: [retained, diagnostic, ...heldConflictMarks(unshown, retained)], result: {
    answer: "refused", mark: retained, entry: { ...request.entry, pending: true, refused: retained, unshown },
  } };
  return { kind: "clashed", drawing, read, diagnostic, result: { answer: "clashed", entry: { ...request.entry, pending: true } } };
}

async function ambiguousPreparation(context: WriteBackContext, request: TakeInRequest, file: Extract<ReadEdit, { kind: "read" }>): Promise<PreparedWriteBack> {
  const mark = request.entry.refused;
  if (mark?.reason === "bases-disagree") return { kind: "held", result: { answer: "refused", mark,
    entry: { ...request.entry, pending: true } } };
  const drawing = await prepareAmbiguousDrawing({ store: context.store, reference: request.entry.reference,
    content: file.content, actor: context.actor, now: context.now, mtimeNs: file.read.stat.mtimeNs });
  return drawing.status === "refused" ? refusedPreparation(request.entry, drawing.refusal)
    : clashedPreparation(request, drawing.result, file.read);
}

async function heldBasePreparation(context: WriteBackContext, request: TakeInRequest, file: Extract<ReadEdit, { kind: "read" }>, mark: RefusedMark): Promise<PreparedWriteBack> {
  if (mark.reason === "ambiguous-base") return ambiguousPreparation(context, request, file);
  return { kind: "held", result: { answer: "pending", entry: { ...request.entry, pending: true } }, diagnostic: mark };
}

/** Capture one settled local file without making store-derived preparation decisions. */
export async function captureWriteBackFile(context: WriteBackContext, request: TakeInRequest): Promise<ReadEdit> {
  const logical = request.copy ?? request.path;
  const boundary = await readProjectionLinkBoundary(request.checkout, [logical]);
  const linked = boundary(logical);
  if (linked !== null) return { kind: "held", result: { answer: "no-edit", entry: request.entry },
    diagnostic: { reason: "not-a-file", remedy: projectionLinkRemedy(linked) } };
  const path = join(request.checkout, logical);
  const gate = await gateRead({ path, markdown: request.path.endsWith(".md") && request.adopting !== true });
  if (gate.kind !== "read") {
    return { kind: "held", result: { answer: gate.kind === "pending" ? "pending" : "no-edit",
      entry: gate.kind === "pending" ? { ...request.entry, pending: true } : request.entry },
    ...readGateDiagnostic(gate) };
  }
  const bytes = await readFile(path);
  const blob = gitBlobId(bytes, context.format);
  const text = bytes.toString("utf8");
  const parsed = request.path.endsWith(".md") ? parseStampedFile(text) : null;
  const stamp = parsed === null ? null : parsed.stamp;
  return { kind: "read", content: parsed?.content ?? text.replaceAll("\r\n", "\n"), stamp, read: { stat: gate.stat, blob } };
}

function observedHeldRead(request: TakeInRequest, held: HeldWriteBack, blob: string): HeldWriteBack {
  // An interrupted replacement can leave old projection bytes that the stampless verdict proves unedited.
  if (held.result.answer === "no-edit") return held;
  const marked = observeProjectionEdit({ ...request, entry: held.result.entry }, blob);
  return { ...held, result: { ...held.result, entry: marked.entry } };
}

function readGateDiagnostic(gate: ReadGateVerdict): { diagnostic?: RefusedMark } {
  if (gate.kind === "pending") return { diagnostic: { reason: `pending: ${gate.reason}`,
    remedy: { text: "Let the editor finish saving; the next command will retry this file." } } };
  return gate.kind === "no-edit" && gate.deleted === "not-a-file"
    ? { diagnostic: { reason: "not-a-file", remedy: gate.remedy } } : {};
}

async function stamplessVerdict(
  context: WriteBackContext, request: TakeInRequest, text: string, stat: FileStat,
): Promise<HeldWriteBack | null> {
  if (request.resolution !== undefined) return null;
  if (request.entry.markers !== null || request.entry.refused?.reason === "bases-disagree") return null;
  const read = await readStamplessFile({ entry: request.entry, text, mtimeNs: stat.mtimeNs,
    format: context.format, memo: context.memo ?? createHistoryMemo(context.store) });
  if (read.status === "refused") return pendingRead(context, request, read.refusal);
  if (read.result.kind === "pending") return pendingRead(context, request, read.result.refusal);
  if (read.result.kind === "edit") return null;
  if (read.result.kind === "unedited" && request.observedEdit) return null;
  const pending = read.result.kind === "wait";
  return { kind: "held", result: { answer: pending ? "pending" : "no-edit",
    entry: pending ? { ...request.entry, pending: true } : request.entry } };
}

function pendingRead(context: WriteBackContext, request: TakeInRequest, refusal: StoreRefusal): HeldWriteBack {
  return { kind: "held", result: { answer: "pending", entry: { ...request.entry, pending: true } },
    diagnostic: markStoreRefusal(refusal, context.verb) };
}

function refusedPreparation(entry: RecordEntry, refusal: StoreRefusal): HeldWriteBack {
  const mark = markStoreRefusal(refusal);
  return { kind: "held", refusal, result: { answer: "refused", entry: { ...entry, refused: mark }, mark } };
}

async function restoreIds(context: WriteBackContext, request: TakeInRequest, content: string, selected: RecoveredBase): Promise<StoreResult<{
  content: string; random?: () => number;
}>> {
  const grammar = (context.registry ?? kinds)[request.entry.reference.kind].entry;
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
  const bound = { ...context, memo: context.memo ?? createHistoryMemo(context.store), versionRecoveries: context.versionRecoveries ?? [] };
  return async (request) => {
    const { result } = await sendWriteBack(bound, request);
    if (request.rendering === undefined) return result;
    // The copy's parse context never replaces the live path's mapping. Reconcile its latest conflict knowledge separately.
    const current = await bound.store.read({ reference: request.entry.reference });
    if (current.status === "refused") return result;
    return { ...result, openConflicts: current.result.conflicts,
      entry: { ...result.entry, unshown: unshownConflicts(result.entry, current.result.conflicts) } };
  };
}

/** A send's outcome, retaining the read-back only for the file walk that owns replacement. */
export type WriteBackSend =
  | { readonly kind: "held" | "read-back-refused" | "landed-held"; readonly result: TakeInResult }
  | { readonly kind: "clashed"; readonly result: TakeInResult; readonly drawing: CheckoutDrawing; readonly read: TakeInRead }
  | { readonly kind: "landed"; readonly result: Extract<TakeInResult, { answer: "taken-in" }>; readonly record: StoreRecord };

type RefusedSend = { kind: "store-refused"; refusal: StoreRefusal; entry: RecordEntry };

/** Prepare and send an edit, recovering a rejected base once without retrying an already-landed write. */
export async function sendWriteBack(context: WriteBackContext, request: TakeInRequest): Promise<WriteBackSend> {
  request = observeProjectionEdit(request);
  const bound = { ...context, memo: context.memo ?? createHistoryMemo(context.store), versionRecoveries: context.versionRecoveries ?? [] };
  const completion = await completeWriteBackRecording(bound, request.entry);
  if (completion.mark !== undefined) {
    context.report?.({ path: request.path, copy: request.copy, mark: completion.mark });
    return { kind: "read-back-refused", result: { answer: "pending",
      entry: { ...completion.entry, pending: true, refused: completion.mark } } };
  }
  let current = { ...request, entry: completion.entry };
  for (const recoveringBase of [false, true]) {
    const attempt = await sendAttempt({ ...bound, recoveringBase }, current);
    if (attempt.kind !== "store-refused") return attempt.kind === "held"
      ? { ...attempt, result: keepStandingHold(attempt.result, current.entry) } : attempt;
    current = { ...current, entry: { ...attempt.entry, refused: current.entry.refused } };
    const decision = await decideWriteBackRefusal(bound, current, attempt.refusal);
    if (decision.kind === "recover" && !recoveringBase) continue;
    const refusal = decision.kind === "recover" ? attempt.refusal : decision.refusal;
    const mark = markStoreRefusal(refusal, context.verb);
    context.report?.({ path: request.path, copy: request.copy, mark });
    const result: TakeInResult = refusal.code === "version-conflict" || refusal.code === "lock-held"
      ? { answer: "pending", entry: { ...current.entry, pending: true } }
      : { answer: "refused", entry: { ...current.entry, refused: mark }, mark };
    return { kind: "held", result: keepStandingHold(result, current.entry) };
  }
  throw new Error("A write-back recovery exceeded its retry bound");
}

function keepStandingHold<T extends TakeInResult>(result: T, prior: RecordEntry): T {
  const mark = prior.refused;
  if (mark?.reason !== "bases-disagree") return result;
  return { ...result, entry: { ...result.entry, refused: mark }, ...("mark" in result ? { mark } : {}) };
}

async function sendAttempt(context: WriteBackContext, request: TakeInRequest): Promise<WriteBackSend | RefusedSend> {
  let prepared = await prepareWriteBack(context, request);
  if (prepared.kind === "clashed") {
    context.report?.({ path: request.path, copy: request.copy, mark: prepared.diagnostic });
    return { kind: "clashed", result: prepared.result, drawing: prepared.drawing, read: prepared.read };
  }
  if (prepared.kind === "held") {
    return heldPreparation(context, request, prepared);
  }
  request = observeProjectionEdit(request, prepared.read.blob);
  let entry = await markOtherCopies(context, request);
  await context.checkpoint?.();
  const submission = await prepareIndexedProjectionSubmission(context, request, prepared);
  if (submission.status === "refused") return { kind: "store-refused", refusal: submission.refusal, entry };
  const receipt = submission.result.plan.prepared;
  if (receipt.stamp === null) throw new Error("An indexed content write requires its captured stamp");
  const original = { ...prepared };
  delete original.retained;
  prepared = { ...original, write: { ...submission.result.plan.mutation, provenance: submission.result.batch.provenance },
    stamp: receipt.stamp, takenIn: receipt.takenIn, ...(receipt.retained === null ? {} : { retained: receipt.retained }) };
  const sent = await submitProjectionBatch(context, submission.result.batch);
  if (sent.status === "refused") {
    return { kind: "store-refused", refusal: sent.refusal, entry };
  }
  if (sent.result.version === undefined) throw new Error("A landed content put returned no version");
  if (isAdopting(request)) entry = { ...entry, adoption: { kind: "read-back", read: prepared.read } };
  if (request.resolution !== undefined) context.reportExplicitResolution?.();
  for (const reference of prepared.write.resolves ?? []) {
    context.reportResolution?.({ path: request.path, copy: request.copy, reference });
  }
  const read = await context.store.read({ reference: sent.result.reference });
  if (read.status === "refused") {
    const mark = { reason: `The edit landed, but read-back failed: ${read.refusal.condition}`, remedy: read.refusal.remedy };
    context.report?.({ path: request.path, copy: request.copy, mark });
    entry = await pendingAcceptedRecording(context, request, prepared, entry, sent.result.version);
    return { kind: "read-back-refused", result: { answer: "pending", entry: { ...entry, pending: true, refused: mark } } };
  }
  const recorded = await recordWriteBack({ location: context.location, checkpoint: context.checkpoint, entry, stamp: prepared.stamp,
    takenIn: prepared.takenIn, outcome: { kind: "landed", version: sent.result.version }, readBack: read.result,
    grammar: kinds[entry.reference.kind].entry, format: context.format,
    memo: context.memo ?? createHistoryMemo(context.store) });
  if (recorded.mark !== undefined) return pendingRecordingResult(context, request,
    adoptionReadBackEntry(request, prepared, recorded.entry), recorded.mark);
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

function isAdopting(request: TakeInRequest): boolean {
  return request.adopting === true || request.entry.adoption !== undefined;
}

async function pendingAcceptedRecording(context: WriteBackContext, request: TakeInRequest,
  prepared: Extract<PreparedWriteBack, { kind: "ready" }>, entry: RecordEntry, version: RecordVersion): Promise<RecordEntry> {
  const recorded = await recordPendingWriteBack({ location: context.location, checkpoint: context.checkpoint, entry,
    stamp: prepared.stamp, takenIn: prepared.takenIn, version, format: context.format });
  return adoptionReadBackEntry(request, prepared, recorded);
}

function adoptionReadBackEntry(request: TakeInRequest, prepared: Extract<PreparedWriteBack, { kind: "ready" }>,
  entry: RecordEntry): RecordEntry {
  return !isAdopting(request) ? entry : { ...entry, adoption: { kind: "read-back", read: prepared.read,
    ...(prepared.retained === undefined ? {} : { retained: prepared.retained }) } };
}

function pendingRecordingResult(context: WriteBackContext, request: TakeInRequest, entry: RecordEntry,
  mark: RefusedMark): WriteBackSend {
  context.report?.({ path: request.path, copy: request.copy, mark });
  return { kind: "read-back-refused", result: { answer: "pending", entry: { ...entry, pending: true, refused: mark } } };
}

function heldPreparation(context: WriteBackContext, request: TakeInRequest, prepared: HeldWriteBack): WriteBackSend | RefusedSend {
  if (prepared.refusal !== undefined) return { kind: "store-refused", refusal: prepared.refusal, entry: prepared.result.entry };
  const mark = "mark" in prepared.result ? prepared.result.mark : prepared.diagnostic;
  for (const diagnostic of prepared.diagnostics ?? (mark === undefined ? [] : [mark])) {
    context.report?.({ path: request.path, copy: request.copy, mark: diagnostic });
  }
  return { kind: "held", result: prepared.result };
}

async function markOtherCopies(context: WriteBackContext, request: TakeInRequest): Promise<RecordEntry> {
  if (!request.entry.copies.some(copy => copy.name !== request.copy && !copy.writeBackSent)) return request.entry;
  const disk = await readProjectionIndex(context.location, true);
  if (disk.kind !== "index") return request.entry;
  const entry = disk.index.entries[request.path];
  if (entry?.kind !== "record") return request.entry;
  await writeProjectionIndex(context.location, { ...disk.index, entries: {
    ...disk.index.entries, [request.path]: recordWriteBackSent(entry, request.copy),
  } }, context.checkpoint);
  return recordWriteBackSent(request.entry, request.copy);
}

function currentUnshown(entry: RecordEntry, open: readonly RecordReference[] | undefined): RecordEntry["unshown"] {
  return open === undefined ? entry.unshown : unshownConflicts(entry, open);
}
