/** Shared holder evidence and recovery exits for work-unit markers without a UUID. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { decodeWorktreeMarkerOwnership, type WorktreeMarker } from "../git/worktree-marker.js";
import type { Store } from "../store/contract.js";
import { sameReference, type RecordReference } from "../store/identity.js";
import { SlugSchema } from "../kernel/index.js";
import type { StoreRecord, ListingOutcome } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { SessionActionSchema, type SessionAction } from "../session-init/actions.js";

/** Recovery selected from the marker's name and the current namespace. */
export type UnboundMarkerExit = { kind: "bind"; reference: RecordReference; owner: string } | { kind: "rerun" } | { kind: "release" };
/** An unbound claim retains every holder and exact checkout-scoped recovery action. */
export interface UnboundMarkerClassification {
  kind: "unbound"; slug: string; holders: readonly RecordReference[]; exit: UnboundMarkerExit;
  exits: readonly SessionAction[]; reason: string;
}
/** Unreadable inventories cannot establish the holders of an unbound name. */
export type UnboundMarkerOutcome = UnboundMarkerClassification | { kind: "unreadable"; reason: string };
/** Caller-owned marker observation, optionally sharing an already acquired inventory. */
export interface UnboundMarkerInput {
  store: Store; cwd: string; marker: WorktreeMarker; identity?: string; listing?: StoreResult<ListingOutcome>;
}
/** Match materialize's ownership, placement, and lifecycle admission. */
export function ownedInFlight(record: StoreRecord, identity: string): boolean {
  const fields = ParsedMetaRecordSchema.parse(record.fields);
  return record.placement?.kind === "active" && fields.owner === identity
    && new Set(["Planning", "Active", "Integrating"]).has(fields.state ?? "");
}
/** Classify an unbound work-unit claim without binding or releasing its marker. */
export async function classifyUnboundMarker(input: UnboundMarkerInput): Promise<UnboundMarkerOutcome> {
  try {
    const ownership = decodeWorktreeMarkerOwnership(input.marker);
    if (input.marker.husk !== undefined || ownership.kind !== "current" || ownership.subject.kind !== "work-unit" || ownership.subject.uid !== undefined)
      return { kind: "unreadable", reason: "Expected an unbound work-unit marker. Inspect its ownership before retrying." };
    const slug = SlugSchema.parse(ownership.subject.name);
    const inventory = await workUnitInventory(input);
    if (!inventory.ok) return { kind: "unreadable", reason: inventory.reason };
    const selected = await selectExit(input, slug);
    const holders = inventory.records.filter(record => record.reference.owner.name === slug).map(record => record.reference);
    for (const reference of selected.references) {
      if (!holders.some(held => sameReference(held, reference))) holders.push(reference);
    }
    const exits = exitActions(input, slug, selected.exit);
    const described = holders.map(reference => describeHolder(reference, inventory.records));
    const reason = `Checkout ${input.cwd} has an unbound work-unit marker naming '${slug}'. ${described.length === 0
      ? "No current name holder was found." : `Holders: ${described.join("; ")}.`} ${selected.detail ?? ""} ${exits.map(action => action.text).join("; ")}. Run these exits from ${input.cwd}.`;
    return { kind: "unbound", slug, holders, exit: selected.exit, exits, reason };
  } catch (error) {
    return { kind: "unreadable", reason: `Cannot classify the unbound marker at ${input.cwd}: ${error instanceof Error ? error.message : String(error)}. Repair the named evidence, then retry.` };
  }
}

