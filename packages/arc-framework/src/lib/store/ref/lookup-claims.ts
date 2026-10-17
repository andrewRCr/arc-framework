/** Resolve marker claims using their primary or identity-scoped machine record. */
import type { CheckoutClaim, LookupInput, LookupResult } from "../lookup.js";
import type { StoreRefusal } from "../refusal.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import { lookupPrimary } from "./lookup-primary.js";
import { decodeReference } from "./codec.js";
import { readRefContent } from "./content-read.js";

/** Match claims against the exact parsed token; partial Errands have no record. */
export function claimLookupCandidates(context: Pick<RefBackendContext, "registry">, claim: CheckoutClaim,
  trees: ReadonlyMap<string, RefLookupTree>): LookupResult[] {
  if (claim.kind === "partial-errand") return [];
  const matches: LookupResult[] = [];
  for (const [ref, tree] of trees) {
    if (claim.kind === "groom" || claim.kind === "housekeep") {
      matches.push(...personalClaimCandidates(context, claim, ref, tree));
      continue;
    }
    const reference = lookupPrimary(context, ref, tree);
    if (!reference || reference.owner.name !== claim.slug) continue;
    if (claim.kind === "work-unit" && reference.kind === "work-item/meta"
      || claim.kind === "errand" && reference.kind === "work-item/record" && storedClaimId(context, tree, reference) === claim.claimId) matches.push({ reference });
  }
  return matches;
}

function personalClaimCandidates(context: Pick<RefBackendContext, "registry">, claim: Extract<CheckoutClaim, { kind: "groom" | "housekeep" }>,
  ref: string, tree: RefLookupTree): LookupResult[] {
  if (!/^refs\/arc\/user\/[^/]+\/claims$/u.test(ref)) return [];
  const owner = { type: "person" as const, name: ref.split("/")[3] };
  return tree.entries.flatMap(({ path, oid }) => {
    const reference = decodeReference(context, RecordReferenceSchema.parse({ kind: `claims/${claim.kind}`, owner, key: claim.slug }).owner,
      "claims", path, tree.metadata, tree.objects?.get(oid));
    return reference && "owner" in reference && reference.kind === `claims/${claim.kind}` && reference.key === claim.slug
      && storedClaimId(context, tree, reference) === claim.claimId ? [{ reference }] : [];
  });
}

function storedClaimId(context: Pick<RefBackendContext, "registry">, tree: RefLookupTree, reference: RecordReference): unknown {
  const path = expandStoredPath(reference, { registry: context.registry }).path;
  const entry = tree.entries.find((entry) => entry.path === path), object = entry ? tree.objects?.get(entry.oid) : null;
  if (object?.type !== "blob") return undefined;
  const decoded = readRefContent(context.registry[reference.kind], object.bytes);
  if (!("content" in decoded)) return undefined;
  const fields: unknown = decoded.fields ?? JSON.parse(decoded.content);
  return typeof fields === "object" && fields !== null && "claimId" in fields ? fields.claimId : undefined;
}

/** Identity-scoped claims require the caller's configured identity before scanning. */
export function claimIdentityRefusal(input: LookupInput, identity: string | null): StoreRefusal | null {
  return identity === null && input.kind === "claim" && ["groom", "housekeep"].includes(input.claim.kind) ? {
    code: "not-found", class: "recoverable", lookup: input, condition: "No arc.identity is configured for this identity-scoped claim.",
    remedy: { text: "Configure arc.identity to the claim owner's identity, then repeat the lookup." },
  } : null;
}
