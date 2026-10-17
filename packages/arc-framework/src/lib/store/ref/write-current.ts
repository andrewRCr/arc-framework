/** Expected-version admission against immutable, locked state trees. */

import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { BatchInput } from "../write.js";
import type { RefBackendContext } from "./context.js";
import type { ResolvedBatch, ResolvedMutation } from "./write-resolution.js";
import type { RefMetadata } from "./metadata.js";
import { readBatchObjects, type RefTreeEntry } from "./batch-read.js";
import { refFormatKey } from "./format-key.js";
import { refRecordVersion } from "./record-version.js";
import { expandStoredPath } from "../stored-path.js";
import { isTerminalSnapshotRepair } from "../kinds/lineage/repair.js";
import { mergeRefMutation, type PreparedRefMutation } from "./write-merge.js";
import type { StoreResult } from "../refusal.js";

/** Captured tree and metadata shared by admission and tree preparation. */
export interface CapturedWriteGroup { entries: Map<string, RefTreeEntry>; metadata: RefMetadata }

/** Prepare current and stale puts, collecting every unmergeable version conflict. */
export async function prepareCapturedWrites(context: RefBackendContext, resolved: ResolvedBatch,
  groups: ReadonlyMap<string, CapturedWriteGroup>, provenance: BatchInput["provenance"]): Promise<StoreResult<PreparedRefMutation[]>> {
  const stale: RecordReference[] = [];
  const prepared: PreparedRefMutation[] = [];
  for (const requested of resolved.writes) {
    const group = groups.get(requested.home.ref);
    if (!group) throw new Error("A resolved mutation has no captured ref group");
    const write = primaryWriteBasis(context, requested, group);
    const basis = { ...write, mutation: { ...write.mutation, reference: write.prior?.reference ?? write.mutation.reference },
      home: write.prior?.home ?? write.home };
    if (!await staleMutation(context, basis, group, provenance)) { prepared.push({ ...write, conflicts: [] }); continue; }
    const { mutation } = write;
    const home = write.prior?.home ?? write.home;
    const definition = context.registry[mutation.reference.kind];
    const entry = group.entries.get(home.path);
    const tip = resolved.tips.get(home.ref);
    if (mutation.action === "put" && mutation.expected !== null && entry && tip
      && basis.mutation.reference.kind === mutation.reference.kind && definition.merge !== "single-writer" && !["create-only", "write-once"].includes(definition.writerRule)) {
      const current = refRecordVersion(mutation.reference, entry.oid, group.metadata,
        group.metadata.formats[refFormatKey(mutation.reference)] ?? 1);
      const merged = await mergeRefMutation(context, { ...write, home }, tip, current);
      if (merged.status === "refused") return merged;
      if (merged.result) { prepared.push({ ...merged.result, home: write.home }); continue; }
    }
    stale.push(mutation.reference);
  }
  return stale.length > 0 ? { status: "refused", refusal: {
    code: "version-conflict", class: "recoverable", records: stale,
    condition: "The expected record versions do not match the captured state or the kind is immutable",
    remedy: { text: "Read every conflicting record, then retry the whole batch with its current versions and admitted mutation." },
  } } : { status: "ok", result: prepared };
}

async function staleMutation(context: RefBackendContext, { mutation, home }: ResolvedMutation,
  group: CapturedWriteGroup, provenance: BatchInput["provenance"]): Promise<boolean> {
  const { reference } = mutation;
  const entry = group.entries.get(home.path);
  if (mutation.expected === null) {
    if (entry) return true;
    if (reference.kind !== "work-item/meta" && reference.kind !== "work-item/record") return false;
    const other = { ...reference, kind: reference.kind === "work-item/meta" ? "work-item/record" as const : "work-item/meta" as const };
    return group.entries.has(expandStoredPath(other, { registry: context.registry }).path);
  }
  const format = group.metadata.formats[refFormatKey(reference)] ?? 1;
  const version = entry ? refRecordVersion(reference, entry.oid, group.metadata, format) : null;
  if (mutation.expected !== version) return true;
  if (mutation.action !== "put" || !["create-only", "write-once"].includes(context.registry[reference.kind].writerRule)) return false;
  const object = entry ? (await readBatchObjects(context, [entry.oid])).get(entry.oid) : null;
  return !isTerminalSnapshotRepair({ ...mutation, provenance }, object?.type === "blob" ? new TextDecoder().decode(object.bytes) : null);
}

function primaryWriteBasis(context: RefBackendContext, write: ResolvedMutation, group: CapturedWriteGroup): ResolvedMutation {
  const { mutation } = write;
  const role = group.metadata.primary?.role;
  if (mutation.expected === null || !role || role === mutation.reference.kind
    || !["work-item/meta", "work-item/record"].includes(mutation.reference.kind)) return write;
  const reference = RecordReferenceSchema.parse({ ...(write.prior?.reference ?? mutation.reference), kind: role });
  const home = expandStoredPath(reference, { registry: context.registry, history: write.home.ref.startsWith("refs/arc/history/") });
  if (mutation.action === "remove") return { ...write, mutation: { ...mutation, reference }, home, prior: undefined };
  return group.entries.has(home.path) ? { ...write, prior: { reference, home } } : write;
}
