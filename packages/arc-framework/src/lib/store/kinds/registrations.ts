/** One production registration set shared by storage backends. */

import type { RegisteredKind } from "../registry.js";
import { ERRAND_RECORD_REGISTRATION } from "./errand-record/registration.js";
import { META_REGISTRATION } from "./meta/registration.js";
import { LINEAGE_REGISTRATION } from "./lineage/registration.js";
import { TASK_LIST_REGISTRATION } from "./task-list/registration.js";
import { DESIGN_REGISTRATIONS } from "./design/registration.js";
import { COHORT_REGISTRATION } from "./cohort/registration.js";

/** Parsers, write checks, and anchors owned by each record kind. */
export const PRODUCTION_REGISTRATIONS: readonly RegisteredKind[] = [
  ERRAND_RECORD_REGISTRATION, META_REGISTRATION, LINEAGE_REGISTRATION, TASK_LIST_REGISTRATION, ...DESIGN_REGISTRATIONS, COHORT_REGISTRATION,
];
