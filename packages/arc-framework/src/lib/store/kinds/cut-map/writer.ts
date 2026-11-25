/** Canonical storage bytes for completed cut maps. */
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { StoredCutMapSchema, type StoredCutMap } from "./schema.js";

/** Render one completed map as canonical JSON with no trailing newline. */
export function writeCutMapRecord(stored: StoredCutMap): string {
  return canonicalize(StoredCutMapSchema.parse(stored));
}
