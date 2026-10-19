/** Shared occupancy refusals preserve the marker's role and its exact checkout. */
import { ParsedMetaRecordSchema } from "../active/meta-schema.js";
import { deserializeTransientIdentityRecord, projectLocusIdentity } from "../errand/identity-record.js";
import { deriveHandoffLocusPlan } from "../handoff/locus-plan.js";
import { SlugSchema } from "../kernel/index.js";
import { digestBytes } from "../kernel/canonical/canonical-json.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import { decodeWorktreeMarkerOwnership, readWorktreeMarkerGeneration, resolveWorktreeMarkerPath,
  type WorktreeMarkerGenerationReadResult } from "../git/worktree-marker.js";
import type { DerivedCheckoutRow } from "./derived-roster.js";
import { readWorkUnitLineage } from "./store-terminal-work-unit.js";

/** The generation retained by an occupancy observation. */
export type PresentMarker = Extract<WorktreeMarkerGenerationReadResult, { kind: "present" }>;
export type MarkerOccupancy =
  | { kind: "clear" }
  | { kind: "unreadable"; reason: string }
  | { kind: "occupied"; reason: string; marker: PresentMarker; workUnit: StoreRecord | null; missingRecord: boolean };

/** Read every marker role, including roles the current-work-unit resolver deliberately passes over. */
export async function inspectCheckoutMarker(input: { cwd: string; store: Store; identity?: string }): Promise<MarkerOccupancy> {
  try {
    const marker = await readWorktreeMarkerGeneration(input.cwd);
    if (marker.kind === "absent") return { kind: "clear" };
    if (marker.kind === "malformed") return { kind: "unreadable", reason: `${marker.path}: ${marker.message}. Inspect and repair or remove the marker, then retry.` };
    if (marker.marker.husk !== undefined) return occupied(marker,
      `Checkout ${input.cwd} holds a husk; run arc teardown ${marker.marker.husk.subject.kind === "work-unit" ? marker.marker.husk.subject.name : marker.marker.husk.branch}.`);
    const ownership = decodeWorktreeMarkerOwnership(marker.marker);
    if (ownership.kind !== "current") return { kind: "unreadable", reason: `${resolveWorktreeMarkerPath(input.cwd)}: marker ownership is ${ownership.reason}. Inspect and repair its marker, then retry.` };
    if (ownership.subject.kind !== "work-unit") return occupied(marker,
      await transientMarkerExit(input, marker, ownership.subject));
    return await readWorkUnitOccupancy(input, marker, ownership.subject.name);
  } catch (error) { return { kind: "unreadable", reason: `Cannot observe checkout ${input.cwd}'s marker: ${error instanceof Error ? error.message : String(error)}. Inspect and repair its marker, then retry.` }; }
}
async function readWorkUnitOccupancy(input: { cwd: string; store: Store; identity?: string }, marker: PresentMarker, name: string): Promise<MarkerOccupancy> {
  const listing = await input.store.list({ family: "work-item", kind: "work-item/meta" });
  if (listing.status === "refused") return unreadable(`${listing.refusal.condition} ${listing.refusal.remedy.text}`);
  const result = listing.result;
  if (result.status === "unreadable") return unreadable(`${result.condition} ${result.remedy.text}`);
  if (result.status === "complete" && (result.missed || result.diagnostics.length > 0)) return unreadable(`Work-unit inventory is incomplete. ${result.diagnostics.map(item => `${item.condition} ${item.remedy.text}`).join(" ")}`);
  const lookup = await input.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: SlugSchema.parse(name) } });
  if (lookup.status === "refused") {
    if (lookup.refusal.code !== "not-found") return unreadable(`${lookup.refusal.condition} ${lookup.refusal.remedy.text}`);
    const lineage = await readWorkUnitLineage(input.store, name);
    if (lineage !== null) return occupied(marker, `Checkout ${input.cwd} holds '${name}' with retained lineage. Inspect arc status ${name}; run arc teardown ${name} for ended work, or repair the marker after a rename.`);
    return { ...occupied(marker, noRecordMarkerExit(input.cwd, name, marker.marker.spawnedByArc)), missingRecord: true };
  }
  const read = await input.store.read({ reference: lookup.result.reference });
  if (read.status === "refused") return unreadable(`${read.refusal.condition} ${read.refusal.remedy.text}`);
  if (read.result.reference.kind !== "work-item/meta") return unreadable("The marker claim resolves to an Errand rather than a work unit.");
  return occupied(marker, workUnitMarkerExit(input.cwd, name, read.result, input.identity), read.result);
}
/** Describe the missing-record marker's distinct recovery paths. */
export function noRecordMarkerExit(cwd: string, name: string, spawned: boolean): string {
  return spawned ? `Checkout ${cwd} is a spawn's residue; run arc locus release ${name} to remove that checkout.`
    : `Checkout ${cwd} has an unfinished cold-start marker; run arc start ${name} --new --here there to finish it, or arc locus release ${name} to clear the marker.`;
}
/** Preserve the owning work unit's state-specific exit at every occupancy guard. */
export function workUnitMarkerExit(cwd: string, name: string, record: StoreRecord, identity?: string): string {
  const fields = ParsedMetaRecordSchema.parse(record.fields);
  const location = `Checkout ${cwd} already holds work unit '${name}' in ${resolveWorktreeMarkerPath(cwd)}.`;
  if (record.placement?.kind === "backlog") return `${location} Run arc locus release ${name} there.`;
  if (record.placement?.kind === "completed") return `${location} Run ${identity !== undefined && fields.owner !== identity ? "arc locus release" : "arc teardown"} ${name} there.`;
  if (fields.state === "Integrating") return `${location} Work there to finish integration, then run arc teardown ${name} there.`;
  if (fields.state === "Planning" || fields.state === "Active") return `${location} Work there, or as owner '${fields.owner ?? "unknown"}' run arc pause ${name} --reason <text>, then arc locus release ${name} there.`;
  return `${location} Inspect arc status ${name}, then release it there with arc locus release ${name} once eligible.`;
}
function occupied(marker: PresentMarker, reason: string, workUnit: StoreRecord | null = null): Extract<MarkerOccupancy, { kind: "occupied" }> {
  return { kind: "occupied", marker, reason, workUnit, missingRecord: false };
}
function unreadable(reason: string): Extract<MarkerOccupancy, { kind: "unreadable" }> { return { kind: "unreadable", reason }; }

