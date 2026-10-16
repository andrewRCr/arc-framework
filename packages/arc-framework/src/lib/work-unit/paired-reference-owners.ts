/** Resolve paired-spec filenames without guessing whether a suffix belongs to an owner slug. */
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import type { ArtifactReferenceOwner } from "./reference-reconcile.js";

/** Acquire all evidenced owner interpretations for paired artifact filenames.
 * @param store - Live primary and alias lookup boundary.
 * @param records - Current owner's acquired artifacts.
 * @param retiredNames - Authenticated terminal names and their former names.
 * @returns Filename interpretations, retaining ambiguity and lookup refusals.
 */
export async function readPairedReferenceOwners(store: Store, records: readonly StoreRecord[], retiredNames: ReadonlySet<string>): Promise<StoreResult<ReadonlyMap<string, readonly ArtifactReferenceOwner[]>>> {
  const owners = new Map<string, ArtifactReferenceOwner[]>();
  for (const [filename, candidates] of pairedCandidates(records)) {
    const resolved: ArtifactReferenceOwner[] = [];
    for (const candidate of candidates) {
      const known = await knownArtifactOwner(store, candidate.subject, retiredNames);
      if (known.status === "refused") return known;
      if (known.result) resolved.push(candidate);
    }
    owners.set(filename, resolved);
  }
  return { status: "ok", result: owners };
}
function pairedCandidates(records: readonly StoreRecord[]): Map<string, ArtifactReferenceOwner[]> {
  const candidates = new Map<string, ArtifactReferenceOwner[]>();
  for (const record of records) {
    for (const match of record.content.matchAll(/\bspec-([a-z0-9]+(?:-[a-z0-9]+)*)-(prd|rfc)\.md\b/gu)) {
      const [filename, subject, half] = match;
      if (subject !== undefined && half !== undefined) candidates.set(filename,
        [{ subject: `${subject}-${half}`, suffix: "" }, { subject, suffix: `-${half}` }]);
    }
  }
  return candidates;
}
async function knownArtifactOwner(store: Store, subject: string, retiredNames: ReadonlySet<string>): Promise<StoreResult<boolean>> {
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(subject) });
  if (lookup.status === "refused" && lookup.refusal.code !== "not-found") return lookup;
  return { status: "ok", result: lookup.status === "ok"
    ? lookup.result.reference.kind === "work-item/meta" : retiredNames.has(subject) };
}
