/** Validate imported records and prepare isolated commit trees without running write checks. */
import type { RefBackendContext } from "../context.js";
import type { ImportCandidateSource, ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { checkSerializationRules } from "../../serialization.js";
import { checkRefKey, checkRefBatchPaths } from "../path-admission.js";
import { prepareRefPut } from "../prepare-content.js";
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { commitRefTree } from "../write-commits.js";
import { writeRefBlob } from "../tree-write.js";
import { prepareImportGroups } from "./groups.js";
import { addImportArchive, type ImportQuarter } from "./archive.js";
import { replayImportVersions } from "./candidate.js";
import { expandStoredPath } from "../../stored-path.js";
import { reportImportAdmission, reportImportPutFailure } from "./admission.js";
import { RecordReferenceSchema } from "../../identity.js";

/** Admit every record before any prepared commit can become visible. */
export function prepareImportRecords(context: RefBackendContext, records: ImportRecord[], report: MigrateReport): ImportRecord[] {
  const prepared: ImportRecord[] = [];
  for (const record of records) {
    const admitted = prepareImportRecord(context, record, report);
    if (admitted) prepared.push(admitted);
  }
  const unique = reconcilePersonalDestinations(prepared, report);
  const collision = checkRefBatchPaths(unique.map(({ reference }) => reference), context.registry);
  if (collision) report.notices.push({ condition: collision.condition, remedy: collision.remedy });
  return unique;
}

function reconcilePersonalDestinations(records: ImportRecord[], report: MigrateReport): ImportRecord[] {
  const result: ImportRecord[] = [], seen = new Map<string, ImportRecord>();
  for (const record of records) {
    if (record.personalPath === undefined) { result.push(record); continue; }
    const key = JSON.stringify(record.reference), previous = seen.get(key);
    if (!previous) { seen.set(key, record); result.push(record); continue; }
    if (previous.content === record.content) continue;
    report.refused.push({ reference: record.reference, rule: "key" });
    report.notices.push({ condition: `Personal sources ${previous.personalPath ?? "unknown"} and ${record.personalPath} differ at the same destination ${JSON.stringify(record.reference)}.`,
      remedy: { text: "Move one source to another scratch path or reconcile both files to the intended identical content, then retry arc store migrate --import." } });
  }
  return result;
}

function prepareImportRecord(context: RefBackendContext, record: ImportRecord, report: MigrateReport): ImportRecord | undefined {
  const current = prepareImportContent(context, record, report);
  if (!current) return;
  if (record.mappedVersions) {
    const revisions = prepareImportRevisions(context, record, record.mappedVersions.map(content => ({ content })), report);
    return revisions ? { ...current, mappedVersions: revisions.map(version => version.content) } : undefined;
  }
  return current;
}

/** Validate committed Candidate revisions without inventing a current Candidate file. */
export function prepareImportCandidateSources(context: RefBackendContext, candidates: readonly ImportCandidateSource[],
  report: MigrateReport): ImportCandidateSource[] {
  return candidates.flatMap(candidate => {
    const versions = prepareImportRevisions(context, { reference: candidate.reference, asFound: true }, candidate.versions, report);
    return versions ? [{ ...candidate, versions }] : [];
  });
}

function prepareImportRevisions<T extends { content: string }>(context: RefBackendContext, record: Omit<ImportRecord, "content">,
  revisions: readonly T[], report: MigrateReport): T[] | undefined {
  const versions: T[] = [];
  for (const version of revisions) {
    const prepared = prepareImportContent(context, { ...record, content: version.content }, report);
    if (!prepared) return;
    versions.push({ ...version, content: prepared.content });
  }
  return versions;
}

function prepareImportContent(context: RefBackendContext, record: ImportRecord, report: MigrateReport): ImportRecord | undefined {
  const serialized = checkSerializationRules(record.reference, record.content);
  if (serialized) { reportImportAdmission(report, record, serialized, serialized.rule); return; }
  const key = checkRefKey(record.reference, context.registry);
  if (key) { reportImportAdmission(report, record, key, "key"); return; }
  // Legacy review bytes remain useful evidence even when today's schema rejects them.
  const registry = record.asFound ? { ...context.registry, [record.reference.kind]: { ...context.registry[record.reference.kind], parser: null } } : context.registry;
  const result = prepareRefPut(record.reference, null, record.content, registry);
  if (result.status === "refused") { reportImportPutFailure(registry, report, record, result.refusal); return; }
  const content = context.registry[record.reference.kind].projection === "never" ? canonicalize(JSON.parse(result.result)) : result.result;
  const stamped = checkSerializationRules(record.reference, content);
  if (stamped) { reportImportAdmission(report, record, stamped, stamped.rule); return; }
  return { ...record, content };
}

/** Build one commit per imported owner, sharing the importing code head and batch provenance. */
export async function buildImportCommits(context: RefBackendContext, records: readonly ImportRecord[], codeHead: string, batchId: string,
  candidates: readonly ImportCandidateSource[]): Promise<Map<string, string>> {
  const groups = await prepareImportGroups(context, records, candidates);
  const identity = await context.identity();
  const actor = identity ? await context.actor(identity) : undefined;
  const refs = new Map<string, string>();
  const quarters = new Map<string, ImportQuarter>();
  const provenance = { verb: "migrate", lifecycleAction: "import", codeHead };
  for (const [ref, group] of groups) {
    const parent = await replayImportVersions(context, group, provenance, actor);
    if (group.placement?.kind === "completed") { group.metadata.endBatch = batchId; group.metadata.batch = batchId; }
    group.entries.set(group.metadataPath, { path: group.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
    const tip = await commitRefTree(context, group.entries.values(), parent, provenance, group.reference, batchId, actor);
    if (group.placement?.kind === "completed") addImportArchive(context, ref, group, tip, refs, quarters);
    else refs.set(ref, tip);
  }
  for (const [ref, quarter] of quarters) refs.set(ref, await commitRefTree(context, quarter.entries.values(), undefined, provenance, quarter.reference, batchId, actor));
  for (const record of records.filter(({ reference }) => reference.kind === "lineage/transition")) {
    const primary = RecordReferenceSchema.parse({ kind: "work-item/meta", owner: record.reference.owner });
    const history = expandStoredPath(primary, { registry: context.registry, history: true }).ref;
    refs.set(history, await commitRefTree(context, [], undefined, provenance, primary, batchId, actor));
  }
  return refs;
}
