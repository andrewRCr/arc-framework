/** Registered parsing for the never-projected cut-map machine record. */
import { defineKindRegistration, KIND_MECHANISMS } from "../../registry.js";
import { decodeCutMapContent } from "./parser.js";
import { checkCutMapBinding } from "./check.js";

/** Install the completed-map parser and atomic native admission check. */
export const CUT_MAP_REGISTRATION = defineKindRegistration({ kind: "work-item/cut-map", parser: decodeCutMapContent,
  check: input => checkCutMapBinding(input, KIND_MECHANISMS["work-item/inbound"].entry), });
