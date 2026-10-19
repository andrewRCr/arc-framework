/** One production registration set shared by storage backends. */

import { ENTRY_REGISTRATIONS, ROUTING_RECEIPT_REGISTRATIONS } from "./entry-registration.js";
import { FAMILY_REGISTRY, KIND_MECHANISMS, type RegisteredKind } from "../registry.js";
import { familyOf, type KindId } from "../catalog.js";
import { checkRecordLinks } from "./record-links.js";
import { ERRAND_RECORD_REGISTRATION } from "./errand-record/registration.js";
import { META_REGISTRATION } from "./meta/registration.js";
import { LINEAGE_REGISTRATION } from "./lineage/registration.js";
import { TASK_LIST_REGISTRATION } from "./task-list/registration.js";
import { DESIGN_REGISTRATIONS } from "./design/registration.js";
import { COHORT_REGISTRATION } from "./cohort/registration.js";

/** Projecting kinds whose stored Markdown receives the shared link checks. */
export const RECORD_LINK_KINDS: readonly KindId[] = (Object.keys(KIND_MECHANISMS) as KindId[]).filter(kind =>
  KIND_MECHANISMS[kind].projection !== "never" && FAMILY_REGISTRY[familyOf(kind)].ref !== null
  && kind !== "personal/errand-queue");

function composeLinkChecks(registrations: readonly RegisteredKind[]): readonly RegisteredKind[] {
  const covered = new Set(RECORD_LINK_KINDS);
  const registered = new Set(registrations.map(item => item.kind));
  return [
    ...registrations.map((item): RegisteredKind => covered.has(item.kind) ? {
      ...item,
      check: async input => [...await item.check?.(input) ?? [], ...await checkRecordLinks(input)],
    } : item),
    ...RECORD_LINK_KINDS.filter(kind => !registered.has(kind)).map(kind => ({ kind, check: checkRecordLinks })),
  ];
}

/** Parsers, write checks, and anchors owned by each record kind. */
export const PRODUCTION_REGISTRATIONS: readonly RegisteredKind[] = composeLinkChecks([
  ...ENTRY_REGISTRATIONS, ...ROUTING_RECEIPT_REGISTRATIONS, ERRAND_RECORD_REGISTRATION, META_REGISTRATION, LINEAGE_REGISTRATION, TASK_LIST_REGISTRATION, ...DESIGN_REGISTRATIONS, COHORT_REGISTRATION,
]);
