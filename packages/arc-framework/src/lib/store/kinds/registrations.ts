/** One production registration set shared by storage backends. */

import type { RegisteredKind } from "../registry.js";
import { META_REGISTRATION } from "./meta/registration.js";

/** Parsers, write checks, and anchors owned by each record kind. */
export const PRODUCTION_REGISTRATIONS: readonly RegisteredKind[] = [META_REGISTRATION];
