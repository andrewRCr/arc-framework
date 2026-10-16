/** Placement and exact marker claims select off-branch cleanup candidates. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import type { Store } from "../store/contract.js";
import { listLifecycleIndex } from "../store/lifecycle-index.js";
import { LineageRecordSchema } from "../store/kinds/lineage/index.js";
import { SlugSchema } from "../kernel/index.js";
import { decodeWorktreeMarkerOwnership, type WorktreeMarkerReadResult } from "../git/worktree-marker.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
import type { StaleWorktreeReport } from "./stale-worktree-sweep.js";
type SelectionInput = { store: Store; topology: readonly RegisteredWorktree[];
  readMarker: (path: string) => Promise<WorktreeMarkerReadResult>; identity?: string | null; excludeWorktreePath?: string };
type Selected = { kind: "ended"; name: string } | { kind: "release"; name: string } | null;
/** Read complete authority before treating a missing claim as a marker with no record. */
export async function selectStoreWorktreeCleanup(input: SelectionInput): Promise<{
  ended: { checkout: RegisteredWorktree; name: string }[]; releases: StaleWorktreeReport[]; warnings: string[] }> {
  const result: { ended: { checkout: RegisteredWorktree; name: string }[]; releases: StaleWorktreeReport[]; warnings: string[] } = { ended: [], releases: [], warnings: [] };
  const listing = await listLifecycleIndex(input.store);
  if (listing.status === "refused" || listing.result.status === "unreadable" || (listing.result.status === "complete" && (listing.result.missed || listing.result.diagnostics.length > 0))) {
    result.warnings.push("Work-unit inventory is incomplete; repair the store and retry checkout cleanup."); return result;
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
async function selectCheckout(input: SelectionInput, checkout: RegisteredWorktree): Promise<Selected> {
  const marker = await input.readMarker(checkout.path);
  if (marker.kind !== "present" || marker.marker.husk !== undefined || marker.marker.renameMovePending !== undefined) return null;
  const owner = decodeWorktreeMarkerOwnership(marker.marker);
  if (owner.kind !== "current" || owner.subject.kind !== "work-unit") return null;
  const name = owner.subject.name;
  const found = await input.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(name) } });
  if (found.status === "refused") {
    if (found.refusal.code !== "not-found") throw new Error(`${found.refusal.condition} ${found.refusal.remedy.text}`);
    return await releaseMissingClaim(input.store, name, checkout.branch) ? { kind: "release", name } : null;
  }
  const read = await input.store.read({ reference: found.result.reference });
  if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  const fields = ParsedMetaRecordSchema.parse(read.result.fields);
  if ((input.identity != null && fields.owner !== input.identity) || read.result.placement?.kind === "backlog") return { kind: "release", name };
  return read.result.placement?.kind === "completed" ? { kind: "ended", name: read.result.reference.owner.name } : null;
}
async function releaseMissingClaim(store: Store, name: string, branch: string | null): Promise<boolean> {
  if (branch === null) return true;
  const lineage = await store.lookup({ kind: "lineage", origin: SlugSchema.parse(name) });
  if (lineage.status === "ok") {
    const read = await store.read({ reference: lineage.result.reference });
    if (read.status === "refused") throw new Error(`${read.refusal.condition} ${read.refusal.remedy.text}`);
    return LineageRecordSchema.parse(read.result.fields).kind !== "abandon";
  }
  if (lineage.refusal.code !== "not-found") throw new Error(`${lineage.refusal.condition} ${lineage.refusal.remedy.text}`);
  return true;
}
function release(checkout: RegisteredWorktree, name: string): StaleWorktreeReport {
  const common = { worktreePath: checkout.path, decision: { action: "external" as const }, actions: [{ text: `arc locus release ${name}`, argv: ["arc", "locus", "release", name] }] };
  return checkout.branch === null ? { ...common, kind: "detached", branch: null, workUnit: name } : { ...common, kind: "branched", branch: checkout.branch };
}
