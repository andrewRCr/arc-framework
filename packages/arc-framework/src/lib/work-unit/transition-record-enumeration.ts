/** Validate and group one complete transition-record namespace snapshot. */

import {
  parseTransitionRecord,
  type TransitionRecord,
} from "./transition-record.js";
import { SlugSchema } from "../kernel/schema/slug.js";

const decoder = new TextDecoder("utf-8", { fatal: true });
const RECORD_FILENAME_PATTERN = /^([^/]+)\.json$/u;

/** One raw Git namespace entry supplied without a repository path. */
export interface TransitionRecordEnumerationEntry {
  filename: string;
  mode: string;
  type: string;
  content: Uint8Array;
}

/** All transition records whose content names the same origin. */
export interface TransitionRecordOriginGroup {
  origin: string;
  records: readonly TransitionRecord[];
}

/** Complete namespace result before an origin-specific projection. */
export type TransitionRecordEnumerationResult =
  | { status: "valid"; groups: readonly TransitionRecordOriginGroup[] }
  | { status: "namespace-corrupt"; filename?: string };

/** Validate every entry before exposing deterministic content-origin groups. */
export function validateTransitionRecordEnumeration(
  entries: readonly TransitionRecordEnumerationEntry[],
): TransitionRecordEnumerationResult {
  const recordsByOrigin = new Map<string, TransitionRecord[]>();
  const orderedEntries = [...entries].sort((left, right) =>
    compareUtf8(left.filename, right.filename)
    || Buffer.compare(Buffer.from(left.content), Buffer.from(right.content)));
  for (const entry of orderedEntries) {
    const filenameMatch = RECORD_FILENAME_PATTERN.exec(entry.filename);
    if (entry.mode !== "100644"
      || entry.type !== "blob"
      || filenameMatch?.[1] === undefined
      || !SlugSchema.safeParse(filenameMatch[1]).success) {
      return { status: "namespace-corrupt", filename: entry.filename };
    }
    let content: string;
    try {
      content = decoder.decode(entry.content);
    } catch {
      return { status: "namespace-corrupt", filename: entry.filename };
    }
    const record = parseTransitionRecord(content);
    if (record === null) {
      return { status: "namespace-corrupt", filename: entry.filename };
    }
    const records = recordsByOrigin.get(record.origin) ?? [];
    records.push(record);
    recordsByOrigin.set(record.origin, records);
  }
  return {
    status: "valid",
    groups: [...recordsByOrigin.entries()]
      .sort(([left], [right]) => compareUtf8(left, right))
      .map(([origin, records]) => ({ origin, records })),
  };
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}
