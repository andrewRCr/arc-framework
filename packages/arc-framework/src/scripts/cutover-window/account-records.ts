/** Establish landed-record coverage, including the import's lineage transformations. */
import { createRefStore } from "../../lib/store/create.js";
import { RecordReferenceSchema, type RecordReference } from "../../lib/store/identity.js";
import { LineageRecordSchema, type LineageRecord } from "../../lib/store/kinds/lineage/index.js";
import type { StoreRecord } from "../../lib/store/read.js";
import type { StoreResult } from "../../lib/store/refusal.js";
import type { WindowImportContext } from "./import-context.js";
import type { WindowReadMap } from "./read-map.js";

/** Whether landed evidence accounts for one exact discovered source record. */
export interface WindowRecordCoverage { held: boolean; reason: string }
/** A point-read consumer over one operation's tracked and landed coordinates. */
export type WindowAccountingRecordReader = (reference: RecordReference, revision: string, path: string) => Promise<WindowRecordCoverage>;

/** Bind source lineage discovery and landed point reads without creating listing manifests. */
export function createWindowAccountingRecordReader(context: WindowImportContext, map: WindowReadMap): WindowAccountingRecordReader {
  const store = createRefStore(context);
  let lineages: Promise<Map<string, LineageRecord>> | undefined;
  return async (reference, revision, path) => {
    if (reference.kind !== "lineage/transition") return coverage(await store.read({ reference }));
    const fields = await sourceLineage(context, revision, path);
    if (fields.kind !== "rename") {
      const owner = await store.lookup({ kind: "lineage", origin: fields.origin.name });
      return owner.status === "ok" ? coverage(await store.read({ reference: owner.result.reference }))
        : { held: false, reason: owner.refusal.condition };
    }
    const sources = await (lineages ??= sourceLineages(context, map));
    const target = renameTarget(fields, sources);
    if (target === null) return { held: false, reason: "The rename chain has no resolvable successor." };
    const terminal = sources.get(target);
    if (terminal && terminal.kind !== "rename") {
      const owner = await store.lookup({ kind: "lineage", origin: fields.origin.name });
      if (owner.status !== "ok") return { held: false, reason: owner.refusal.condition };
      if (owner.result.reference.owner.name !== target) return { held: false, reason: `The renamed lineage resolves to ${owner.result.reference.owner.name}, not ${target}.` };
      return coverage(await store.read({ reference: owner.result.reference }));
    }
    const primary = await store.read({ reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: target } }) });
    if (primary.status !== "ok") return { held: false, reason: primary.refusal.condition };
    return primary.result.aliases?.includes(fields.origin.name)
      ? { held: true, reason: "The successor retains the rename origin among its former names." }
      : { held: false, reason: `Successor ${target} does not retain former name ${fields.origin.name}.` };
  };
}

function coverage(read: StoreResult<StoreRecord>): WindowRecordCoverage {
  return read.status === "ok" ? { held: true, reason: "The discovered record is present in the landed store." }
    : { held: false, reason: read.refusal.condition };
}

async function sourceLineage(context: WindowImportContext, revision: string, path: string): Promise<LineageRecord> {
  const { stdout } = await context.exec("git", ["--no-replace-objects", "show", `${revision}:${path}`],
    { cwd: context.checkoutRoot, objectAccess: "local-only", preserveOutput: true });
  return LineageRecordSchema.parse(JSON.parse(stdout));
}

async function sourceLineages(context: WindowImportContext, map: WindowReadMap): Promise<Map<string, LineageRecord>> {
  const records = new Map<string, LineageRecord>();
  for (const [path, reference] of await map.records(map.main)) {
    if (reference.kind !== "lineage/transition") continue;
    const fields = await sourceLineage(context, map.main, path);
    records.set(fields.origin.name, fields);
  }
  return records;
}

function renameTarget(record: LineageRecord, sources: ReadonlyMap<string, LineageRecord>): string | null {
  const visited = new Set([record.origin.name]);
  let target = record.successors[0]?.name;
  while (target !== undefined && !visited.has(target)) {
    visited.add(target);
    const next = sources.get(target);
    if (!next || next.kind !== "rename") return target;
    target = next.successors[0]?.name;
  }
  return null;
}
