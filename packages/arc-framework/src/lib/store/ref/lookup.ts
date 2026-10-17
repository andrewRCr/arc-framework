/** Metadata-based lookup of names, code links, and claims over captured state trees. */

import type { LookupInput, LookupResult } from "../lookup.js";
import type { StoreResult } from "../refusal.js";
import { RecordReferenceSchema, type RecordReference } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import type { RefMetadata } from "./metadata.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { lookupPrimary } from "./lookup-primary.js";
import { claimLookupCandidates, claimIdentityRefusal } from "./lookup-claims.js";
import { readLookupTrees } from "./lookup-trees.js";
import { z } from "zod";
import type { Slug } from "../../kernel/schema/slug.js";

/** One immutable tree's entries and decoded metadata, also usable by write views. */
export interface RefLookupTree { entries: readonly RefTreeEntry[]; metadata: RefMetadata; liveRef?: string; objects?: ReadonlyMap<string, BatchObject | null> }

/** Resolve logical handles from one tip capture, reusing unchanged metadata within this process. */
export async function lookupRefRecord(context: RefBackendContext, input: LookupInput): Promise<StoreResult<LookupResult>> {
  const identity = await context.identity();
  const missingIdentity = claimIdentityRefusal(input, identity);
  if (missingIdentity) return { status: "refused", refusal: missingIdentity };
  const trees = await readLookupTrees(context, identity);
  return trees.status === "refused" ? trees : lookupCapturedRefTrees(context, input, trees.result);
}

/** Match the same lookup rules against a caller's captured or prepared tree set. */
export function lookupCapturedRefTrees(context: Pick<RefBackendContext, "registry">, input: LookupInput,
  trees: ReadonlyMap<string, RefLookupTree>): StoreResult<LookupResult> {
  const candidates = lookupCandidates(context, input, trees);
  if (candidates.length > 1) return { status: "refused", refusal: {
    code: "ambiguous-match", class: "recoverable", candidates: candidates.map(({ reference }) => reference), condition: "The lookup matches more than one record generation.",
    remedy: { text: "Name the intended owner by UID and rename one to a free slug, then repeat the lookup." },
  } };
  const result = candidates[0];
  return result ? { status: "ok", result } : { status: "refused", refusal: {
    code: "not-found", class: "recoverable", lookup: input, condition: input.kind === "claim" && input.claim.kind === "partial-errand" ? "A partial Errand claim keeps no stored record."
      : "No readable primary, claim, or lineage origin matches this lookup.",
    remedy: { text: "Pull state or correct the requested name or origin, then repeat the lookup." },
  } };
}

function lookupCandidates(context: Pick<RefBackendContext, "registry">, input: LookupInput,
  trees: ReadonlyMap<string, RefLookupTree>): LookupResult[] {
  if (input.kind === "slug") return slugCandidates(context, trees, input.slug).map((reference) => ({ reference }));
  if (input.kind === "lineage") return lineageCandidates(trees, input.origin).map((reference) => ({ reference }));
  if (input.kind === "ref") return [...trees].flatMap(([ref, tree]) => {
    const reference = lookupPrimary(context, ref, tree);
    return reference && tree.metadata.primary?.links?.branches?.some((branch) => branch.repository === input.repository && branch.ref === input.ref)
      ? [{ reference }] : [];
  });
  if (input.kind === "commit") {
    const exact = commitCandidates(context, trees, input, "sha");
    return exact.length ? exact : commitCandidates(context, trees, input, "copyKey");
  }
  return claimLookupCandidates(context, input.claim, trees);
}

function commitCandidates(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>,
  input: Extract<LookupInput, { kind: "commit" }>, match: "sha" | "copyKey"): LookupResult[] {
  const value = input[match];
  if (value === undefined) return [];
  return [...trees].flatMap(([ref, tree]) => {
    const reference = lookupPrimary(context, ref, tree);
    if (!reference || !["work-item/meta", "work-item/record"].includes(reference.kind)) return [];
    const links = tree.metadata.primary?.links;
    const taskIds = Object.entries(links?.taskCaptures ?? {}).filter(([, captures]) => captures.some((capture) =>
      capture.repository === input.repository && capture[match] === value)).map(([taskId]) => taskId);
    const landing = links?.landingCommit;
    return taskIds.length || landing?.repository === input.repository && landing[match] === value ? [{ reference, taskIds }] : [];
  });
}

function slugCandidates(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>, slug: Slug): RecordReference[] {
  const current: RecordReference[] = [];
  const former: RecordReference[] = [];
  const completed: RecordReference[] = [], completedFormer: RecordReference[] = [];
  for (const [ref, tree] of trees) {
    const reference = lookupPrimary(context, ref, tree);
    if (!reference) continue;
    if (tree.metadata.slug === slug) (tree.liveRef ? completed : current).push(reference);
    else if (tree.metadata.formerSlugs?.includes(slug)) (tree.liveRef ? completedFormer : former).push(reference);
  }
  return [current, former, completed, completedFormer].find((tier) => tier.length > 0) ?? [];
}

function lineageCandidates(trees: ReadonlyMap<string, RefLookupTree>, origin: string): RecordReference[] {
  const registry = trees.get("refs/arc/project/registry");
  if (!registry) return [];
  const byUid = z.uuid().safeParse(origin).success;
  return Object.entries(registry.metadata.lineage ?? {}).flatMap(([uid, name]) => (byUid ? uid === origin : name === origin)
    && registry.entries.some(({ path }) => path === `lineage/${uid}.json`)
    ? [RecordReferenceSchema.parse({ owner: { type: "work-item", name, uid }, kind: "lineage/transition" })] : []);
}
