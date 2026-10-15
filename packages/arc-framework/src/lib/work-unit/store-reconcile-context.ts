/** Complete store-backed context and version bases for current-work-unit reconciliation. */
import { SlugSchema } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { lifecycleRecordPath } from "../store/lifecycle-record-path.js";
import { acquireLifecycleRecords } from "./prepared-lifecycle-write.js";
import type { CurrentWuReconcilePrepareContext } from "./side-effects/discharge-dep-edges.js";
import { validateTransitionRecordEnumeration, type TransitionRecordEnumerationResult } from "./transition-record-enumeration.js";
import { queryTransitionDisposition } from "./transition-disposition-query.js";
import { readPairedReferenceOwners } from "./paired-reference-owners.js";
import { readTerminalReferenceAliases } from "./terminal-reference-aliases.js";
import type { ReachableReferenceTransition } from "./reference-reconcile.js";
/** Every reported artifact path resolves only through its already-acquired record. */
export interface StoreReconcilePreparation { context: CurrentWuReconcilePrepareContext; records: readonly StoreRecord[]; byPath: ReadonlyMap<string, StoreRecord> }
/** Acquire complete lifecycle, lineage, and artifact evidence before planning edits. */
export async function createStoreReconcilePrepareContext(store: Store, slug: string): Promise<StoreResult<StoreReconcilePreparation>> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  const acquired = await acquireLifecycleRecords(store, slug);
  if (acquired.status === "refused") return acquired;
  const primary = acquired.result.find((record) => record.reference.kind === "work-item/meta");
  if (primary === undefined) throw new Error("The acquired work-unit group lacks its primary");
  const byPath = new Map<string, StoreRecord>();
  for (const record of acquired.result) {
    const path = lifecycleRecordPath(primary, record);
    if (path !== null) byPath.set(path, record);
  }
  const lineage = await storeLineageEnumeration(store);
  if (lineage.status === "refused") return lineage;
  const aliases = await artifactAliasTransitions(store, acquired.result, view.result.index, lineage.result.aliases);
  if (aliases.status === "refused") return aliases;
  const retiredNames = new Set(lineage.result.aliases.keys());
  if (lineage.result.enumeration.status === "valid") for (const group of lineage.result.enumeration.groups) retiredNames.add(group.origin);
  const artifactOwners = await readPairedReferenceOwners(store, acquired.result, retiredNames);
  if (artifactOwners.status === "refused") return artifactOwners;
  return { status: "ok", result: { records: acquired.result, byPath, context: {
    index: view.result.index,
    additionalReferenceTransitions: aliases.result,
    artifactReferenceOwners: artifactOwners.result,
    enumerateTransitionRecords: () => Promise.resolve(lineage.result.enumeration),
    queryDisposition: async (input) => {
      const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(input.origin) });
      if (lookup.status === "ok" && lookup.result.reference.owner.name !== input.origin) {
        return { status: "unique", disposition: { kind: "retarget", targetSlug: lookup.result.reference.owner.name } };
      }
      if (lookup.status === "refused" && lookup.refusal.code !== "not-found") return { status: "namespace-corrupt" };
      const targets = lookup.status === "refused" ? lineage.result.aliases.get(input.origin) : undefined;
      if (targets !== undefined && targets.length !== 1) return { status: "ambiguous" };
      return queryTransitionDisposition(lineage.result.enumeration, { ...input, origin: targets?.[0] ?? input.origin });
    },
    listArtifactPaths: () => Promise.resolve([...byPath.keys()]),
    readFile: (path) => {
      const record = byPath.get(path);
      if (record === undefined) throw new Error(`Artifact ${path} was not acquired`);
      return Promise.resolve(record.content);
    },
  } } };
}
async function artifactAliasTransitions(store: Store, records: readonly StoreRecord[], index: CurrentWuReconcilePrepareContext["index"], terminalAliases: ReadonlyMap<string, readonly string[]>): Promise<StoreResult<ReachableReferenceTransition[]>> {
  const candidates = artifactAliasCandidates(records);
  const transitions: ReachableReferenceTransition[] = [];
  for (const candidate of candidates) {
    const slug = SlugSchema.safeParse(candidate);
    if (!slug.success || index.has(candidate)) continue;
    const lookup = await store.lookup({ kind: "slug", slug: slug.data });
    if (lookup.status === "refused") {
      if (lookup.refusal.code === "not-found") {
        for (const targetSlug of terminalAliases.get(candidate) ?? []) transitions.push({ subject: candidate, outcome: { kind: "rename", targetSlug } });
        continue;
      }
      return lookup;
    }
    if (lookup.result.reference.kind === "work-item/meta" && lookup.result.reference.owner.name !== candidate) {
      transitions.push({ subject: candidate, outcome: { kind: "rename", targetSlug: lookup.result.reference.owner.name } });
    }
  }
  return { status: "ok", result: transitions };
}
function artifactAliasCandidates(records: readonly StoreRecord[]): Set<string> {
  const candidates = new Set<string>();
  for (const record of records) {
    for (const match of record.content.matchAll(/\b[a-z0-9]+(?:-[a-z0-9]+)*\b/gu)) candidates.add(match[0]);
    for (const match of record.content.matchAll(/[a-z]+-([a-z0-9]+(?:-[a-z0-9]+)*)\.md/gu)) {
      if (match[1] !== undefined) candidates.add(match[1]);
      if (match[0].startsWith("spec-") && match[1] !== undefined && /-(prd|rfc)$/u.test(match[1])) {
        candidates.add(match[1].replace(/-(prd|rfc)$/u, ""));
      }
    }
  }
  return candidates;
}

async function storeLineageEnumeration(store: Store): Promise<StoreResult<{
  enumeration: TransitionRecordEnumerationResult; aliases: ReadonlyMap<string, readonly string[]>;
}>> {
  const listing = await store.list({ family: "lineage", kind: "lineage/transition" });
  if (listing.status === "refused") return listing;
  if (listing.result.status === "absent") return { status: "ok", result: { enumeration: { status: "valid", groups: [] }, aliases: new Map() } };
  if (listing.result.status !== "complete" || listing.result.missed || listing.result.diagnostics.length > 0) {
    return { status: "ok", result: { enumeration: { status: "namespace-corrupt" }, aliases: new Map() } };
  }
  const enumeration = validateTransitionRecordEnumeration(listing.result.records.map((record) => ({
    filename: `${record.reference.owner.name}.json`, mode: "100644", type: "blob", content: Buffer.from(record.content),
  })));
  if (enumeration.status !== "valid") return { status: "ok", result: { enumeration, aliases: new Map() } };
  const aliases = await readTerminalReferenceAliases(store, listing.result.records);
  return aliases.status === "refused" ? aliases : { status: "ok", result: { enumeration, aliases: aliases.result } };
}
