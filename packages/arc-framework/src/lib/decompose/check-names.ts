/** Shared work-item and cohort namespace admission for additive decomposition. */
import type { Store } from "../store/contract.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { parseCohortDocument } from "../store/kinds/cohort/index.js";
import { SlugSchema } from "../kernel/index.js";

/** One cohort's authoritative path and mutation basis. */
export interface DecomposeCohortObservation { path: string; record: StoreRecord }

/** Cohort observations retained for topology and Purpose validation. */
export interface DecomposeNames {
  cohorts: readonly DecomposeCohortObservation[];
  newCohorts: readonly { path: string; locus: string }[];
}
interface AcquiredName { name: string; locus: string; cohort: boolean }

/** Prove each acquired name free before planning any creation. */
export async function checkDecomposeNames(store: Store, map: CutMap): Promise<DecomposeResult<DecomposeNames>> {
  const cohorts = await acquireCohorts(store);
  if (cohorts.status === "refused") return cohorts;
  const newCohorts = placementCohorts(map.authoring.placement).filter(({ path }) =>
    !cohorts.result.some(cohort => cohort.path === path && cohort.record.placement?.kind !== "completed"));
  const names = [
    ...map.authoring.destinations.flatMap((destination, index) => destination.kind === "new-member"
      ? [{ name: destination.slug, locus: `authoring.destinations.${index}.slug`, cohort: false }] : []),
    ...newCohorts.map(({ path, locus }) => ({ name: path.split("/").at(-1) ?? path, locus, cohort: true })),
  ];
  const originName = names.find(named => named.cohort && named.name === map.machine.origin.slug);
  if (originName !== undefined) return { status: "refused", reason: "cohort-origin-name", class: "recoverable",
    locus: originName.locus, message: "The live origin holds its own name during the additive batch.",
    remedy: { text: "Choose another cohort name in the map, then retry." } };
  const seen = new Set<string>();
  for (const named of names) {
    if (seen.has(named.name)) return nameCollision(named.name, named.locus, "another name in the map");
    seen.add(named.name);
  }
  for (const named of names) {
    const refusal = await checkNamespaceName(store, named, cohorts.result);
    if (refusal !== undefined) return refusal;
  }
  return { status: "ok", result: { cohorts: cohorts.result, newCohorts } };
}

async function checkNamespaceName(store: Store, named: AcquiredName,
  cohorts: readonly DecomposeCohortObservation[]): Promise<DecomposeRefusal | undefined> {
  const held = cohorts.find(({ record }) => record.reference.owner.name === named.name
    && (named.cohort || record.placement?.kind !== "completed"));
  if (held !== undefined) return nameCollision(named.name, named.locus, "a cohort document");
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(named.name) });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found" ? undefined : decomposeStoreRefusal(lookup.refusal);
  const holder = await store.read({ reference: lookup.result.reference });
  if (holder.status === "refused") return decomposeStoreRefusal(holder.refusal);
  if (holder.result.reference.owner.name !== named.name || holder.result.placement?.kind !== "completed") {
    return nameCollision(named.name, named.locus, holder.result.reference.owner.name === named.name
      ? "a live work item" : "a former slug");
  }
  return undefined;
}

function placementCohorts(placement: CutMap["authoring"]["placement"]): { path: string; locus: string }[] {
  if (placement.kind === "direct-member" || placement.kind === "at-cap") return [];
  const paths = placement.kind === "cohort" ? [placement.cohort] : [placement.cohort.split("/")[0] ?? placement.cohort, placement.cohort];
  return paths.map(path => ({ path, locus: "authoring.placement.cohort" }));
}

function nameCollision(name: string, locus: string, holder: string): DecomposeRefusal {
  return { status: "refused", reason: "name-collision", class: "recoverable", locus,
    message: `${JSON.stringify(name)} is held by ${holder}.`, remedy: { text: "Choose another name at the named map locus, then retry." } };
}

async function acquireCohorts(store: Store): Promise<DecomposeResult<DecomposeCohortObservation[]>> {
  const listed = await store.list({ family: "cohort", kind: "cohort/document" });
  if (listed.status === "refused") return decomposeStoreRefusal(listed.refusal);
  const listing = listed.result;
  if (listing.status === "unreadable") return { status: "refused", reason: "inventory-incomplete", class: "recoverable",
    locus: "cohort-inventory", message: listing.condition, remedy: listing.remedy };
  if (listing.status === "absent") return { status: "ok", result: [] };
  if (listing.missed || listing.diagnostics.length > 0) return { status: "refused", reason: "inventory-incomplete", class: "recoverable",
    locus: "cohort-inventory", message: listing.diagnostics.map(item => item.condition).join("\n") || "Cohort inventory missed records.",
    remedy: listing.diagnostics.length === 1 && listing.diagnostics[0] !== undefined ? listing.diagnostics[0].remedy
      : { text: listing.diagnostics.map(item => item.remedy.text).join("\n") || "Restore a complete cohort inventory, then retry." } };
  const cohorts: DecomposeCohortObservation[] = [];
  for (const record of listing.records) {
    const parsed = parseCohortDocument(record.content);
    if (!parsed.success) return { status: "refused", reason: "inventory-incomplete", class: "recoverable",
      locus: "cohort-inventory", message: `${record.reference.owner.name}: ${parsed.error}`,
      remedy: { text: "Repair the named cohort document through write-back, then retry." } };
    cohorts.push({ record, path: parsed.data.parent === null ? record.reference.owner.name
      : `${parsed.data.parent}/${record.reference.owner.name}` });
  }
  return { status: "ok", result: cohorts };
}
