/** Prepare one materialized file, trusting existing index evidence or a checked rebuild baseline. */
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { StoreRecord } from "../read.js";
import { sameReference } from "../identity.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionIndex, RecordEntry, RefusedMark } from "./index-schema.js";
import type { RecordRenderer } from "./record-render.js";
import { stageRenderedRecordFile } from "./staging.js";
import { gateRead } from "./read-gate.js";
import { readStat } from "./change-detection.js";
import { parseStampedFile, renderStampedFile } from "./stamp.js";
import { gitBlobId, storedBlobId, type ObjectFormat } from "./blob-id.js";
import { withProjectionEntry } from "./index-memory.js";
import { guardReplacement } from "./replace-guard.js";
import type { SwapFile } from "./swap.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** A caller's complete rendering and replacement context for one target path. */
export interface MaterializationFileInput {
  readonly root: ProjectionRootState;
  readonly index: ProjectionIndex;
  readonly path: string;
  readonly record: StoreRecord;
  readonly renderer: RecordRenderer;
  readonly rebuilding: boolean;
  readonly reference: bigint | null;
  readonly blocked: boolean;
}
/** A held entry or one guarded replacement ready for the batch. */
export interface MaterializationFileResult { readonly index: ProjectionIndex; readonly file?: SwapFile }

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
  if (prior?.withheld) return hold(input, prior);
  let entry = prior?.kind === "record" ? prior : projectionEntryForRecord(record, path, root.context.format);
  if (prior?.kind === "record" && !sameReference(prior.reference, record.reference)) {
    const mark = { reason: "The path is still bound to another record.", remedy: { text: "Refresh its previous owner before laying this record." } };
    root.context.report?.({ path, copy: null, mark });
    return { index: withProjectionEntry(input.index, path, { ...prior, pending: true, refused: mark }) };
  }
  if (input.rebuilding) entry = await rebuildBasis(input, entry);
  if (input.blocked) entry = { ...entry, withheld: true, pending: true };
  const rendered = await renderer({ record, content: record.content, stamped: path.endsWith(".md") });
  if (rendered.status === "refused") {
    const mark = markStoreRefusal(rendered.refusal);
    root.context.report?.({ path, copy: null, mark });
    return { index: withProjectionEntry(input.index, path, { ...entry, pending: true, refused: mark }) };
  }
  entry = { ...entry, protected: rendered.result.protected ?? entry.protected };
  if (entry.withheld) return hold(input, entry);
  await root.context.checkpoint?.();
  await mkdir(join(root.checkout, dirname(path)), { recursive: true });
  const staged = await stageRenderedRecordFile({ checkout: root.checkout, path, record, replacing: entry.base.blob,
    content: rendered.result.content, notices: rendered.result.notices, rendering: { ...rendered.result.state, protected: entry.protected },
    readOnly: entry.protected, writer: root.context.writer, format: root.context.format, checkpoint: root.context.checkpoint });
  const guarded = await guardReplacement({ checkout: root.checkout, path, entry, staged, reference: input.reference,
    format: root.context.format, store: root.store, writer: root.context.writer, checkpoint: root.context.checkpoint, takeIn: root.takeIn, renderer });
  return { index: withProjectionEntry(input.index, path, guarded.entry), ...(guarded.kind === "replace" ? { file: { path, replace: guarded } } : {}) };
}

async function rebuildBasis(input: MaterializationFileInput, entry: RecordEntry): Promise<RecordEntry> {
  if (input.blocked) return { ...entry, withheld: true };
  const absolute = join(input.root.checkout, input.path);
  const gate = await gateRead({ path: absolute, markdown: false });
  if (gate.kind === "absent") return entry;
  if (gate.kind !== "read") return { ...entry, stat: await readStat(absolute), changed: true, withheld: true };
  const bytes = await readFile(absolute);
  const after = await readStat(absolute);
  const text = bytes.toString("utf8"), markdown = input.path.endsWith(".md");
  const stamp = markdown ? parseStampedFile(text).stamp : null;
  const safe = bytes.length > 0 && isDeepStrictEqual(gate.stat, after)
    && storedBlobId(text, { format: input.root.context.format, markdown }) === (stamp ?? entry.base.blob);
  return { ...entry, stat: gate.stat, written: gitBlobId(bytes, input.root.context.format), changed: true, withheld: !safe };
}

function hold(input: MaterializationFileInput, entry: ProjectionIndex["entries"][string]): MaterializationFileResult {
  const mark = withheldProjectionMark();
  input.root.context.report?.({ path: input.path, copy: null, mark });
  return { index: withProjectionEntry(input.index, input.path, { ...entry, refused: mark }) };
}

/** A rebuild cannot establish that these bytes contain no hand edit. */
export function withheldProjectionMark(): RefusedMark {
  return { reason: "withheld: The projection has no trustworthy basis for this file.",
    remedy: { text: "Copy out anything wanted, then delete the withheld file and reapply the edit after it is projected again." } };
}
