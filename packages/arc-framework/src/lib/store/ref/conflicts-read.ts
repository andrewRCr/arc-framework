/** Read open clashes beside their target without adding processes to a listing. */

import { ConflictRecordSchema } from "../conflict.js";
import { RecordReferenceSchema, sameReference, type RecordReference } from "../identity.js";
import type { StoreRecord, ListingDiagnostic } from "../read.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import { readBatchObjects, type BatchObject, type RefTreeEntry } from "./batch-read.js";

const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The pinned parent tree that proves whether a conflict directory exists. */
export function conflictParentQuery(tip: string, root: string): string {
  return root ? `${tip}:${root.slice(0, -1)}` : `${tip}^{tree}`;
}

/**
 * Read the conflict blobs named by the tree captured with a direct record read. An entry whose name is not UTF-8 or
 * names no conflict key is skipped: the read has no diagnostics, and its family listing reports such an entry malformed.
 */
export async function readOpenConflicts(context: RefBackendContext, target: RecordReference,
  tree: BatchObject | null | undefined, basis: { ref: string; root: string; parent: BatchObject | null | undefined }): Promise<StoreResult<RecordReference[]>> {
  const directory = `${basis.ref}:${basis.root}conflicts`;
  if (tree?.type !== "tree") {
    // A missing path query also means an existing directory's tree object is missing. Its pinned parent proves absence.
    if (!tree && basis.parent?.type === "tree" && !treeEntries(basis.parent).some(({ name }) => name === "conflicts")) return { status: "ok", result: [] };
    return { status: "refused", refusal: unavailableConflictEvidence(target, directory) };
  }
  const entries = treeEntries(tree).flatMap(({ name, oid }) => name?.endsWith(".json")
    ? [{ key: name.slice(0, -5), oid, path: `${directory}/${name}` }] : []);
  const objects = await readBatchObjects(context, entries.map((entry) => entry.oid));
  return establishConflicts(target, entries, objects);
}

interface ConflictEntry { key: string; oid: string; path: string }

function establishConflicts(target: RecordReference, entries: readonly ConflictEntry[],
  objects: ReadonlyMap<string, BatchObject | null>, saved = false): StoreResult<RecordReference[]> {
  const conflicts: RecordReference[] = [];
  for (const entry of entries) {
    const conflict = conflictReference(target, entry.key);
    if (!conflict.success) continue;
    const object = objects.get(entry.oid);
    if (object?.type !== "blob") return { status: "refused", refusal: unavailableConflictEvidence(target, entry.path, saved) };
    const record = conflictTarget(object.bytes);
    if (!record) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: target,
      rule: "store.conflict-evidence", condition: `The sibling conflict at ${entry.path} cannot be decoded; its target and the record's conflict set cannot be established.`,
      remedy: { text: saved ? "Restore the original conflict objects or select a readable saved state after repair; do not infer historical conflict evidence."
        : "Repair the sibling conflict forward with its original supported payload, or rebuild with support for its format, then retry." } } };
    if (matchesTarget(record, target)) conflicts.push(conflict.data);
  }
  return { status: "ok", result: conflicts };
}

/** Attach raw sibling evidence even when a conflict record's format is newer than this build supports. */
export function attachOpenConflicts(context: Pick<RefBackendContext, "registry">, records: readonly StoreRecord[],
  entries: readonly RefTreeEntry[], objects: ReadonlyMap<string, BatchObject | null>, saved = false): {
    records: StoreRecord[]; diagnostics: ListingDiagnostic[]; conflictRefusals: Map<string, StoreRefusal>;
  } {
  const attached: StoreRecord[] = [], diagnostics: ListingDiagnostic[] = [], conflictRefusals = new Map<string, StoreRefusal>();
  for (const record of records) {
    const home = expandStoredPath(record.reference, { registry: context.registry }), prefix = `${home.root}conflicts/`;
    const siblings = entries.flatMap(({ path, oid, invalidName }) => {
      const name = path.startsWith(prefix) ? path.slice(prefix.length) : "";
      return !invalidName && name.endsWith(".json") && !name.includes("/") ? [{ path, oid, key: name.slice(0, -5) }] : [];
    });
    const malformed = malformedCapturedConflictPath(record.reference, home.root, entries);
    const conflicts: StoreResult<RecordReference[]> = malformed
      ? { status: "refused", refusal: unavailableConflictEvidence(record.reference, malformed, saved) }
      : establishConflicts(record.reference, siblings, objects, saved);
    if (conflicts.status === "ok") attached.push({ ...record, conflicts: conflicts.result });
    else {
      conflictRefusals.set(home.path, conflicts.refusal);
      diagnostics.push({ kind: "unreadable", key: home.path, condition: conflicts.refusal.condition, remedy: conflicts.refusal.remedy });
    }
  }
  return { records: attached, diagnostics, conflictRefusals };
}

