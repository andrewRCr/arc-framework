/** Pure decoding of completed record-bound cut maps. */
import { decodeCutMap } from "../../../decompose/cut-map-decode.js";
import type { CutMap } from "../../../decompose/cut-map-schema.js";

/** Decode stored JSON into a completed cut map, retaining the first rejected locus. */
export function decodeCutMapContent(content: string): { success: true; data: CutMap } | { success: false; error: string } {
  let candidate: unknown;
  try { candidate = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const parsed = decodeCutMap(candidate);
  return parsed.status === "accepted" ? { success: true, data: parsed.value } : {
    success: false, error: `${parsed.issue.code} ${parsed.issue.path || "(root)"}: ${parsed.issue.message}`,
  };
}
