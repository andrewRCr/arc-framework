/** Canonical creation bytes for terminal lineage records. */
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { LineageRecordSchema, type LineageRecord, type WorkItemRef } from "./schema.js";

/** Write a terminal lineage record with canonical list ordering.
 * @param record - Typed terminal transition to create.
 * @returns Canonical JSON bytes with no trailing newline.
 */
export function writeLineageRecord(record: LineageRecord): string {
  const { outgoing, retiredBranches, ...fields } = record;
  const ordered = {
    ...fields,
    origin: definedReference(record.origin),
    successors: orderReferences(record.successors),
    ...(retiredBranches === undefined ? {} : { retiredBranches }),
    incoming: record.incoming.map((entry) => ({
      ...entry,
      dependent: definedReference(entry.dependent),
      disposition: entry.disposition.kind === "replace"
        ? { ...entry.disposition, replacementTargets: orderReferences(entry.disposition.replacementTargets) }
        : entry.disposition,
    })).sort((left, right) => compareNames(left.dependent, right.dependent)),
    ...(outgoing === undefined ? {} : {
      outgoing: outgoing.map((entry) => ({
        ...entry, prerequisite: definedReference(entry.prerequisite), members: orderReferences(entry.members),
      })).sort((left, right) => compareNames(left.prerequisite, right.prerequisite)),
    }),
  };
  return canonicalize(LineageRecordSchema.parse(ordered));
}

function definedReference(reference: WorkItemRef): WorkItemRef {
  const { uid, ...fields } = reference;
  return uid === undefined ? fields : { ...fields, uid };
}

function orderReferences(references: readonly WorkItemRef[]): WorkItemRef[] {
  return references.map(definedReference).sort(compareNames);
}

function compareNames(left: WorkItemRef, right: WorkItemRef): number {
  return Buffer.compare(Buffer.from(left.name, "utf8"), Buffer.from(right.name, "utf8"));
}