function conflictReference(target: RecordReference, key: string) {
  return RecordReferenceSchema.safeParse({ owner: target.owner, kind: `${target.kind.split("/")[0]}/conflict-record`, key });
}

function malformedCapturedConflictPath(target: RecordReference, root: string, entries: readonly RefTreeEntry[]): string | undefined {
  const directory = `${root}conflicts`, prefix = `${directory}/`;
  for (const entry of entries) {
    if (entry.path === directory && entry.mode !== "040000") return directory;
    if (!entry.path.startsWith(prefix)) continue;
    const name = directConflictName(entry, prefix);
    if (name?.endsWith(".json") && conflictReference(target, name.slice(0, -5)).success) return `${prefix}${name}`;
  }
  return undefined;
}

/** Nonempty directory rows are omitted from enumeration; a descendant still proves its direct slot is a tree. */
function directConflictName(entry: RefTreeEntry, prefix: string): string | undefined {
  if (entry.rawPath) {
    const end = entry.rawPath.indexOf(47, prefix.length);
    if (end < 0) return undefined;
    try { return strict.decode(entry.rawPath.subarray(prefix.length, end)); } catch { return undefined; }
  }
  const nested = entry.path.slice(prefix.length), slash = nested.indexOf("/");
  return slash < 0 ? undefined : nested.slice(0, slash);
}

function unavailableConflictEvidence(reference: RecordReference, path: string, saved = false): StoreRefusal {
  return { code: "state-unresolvable", class: "recoverable", reference, historyRefs: [],
    condition: `The sibling conflict evidence at ${path} is unavailable; the record's conflict set cannot be established.`,
    remedy: { text: saved ? "Restore or fetch the original missing conflict objects, then retry this saved-state read."
      : "Restore or fetch the missing conflict objects, then retry the read or write with complete evidence." } };
}

/** Decode the target of a typed conflict independently of its containing path. */
export function conflictTarget(bytes: Uint8Array): RecordReference | null {
  let content: unknown;
  try { content = JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
  const parsed = ConflictRecordSchema.safeParse(content);
  return parsed.success ? parsed.data.record : null;
}

function treeEntries(tree: BatchObject): { name: string | null; oid: string }[] {
  const entries: { name: string | null; oid: string }[] = [];
  const oidBytes = tree.oid.length / 2;
  let cursor = 0;
  while (cursor < tree.bytes.length) {
    const space = tree.bytes.indexOf(32, cursor);
    const end = tree.bytes.indexOf(0, space + 1);
    if (space < cursor || end < 0 || end + 1 + oidBytes > tree.bytes.length) throw new Error("Malformed conflict tree");
    const name = decodeName(tree.bytes.subarray(space + 1, end));
    entries.push({ name, oid: Buffer.from(tree.bytes.subarray(end + 1, end + 1 + oidBytes)).toString("hex") });
    cursor = end + 1 + oidBytes;
  }
  return entries;
}

function decodeName(bytes: Uint8Array): string | null {
  try { return strict.decode(bytes); } catch { return null; }
}

function matchesTarget(record: RecordReference, target: RecordReference): boolean {
  if (record.owner.type === "project" && target.owner.type === "project" && !record.owner.uid && record.owner.name === target.owner.name) {
    return sameReference({ ...record, owner: target.owner }, target);
  }
  return sameReference(record, target);
}
