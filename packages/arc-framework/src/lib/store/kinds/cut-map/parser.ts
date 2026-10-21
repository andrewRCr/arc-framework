/** Pure decoding of completed record-bound cut maps. */
import { decodeCutMap } from "../../../decompose/cut-map-decode.js";
import { StoredCutMapSchema, type StoredCutMap } from "./schema.js";

/** Decode stored JSON into a completed cut map, retaining the first rejected locus. */
export function decodeCutMapContent(content: string): { success: true; data: StoredCutMap } | { success: false; error: string } {
  let candidate: unknown;
  try { candidate = JSON.parse(content) as unknown; }
  catch (error) { return { success: false, error: `JSON: ${error instanceof Error ? error.message : String(error)}` }; }
  const wrapper = StoredCutMapSchema.safeParse(candidate);
  if (!wrapper.success) return { success: false, error: wrapper.error.issues.map(issue => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ") };
  const parsed = decodeCutMap(wrapper.data.map);
  return parsed.status === "accepted" ? { success: true, data: { ...wrapper.data, map: parsed.value } } : {
    success: false, error: `${parsed.issue.code} ${parsed.issue.path || "(root)"}: ${parsed.issue.message}`,
  };
}
