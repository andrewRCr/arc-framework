/** Prepare each imported owner's flat retained tree before live or archive placement. */
import type { RefBackendContext } from "../context.js";
import type { ImportCandidateSource, ImportRecord } from "./source.js";
import type { RefMetadata } from "../metadata.js";
import type { RefTreeEntry } from "../batch-read.js";
import type { ReadPlacement, WritePlacement } from "../../placement.js";
import type { RecordReference } from "../../identity.js";
import { expandStoredPath } from "../../stored-path.js";
import { refFormatKey } from "../format-key.js";
import { writeRefBlob } from "../tree-write.js";
import { mergeLineageAliases } from "../lineage-aliases.js";

/** One owner's current files and the exact source archive coordinate, when completed. */
export interface ImportGroup {
  reference: RecordReference; metadata: RefMetadata; entries: Map<string, RefTreeEntry>; metadataPath: string; placement?: ReadPlacement;
  replays: { reference: RecordReference; contents: readonly string[] }[];
}

/** Group using live homes so multiple ended owners can later share one quarter without sharing metadata. */
export async function prepareImportGroups(context: RefBackendContext, records: readonly ImportRecord[],
  candidates: readonly ImportCandidateSource[]): Promise<Map<string, ImportGroup>> {
  const groups = new Map<string, ImportGroup>();
  for (const record of records) {
    const home = expandStoredPath(record.reference, { registry: context.registry });
    let group = groups.get(home.ref);
    if (!group) {
      group = { reference: record.reference, metadata: { formatVersion: 1, formats: {},
        ...(/^refs\/arc\/(?:work|cohort)\//u.test(home.ref) ? { slug: record.reference.owner.name } : {}) },
      entries: new Map(), metadataPath: home.metadataPath, replays: [] };
      groups.set(home.ref, group);
    }
    group.entries.set(home.path, { path: home.path, mode: "100644", oid: await writeRefBlob(context, record.content) });
    applyImportMetadata(group, record, context);
  }
  for (const candidate of candidates) {
    if (!candidate.versions.length) continue;
    const group = groups.get(expandStoredPath(candidate.reference, { registry: context.registry }).ref);
    if (!group) throw new Error("Candidate history has no imported owner");
    group.replays.push({ reference: candidate.reference, contents: candidate.versions.map(version => version.content) });
  }
  const evidence = records.flatMap(({ reference, formerSlugs }) => reference.owner.type === "work-item"
    && reference.owner.uid && formerSlugs?.length ? [{ [reference.owner.uid]: formerSlugs }] : []);
  const aliases = mergeLineageAliases(...evidence);
  if (aliases) {
    const registry = groups.get("refs/arc/project/registry");
    if (!registry) throw new Error("The import did not prepare its project registry");
    registry.metadata.lineageFormerSlugs = aliases;
  }
  return groups;
}

function applyImportMetadata(group: ImportGroup, record: ImportRecord, context: RefBackendContext): void {
  group.metadata.formats[refFormatKey(record.reference)] = context.registry[record.reference.kind].formatVersion;
  if (record.reference.kind === "lineage/transition" && record.reference.owner.type === "work-item" && record.reference.owner.uid) {
    group.metadata.lineage = { ...group.metadata.lineage, [record.reference.owner.uid]: record.reference.owner.name };
  }
  if (record.formerSlugs && record.reference.kind !== "lineage/transition") group.metadata.formerSlugs = record.formerSlugs;
  if (record.mappedVersions) group.replays.push({ reference: record.reference, contents: record.mappedVersions });
  if ((record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record") && record.placement) {
    group.metadata.primary = { role: record.reference.kind, placement: writePlacement(record.placement),
      ...(record.links ? { links: record.links } : {}) };
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
