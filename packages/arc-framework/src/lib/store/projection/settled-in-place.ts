/** A settled file whose record still renders to the bytes it holds stays in place; only its entry takes the record's version. */
import { join } from "node:path";
import type { StoreRecord } from "../read.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";
import { checkChange, projectionFileReader } from "./change-detection.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { RenderedRecord } from "./record-render.js";
import { renderedRecordText } from "./staging.js";

/** One planned file's entry before this command and the rendering its record now lays. */
export interface SettledInPlaceInput {
  readonly checkout: string;
  /** The file's repository-relative path. */
  readonly path: string;
  readonly prior: ProjectionIndex["entries"][string] | undefined;
  readonly record: StoreRecord;
  readonly rendered: RenderedRecord;
  /** Whether the rendering lays the file read-only. */
  readonly protected: boolean;
  /** The racy-clean reference time a stat match must precede, null where none was read. */
  readonly reference: bigint | null;
  readonly format: ObjectFormat;
}

/**
 * Keep a settled file in place when its record renders to the bytes it was laid with, under the same protection, and the
 * file still holds them.
 * @param input - The path, its prior entry, and the record's rendering.
 * @returns The entry a replacement would have settled, the file's own stat kept, or null where the file must be laid.
 */
export async function keepSettledFileInPlace(input: SettledInPlaceInput): Promise<RecordEntry | null> {
  const { prior, format } = input;
  if (prior?.kind !== "record" || !isSettled(prior) || prior.protected !== input.protected) return null;
  const text = renderedRecordText({ path: input.path, record: input.record, content: input.rendered.content,
    notices: input.rendered.notices, format });
  if (gitBlobId(text, format) !== prior.written) return null;
  const reader = projectionFileReader(input.checkout, input.path);
  const verdict = await checkChange({ path: join(input.checkout, input.path), recorded: prior.stat, written: prior.written,
    reference: input.reference, format }, reader.read, reader.stat);
  if (verdict.status !== "clean" && verdict.status !== "hashed-clean") return null;
  return { ...prior, ...input.rendered.state, protected: input.protected, stat: verdict.stat, pending: false,
    base: { blob: gitBlobId(input.record.content, format), version: input.record.version } };
}

/** A file laid and confirmed: nothing awaits it, holds it, or is still being written or recorded for it. */
function isSettled(entry: RecordEntry): boolean {
  return !entry.pending && !entry.withheld && entry.refused === null && entry.inProgress === null
    && entry.handoff === undefined && entry.adoption === undefined && entry.persisted?.recording !== true;
}
