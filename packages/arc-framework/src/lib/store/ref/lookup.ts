/** Metadata-based lookup of names, code links, and claims over captured state trees. */

import type { LookupInput, LookupResult } from "../lookup.js";
import { restartOnVanishedStore } from "./repository.js";
import type { StoreResult, StoreRefusal } from "../refusal.js";
import { RecordReferenceSchema, StoredUidSchema, type RecordReference } from "../identity.js";
import type { RefBackendContext } from "./context.js";
import type { RefMetadata } from "./metadata.js";
import type { BatchObject, RefTreeEntry } from "./batch-read.js";
import { lookupPrimary, preferredNameTrees } from "./lookup-primary.js";
import { claimLookupCandidates, claimIdentityRefusal, claimPayloadRefusal } from "./lookup-claims.js";
import { readLookupTrees } from "./lookup-trees.js";
import type { Slug } from "../../kernel/schema/slug.js";
import type { ArchivedFolder } from "./archive-read.js";
import { completedLookupWinner } from "./lookup-ranking.js";

/** One immutable tree's entries and decoded metadata, also usable by write views. */
export interface RefLookupTree { entries: readonly RefTreeEntry[]; metadata: RefMetadata; liveRef?: string; objects?: ReadonlyMap<string, BatchObject | null>; archived?: ArchivedFolder }

interface LookupSelection {
  candidates: LookupResult[];
  tie?: Extract<StoreRefusal, { code: "ambiguous-match" }>["tie"];
}

/** Resolve logical handles from one tip capture, reusing unchanged metadata within this process. */
export async function lookupRefRecord(context: RefBackendContext, input: LookupInput): Promise<StoreResult<LookupResult>> {
  const identity = await context.identity();
  const missingIdentity = claimIdentityRefusal(input, identity);
  if (missingIdentity) return { status: "refused", refusal: missingIdentity };
  return restartOnVanishedStore(context, async (bound) => {
    const trees = await readLookupTrees(bound, identity);
    return trees.status === "refused" ? trees : lookupCapturedRefTrees(bound, input, trees.result.trees, trees.result.unreadable);
  });
}

/** Match the same lookup rules against a caller's captured or prepared tree set. */
export function lookupCapturedRefTrees(context: Pick<RefBackendContext, "registry">, input: LookupInput,
  trees: ReadonlyMap<string, RefLookupTree>, unreadable: ReadonlyMap<string, StoreRefusal> = new Map()): StoreResult<LookupResult> {
  const payload = input.kind === "claim" ? claimPayloadRefusal(context, input.claim, trees) : undefined;
  if (payload) return { status: "refused", refusal: payload };
  const { candidates, tie } = lookupCandidates(context, input, trees);
  const skipped = lookupSkippedRefusal(context, input, trees, unreadable, candidates.length > 0);
  if (skipped) return { status: "refused", refusal: skipped };
  if (candidates.length > 1) return { status: "refused", refusal: {
    code: "ambiguous-match", class: "recoverable", candidates: candidates.map(({ reference }) => reference), ...(tie ? { tie } : {}), condition: "The lookup matches more than one record generation.",
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
  trees: ReadonlyMap<string, RefLookupTree>): LookupSelection {
  if (input.kind === "slug") return slugCandidates(context, trees, input.slug);
  if (input.kind === "lineage") return { candidates: lineageCandidates(trees, input.origin).map((reference) => ({ reference })) };
  if (input.kind === "ref") return { candidates: [...trees].flatMap(([ref, tree]) => {
    const reference = lookupPrimary(context, ref, tree);
    return reference && tree.metadata.primary?.links?.branches?.some((branch) => branch.repository === input.repository && branch.ref === input.ref)
      ? [{ reference }] : [];
  }) };
  if (input.kind === "commit") {
    const exact = commitCandidates(context, trees, input, "sha");
    return { candidates: exact.length ? exact : commitCandidates(context, trees, input, "copyKey") };
  }
  return { candidates: claimLookupCandidates(context, input.claim, trees) };
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

// Work items and cohorts compete in the same slug tiers.
function slugCandidates(context: Pick<RefBackendContext, "registry">, trees: ReadonlyMap<string, RefLookupTree>, slug: Slug): LookupSelection {
  const tier = preferredNameTrees(context, trees, slug), first = tier[0]?.[1];
  const candidates = completedLookupWinner(context, tier).flatMap(([ref, tree]) => {
    const reference = lookupPrimary(context, ref, tree);
    return reference ? [{ reference }] : [];
  });
  return { candidates, ...(first ? { tie: { liveness: first.liveRef ? "completed" : "live", name: first.metadata.slug === slug ? "current" : "former" } } : {}) };
}

function lineageCandidates(trees: ReadonlyMap<string, RefLookupTree>, origin: string): RecordReference[] {
  const registry = trees.get("refs/arc/project/registry");
  if (!registry) return [];
  const byUid = StoredUidSchema.safeParse(origin).success;
  const paths = new Set(registry.entries.map(({ path }) => path));
  const held = Object.entries(registry.metadata.lineage ?? {})
    .filter(([uid]) => paths.has(`lineage/${uid}.json`));
  const exact = held.filter(([uid, name]) => byUid ? uid === origin : name === origin);
  const matches = exact.length || byUid ? exact
    : held.filter(([uid]) => registry.metadata.lineageFormerSlugs?.[uid]?.some(name => name === origin));
  return matches.map(([uid, name]) => RecordReferenceSchema.parse({ owner: { type: "work-item", name, uid }, kind: "lineage/transition" }));
}

// Slug and ref lookups admit cohorts; commit and work-unit claim evidence stays within work-item holders.
function answerHolders(input: LookupInput): RegExp {
  return input.kind === "ref" || input.kind === "slug" ? /^refs\/arc\/(?:work|cohort|archive)\//u : /^refs\/arc\/(?:work|archive)\//u;
}

function lookupSkippedRefusal(context: Pick<RefBackendContext, "registry">, input: LookupInput,
  trees: ReadonlyMap<string, RefLookupTree>, unreadable: ReadonlyMap<string, StoreRefusal>, matched: boolean): StoreRefusal | undefined {
  if (input.kind === "lineage") return unreadable.get("refs/arc/project/registry");
  if (input.kind === "claim" && input.claim.kind === "partial-errand") return undefined;
  if (input.kind === "claim" && (input.claim.kind === "groom" || input.claim.kind === "housekeep")) {
    return matched ? undefined : [...unreadable].find(([ref]) => /^refs\/arc\/user\/[^/]+\/claims$/u.test(ref))?.[1];
  }
  const holders = answerHolders(input);
  const skipped = [...unreadable].find(([ref]) => holders.test(ref))?.[1];
  if (!skipped) return undefined;
  if (input.kind === "slug") {
    return preferredNameTrees(context, trees, input.slug).some(([, tree]) => !tree.liveRef && tree.metadata.slug === input.slug)
      ? undefined : skipped;
  }
  if (input.kind === "commit") return commitCandidates(context, trees, input, "sha").length > 0 ? undefined : skipped;
  return matched ? undefined : skipped;
}
