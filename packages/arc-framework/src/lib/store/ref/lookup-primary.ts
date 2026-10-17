/** Decode an owner's primary coordinate from live or completed lookup metadata. */
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefLookupTree } from "./lookup.js";
import type { Slug } from "../../kernel/schema/slug.js";
import { matchesFamilyRef, refOwner } from "./codec.js";

/** A retained metadata file names an owner only while its primary path is present. */
export function lookupPrimary(context: Pick<RefBackendContext, "registry">, ref: string, tree: RefLookupTree): RecordReference | null {
  ref = tree.liveRef ?? ref;
  const cohort = matchesFamilyRef(ref, "cohort");
  if (!cohort && !matchesFamilyRef(ref, "work-item")) return null;
  const kind = cohort ? "cohort/document" : tree.metadata.primary?.role;
  if (!kind) return null;
  const reference = RecordReferenceSchema.parse({ owner: refOwner(ref, cohort ? "cohort" : "work-item", tree.metadata), kind });
  return tree.entries.some(({ path }) => path === expandStoredPath(reference, { registry: context.registry }).path) ? reference : null;
}

/** Rank one name consistently, optionally admitting owners whose auxiliary records outlive their primary. */
export function preferredNameTrees(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>,
  slug: Slug, requirePrimary = true): Array<[string, RefLookupTree]> {
  const primaries = rankNameTrees(context, trees, slug, true);
  return requirePrimary || primaries.length ? primaries : rankNameTrees(context, trees, slug, false);
}

function rankNameTrees(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>,
  slug: Slug, requirePrimary: boolean): Array<[string, RefLookupTree]> {
  const tiers: Array<Array<[string, RefLookupTree]>> = [[], [], [], []];
  for (const [ref, tree] of trees) {
    const live = tree.liveRef ?? ref;
    if (!matchesFamilyRef(live, "work-item") && !matchesFamilyRef(live, "cohort")) continue;
    if (requirePrimary && !lookupPrimary(context, ref, tree)) continue;
    const current = tree.metadata.slug === slug;
    if (!current && !tree.metadata.formerSlugs?.includes(slug)) continue;
    tiers[(tree.liveRef ? 2 : 0) + (current ? 0 : 1)]?.push([ref, tree]);
  }
  return tiers.find((tier) => tier.length > 0) ?? [];
}