async function transientMarkerExit(input: { cwd: string; store: Store }, marker: PresentMarker,
  subject: Exclude<Extract<ReturnType<typeof decodeWorktreeMarkerOwnership>, { kind: "current" }>["subject"], { kind: "work-unit" }>): Promise<string> {
  if (subject.kind === "branch") return `Checkout ${input.cwd} has branch-only marker ownership. Inspect and release that marker manually before claiming the checkout.`;
  const projected = subject.kind === "partial-errand" ? { kind: "partial-errand" as const, key: subject.slug, claimId: null }
    : { kind: subject.kind, key: subject.slug, claimId: subject.claimId };
  let identity: DerivedCheckoutRow["identity"] = null;
  if (subject.kind !== "partial-errand") {
    const lookup = await input.store.lookup({ kind: "claim", claim: { kind: subject.kind, slug: SlugSchema.parse(subject.slug), claimId: subject.claimId } });
    if (lookup.status === "ok") {
      const read = await input.store.read({ reference: lookup.result.reference });
      if (read.status === "ok") {
        const decoded = deserializeTransientIdentityRecord(read.result.content, subject.slug);
        if (decoded.kind === "valid") identity = projectLocusIdentity(decoded.record);
      }
    }
  }
  const row: DerivedCheckoutRow = { kind: "transient", subject: projected, identity, context: null, diagnostics: [], lifecycleLocation: null,
    checkout: { path: input.cwd, head: "", branch: null, detached: true, primary: !marker.marker.spawnedByArc, folderPresent: true },
    markerGeneration: digestBytes(marker.bytes), origin: null, parentCheckoutPath: marker.marker.parentCheckoutPath ?? null };
  const plan = deriveHandoffLocusPlan({ roster: [row], entering: { kind: "selected", row }, active: null,
    identityDiscovery: { kind: "absent" }, primaryAvailability: { kind: "occupied", checkoutPath: input.cwd, subject: projected } });
  if (plan.kind === "leave-errand") return `Checkout ${input.cwd} holds Errand '${subject.slug}'; run arc errand leave ${subject.slug}, or finish or abandon it, before claiming this checkout.`;
  return plan.kind === "refused" ? plan.recommendedPromptText : `Finish or abandon the ${subject.kind} before claiming checkout ${input.cwd}.`;
}
