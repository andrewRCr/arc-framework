/** Staging a record's file: its bytes written exclusively into the aside folder, ready to link onto its path. */
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import type { RecordVersion } from "../identity.js";
import type { StoreRecord } from "../read.js";
import { createStagedFile, nameAsideFile, type AsideWriterInput } from "./aside.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { renderStampedFile } from "./stamp.js";
import type { RecordEntry, RefusedMark } from "./index-schema.js";

/** Rendering metadata applies only when this staged file wins replacement. */
export interface RenderedFileState {
  readonly markers: RecordEntry["markers"];
  readonly notices: RecordEntry["notices"];
  readonly unshown: RecordEntry["unshown"];
  readonly refused?: RefusedMark | null;
  readonly keepPending?: boolean;
}

/** A staged file: where it sits, the blob id of the bytes it holds, and the stored version it lays. */
export interface StagedFile {
  /** Its repository-relative location in the aside folder. */
  readonly location: string;
  readonly written: string;
  readonly base: { readonly blob: string; readonly version: RecordVersion };
  readonly rendering?: RenderedFileState;
}

/**
 * Stage a record's file for its path: a Markdown file stamped with its stored content's blob id, any other as stored.
 * @param input - The checkout, the file's repository-relative path, the record, the base blob id of the version the
 *   file now holds, the writer, the object format, and whether the file is staged read-only, as a protected one is.
 * @returns The staged file.
 */
export async function stageRecordFile(input: {
  checkout: string; path: string; record: StoreRecord; replacing: string; writer: AsideWriterInput; format: ObjectFormat;
  readOnly?: boolean;
}): Promise<StagedFile> {
  return stageRenderedRecordFile({ ...input, content: input.record.content,
    rendering: { markers: null, notices: [], unshown: input.record.conflicts } });
}

/** Stage rendered content under the stored record's base stamp and version. */
export async function stageRenderedRecordFile(input: {
  checkout: string; path: string; record: StoreRecord; replacing: string; writer: AsideWriterInput; format: ObjectFormat;
  content: string; markerLength?: number; readOnly?: boolean; rendering?: RenderedFileState;
}): Promise<StagedFile> {
  const { record, format } = input;
  const blob = gitBlobId(record.content, format);
  const text = input.path.endsWith(".md") ? renderStampedFile({ content: input.content, stamp: blob }) : input.content;
  const location = nameAsideFile({ path: input.path, base: input.replacing, writer: input.writer, role: "staged" });
  await createStagedFile(input.checkout, location, text);
  // A link shares its file's mode, so a protected file is staged read-only and linked in that way.
  if (input.readOnly === true) await chmod(join(input.checkout, location), 0o444);
  return { location, written: gitBlobId(text, format), base: { blob, version: record.version },
    ...(input.rendering === undefined ? {} : { rendering: input.rendering }) };
}
