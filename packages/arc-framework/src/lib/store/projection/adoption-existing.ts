/** Bind an unindexed file to an existing stored record before ordinary write-back recovers its base. */
import type { StoreRecord } from "../read.js";
import type { ProjectionIndex, RecordEntry } from "./index-schema.js";
import type { ProjectionRootState } from "./process-state.js";
import type { TakeInRead } from "./take-in-port.js";
import { gitBlobId } from "./blob-id.js";
import { commitProjectionIndex } from "./index-file.js";

/** Retain exact stored authority and the observed file while its first ordinary hand edit remains unsent. */
export function attachExistingProjectionFile(root: ProjectionRootState, index: ProjectionIndex, path: string,
  record: StoreRecord, read: TakeInRead): Promise<ProjectionIndex> {
  const entry: RecordEntry = { kind: "record", reference: record.reference, stat: read.stat, written: read.blob,
    base: { blob: gitBlobId(record.content, root.context.format), version: record.version },
    markers: null, notices: [], unshown: record.conflicts, protected: false, changed: true, pending: true,
    withheld: false, refused: null, persisted: null, inProgress: null, copies: [], adoption: { kind: "write-back" } };
  return commitProjectionIndex({ location: root.location, checkout: root.checkout,
    index: { ...index, entries: { ...index.entries, [path]: entry } }, checkpoint: root.context.checkpoint });
}
