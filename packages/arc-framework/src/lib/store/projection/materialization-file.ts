/** Prepare one materialized file, trusting existing index evidence or a checked rebuild baseline. */
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { StoreRecord } from "../read.js";
import { sameReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { RecordRenderer, RenderedRecord } from "./record-render.js";
import { stageRenderedRecordFile } from "./staging.js";
import { gateRead, projectionReadGate } from "./read-gate.js";
import { projectionFileReader } from "./change-detection.js";
import { parseStampedFile, renderStampedFile } from "./stamp.js";
import { gitBlobId, storedBlobId, type ObjectFormat } from "./blob-id.js";
import { projectionLayMode, isOwnSaveLanding } from "./lay-mode.js";
import { withProjectionEntry } from "./index-memory.js";
import { guardReplacement, reportGuardHold } from "./replace-guard.js";
import type { SwapFile } from "./swap.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { installProjectionHandoff } from "./ownership-install.js";
import { keepSettledFileInPlace } from "./settled-in-place.js";
import { ensureLayFolder } from "./lay-folder.js";
import { ArchiveDestinationBlocked } from "./archive-file.js";
import { refuseArchiveChange, selectArchivePath } from "./archive-selection.js";
import { archiveEditCommand } from "./archive-admission.js";

/** A caller's complete rendering and replacement context for one target path. */
export interface MaterializationFileInput {
  readonly root: ProjectionRootState;
  readonly index: ProjectionIndex;
  readonly path: string;
  readonly record: StoreRecord;
  readonly renderer: RecordRenderer;
  readonly rebuilding: boolean;
  /** Opened state carried from the obsolete path of this same record. */
  readonly opened?: true;
  /** A standing conflicted view; guard restaging still uses the live renderer. */
  readonly rendered?: RenderedRecord;
  readonly reference: bigint | null;
  readonly blocked: boolean;
  /** Whether the guard may take in a forced edit: a refresh's or a rebuild's, never a restoration's. */
  readonly admitsForcedEdit: boolean;
}
/**
 * A withheld or pending entry, or one guarded replacement ready for the batch. `unresolved` records a blocked lay
 * that the arrivals check cannot see at a bound path. The caller keeps its state version until retry.
 */
export interface MaterializationFileResult { readonly index: ProjectionIndex; readonly file?: SwapFile; readonly unresolved?: true }

/** Form a pending record basis without claiming any bytes already exist at its path. */
export function projectionEntryForRecord(record: StoreRecord, path: string, format: ObjectFormat): RecordEntry {
  const blob = gitBlobId(record.content, format);
  return { kind: "record", reference: record.reference, stat: null, written: gitBlobId(path.endsWith(".md")
    ? renderStampedFile({ content: record.content, stamp: blob }) : record.content, format), base: { blob, version: record.version },
    markers: null, notices: [], unshown: record.conflicts, protected: false, changed: false, pending: true, withheld: false,
    refused: null, persisted: null, inProgress: null, copies: [] };
}

/** The code an unread rebuild's mark starts with: rewording its prose never changes which entries a later lay rebuilds. */
const UNREAD_REBUILD_CODE = "unread-rebuild:";

/**
 * A rebuild's entry for an archive path whose folder another checkout holds: pending under the path check's refusal,
 * its basis left unread until a command whose check passes rebuilds it from the file.
 */
function unreadRebuildEntry(input: MaterializationFileInput, mark: RefusedMark): RecordEntry {
  return { ...projectionEntryForRecord(input.record, input.path, input.root.context.format), pending: true,
    refused: { reason: `${UNREAD_REBUILD_CODE} ${mark.reason}`, remedy: mark.remedy } };
}

/** An entry a rebuild recorded without reading its file, which the next lay rebuilds once the path is this checkout's. */
export function isUnreadRebuildEntry(entry: ProjectionIndex["entries"][string] | undefined): boolean {
  return entry?.kind === "record" && entry.refused?.reason.startsWith(UNREAD_REBUILD_CODE) === true;
}

/**
 * Why a command that judges an archived file's edit holds an entry a rebuild has not read: it has no basis to judge the
 * file against until a lay rebuilds the path from the file.
 */
export function unreadRebuildHold(checkout: string, path: string, refused: RefusedMark): RefusedMark {
  const cause = refused.reason.slice(UNREAD_REBUILD_CODE.length).trim();
  return { reason: `The projection has not read ${path} since rebuilding its index: ${cause}`,
    remedy: { text: `${refused.remedy.text} Then run any arc command from ${checkout}, whose rebuild reads the file, and retry.` } };
}

/** Stage only proved bytes, and hand a concurrent edit to the live writable store before replacement. */
export async function prepareMaterializationFile(input: MaterializationFileInput): Promise<MaterializationFileResult> {
  const { root, path } = input;
  // The path check at this selection: a refused path keeps any entry it has, and a rebuild records an unread one.
  const refused = selectArchivePath(root, path);
  if (refused !== null) {
    if (input.index.entries[path] !== undefined) return { index: input.index, unresolved: true };
    return { index: withProjectionEntry(input.index, path, unreadRebuildEntry(input, refused)), unresolved: true };
  }
  if (isUnreadRebuildEntry(input.index.entries[path])) {
    // Dropped through the partitioned entries, so partitions this command never loaded stay as they are.
    return prepareCheckedFile({ ...input, index: withProjectionEntry(input.index, path, undefined), rebuilding: true });
  }
  return prepareCheckedFile(input);
}

async function prepareCheckedFile(input: MaterializationFileInput): Promise<MaterializationFileResult> {
  const { root, path, record } = input;
  const prior = input.index.entries[path];
  if (prior?.withheld) return withhold(input, prior);
  let entry = prior?.kind === "record" ? prior : projectionEntryForRecord(record, path, root.context.format);
  if (prior?.kind === "record" && !sameReference(prior.reference, record.reference)) {
    const arriving = { ...projectionEntryForRecord(record, path, root.context.format),
      ...(input.opened ? { opened: true as const } : {}) };
    return { index: await installProjectionHandoff({ ...input, arriving }) };
  }
  if (input.opened === true) entry = { ...entry, opened: true };
  // A path at or below a walked link waits for the link's own report and remedy; its file lives elsewhere.
  if (input.blocked) return { index: withProjectionEntry(input.index, path, { ...entry, pending: true }) };
  try { return await prepareFileContents(input, entry); }
  catch (error) {
    if (!(error instanceof ArchiveDestinationBlocked)) throw error;
    if (!input.rebuilding) return blockedMaterialization(input, entry, error.mark);
    // A rebuild refused before it could read the file has no basis for it: a later lay rebuilds the path from the file.
    refuseArchiveChange(input.root, path, error.mark);
    return { index: withProjectionEntry(input.index, path, unreadRebuildEntry(input, error.mark)), unresolved: true };
  }
}

async function prepareFileContents(input: MaterializationFileInput, entry: RecordEntry): Promise<MaterializationFileResult> {
  const { root, path, record, renderer } = input;
  const prior = input.index.entries[path];
  if (input.rebuilding) entry = await rebuildBasis(input, entry);
  const rendered = input.rendered === undefined ? await renderer({ path, record, content: record.content, stamped: path.endsWith(".md") })
    : { status: "ok" as const, result: input.rendered };
  if (rendered.status === "refused") {
    const mark = markStoreRefusal(rendered.refusal);
    root.context.report?.({ path, copy: null, mark });
    return { index: withProjectionEntry(input.index, path, { ...entry, pending: true, refused: mark }) };
  }
  entry = { ...entry, protected: rendered.result.protected ?? entry.protected };
  if (entry.withheld) return withhold(input, entry);
  const kept = input.rebuilding ? null : await keepSettledFileInPlace({ checkout: root.checkout, path, prior, record,
    rendered: rendered.result, protected: entry.protected, reference: input.reference, format: root.context.format });
  if (kept !== null) return { index: withProjectionEntry(input.index, path, kept) };
  return layFile(input, entry, rendered.result);
}

/** Stage the rendering and guard its replacement, leaving the path pending where a regular file occupies its folder. */
async function layFile(input: MaterializationFileInput, entry: RecordEntry, rendered: RenderedRecord): Promise<MaterializationFileResult> {
  const { root, path, record, renderer } = input;
  const folder = await ensureLayFolder(root.checkout, path, root.context.checkpoint);
  if (folder?.kind === "archive") return blockedMaterialization(input, entry, folder.mark);
  if (folder !== null) {
    root.context.report?.({ path, copy: null, mark: folder.mark });
    return { index: withProjectionEntry(input.index, path, { ...entry, pending: true }), unresolved: true };
  }
  const staged = await stageRenderedRecordFile({ checkout: root.checkout, path, record, replacing: entry.base.blob,
    layMode: projectionLayMode(path, entry), content: rendered.content, notices: rendered.notices,
    rendering: { ...rendered.state, protected: entry.protected },
    readOnly: entry.protected, writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint });
  const guarded = await guardReplacement({ checkout: root.checkout, path, entry, staged,
    saveLanding: isOwnSaveLanding(root.context.verb, root.checkout), reference: input.reference,
    format: root.context.format, store: root.store, writer: root.context.writer, checkpoint: root.context.checkpoint,
    takeIn: root.takeIn, renderer, admitsForcedEdit: input.admitsForcedEdit });
  reportGuardHold(root.context.report, path, null, guarded);
  const index = withProjectionEntry(input.index, path, guarded.entry);
  if (guarded.kind === "replace") return { index, file: { path, replace: guarded } };
  return guarded.cause === "unreadable" ? { index, unresolved: true } : { index };
}

function blockedMaterialization(input: MaterializationFileInput, entry: RecordEntry, mark: RefusedMark): MaterializationFileResult {
  refuseArchiveChange(input.root, input.path, mark);
  const held = { ...entry, pending: true, refused: mark };
  return { index: withProjectionEntry(input.index, input.path, held), unresolved: true };
}

async function rebuildBasis(input: MaterializationFileInput, entry: RecordEntry): Promise<RecordEntry> {
  const absolute = join(input.root.checkout, input.path);
  const reader = projectionFileReader(input.root.checkout, input.path);
  const gate = await gateRead({ path: absolute, markdown: false }, projectionReadGate(input.root.checkout, input.path));
  // Nothing to keep, or a non-file, which the guard holds pending with its own remedy as it does under an index.
  if (gate.kind === "absent" || gate.kind === "no-edit" && gate.deleted === "not-a-file") return entry;
  if (gate.kind !== "read") return { ...entry, stat: await reader.stat(absolute), changed: true, withheld: true };
  const bytes = await reader.read(absolute);
  const after = await reader.stat(absolute);
  const text = bytes.toString("utf8"), markdown = input.path.endsWith(".md");
  const stamp = markdown ? parseStampedFile(text).stamp : null;
  const canMatchEmpty = !markdown && input.path.startsWith(".arc/completed/");
  const safe = (bytes.length > 0 || canMatchEmpty) && isDeepStrictEqual(gate.stat, after)
    && storedBlobId(text, { format: input.root.context.format, markdown }) === (stamp ?? entry.base.blob);
  return { ...entry, stat: gate.stat, written: gitBlobId(bytes, input.root.context.format), changed: true, withheld: !safe };
}

/** Keep a withheld file as it is, reporting its mark: the evidence-held one, or the ordinary withheld one. */
function withhold(input: MaterializationFileInput, entry: ProjectionIndex["entries"][string]): MaterializationFileResult {
  const { checkout } = input.root;
  const mark = isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark(input.path, checkout)
    : withheldProjectionMark(input.path, { checkout, known: entry.kind === "record" });
  input.root.context.report?.({ path: input.path, copy: null, mark });
  return { index: withProjectionEntry(input.index, input.path, { ...entry, refused: mark }) };
}

/** The code an evidence-held mark's reason starts with: rewording its prose never changes which entries are evidence-held. */
const EVIDENCE_HELD_CODE = "evidence-held:";

/**
 * A rebuild could not yet tell whether a stored record lays this path; a later rebuild with whole evidence settles it.
 * An archived path's `arc edit` remedy names the checkout, so the remedy works from any folder.
 */
export function evidenceHeldProjectionMark(path: string, checkout: string): RefusedMark {
  return { reason: `${EVIDENCE_HELD_CODE} The projection could not yet tell whether a stored record lays this path.`,
    remedy: { text: "Resolve the condition reported with it, then run any arc command from the checkout holding this file; "
      + "its rebuild settles the file, refreshing it where unedited. Or copy out anything wanted and delete the file."
      + archivedReapplyInstruction(path, checkout) } };
}

/** A file a rebuild withheld under the held mark, never one awaiting a minted stub; only this mark lets a rebuild settle it. */
export function isEvidenceHeldEntry(entry: ProjectionIndex["entries"][string]): boolean {
  return entry.kind === "ownerless" && entry.withheld === true && entry.minted === undefined
    && entry.refused?.reason.startsWith(EVIDENCE_HELD_CODE) === true;
}

/** Once evidence is whole, a file held for that evidence at a path no record lays takes the ordinary withheld mark. */
export function settleHeldMarks(index: ProjectionIndex, laid: ReadonlyMap<string, unknown>, checkout: string): ProjectionIndex {
  let settled = index;
  for (const [path, entry] of Object.entries(index.entries)) {
    if (!isEvidenceHeldEntry(entry) || laid.has(path)) continue;
    settled = withProjectionEntry(settled, path, { ...entry, refused: withheldProjectionMark(path, { checkout, known: false }) });
  }
  return settled;
}

/**
 * A rebuild cannot establish that these bytes contain no hand edit. An archived file's remedy names `arc edit` from its
 * checkout, and a new archived file's, which nothing projects again and no record lays, the route that keeps it: put back
 * after the next command releases it, then opened and saved.
 */
export function withheldProjectionMark(path: string, at: { readonly checkout: string; readonly known: boolean }): RefusedMark {
  const edit = archiveEditCommand(at.checkout, path);
  return { reason: "withheld: The projection has no trustworthy basis for this file.",
    remedy: { text: !path.startsWith(".arc/completed/")
      ? "Copy out anything wanted, then delete the withheld file and reapply the edit after it is projected again."
      : !at.known
        ? `Copy out anything wanted, then delete the withheld file. To keep it as a new archived file, put it back after the next arc command, then run ${edit} and arc save.`
        : `Copy out anything wanted, then delete the withheld file. Once it is projected again, run ${edit} before reapplying the edit.` } };
}

function archivedReapplyInstruction(path: string, checkout: string): string {
  return path.startsWith(".arc/completed/")
    ? ` Once projected again, run ${archiveEditCommand(checkout, path)} before reapplying any saved correction.` : "";
}
