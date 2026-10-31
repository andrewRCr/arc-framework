/** Completed lifecycle projections independent of archive folder numbering. */
import type { Store } from "./contract.js";
import { listLifecycleIndex, type LifecycleEntry, type LifecycleIndexOutcome } from "./lifecycle-index.js";
import { createProjectIdentityReader, resolveProjectIdentity } from "./project-identity.js";
import { workBranchName } from "./lifecycle-branch.js";
import type { CompletedEvidenceRead, ShippedWorkUnitRecord } from "../work-unit/completed-index.js";
import type { BranchLink } from "./links.js";
import { selectStandingLifecycleEntries } from "./lifecycle-standing.js";
/** Read completed work units through logical placement, retaining listing failure evidence. */
export async function readStoreCompletedEvidence(store: Store): Promise<CompletedEvidenceRead> {
  const [listing, live] = await Promise.all([
    listLifecycleIndex(store, { locations: ["completed"] }),
    listLifecycleIndex(store, { locations: ["active", "planned", "provisional"] }),
  ]);
  if (listing.status === "refused" || listing.result.status === "unreadable") return { status: "unavailable", reason: "archive-tree-read-failed" };
  if (live.status === "refused" || live.result.status === "unreadable") return { status: "unavailable", reason: "archive-tree-read-failed" };
  const records = new Map<string, ShippedWorkUnitRecord>();
  if (listing.result.status === "absent") return { status: "available", records };
  const excluded = live.result.status === "complete" ? liveNames(live.result) : new Set<string>();
  const standing = selectStandingLifecycleEntries(listing.result.index.entries(), listing.result.diagnostics);
  for (const entry of standing.entries) {
    if (!excluded.has(entry.reference.owner.name)) records.set(entry.reference.owner.name, completedRecord(entry));
  }
  return listing.result.missed || listing.result.diagnostics.length > 0 ? { status: "partial", records,
    unreadableMetaPaths: listing.result.diagnostics.map((item) => `${item.key}: ${item.condition} ${item.remedy.text}`) } : { status: "available", records };
}
function liveNames(listing: Extract<LifecycleIndexOutcome, { status: "complete" }>): Set<string> {
  const names = new Set<string>(listing.index.entries().flatMap(entry => [entry.reference.owner.name, ...(entry.aliases ?? [])]));
  for (const diagnostic of listing.diagnostics) {
    const name = /^work-item\/meta:(.+)$/u.exec(diagnostic.key)?.[1];
    if (name !== undefined) names.add(name);
  }
  return names;
}
function completedRecord(entry: LifecycleEntry): ShippedWorkUnitRecord {
  const fields = entry.fields, pr = /^(https?:\/\/[^\s]+\/pull\/([1-9]\d*))$/u.exec(fields.prUrl?.trim() ?? "");
  const number = pr === null ? null : Number(pr[2]);
  const completed = fields.completed?.trim();
  return { slug: entry.reference.owner.name,
    completedAt: completed === undefined || Number.isNaN(Date.parse(completed)) ? null : completed,
    prUrl: pr?.[1] ?? null, prNumber: Number.isSafeInteger(number) ? number : null };
}

/** Resolve ended branches by their own repository-qualified links, never by the branch's spelling. */
export async function readStoreCompletedBranches(store: Store, projectId?: () => Promise<string>): Promise<
  { status: "ready"; branches: Map<string, { name: string; link: BranchLink }> } | { status: "unavailable"; reason: string }> {
  let project;
  try { project = await resolveProjectIdentity(projectId ?? createProjectIdentityReader(store)); }
  catch (error) { return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) }; }
  if (project.status !== "ready") return { status: "unavailable", reason: `${project.reason} ${project.remedy.text}` };
  const listing = await listLifecycleIndex(store, { locations: ["completed"] });
  if (listing.status === "refused") return { status: "unavailable", reason: `${listing.refusal.condition} ${listing.refusal.remedy.text}` };
  if (listing.result.status === "unreadable") return { status: "unavailable", reason: `${listing.result.condition} ${listing.result.remedy.text}` };
  const branches = new Map<string, { name: string; link: BranchLink }>();
  if (listing.result.status === "absent") return { status: "ready", branches };
  if (listing.result.missed || listing.result.diagnostics.length > 0) return { status: "unavailable", reason: listing.result.diagnostics.map((item) => `${item.condition} ${item.remedy.text}`).join("; ") || "Completed work-unit inventory is incomplete; repair it, then retry." };
  for (const entry of listing.result.index.entries()) {
    for (const link of entry.links?.branches ?? []) if (link.repository === project.id) branches.set(workBranchName(link.ref), { name: entry.reference.owner.name, link });
  }
  return { status: "ready", branches };
}
