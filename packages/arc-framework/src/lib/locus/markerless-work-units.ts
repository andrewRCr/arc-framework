/** Match unclaimed registered checkouts to repository-qualified in-flight work branches. */
import type { Store } from "../store/contract.js";
import { listLifecycleIndex } from "../store/lifecycle-index.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { createProjectIdentityReader } from "../store/project-identity.js";
import { selectWorkBranchLink, workBranchName } from "../store/lifecycle-branch.js";
import type { DerivedCheckoutRow } from "./derived-roster.js";
import type { StoreRecord } from "../store/read.js";
import type { RegisteredWorktree } from "../git/worktree-roster.js";
/** A work unit can be claimed in place from this exact checkout. */
export interface MarkerlessWorkUnitCheckout { workUnit: string; checkoutPath: string }
/** Find owned work whose checkout predates marker-based claims. */
export async function findMarkerlessWorkUnitCheckouts(input: { store: Store; identity: string;
  roster: readonly DerivedCheckoutRow[]; projectId?: () => Promise<string> }): Promise<MarkerlessWorkUnitCheckout[]> {
  const repository = await (input.projectId ?? createProjectIdentityReader(input.store))();
  if (repository.trim() === "") throw new Error("Project identity is unavailable; markerless checkout matches are incomplete.");
  const listing = await listLifecycleIndex(input.store, { locations: ["active"] });
  if (listing.status === "refused") throw new Error(`${listing.refusal.condition} ${listing.refusal.remedy.text}`);
  requireCompleteInventory(input.store, listing.result);
  if (listing.result.status !== "complete") return [];
  const checkouts = input.roster.filter(isUnclaimedCheckout);
  const matches: MarkerlessWorkUnitCheckout[] = [];
  for (const entry of listing.result.index.entries()) {
    if (entry.fields.owner !== input.identity || entry.phase === "Shipped") continue;
    for (const checkoutPath of findWorkBranchCheckoutPaths(entry, repository, checkouts.map(row => row.checkout))) {
      matches.push({ workUnit: entry.reference.owner.name, checkoutPath });
    }
  }
  return matches;
}

/** Match one exact primary's repository-qualified branch against already verified unclaimed registrations. */
export function findWorkBranchCheckoutPaths(record: Pick<StoreRecord, "links">, repository: string,
  checkouts: readonly RegisteredWorktree[]): string[] {
  if (repository.trim() === "") throw new Error("Project identity is unavailable; markerless checkout matches are incomplete.");
  const selected = selectWorkBranchLink(record, { repository });
  if (selected.kind === "ambiguous") throw new Error(selected.reason);
  if (selected.kind === "none") return [];
  const branch = workBranchName(selected.link.ref);
  return checkouts.filter(row => row.branch === branch).map(row => row.path);
}
function isUnclaimedCheckout(row: DerivedCheckoutRow): boolean {
  return row.checkout.folderPresent && row.markerGeneration === null && row.subject === null
    && row.diagnostics.every(diagnostic => diagnostic.code === "primary-safety-unproven");
}
