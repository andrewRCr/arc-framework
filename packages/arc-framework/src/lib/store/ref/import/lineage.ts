/** Re-home legacy transitions as UID-bound terminal lineage or former owner names. */
import { randomUUID } from "node:crypto";
import type { RefBackendContext } from "../context.js";
import type { MigrateReport } from "../../commands.js";
import type { ImportRecord } from "./source.js";
import { RecordReferenceSchema, type StateVersion } from "../../identity.js";
import { LineageRecordSchema, writeLineageRecord, type WorkItemRef, type LineageRecord } from "../../kinds/lineage/index.js";
import { SlugSchema } from "../../../kernel/schema/slug.js";

/** Acquire transitions at the importing head after every held work item's UID has been assigned. */
export async function appendImportLineage(context: RefBackendContext, report: MigrateReport, records: ImportRecord[],
  owners: Map<string, string>, asOf: StateVersion): Promise<void> {
  if (!context.importSource) throw new Error("No import source bound");
  const listing = await context.importSource.store.list({ family: "lineage", kind: "lineage/transition", asOf });
  if (listing.status === "refused") { report.notices.push({ condition: listing.refusal.condition, remedy: listing.refusal.remedy }); return; }
  if (listing.result.status === "unreadable") { report.notices.push({ condition: listing.result.condition, remedy: listing.result.remedy }); return; }
  if (listing.result.status !== "complete") return;
  report.notices.push(...listing.result.diagnostics.map(({ condition, remedy }) => ({ condition, remedy })));
  const transitions = listing.result.records.map((record) => ({ record, fields: LineageRecordSchema.parse(JSON.parse(record.content)) }));
  for (const { fields } of transitions.filter(({ fields }) => fields.kind !== "rename")) {
    const key = `work-item:${fields.origin.name}`;
    if (!owners.has(key)) owners.set(key, randomUUID());
  }
  for (const { record, fields } of transitions.filter(({ fields }) => fields.kind !== "rename")) {
    const mapped = bindLineageUids(fields, owners);
    records.push({ ...record, reference: RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner,
      uid: mapped.origin.uid } }), content: writeLineageRecord(mapped) });
  }
  const renames = new Map(transitions.filter(({ fields }) => fields.kind === "rename")
    .map(({ fields }) => [fields.origin.name, fields]));
  for (const fields of renames.values()) importRename(records, fields, renames, owners, report);
}

function importRename(records: ImportRecord[], fields: LineageRecord, renames: ReadonlyMap<string, LineageRecord>,
  owners: ReadonlyMap<string, string>, report: MigrateReport): void {
  const visited = new Set<string>([fields.origin.name]);
  let name = fields.successors[0]?.name;
  while (name && renames.has(name) && !visited.has(name)) {
    visited.add(name);
    name = renames.get(name)?.successors[0]?.name;
  }
  const uid = name && !visited.has(name) ? owners.get(`work-item:${name}`) : undefined;
  const targets = uid ? records.filter(({ reference }) => reference.owner.type === "work-item" && reference.owner.uid === uid
    && (reference.kind === "work-item/meta" || reference.kind === "lineage/transition")) : [];
  if (!targets.length) {
    report.notices.push({ condition: `The rename from ${fields.origin.name} has no imported successor primary or terminal origin.`,
      remedy: { text: "Restore the rename chain and its successor meta or terminal record, then retry the import." } });
    return;
  }
  for (const target of targets) target.formerSlugs = [...new Set([...(target.formerSlugs ?? []), SlugSchema.parse(fields.origin.name)])];
}

function bindLineageUids(record: LineageRecord, owners: ReadonlyMap<string, string>): LineageRecord {
  const bind = (reference: WorkItemRef): WorkItemRef => {
    const uid = owners.get(`work-item:${reference.name}`);
    return uid ? { ...reference, uid } : reference;
  };
  return { ...record, origin: bind(record.origin), successors: record.successors.map(bind),
    incoming: record.incoming.map((entry) => ({ dependent: bind(entry.dependent), disposition: entry.disposition.kind === "replace"
      ? { ...entry.disposition, replacementTargets: entry.disposition.replacementTargets.map(bind) } : entry.disposition })),
    ...(record.outgoing ? { outgoing: record.outgoing.map((entry) => ({ prerequisite: bind(entry.prerequisite), members: entry.members.map(bind) })) } : {}) };
}
