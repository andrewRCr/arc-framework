/** Claim and branch resolution through the current local identity snapshot. */
import { readTransientIdentitySnapshot } from "../../errand/identity-snapshot.js";
import type { CheckoutClaim, LookupInput, LookupResult } from "../lookup.js";
import type { TransientIdentityRecord } from "../../errand/identity-record.js";
import type { InRepoContext } from "./context.js";
import { transientIO, transientKind, transientReference } from "./transient-common.js";
import { refuse } from "./refusals.js";

/** Resolve transient handles or allow a tracked-only handle to continue there.
 * @param context - Backend dependencies.
 * @param input - Claim, branch, or other logical handle.
 * @returns The resolved entry, or null when the handle belongs to tracked state.
 */
export async function lookupTransient(context: InRepoContext, input: LookupInput): Promise<LookupResult | null> {
  const claim = input.kind === "claim" && input.claim.kind !== "work-unit" ? input.claim : null;
  const branch = lookupBranch(input);
  if (!isTransientLookup(input, claim, branch)) return null;
  if (claim?.kind === "partial-errand") return missing(input, "A partial-protection Errand keeps no record.", "Use its checkout-local claim; partial Errands have no Store record.");
  const io = await transientIO(context);
  if (io === null) {
    if (input.kind === "slug") return null;
    return missing(input, "No identity is configured.", "Set arc.identity, then retry lookup.");
  }
  if (input.kind === "ref" && !await sameRepository(context, input.repository)) return missing(input, "The lookup names another repository.", "Select this checkout's path or its configured origin URL.");
  const snapshot = await readTransientIdentitySnapshot(io);
  if (snapshot.kind === "error") throw new Error(snapshot.message);
  if (snapshot.kind === "complete") {
    for (const [key, record] of snapshot.records) {
      const kind = transientKind(record);
      if (matchesLookup(input, claim, branch, record)) return { reference: transientReference(kind, key, io.identity) };
    }
  }
  if (input.kind === "slug") return null;
  return missing(input, "No identity-ref record matches the lookup.", "Check the branch or claim generation and restore its record before retrying.");
}
function lookupBranch(input: LookupInput): string | null {
  return input.kind === "ref" ? input.ref.replace(/^refs\/heads\//u, "").replace(/^refs\/remotes\/[^/]+\//u, "") : null;
}
function isTransientLookup(input: LookupInput, claim: CheckoutClaim | null, branch: string | null): boolean {
  return claim !== null || (branch !== null && branch.startsWith("chore/")) || input.kind === "slug";
}
function matchesLookup(input: LookupInput, claim: CheckoutClaim | null, branch: string | null, record: TransientIdentityRecord): boolean {
  const kind = transientKind(record);
  if (claim !== null) {
    if (claim.kind === "work-unit" || claim.kind === "partial-errand") return false;
    const expected = { errand: "work-item/record", groom: "claims/groom", housekeep: "claims/housekeep" }[claim.kind];
    return record.slug === claim.slug && record.claimId === claim.claimId && kind === expected;
  }
  if (kind !== "work-item/record") return false;
  return branch !== null ? record.branch === branch : input.kind === "slug" && record.slug === input.slug;
}
async function sameRepository(context: InRepoContext, repository: string): Promise<boolean> {
  if (repository === context.ports.checkoutRoot) return true;
  const options = { cwd: context.ports.checkoutRoot, objectAccess: "local-only" as const };
  const remotes = (await context.ports.exec("git", ["remote"], options)).stdout.split("\n");
  if (!remotes.includes("origin")) return false;
  return (await context.ports.exec("git", ["remote", "get-url", "origin"], options)).stdout.trim() === repository;
}
function missing(input: LookupInput, condition: string, text: string): never {
  return refuse({ code: "not-found", class: "recoverable", lookup: input, condition, remedy: { text } });
}