async function workUnitInventory(input: UnboundMarkerInput): Promise<{ ok: true; records: readonly StoreRecord[] } | { ok: false; reason: string }> {
  const listed = input.listing ?? await input.store.list({ family: "work-item", kind: "work-item/meta" });
  if (listed.status === "refused") return { ok: false, reason: `Work-unit inventory is unavailable. ${listed.refusal.condition} ${listed.refusal.remedy.text}` };
  const result = listed.result;
  if (result.status === "unreadable") return { ok: false, reason: `Work-unit inventory is unreadable. ${result.condition} ${result.remedy.text}` };
  if (result.status === "absent") return { ok: true, records: [] };
  if (result.missed || result.diagnostics.length > 0) return { ok: false, reason: `Work-unit inventory is incomplete. ${result.diagnostics.map(item =>
    `${item.condition} ${item.remedy.text}`).join(" ") || "Repair the missed work-unit entries, then retry."}` };
  return { ok: true, records: result.records };
}
interface SelectedExit { exit: UnboundMarkerExit; references: readonly RecordReference[]; detail?: string }
async function selectExit(input: UnboundMarkerInput, slug: string): Promise<SelectedExit> {
  const lookup = await input.store.lookup({ kind: "slug", slug: SlugSchema.parse(slug) });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "not-found") return absentNameExit(input, slug);
    return { exit: { kind: "release" }, references: lookup.refusal.code === "ambiguous-match" ? lookup.refusal.candidates : [],
      detail: `${lookup.refusal.condition} ${lookup.refusal.remedy.text}` };
  }
  const reference = lookup.result.reference;
  if (reference.kind !== "work-item/meta") return { exit: { kind: "release" }, references: [reference] };
  const read = await input.store.read({ reference });
  if (read.status === "refused") return { exit: { kind: "release" }, references: [reference], detail: `${read.refusal.condition} ${read.refusal.remedy.text}` };
  const fields = ParsedMetaRecordSchema.parse(read.result.fields), owner = fields.owner;
  return typeof owner === "string" && ownedInFlight(read.result, input.identity ?? owner)
    ? { exit: { kind: "bind", reference: read.result.reference, owner }, references: [read.result.reference] }
    : { exit: { kind: "release" }, references: [read.result.reference] };
}
async function absentNameExit(input: UnboundMarkerInput, slug: string): Promise<SelectedExit> {
  if (input.marker.spawnedByArc) return { exit: { kind: "release" }, references: [] };
  const lineage = await input.store.lookup({ kind: "lineage", origin: SlugSchema.parse(slug) });
  return lineage.status === "refused" && lineage.refusal.code === "not-found"
    ? { exit: { kind: "rerun" }, references: [] }
    : { exit: { kind: "release" }, references: [], detail: lineage.status === "ok" ? "The name has retained lineage."
      : `${lineage.refusal.condition} ${lineage.refusal.remedy.text}` };
}
function exitActions(input: UnboundMarkerInput, slug: string, exit: UnboundMarkerExit): SessionAction[] {
  const actions: SessionAction[] = [];
  if (exit.kind === "bind") actions.push({ text: `${input.identity === undefined ? `As owner '${exit.owner}', run ` : ""}arc materialize ${exit.reference.owner.name} --here`,
    argv: ["arc", "materialize", exit.reference.owner.name, "--here"], checkout: input.cwd });
  if (exit.kind === "rerun") actions.push({ text: `arc start ${slug} --new --here`, argv: ["arc", "start", slug, "--new", "--here"], checkout: input.cwd });
  actions.push({ text: "arc locus release", argv: ["arc", "locus", "release"], checkout: input.cwd });
  return actions.map(action => SessionActionSchema.parse(action));
}
function describeHolder(reference: RecordReference, records: readonly StoreRecord[]): string {
  const record = records.find(record => sameReference(record.reference, reference));
  const type = reference.kind === "work-item/meta" ? "work unit" : reference.kind === "work-item/record" ? "Errand"
    : reference.kind === "cohort/document" ? "cohort" : reference.kind;
  const state = record === undefined ? "" : record.placement?.kind === "completed" ? "completed " : "live ";
  return `${state}${type} '${reference.owner.name}' (UID ${reference.owner.type === "person" ? "unavailable" : reference.owner.uid ?? "unavailable"})`;
}
