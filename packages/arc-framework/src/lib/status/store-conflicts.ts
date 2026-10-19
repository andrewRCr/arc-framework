/** Acquire open conflict records while retaining family-listing completeness. */
import { KIND_SHAPES, familyOf, type KindId } from "../store/catalog.js";
import { OwnerIdentitySchema } from "../store/identity.js";
import { ConflictRecordSchema } from "../store/conflict.js";
import { formatConflictToken } from "./conflict-token.js";
import type { Store } from "../store/contract.js";
import type { ListingOutcome, StoreRecord } from "../store/read.js";
import type { StatusViewResult } from "./store-view-result.js";
/** A listed record with its public, generation-independent address. */
export type StatusConflictRecord = StoreRecord & { token: string };
/** Good records remain visible alongside omitted-entry diagnostics. */
export interface StoreConflictsView { conflicts: StatusConflictRecord[]; warnings: string[]; incomplete: boolean }
/** Registered conflict-bearing roles; reserved families contribute no invented kinds. */
export type ConflictKind = Extract<KindId, `${string}/conflict-record`>;
const conflictKinds = (Object.keys(KIND_SHAPES) as KindId[]).filter((kind): kind is ConflictKind => kind.endsWith("/conflict-record"));

/** List each conflict kind using the invocation's personal identity scope. */
export async function readStoreConflicts(options: { store: Store; identity: string | null }): Promise<StatusViewResult<StoreConflictsView>> {
  const view: StoreConflictsView = { conflicts: [], warnings: [], incomplete: false };
  if (options.identity === null) view.warnings.push("The personal and claims conflict families were not read without an identity. Run git config arc.identity <name> and retry arc status --conflicts.");
  for (const kind of conflictKinds) {
    if (options.identity === null && (kind === "personal/conflict-record" || kind === "claims/conflict-record")) continue;
    const family = await readStoreConflictFamily({ ...options, kind });
    if (family.status === "refused") return family;
    view.conflicts.push(...family.result.conflicts);
    view.warnings.push(...family.result.warnings);
    view.incomplete ||= family.result.incomplete;
  }
  return { status: "ok", result: view };
}

/** Read one family's conflict kind without binding name-only work-item owners. */
export async function readStoreConflictFamily(options: { store: Store; identity: string | null; kind: ConflictKind }): Promise<StatusViewResult<StoreConflictsView>> {
  const { kind } = options, family = familyOf(kind), scoped = family === "personal" || family === "claims";
  const listing = await options.store.list({ family, kind, ...(scoped && options.identity !== null
    ? { owner: OwnerIdentitySchema.parse({ type: "person", name: options.identity }) } : {}) });
  if (listing.status === "refused") return listing;
  if (listing.result.status === "unreadable") return { status: "refused", refusal: { code: "listing-unreadable",
    condition: listing.result.condition, remedy: listing.result.remedy } };
  if (listing.result.status === "absent") return { status: "ok", result: { conflicts: [], warnings: [], incomplete: false } };
  return { status: "ok", result: decodeListing(family, listing.result) };
}

function decodeListing(family: string, listing: Extract<ListingOutcome, { status: "complete" }>): StoreConflictsView {
  const warnings = listing.diagnostics.map(diagnostic => `${family} ${diagnostic.key}: ${diagnostic.condition} ${diagnostic.remedy.text}`);
  let incomplete = listing.missed || listing.diagnostics.length > 0;
  if (listing.missed && listing.diagnostics.length === 0) warnings.push(`${family} conflict inventory is incomplete. Repair its inventory, then retry arc status --conflicts.`);
  const conflicts: StatusConflictRecord[] = [];
  for (const record of listing.records) {
    const token = formatConflictToken(record.reference);
    if (readableConflict(record.content)) conflicts.push({ ...record, token });
    else {
      incomplete = true;
      warnings.push(`Conflict ${token} could not be read. Inspect and repair it with arc store conflict, then retry arc status --conflicts.`);
    }
  }
  return { conflicts, warnings, incomplete };
}
function readableConflict(content: string): boolean {
  try { return ConflictRecordSchema.safeParse(JSON.parse(content)).success; }
  catch { return false; }
}
