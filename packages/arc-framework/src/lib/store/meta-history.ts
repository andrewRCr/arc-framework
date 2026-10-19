/** Decode exact historical meta bytes through the storage kind's parser. */
import { parseMetaRecord } from "../active/meta-reader.js";
import { ParsedMetaRecordSchema, type ParsedMetaRecord } from "../active/meta-schema.js";

/** Recover historical fields without treating provenance as the historical Owner.
 * @param content - Exact meta content retained in a Store history entry.
 * @returns Validated historical semantic fields.
 */
export function decodeMetaHistoryContent(content: string): ParsedMetaRecord {
  return ParsedMetaRecordSchema.parse(parseMetaRecord(content));
}
