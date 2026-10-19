/** Registered parsing for the never-projected cut-map machine record. */
import { defineKindRegistration } from "../../registry.js";
import { decodeCutMapContent } from "./parser.js";

/** Install the completed-map parser without a hand-edit write check. */
export const CUT_MAP_REGISTRATION = defineKindRegistration({ kind: "work-item/cut-map", parser: decodeCutMapContent });
