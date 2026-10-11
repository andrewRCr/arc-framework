/** Registered content parsing for the create-only lineage kind. */
import { defineKindRegistration } from "../../registry.js";
import { decodeLineageContent } from "./parser.js";

/** Install the closed terminal-lineage content parser. */
export const LINEAGE_REGISTRATION = defineKindRegistration({ kind: "lineage/transition", parser: decodeLineageContent });
