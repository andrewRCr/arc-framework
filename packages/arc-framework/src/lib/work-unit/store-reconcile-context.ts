/** Complete store-backed context and version bases for current-work-unit reconciliation. */
import { readWorkUnit } from "../store/lifecycle-write.js";
import { createDependencyResolver } from "./side-effects/store-dependency-resolution.js";
import { SlugSchema, type Slug } from "../kernel/index.js";
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { StoreResult } from "../store/refusal.js";
import { sameOwner, sameReference, type OwnerIdentity, type RecordReference } from "../store/identity.js";
import type { WorkItemRef } from "../store/kinds/lineage/schema.js";
import { readLifecycleView } from "../store/lifecycle-view.js";
import { requireCompleteInventory } from "../store/lifecycle-storage.js";
import { lifecycleRecordPath } from "../store/lifecycle-record-path.js";
import { acquireLifecycleRecords } from "./prepared-lifecycle-write.js";
import type { CurrentWuReconcilePrepareContext } from "./side-effects/discharge-dep-edges.js";
import { validateTransitionRecordEnumeration, type TransitionRecordEnumerationResult } from "./transition-record-enumeration.js";
import { queryTransitionDisposition, type TransitionDispositionQuery, type TransitionDispositionQueryResult } from "./transition-disposition-query.js";
import { readPairedReferenceOwners } from "./paired-reference-owners.js";
import { readTerminalReferenceAliases } from "./terminal-reference-aliases.js";
import type { ReachableReferenceTransition } from "./reference-reconcile.js";
/** Every reported artifact path resolves only through its already-acquired record. */
export interface StoreReconcilePreparation { primary: StoreRecord; context: CurrentWuReconcilePrepareContext; records: readonly StoreRecord[]; byPath: ReadonlyMap<string, StoreRecord> }
/** Acquire complete lifecycle, lineage, and artifact evidence before planning edits. */
export async function createStoreReconcilePrepareContext(store: Store, slug: string, reference?: RecordReference): Promise<StoreResult<StoreReconcilePreparation>> {
  const view = await readLifecycleView(store);
  if (view.status === "refused") return view;
  requireCompleteInventory(store, view.result.listing);
  const selected = reference === undefined ? await readWorkUnit(store, slug) : { status: "ok" as const, result: { reference } };
  if (selected.status === "refused") return selected;
  const acquired = await acquireLifecycleRecords(store, selected.result.reference);
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
  return { status: "ok", result: { primary, records: acquired.result, byPath, context: {
    index: view.result.index,
    resolveDependency: createDependencyResolver(store, view.result.entries, primary.reference),
    additionalReferenceTransitions: aliases.result,
    artifactReferenceOwners: artifactOwners.result,
    enumerateTransitionRecords: () => Promise.resolve(lineage.result.enumeration),
    queryDisposition: async (input) => {
      if (input.reference?.uid !== undefined) {
        const exact = await queryUidDisposition(store, primary.reference.owner, input);
        return exact.status === "ok" ? exact.result : { status: exact.refusal.code === "ambiguous-match" ? "ambiguous" : "namespace-corrupt" };
      }
      const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(input.origin) });
      if (lookup.status === "ok" && lookup.result.reference.owner.name !== input.origin) {
        return { status: "unique", disposition: { kind: "retarget", targetSlug: lookup.result.reference.owner.name } };
      }
      if (lookup.status === "refused" && lookup.refusal.code !== "not-found") return { status: "namespace-corrupt" };
      const disposition = lookup.status === "refused"
        ? await queryRetiredOriginDisposition(store, primary.reference.owner, lineage.result, input)
        : await queryStoreDisposition(store, primary.reference.owner, lineage.result.enumeration, input);
      return disposition.status === "ok" ? disposition.result
        : { status: disposition.refusal.code === "ambiguous-match" ? "ambiguous" : "namespace-corrupt" };
    },
    listArtifactPaths: () => Promise.resolve([...byPath.keys()]),
    readFile: (path) => {
      const record = byPath.get(path);
      if (record === undefined) throw new Error(`Artifact ${path} was not acquired`);
      return Promise.resolve(record.content);
    },
  } } };
}
async function queryStoreDisposition(store: Store, dependentOwner: OwnerIdentity, enumeration: TransitionRecordEnumerationResult,
  input: TransitionDispositionQuery): Promise<StoreResult<TransitionDispositionQueryResult>> {
  if (enumeration.status !== "valid") return { status: "ok", result: { status: "namespace-corrupt" } };
  const group = enumeration.groups.find(({ origin }) => origin === input.origin);
  const record = group?.records.length === 1 ? group.records[0] : undefined;
  if (record?.kind !== "decompose") {
    const result = queryTransitionDisposition(enumeration, input);
    return { status: "ok", result: result.status === "unique" && result.disposition.kind === "retarget" && record !== undefined
      ? { ...result, disposition: { ...result.disposition, references: record.successors } } : result };
  }
  const matches = new Set<string>();
  for (const { dependent } of record.incoming) {
    const match = await readDependentMatch(store, dependentOwner, input.dependentSlug, dependent);
    if (match.status === "refused") return match;
    if (match.result) matches.add(dependent.name);
  }
  const result = queryTransitionDisposition(enumeration, input, (dependent) => matches.has(dependent.name));
  const edge = record.incoming.find(({ dependent }) => matches.has(dependent.name));
  return { status: "ok", result: result.status === "unique" && result.disposition.kind === "replace" && edge?.disposition.kind === "replace"
    ? { ...result, disposition: { ...result.disposition, references: edge.disposition.replacementTargets } } : result };
}
async function queryUidDisposition(store: Store, dependent: OwnerIdentity, input: TransitionDispositionQuery): Promise<StoreResult<TransitionDispositionQueryResult>> {
  const uid = input.reference?.uid;
  if (uid === undefined) throw new Error("Exact lineage query requires a UID");
  const lookup = await store.lookup({ kind: "lineage", origin: uid });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found" ? { status: "ok", result: { status: "absent" } } : lookup;
  const read = await store.read({ reference: lookup.result.reference });
  if (read.status === "refused") return read;
  const record = read.result, owner = record.reference.owner;
  if (record.conflicts.length > 0) return { status: "ok", result: { status: "ambiguous" } };
  if (record.reference.kind !== "lineage/transition" || owner.type !== "work-item" || owner.uid !== uid
    || !sameReference(record.reference, lookup.result.reference)) {
    return { status: "ok", result: { status: "namespace-corrupt" } };
  }
  const enumeration = validateTransitionRecordEnumeration([{ filename: `${owner.name}.json`, mode: "100644", type: "blob", content: Buffer.from(record.content) }]);
  if (enumeration.status === "valid" && enumeration.groups.some(group => group.origin !== owner.name
    || group.records.some(lineage => lineage.origin.uid !== undefined && lineage.origin.uid !== uid))) {
    return { status: "ok", result: { status: "namespace-corrupt" } };
  }
  return queryStoreDisposition(store, dependent, enumeration, { ...input, origin: owner.name });
}
async function readDependentMatch(store: Store, owner: OwnerIdentity, slug: string, dependent: WorkItemRef): Promise<StoreResult<boolean>> {
  if (dependent.uid !== undefined && owner.type === "work-item" && owner.uid !== undefined) {
    return { status: "ok", result: dependent.uid === owner.uid };
  }
  if (dependent.name === slug) return { status: "ok", result: true };
  const lookup = await store.lookup({ kind: "slug", slug: dependent.name });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found" ? { status: "ok", result: false } : lookup;
  return { status: "ok", result: lookup.result.reference.kind === "work-item/meta" && sameOwner(lookup.result.reference.owner, owner) };
}
async function artifactAliasTransitions(store: Store, records: readonly StoreRecord[], index: CurrentWuReconcilePrepareContext["index"], terminalAliases: ReadonlyMap<string, readonly string[]>): Promise<StoreResult<ReachableReferenceTransition[]>> {
  const candidates = artifactAliasCandidates(records);
  const transitions: ReachableReferenceTransition[] = [];
  for (const candidate of candidates) {
    const slug = SlugSchema.safeParse(candidate);
    if (!slug.success || index.has(candidate)) continue;
    const resolved = await artifactAliasLookup(store, slug.data, terminalAliases.get(candidate) ?? []);
    if (resolved.status === "refused") return resolved;
    transitions.push(...resolved.result);
  }
  return { status: "ok", result: transitions };
}
async function artifactAliasLookup(store: Store, slug: Slug, retiredTargets: readonly string[]): Promise<StoreResult<ReachableReferenceTransition[]>> {
  const lookup = await store.lookup({ kind: "slug", slug });
  if (lookup.status === "refused") {
    if (lookup.refusal.code === "ambiguous-match") return { status: "ok", result: [] };
    if (lookup.refusal.code !== "not-found") return lookup;
    return { status: "ok", result: retiredTargets.map(targetSlug => ({ subject: slug, outcome: { kind: "rename", targetSlug } })) };
  }
  const reference = lookup.result.reference;
  return { status: "ok", result: reference.kind === "work-item/meta" && reference.owner.name !== slug
    ? [{ subject: slug, outcome: { kind: "rename", targetSlug: reference.owner.name } }] : [] };
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

/** Authenticated terminal transitions and former names from one complete lineage inventory. */
export interface StoreLineageEnumeration {
  enumeration: TransitionRecordEnumerationResult; aliases: ReadonlyMap<string, readonly string[]>;
}
/** Acquire the lineage inventory shared by reconciliation and advisory dependency views. */
export async function storeLineageEnumeration(store: Store): Promise<StoreResult<StoreLineageEnumeration>> {
  const listing = await store.list({ family: "lineage", kind: "lineage/transition" });
  if (listing.status === "refused") return listing;
  if (listing.result.status === "absent") return { status: "ok", result: { enumeration: { status: "valid", groups: [] }, aliases: new Map() } };
  if (listing.result.status === "unreadable") return { status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: "lineage",
    condition: listing.result.condition, remedy: listing.result.remedy,
  } };
  if (listing.result.diagnostics.length > 0) return { status: "refused", refusal: {
    code: "namespace-corrupt", class: "terminal", namespace: "lineage",
    condition: listing.result.diagnostics.map(diagnostic => `${diagnostic.key}: ${diagnostic.condition}`).join(" "),
    remedy: { text: listing.result.diagnostics.map(diagnostic => diagnostic.remedy.text).join(" ") },
  } };
  if (listing.result.missed) {
    return { status: "ok", result: { enumeration: { status: "namespace-corrupt" }, aliases: new Map() } };
  }
  const enumeration = validateTransitionRecordEnumeration(listing.result.records.map((record) => ({
    filename: `${record.reference.owner.name}.json`, mode: "100644", type: "blob", content: Buffer.from(record.content),
  })));
  if (enumeration.status !== "valid") return { status: "ok", result: { enumeration, aliases: new Map() } };
  const aliases = await readTerminalReferenceAliases(store, listing.result.records);
  return aliases.status === "refused" ? aliases : { status: "ok", result: { enumeration, aliases: aliases.result } };
}

/** Query a missing origin using authenticated identities, retaining any store refusal's repair evidence. */
export async function queryRetiredOriginDisposition(
  store: Store, dependent: OwnerIdentity, lineage: StoreLineageEnumeration, input: TransitionDispositionQuery,
): Promise<StoreResult<TransitionDispositionQueryResult>> {
  const targets = lineage.aliases.get(input.origin);
  if (targets !== undefined && targets.length !== 1) return { status: "ok", result: { status: "ambiguous" } };
  return queryStoreDisposition(store, dependent, lineage.enumeration, { ...input, origin: targets?.[0] ?? input.origin });
}
