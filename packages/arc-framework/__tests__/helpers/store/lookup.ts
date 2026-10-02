/** Source-grounded reverse lookup over references, parsed claims and stored links. */

import type { LookupInput, LookupResult, StoreResult } from "../../../src/lib/store/index.js";
import type { ReferenceContext } from "./context.js";
import type { MemoryRecord } from "./model.js";
import { missingLookup, namespaceAdmission, ok, recordAdmission, refused } from "./refusals.js";

function primary(record: MemoryRecord): boolean {
  return record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record";
}

function fields(context: ReferenceContext, record: MemoryRecord): Record<string, unknown> | undefined {
  const parsed = context.registry[record.reference.kind].parser?.(record.content);
  if (!parsed?.success || typeof parsed.data !== "object" || parsed.data === null || Array.isArray(parsed.data)) return undefined;
  return parsed.data as Record<string, unknown>;
}

function repositoryMatches(record: MemoryRecord, repository: string): boolean {
  return record.links?.branch?.repository === repository || record.links?.changeRequest?.repository === repository;
}

function commitMatch(record: MemoryRecord, input: Extract<LookupInput, { kind: "commit" }>, match: "sha" | "patchId"): LookupResult | undefined {
  if (!primary(record) || !repositoryMatches(record, input.repository)) return undefined;
  const value = input[match];
  if (value === undefined) return undefined;
  const taskIds = Object.entries(record.links?.taskCaptures ?? {}).filter(([, captures]) => captures.some((capture) => capture[match] === value)).map(([taskId]) => taskId);
  return taskIds.length > 0 || record.links?.landingCommit?.[match] === value ? { reference: record.reference, taskIds } : undefined;
}

/** Resolve logical handles and code links without reading a projected path or Git repository.
 * @param context - Local records, identity and pure field parsers.
 * @param input - Exact reverse-lookup request.
 * @returns The sole matching record, a nameable absence, or every ambiguous candidate.
 */
export function lookupReference(context: ReferenceContext, input: LookupInput): StoreResult<LookupResult> {
  const admission = namespaceAdmission(context.state);
  if (admission) return refused(admission);
  if (input.kind === "claim" && ["groom", "housekeep"].includes(input.claim.kind) && context.environment.identity === undefined) {
    return refused({ ...missingLookup(input), condition: "No arc.identity is configured for this identity-scoped claim.",
      remedy: { text: "Set arc.identity to the claim owner's identity, then repeat the lookup." } });
  }
  const records = [...context.state.records.values()];
  let candidates: LookupResult[];
  if (input.kind === "commit") {
    const sha = records.flatMap((record) => commitMatch(record, input, "sha") ?? []);
    candidates = sha.length > 0 ? sha : records.flatMap((record) => commitMatch(record, input, "patchId") ?? []);
  } else candidates = records.filter((record) => {
    switch (input.kind) {
      case "slug": return primary(record) && (record.reference.owner.name === input.slug || record.formerSlugs.includes(input.slug));
      case "lineage": return record.reference.kind === "lineage/transition" && record.reference.owner.type !== "person" && record.reference.owner.uid === input.origin;
      case "ref": return primary(record) && record.links?.branch?.repository === input.repository && record.links.branch.ref === input.ref;
      case "claim": {
        const claim = input.claim;
        if (claim.kind === "partial-errand") return false;
        if (claim.kind === "work-unit") return record.reference.kind === "work-item/meta" && record.reference.owner.name === claim.slug;
        const kind = claim.kind === "errand" ? "work-item/record" : `claims/${claim.kind}`;
        const slug = claim.kind === "errand" ? record.reference.owner.name : record.reference.key;
        return record.reference.kind === kind && slug === claim.slug && fields(context, record)?.claimId === claim.claimId;
      }
    }
  }).map((record) => ({ reference: record.reference }));
  if (candidates.length === 0) return refused(missingLookup(input));
  for (const candidate of candidates) {
    const fault = recordAdmission(context.state, candidate.reference, context.environment.identity);
    if (fault) return refused(fault);
  }
  if (candidates.length > 1) return refused({
    code: "ambiguous-match", class: "recoverable", candidates: candidates.map((candidate) => candidate.reference),
    condition: "The lookup matches more than one record generation.",
    remedy: { text: "Disambiguate the stored names or links, then repeat the lookup." },
  });
  return ok(candidates[0]!);
}
