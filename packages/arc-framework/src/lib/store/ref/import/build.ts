/** Validate imported records and prepare isolated commit trees without running write checks. */
import type { RefBackendContext } from "../context.js";
import type { ImportRecord } from "./source.js";
import type { MigrateReport } from "../../commands.js";
import { checkSerializationRules } from "../../serialization.js";
import { checkRefKey, checkRefBatchPaths } from "../path-admission.js";
import { prepareRefPut } from "../prepare-content.js";
import { canonicalize } from "../../../kernel/canonical/canonical-json.js";
import { expandStoredPath } from "../../stored-path.js";
import type { RefMetadata } from "../metadata.js";
import type { RefTreeEntry } from "../batch-read.js";
import { refFormatKey } from "../format-key.js";
import { commitRefTree } from "../write-commits.js";
import { writeRefBlob } from "../tree-write.js";

/** Admit every record before any prepared commit can become visible. */
export function prepareImportRecords(context: RefBackendContext, records: ImportRecord[], report: MigrateReport): ImportRecord[] {
  const prepared: ImportRecord[] = [];
  for (const record of records) {
    const admitted = prepareImportRecord(context, record, report);
    if (admitted) prepared.push(admitted);
  }
  const collision = checkRefBatchPaths(prepared.map(({ reference }) => reference), context.registry);
  if (collision) report.notices.push({ condition: collision.condition, remedy: collision.remedy });
  return prepared;
}

function prepareImportRecord(context: RefBackendContext, record: ImportRecord, report: MigrateReport): ImportRecord | undefined {
  const refuse = (rule: string): undefined => { report.refused.push({ reference: record.reference, rule }); };
  const serialized = checkSerializationRules(record.reference, record.content);
  if (serialized) { refuse(serialized.rule); return; }
  if (checkRefKey(record.reference, context.registry)) { refuse("key"); return; }
  // Legacy review bytes remain useful evidence even when today's schema rejects them.
  const registry = record.asFound ? { ...context.registry, [record.reference.kind]: { ...context.registry[record.reference.kind], parser: null } } : context.registry;
  const result = prepareRefPut(record.reference, null, record.content, registry);
  if (result.status === "refused") {
    if (result.refusal.code === "unsupported") report.notices.push({ condition: result.refusal.condition, remedy: result.refusal.remedy });
    else report.refused.push({ reference: record.reference, rule: context.registry[record.reference.kind].merge === "entry" ? "entry-id" : "parse" });
    return;
  }
  const content = context.registry[record.reference.kind].projection === "never" ? canonicalize(JSON.parse(result.result)) : result.result;
  const stamped = checkSerializationRules(record.reference, content);
  if (stamped) { refuse(stamped.rule); return; }
  return { ...record, content };
}

/** Build one commit per imported owner, sharing the importing code head and batch provenance. */
export async function buildImportCommits(context: RefBackendContext, records: readonly ImportRecord[], codeHead: string, batchId: string): Promise<Map<string, string>> {
  const groups = new Map<string, { record: ImportRecord; metadata: RefMetadata; entries: Map<string, RefTreeEntry>; metadataPath: string }>();
  for (const record of records) {
    const { reference } = record;
    const home = expandStoredPath(reference, { registry: context.registry });
    let group = groups.get(home.ref);
    if (!group) {
      group = { record, metadata: { formatVersion: 1, formats: {}, ...(["work-item", "cohort"].includes(reference.owner.type) ? { slug: reference.owner.name } : {}) }, entries: new Map(), metadataPath: home.metadataPath };
      groups.set(home.ref, group);
    }
    group.entries.set(home.path, { path: home.path, mode: "100644", oid: await writeRefBlob(context, record.content) });
    group.metadata.formats[refFormatKey(reference)] = context.registry[reference.kind].formatVersion;
    if (reference.kind === "work-item/meta" && record.placement) group.metadata.primary = { role: "work-item/meta", placement: record.placement };
  }
  const identity = await context.identity();
  const actor = identity ? await context.actor(identity) : undefined;
  const refs = new Map<string, string>();
  for (const [ref, group] of groups) {
    group.entries.set(group.metadataPath, { path: group.metadataPath, mode: "100644", oid: await writeRefBlob(context, canonicalize(group.metadata)) });
    refs.set(ref, await commitRefTree(context, group.entries.values(), undefined,
      { verb: "migrate", lifecycleAction: "import", codeHead }, group.record.reference, batchId, actor));
  }
  return refs;
}
