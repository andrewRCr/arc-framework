/** Placement and exact marker claims select off-branch cleanup candidates. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "../store/contract.js";
import { listLifecycleIndex } from "../store/lifecycle-index.js";
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { SlugSchema } from "../kernel/index.js";
import { decodeWorktreeMarkerOwnership, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { DerivedCheckoutRow } from "../locus/derived-roster.js";
import type { StaleWorktreeReport } from "./stale-worktree-sweep.js";
type SelectionInput = { store: Store; topology: readonly RegisteredWorktree[]; derivedRoster: readonly DerivedCheckoutRow[];
  readMarker: (path: string) => Promise<WorktreeMarkerReadResult>; identity?: string | null; excludeWorktreePath?: string };
type Selected = { kind: "ended"; name: string } | { kind: "release"; name: string } | null;
/** Read complete authority before treating a missing claim as a marker with no record. */
export async function selectStoreWorktreeCleanup(input: SelectionInput): Promise<{
  ended: { checkout: RegisteredWorktree; name: string }[]; releases: StaleWorktreeReport[]; warnings: string[] }> {
  const result: { ended: { checkout: RegisteredWorktree; name: string }[]; releases: StaleWorktreeReport[]; warnings: string[] } = { ended: [], releases: [], warnings: [] };
  const listing = await listLifecycleIndex(input.store);
  if (listing.status === "refused" || listing.result.status === "unreadable" || (listing.result.status === "complete" && (listing.result.missed || listing.result.diagnostics.length > 0))) {
    result.warnings.push(incompleteInventoryMessage(listing));
    return result;
  }
  for (const checkout of input.topology) {
    if (checkout.path === input.excludeWorktreePath) continue;
    try {
      const selected = await selectCheckout(input, checkout);
      if (selected?.kind === "ended") result.ended.push({ checkout, name: selected.name });
      if (selected?.kind === "release") result.releases.push(release(checkout, selected.name));
    } catch (error) { result.warnings.push(`Cannot select checkout ${checkout.path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  return result;
}
function incompleteInventoryMessage(listing: Awaited<ReturnType<typeof listLifecycleIndex>>): string {
  const diagnostics = listing.status === "ok" && listing.result.status === "complete" ? listing.result.diagnostics : [];
  return ["Work-unit inventory is incomplete; repair the store and retry checkout cleanup.",
    ...diagnostics.map(item => `${item.condition} ${item.remedy.text}`)].join(" ");
}
async function selectCheckout(input: SelectionInput, checkout: RegisteredWorktree): Promise<Selected> {
  const row = cleanupAuthorityRow(input.derivedRoster, checkout.path);
  const marker = await input.readMarker(checkout.path);
  if (marker.kind !== "present" || marker.marker.husk !== undefined || marker.marker.renameMovePending !== undefined) return null;
  const owner = decodeWorktreeMarkerOwnership(marker.marker);
  if (owner.kind !== "current" || owner.subject.kind !== "work-unit") return null;
  const name = owner.subject.name;
  if (row.subject?.kind !== "work-unit" || row.subject.key !== name) throw new Error("The marker no longer matches derived checkout authority. Refresh and retry cleanup.");
  const found = await input.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(name) } });
  if (found.status === "refused") {
    if (found.refusal.code !== "not-found") throw new Error(`${found.refusal.condition} ${found.refusal.remedy.text}`);
    return await releaseMissingClaim(input.store, name, checkout.branch) ? { kind: "release", name } : null;
  }
  if (row.kind === "unresolved-checkout") throw new Error("The missing-record release basis changed. Refresh checkout authority and retry cleanup.");
  const read = await input.store.read({ reference: found.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  if (read.result.conflicts.length > 0) throw new Error(
    `The work-unit primary has unresolved conflicts: ${read.result.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry checkout cleanup.`);
  const fields = ParsedMetaRecordSchema.parse(read.result.fields);
  if ((input.identity != null && fields.owner !== input.identity) || read.result.placement?.kind === "backlog") return { kind: "release", name };
  return read.result.placement?.kind === "completed" ? { kind: "ended", name: read.result.reference.owner.name } : null;
}
function cleanupAuthorityRow(rows: readonly DerivedCheckoutRow[], path: string): DerivedCheckoutRow {
  const matches = rows.filter(row => row.checkout.path === path), row = matches[0];
  if (matches.length !== 1 || row === undefined) throw new Error(`Expected one derived checkout row; found ${matches.length}. Refresh checkout authority and retry cleanup.`);
  const missingRecordRelease = row.subject?.kind === "work-unit" && row.diagnostics.length > 0
    && row.diagnostics.every(diagnostic => diagnostic.source === "lifecycle" && diagnostic.code === "work-unit-record-missing");
  if ((row.kind === "unresolved-checkout" || row.diagnostics.length > 0) && !missingRecordRelease) {
    throw new Error(`${row.diagnostics.map(item => `${item.code}: ${item.message}`).join(" ")} Repair checkout authority and retry cleanup.`);
  }
  return row;
}
/** Retain only checkouts whose derived authority permits cleanup inspection. */
export function selectStoreCleanupTopology(rows: readonly DerivedCheckoutRow[], topology: readonly RegisteredWorktree[], warnings: string[]): RegisteredWorktree[] {
  return topology.filter(checkout => {
    try { cleanupAuthorityRow(rows, checkout.path); return true; }
    catch (error) { warnings.push(`Cannot select checkout ${checkout.path}: ${error instanceof Error ? error.message : String(error)}`); return false; }
  });
}
async function releaseMissingClaim(store: Store, name: string, branch: string | null): Promise<boolean> {
  const lineage = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) });
  if (lineage.status === "ok") {
    const read = await store.read({ reference: lineage.result.reference });
    if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
    if (read.result.conflicts.length > 0) throw new Error(
      `The work-unit lineage has unresolved conflicts: ${read.result.conflicts.map(reference => JSON.stringify(reference)).join(", ")}. Resolve the named conflict records, then retry checkout cleanup.`);
    return branch === null || LineageRecordSchema.parse(read.result.fields).kind !== "abandon";
  }
  if (lineage.refusal.code !== "not-found") throw new Error(`${lineage.refusal.condition} ${lineage.refusal.remedy.text}`);
  return true;
}
function release(checkout: RegisteredWorktree, name: string): StaleWorktreeReport {
  const common = { worktreePath: checkout.path, decision: { action: "external" as const }, actions: [{ text: `arc locus release ${name}`, argv: ["arc", "locus", "release", name] }] };
  return checkout.branch === null ? { ...common, kind: "detached", branch: null, workUnit: name } : { ...common, kind: "branched", branch: checkout.branch };
}
