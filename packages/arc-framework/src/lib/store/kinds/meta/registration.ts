/** The meta kind's content parser, rule catalog, and shared write declarations. */

import { parseMetaRecord } from "../../../active/meta-reader.js";
import { checkMetaRecord } from "./check.js";
import { defineKindRegistration, KIND_MECHANISMS } from "../../registry.js";

/** Install the tolerant parser, complete check, and state-version handoff anchor. */
export const META_REGISTRATION = defineKindRegistration({
  kind: "work-item/meta",
  check: (input) => checkMetaRecord(input, KIND_MECHANISMS["work-item/inbound"].entry),
  anchorFields: ["stateAtHandoff"],
  parser: (content: string) => {
    try { return { success: true as const, data: parseMetaRecord(content) }; }
    catch (error) { return { success: false as const, error: error instanceof Error ? error.message : String(error) }; }
  },
});
