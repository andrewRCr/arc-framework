/** Prepare one materialized file, trusting existing index evidence or a checked rebuild baseline. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { StoreRecord } from "../read.js";
import { sameReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { RecordRenderer, RenderedRecord } from "./record-render.js";
import { stageRenderedRecordFile } from "./staging.js";
import { gateRead } from "./read-gate.js";
import { readStat } from "./change-detection.js";
import { parseStampedFile, renderStampedFile } from "./stamp.js";
import { gitBlobId, storedBlobId, type ObjectFormat } from "./blob-id.js";
import { withProjectionEntry } from "./index-memory.js";
import { guardReplacement, reportGuardHold } from "./replace-guard.js";
import type { SwapFile } from "./swap.js";
import { markStoreRefusal } from "./refusal-mark.js";
import { installProjectionHandoff } from "./ownership-install.js";
import { keepSettledFileInPlace } from "./settled-in-place.js";
import { ensureLayFolder, occupiedFolderMark } from "./lay-folder.js";

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
}
/**
 * A withheld or pending entry, or one guarded replacement ready for the batch. `unresolved` is set only where a regular
 * file occupies the path's folder, the unlaid case the arrivals check cannot see at a bound path. A caller keeps its
 * state version while this flag is set or `projectionArrivalsInstalled` finds an arrival uninstalled; a pending entry
 * is retried by the next pass either way.
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

/** Stage only proved bytes, and hand a concurrent edit to the live writable store before replacement. */
export async function prepareMaterializationFile(input: MaterializationFileInput): Promise<MaterializationFileResult> {
  const { root, path, record, renderer } = input;
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
  if (input.rebuilding) entry = await rebuildBasis(input, entry);
  const rendered = input.rendered === undefined ? await renderer({ record, content: record.content, stamped: path.endsWith(".md") })
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
  await root.context.checkpoint?.();
  const occupying = await ensureLayFolder(root.checkout, path);
  if (occupying !== null) {
    root.context.report?.({ path, copy: null, mark: occupiedFolderMark(root.checkout, path, occupying) });
    return { index: withProjectionEntry(input.index, path, { ...entry, pending: true }), unresolved: true };
  }
  const staged = await stageRenderedRecordFile({ checkout: root.checkout, path, record, replacing: entry.base.blob,
    content: rendered.content, notices: rendered.notices, rendering: { ...rendered.state, protected: entry.protected },
    readOnly: entry.protected, writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint });
  const guarded = await guardReplacement({ checkout: root.checkout, path, entry, staged, reference: input.reference,
    format: root.context.format, store: root.store, writer: root.context.writer, checkpoint: root.context.checkpoint, takeIn: root.takeIn, renderer });
  reportGuardHold(root.context.report, path, null, guarded);
  return { index: withProjectionEntry(input.index, path, guarded.entry), ...(guarded.kind === "replace" ? { file: { path, replace: guarded } } : {}) };
}

async function rebuildBasis(input: MaterializationFileInput, entry: RecordEntry): Promise<RecordEntry> {
  const absolute = join(input.root.checkout, input.path);
  const gate = await gateRead({ path: absolute, markdown: false });
  // Nothing to keep, or a non-file, which the guard holds pending with its own remedy as it does under an index.
  if (gate.kind === "absent" || gate.kind === "no-edit" && gate.deleted === "not-a-file") return entry;
  if (gate.kind !== "read") return { ...entry, stat: await readStat(absolute), changed: true, withheld: true };
  const bytes = await readFile(absolute);
  const after = await readStat(absolute);
  const text = bytes.toString("utf8"), markdown = input.path.endsWith(".md");
  const stamp = markdown ? parseStampedFile(text).stamp : null;
  const safe = bytes.length > 0 && isDeepStrictEqual(gate.stat, after)
    && storedBlobId(text, { format: input.root.context.format, markdown }) === (stamp ?? entry.base.blob);
  return { ...entry, stat: gate.stat, written: gitBlobId(bytes, input.root.context.format), changed: true, withheld: !safe };
}

/** Keep a withheld file as it is, reporting its mark: the evidence-held one, or the ordinary withheld one. */
function withhold(input: MaterializationFileInput, entry: ProjectionIndex["entries"][string]): MaterializationFileResult {
  const mark = isEvidenceHeldEntry(entry) ? evidenceHeldProjectionMark() : withheldProjectionMark();
  input.root.context.report?.({ path: input.path, copy: null, mark });
  return { index: withProjectionEntry(input.index, input.path, { ...entry, refused: mark }) };
}

/** The code an evidence-held mark's reason starts with: rewording its prose never changes which entries are evidence-held. */
const EVIDENCE_HELD_CODE = "evidence-held:";

/** A rebuild could not yet tell whether a stored record lays this path; a later rebuild with whole evidence settles it. */
export function evidenceHeldProjectionMark(): RefusedMark {
  return { reason: `${EVIDENCE_HELD_CODE} The projection could not yet tell whether a stored record lays this path.`,
    remedy: { text: "Resolve the condition reported with it, then run any arc command from the checkout holding this file; "
      + "its rebuild settles the file, refreshing it where unedited. Or copy out anything wanted and delete the file." } };
}

/** A file a rebuild withheld under the held mark, never one awaiting a minted stub; only this mark lets a rebuild settle it. */
export function isEvidenceHeldEntry(entry: ProjectionIndex["entries"][string]): boolean {
  return entry.kind === "ownerless" && entry.withheld === true && entry.minted === undefined
    && entry.refused?.reason.startsWith(EVIDENCE_HELD_CODE) === true;
}

/** Once evidence is whole, a file held for that evidence at a path no record lays takes the ordinary withheld mark. */
export function settleHeldMarks(index: ProjectionIndex, laid: ReadonlyMap<string, unknown>): ProjectionIndex {
  let settled = index;
  for (const [path, entry] of Object.entries(index.entries)) {
    if (!isEvidenceHeldEntry(entry) || laid.has(path)) continue;
    settled = withProjectionEntry(settled, path, { ...entry, refused: withheldProjectionMark() });
  }
  return settled;
}

/** A rebuild cannot establish that these bytes contain no hand edit. */
export function withheldProjectionMark(): RefusedMark {
  return { reason: "withheld: The projection has no trustworthy basis for this file.",
    remedy: { text: "Copy out anything wanted, then delete the withheld file and reapply the edit after it is projected again." } };
}
