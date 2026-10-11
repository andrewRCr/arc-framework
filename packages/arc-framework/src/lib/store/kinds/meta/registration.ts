/** The meta kind's content parser and shared write declarations. */

import { parseMetaRecord } from "../../../active/meta-reader.js";
import { defineKindRegistration } from "../../registry.js";

/** Install the tolerant meta parser and declare its state-version handoff anchor. */
export const META_REGISTRATION = defineKindRegistration({
  kind: "work-item/meta",
  anchorFields: ["stateAtHandoff"],
  parser: (content: string) => {
    try { return { success: true as const, data: parseMetaRecord(content) }; }
    catch (error) { return { success: false as const, error: error instanceof Error ? error.message : String(error) }; }
  },
});
