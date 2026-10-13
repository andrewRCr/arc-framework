/** Registered content parsing for the create-only lineage kind. */
import { defineKindRegistration, KIND_MECHANISMS } from "../../registry.js";
import { decodeLineageContent } from "./parser.js";
import { checkLineageRecord } from "./check.js";

/** Install the closed terminal-lineage content parser. */
export const LINEAGE_REGISTRATION = defineKindRegistration({ kind: "lineage/transition", parser: decodeLineageContent,
  check: (input) => checkLineageRecord(input, KIND_MECHANISMS["work-item/inbound"].entry), });
