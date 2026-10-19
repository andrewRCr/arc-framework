/** Canonical storage bytes for completed cut maps. */
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { CutMapSchema, type CutMap } from "../../../decompose/cut-map-schema.js";

/** Render one completed map as canonical JSON with no trailing newline. */
export function writeCutMapRecord(map: CutMap): string {
  return canonicalize(CutMapSchema.parse(map));
}
