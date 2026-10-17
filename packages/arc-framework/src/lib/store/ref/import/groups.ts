/** Prepare each imported owner's flat retained tree before live or archive placement. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { RefMetadata } from "../metadata.js";
import type { RefTreeEntry } from "../batch-read.js";
import type { ReadPlacement, WritePlacement } from "../../placement.js";
import type { RecordReference } from "../../identity.js";
import { expandStoredPath } from "../../stored-path.js";
import { refFormatKey } from "../format-key.js";
import { writeRefBlob } from "../tree-write.js";

/** One owner's current files and the exact source archive coordinate, when completed. */
export interface ImportGroup {
  reference: RecordReference; metadata: RefMetadata; entries: Map<string, RefTreeEntry>; metadataPath: string; placement?: ReadPlacement;
  candidate?: ImportRecord;
}

/** Group using live homes so multiple ended owners can later share one quarter without sharing metadata. */
export async function prepareImportGroups(context: RefBackendContext, records: readonly ImportRecord[]): Promise<Map<string, ImportGroup>> {
  const groups = new Map<string, ImportGroup>();
  for (const record of records) {
    const home = expandStoredPath(record.reference, { registry: context.registry });
    let group = groups.get(home.ref);
    if (!group) {
      group = { reference: record.reference, metadata: { formatVersion: 1, formats: {},
        ...(/^refs\/arc\/(?:work|cohort)\//u.test(home.ref) ? { slug: record.reference.owner.name } : {}) },
      entries: new Map(), metadataPath: home.metadataPath };
      groups.set(home.ref, group);
    }
    group.entries.set(home.path, { path: home.path, mode: "100644", oid: await writeRefBlob(context, record.content) });
    applyImportMetadata(group, record, context);
  }
  return groups;
}

function applyImportMetadata(group: ImportGroup, record: ImportRecord, context: RefBackendContext): void {
  group.metadata.formats[refFormatKey(record.reference)] = context.registry[record.reference.kind].formatVersion;
  if (record.reference.kind === "lineage/transition" && record.reference.owner.type === "work-item" && record.reference.owner.uid) {
    group.metadata.lineage = { ...group.metadata.lineage, [record.reference.owner.uid]: record.reference.owner.name };
  }
  if (record.formerSlugs) group.metadata.formerSlugs = record.formerSlugs;
  if (record.reference.kind === "review/candidate") group.candidate = record;
  if (record.reference.kind === "work-item/meta" && record.placement) {
    group.metadata.primary = { role: "work-item/meta", placement: writePlacement(record.placement) };
    group.placement = record.placement;
  }
  if (record.reference.kind === "cohort/document" && record.placement?.kind === "completed") {
    group.metadata.placement = { kind: "completed", quarter: record.placement.quarter };
    group.placement = record.placement;
  }
}

function writePlacement(placement: ReadPlacement): WritePlacement {
  return placement.kind === "completed" ? { kind: "completed", quarter: placement.quarter } : placement;
}
