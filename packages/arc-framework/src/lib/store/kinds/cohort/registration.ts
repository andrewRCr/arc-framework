/** Production cohort content decoding behind the store boundary. */
import { defineKindRegistration } from "../../registry.js";
import { parseCohortDocument } from "./parser.js";

/** Preserve structural Parent refusals as record diagnostics. */
export const COHORT_REGISTRATION = defineKindRegistration({ kind: "cohort/document", parser: parseCohortDocument });
