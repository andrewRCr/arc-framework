/** Resolve the current work unit's named live cohort copies without guessing through ambiguity. */
import { validateCohortPath } from "../../active/cohort-path.js";
import { ParsedMetaRecordSchema } from "../../active/meta-schema.js";
import { SlugSchema } from "../../kernel/index.js";
import { resolveArcPath } from "../../layout/index.js";
import { ParsedCohortDocumentSchema } from "../kinds/cohort/parser.js";
import { sameOwner, OwnerIdentitySchema, recordReferences, type OwnerIdentity } from "../identity.js";
import type { StoreRecord } from "../read.js";
import type { ProjectionRootState } from "./process-state.js";
import type { ProjectionInventory } from "./inventory.js";
import { markStoreRefusal } from "./refusal-mark.js";

/** Resolve each membership name through the store's current/former-name authority. */
export async function addCurrentCohortCopies(root: ProjectionRootState, inventory: ProjectionInventory, own: OwnerIdentity | null,
  files: Map<string, StoreRecord>): Promise<void> {
  if (own === null || root.claim === null) return;
  const primary = inventory.records.find(record => record.reference.kind === "work-item/meta" && sameOwner(record.reference.owner, own));
  if (primary === undefined) return;
  const membership = ParsedMetaRecordSchema.parse(primary.fields).cohort;
  if (membership === null || validateCohortPath(membership) !== null) return;
  const names = membership.split("/");
  for (const [level, name] of names.entries()) {
    const cohort = SlugSchema.parse(name);
    const read = await inventory.source.read({ reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: cohort })) });
    if (read.status === "refused") {
      root.context.report?.({ path: root.checkout, copy: null, mark: markStoreRefusal(read.refusal) });
      continue;
    }
    if (read.result.placement !== undefined || ParsedCohortDocumentSchema.parse(read.result.fields).parent !== (names[level - 1] ?? null)) {
      root.context.report?.({ path: root.checkout, copy: null, mark: { reason: `No live cohort ${name} has the required Parent.`,
        remedy: { text: "Repair the work unit's Cohort field or the cohort document's Parent, then refresh again." } } });
      continue;
    }
    files.set(resolveArcPath({ kind: "cohort-copy", cohort, location: { kind: "own", claim: root.claim, layoutActive: root.layoutActive } }), read.result);
  }
}
