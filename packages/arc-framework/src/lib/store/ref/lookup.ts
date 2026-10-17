/** Metadata-based live slug and lineage lookup over captured state trees. */

import type { LookupInput, LookupResult } from "../lookup.js";
import type { StoreResult } from "../refusal.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import { expandStoredPath } from "../stored-path.js";
import type { RefBackendContext } from "./context.js";
import type { RefMetadata } from "./metadata.js";
import type { RefTreeEntry } from "./batch-read.js";
import { matchesFamilyRef, refOwner } from "./codec.js";
import { readLookupTrees } from "./lookup-trees.js";
import { z } from "zod";
import type { Slug } from "../../kernel/schema/slug.js";

/** One immutable tree's entries and decoded metadata, also usable by write views. */
export interface RefLookupTree { entries: readonly RefTreeEntry[]; metadata: RefMetadata }

/** Resolve live names from one tip capture, reusing unchanged metadata within this process. */
export async function lookupRefRecord(context: RefBackendContext, input: LookupInput): Promise<StoreResult<LookupResult>> {
  const trees = await readLookupTrees(context);
  return trees.status === "refused" ? trees : lookupCapturedRefTrees(context, input, trees.result);
}

/** Match the same lookup rules against a caller's captured or prepared tree set. */
export function lookupCapturedRefTrees(context: Pick<RefBackendContext, "registry">, input: LookupInput,
  trees: ReadonlyMap<string, RefLookupTree>): StoreResult<LookupResult> {
  if (input.kind !== "slug" && input.kind !== "lineage") throw new Error(`Lookup ${input.kind} is not implemented for the ref store`);
  const candidates = input.kind === "slug" ? slugCandidates(context, trees, input.slug) : lineageCandidates(trees, input.origin);
  if (candidates.length > 1) return { status: "refused", refusal: {
    code: "ambiguous-match", class: "recoverable", candidates, condition: "The lookup matches more than one record generation.",
    remedy: { text: "Name the intended owner by UID and rename one to a free slug, then repeat the lookup." },
  } };
  const reference = candidates[0];
  return reference ? { status: "ok", result: { reference } } : { status: "refused", refusal: {
    code: "not-found", class: "recoverable", lookup: input, condition: "No readable live primary or lineage origin matches this lookup.",
    remedy: { text: "Pull state or correct the requested name or origin, then repeat the lookup." },
  } };
}

function slugCandidates(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>, slug: Slug): RecordReference[] {
  const current: RecordReference[] = [];
  const former: RecordReference[] = [];
  for (const [ref, tree] of trees) {
    const reference = liveLookupPrimary(context, ref, tree);
    if (!reference) continue;
    if (tree.metadata.slug === slug) current.push(reference);
    else if (tree.metadata.formerSlugs?.includes(slug)) former.push(reference);
  }
  return current.length > 0 ? current : former;
}

function liveLookupPrimary(context: Pick<RefBackendContext, "registry">, ref: string, tree: RefLookupTree): RecordReference | null {
  const cohort = matchesFamilyRef(ref, "cohort");
  if (!cohort && !matchesFamilyRef(ref, "work-item")) return null;
  const kind = cohort ? "cohort/document" : tree.metadata.primary?.role;
  if (!kind) return null;
  const reference = RecordReferenceSchema.parse({ owner: refOwner(ref, cohort ? "cohort" : "work-item", tree.metadata), kind });
  return tree.entries.some(({ path }) => path === expandStoredPath(reference, { registry: context.registry }).path) ? reference : null;
}

function lineageCandidates(trees: ReadonlyMap<string, RefLookupTree>, origin: string): RecordReference[] {
  const registry = trees.get("refs/arc/project/registry");
  if (!registry) return [];
  const byUid = z.uuid().safeParse(origin).success;
  return Object.entries(registry.metadata.lineage ?? {}).flatMap(([uid, name]) => (byUid ? uid === origin : name === origin)
    && registry.entries.some(({ path }) => path === `lineage/${uid}.json`)
    ? [RecordReferenceSchema.parse({ owner: { type: "work-item", name, uid }, kind: "lineage/transition" })] : []);
}
