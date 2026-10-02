/** Local, tip-pinned reads and diagnostic-preserving identity-ref enumeration. */
import { readTransientIdentitySnapshot, type IdentitySnapshotDiagnostic } from "../../errand/identity-snapshot.js";
import type { TransientIdentityRecord } from "../../errand/identity-record.js";
import { MAX_LOCUS_JSON_BYTES } from "../../locus/schema/index.js";
import { RecordVersionSchema, sameOwner, type RecordReference } from "../identity.js";
import type { ListingDiagnostic, ListingOutcome, ListInput, ReadInput, StoreRecord } from "../read.js";
import type { InRepoContext } from "./context.js";
import { admitTransient, transientIO, transientKey, transientKind, transientMalformed, transientMismatch, transientReference } from "./transient-common.js";
import { notFound, unsupported } from "./refusals.js";
import type { ErrandRecordIO } from "../../errand/ref-tree.js";

/** Read one current identity record, keeping malformed but readable bytes.
 * @param context - Explicit dependencies.
 * @param input - Logical reference.
 * @returns Stored bytes with their blob mutation basis.
 */
export async function readTransient(context: InRepoContext, input: ReadInput): Promise<StoreRecord> {
  if (input.asOf !== undefined) unsupported("uncovered-state-version", "The branch anchor does not cover identity refs.", "Read the current record using its per-record version.");
  const io = await transientIO(context);
  admitTransient(input.reference, io?.identity ?? null);
  if (io === null) throw new Error("Missing admitted identity");
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "error") throw new Error(snapshot.message);
  if (snapshot.kind === "absent") return notFound(input.reference);
  const key = transientKey(input.reference);
  const oid = snapshot.objects.get(key);
  if (oid === undefined) return notFound(input.reference);
  const record = snapshot.records.get(key);
  if (record !== undefined && transientKind(record) !== input.reference.kind) return notFound(input.reference);
  const diagnostic = snapshot.diagnostics.find((item) => item.key === key);
  checkDiagnostic(diagnostic, input.reference, io.identity);
  return pinnedRecord(io, input.reference, oid, record);
}
/** Enumerate just the roles assigned to this family, retaining invalid-entry evidence.
 * @param context - Explicit dependencies.
 * @param input - Family, role and owner selection.
 * @returns Absent, unreadable, or complete local enumeration.
 */
export async function listTransient(context: InRepoContext, input: ListInput): Promise<ListingOutcome> {
  if (input.asOf !== undefined) unsupported("uncovered-state-version", "The branch anchor does not cover identity refs.", "List current identity records instead.");
  const io = await transientIO(context);
  if (io === null) return { status: "absent" };
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "absent") return { status: "absent" };
  if (snapshot.kind === "error") return { status: "unreadable", condition: snapshot.message, remedy: { text: "Repair the identity ref's tip or root tree, then retry listing." } };
  const records: StoreRecord[] = [];
  for (const [key, record] of snapshot.records) {
    const kind = transientKind(record);
    const reference = transientReference(kind, key, io.identity);
    if (!matchesSelection(input, reference)) continue;
    const oid = snapshot.objects.get(key);
    if (oid === undefined) throw new Error("Snapshot omitted an entry's blob version");
    records.push(await pinnedRecord(io, reference, oid, record));
  }
  return { status: "complete", records, diagnostics: snapshot.diagnostics.map(listingDiagnostic), missed: snapshot.diagnostics.length > 0 };
}
function matchesSelection(input: ListInput, reference: RecordReference): boolean {
  if (!reference.kind.startsWith(`${input.family}/`) || (input.kind !== undefined && input.kind !== reference.kind)) return false;
  if (input.owner !== undefined && !sameOwner(input.owner, reference.owner)) return false;
  if (input.filter?.locations !== undefined && !input.filter.locations.includes("active")) return false;
  if (input.filter?.heldHere !== undefined) unsupported("held-here", "Identity records cannot be filtered by this checkout's held work-unit metas.", "List these records without heldHere.");
  return true;
}
function checkDiagnostic(diagnostic: IdentitySnapshotDiagnostic | undefined, reference: RecordReference, identity: string): void {
  if (diagnostic?.kind === "key-mismatch") transientMismatch(reference, diagnostic.slug, identity);
  if (diagnostic?.kind === "oversized") transientMalformed(reference, `Size ${diagnostic.declaredBytes} exceeds cap ${MAX_LOCUS_JSON_BYTES}`);
  if (diagnostic?.kind === "unreadable") throw new Error(diagnostic.message);
}

async function pinnedRecord(io: ErrandRecordIO, reference: RecordReference, oid: string, record: TransientIdentityRecord | undefined): Promise<StoreRecord> {
  const content = await io.execInput(["cat-file", "blob", oid], "");
  return { reference, content, version: RecordVersionSchema.parse(oid), formatVersion: 1, conflicts: [],
    ...(record === undefined ? {} : { fields: record }), ...(reference.kind === "work-item/record" ? { placement: { kind: "active" as const } } : {}) };
}
function listingDiagnostic(item: IdentitySnapshotDiagnostic): ListingDiagnostic {
  const condition = item.kind === "unknown-version" ? `Unknown content version ${String(item.version)}`
    : item.kind === "oversized" ? `Size ${item.declaredBytes} exceeds cap ${MAX_LOCUS_JSON_BYTES}`
    : item.kind === "key-mismatch" ? `Entry ${item.key} names slug ${item.slug}` : item.message;
  return { kind: item.kind === "unknown-version" ? "malformed" : item.kind, key: item.key, condition,
    remedy: { text: "Hand repair the named identity-ref entry, then retry listing." } };
}
