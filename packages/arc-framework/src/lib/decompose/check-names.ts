/** Shared work-item and cohort namespace admission for decomposition. */
import type { Store } from "../store/contract.js";
import type { OwnerIdentity } from "../store/identity.js";
import { checkCreationAdmission, renderCreationAdmissionRefusal } from "../store/creation-admission.js";
import type { StoreRecord } from "../store/read.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import { decomposeStoreRefusal } from "./refusal.js";
import { parseCohortDocument } from "../store/kinds/cohort/index.js";
import { SlugSchema } from "../kernel/index.js";
import { checkDecomposeRecordConflicts, DECOMPOSE_SOURCE_CONFLICT_REMEDY } from "./source-conflicts.js";

/** One cohort's authoritative path and mutation basis. */
export interface DecomposeCohortObservation { path: string; record: StoreRecord }

/** Cohort observations retained for topology and Purpose validation. */
export interface DecomposeNames {
  cohorts: readonly DecomposeCohortObservation[];
  newCohorts: readonly { path: string; locus: string }[];
}
interface AcquiredName { name: string; locus: string; cohort: boolean }

/** Prove names free for creation, allowing only authenticated retained member generations. */
export async function checkDecomposeNames(store: Store, map: CutMap, retainedMembers: readonly OwnerIdentity[] = []): Promise<DecomposeResult<DecomposeNames>> {
  const cohorts = await acquireDecomposeCohortInventory(store);
  if (cohorts.status === "refused") return cohorts;
  const conflicts = selectedCohortConflicts(map, cohorts.result);
  if (conflicts !== undefined) return conflicts;
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
    if (seen.has(named.name)) return nameCollision(named.locus, `${JSON.stringify(named.name)} is held by another name in the map.`);
    seen.add(named.name);
  }
  for (const named of names) {
    const refusal = await checkNamespaceName(store, named, cohorts.result, retainedMembers);
    if (refusal !== undefined) return refusal;
  }
  return { status: "ok", result: { cohorts: cohorts.result, newCohorts } };
}

function selectedCohortConflicts(map: CutMap, cohorts: readonly DecomposeCohortObservation[]): DecomposeRefusal | undefined {
  const placement = map.authoring.placement;
  const path = placement.kind === "direct-member" ? null : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  const names = path?.split("/") ?? [];
  const selected = cohorts.filter(({ record }) => record.placement?.kind !== "completed"
    && names.includes(record.reference.owner.name)).map(({ record }) => record);
  return checkDecomposeRecordConflicts(selected, "cohort decision", DECOMPOSE_SOURCE_CONFLICT_REMEDY);
}

async function checkNamespaceName(store: Store, named: AcquiredName,
  cohorts: readonly DecomposeCohortObservation[], retainedMembers: readonly OwnerIdentity[]): Promise<DecomposeRefusal | undefined> {
  if (!named.cohort) {
    const admission = await checkCreationAdmission(store, named.name, retainedMembers);
    if (admission.kind === "free") return undefined;
    const rendered = renderCreationAdmissionRefusal(named.name, admission);
    if (admission.kind === "refused" && admission.refusal !== undefined && !admission.ambiguous) {
      return { ...decomposeStoreRefusal(admission.refusal), message: rendered.condition };
    }
    return nameCollision(named.locus, rendered.condition);
  }
  const held = cohorts.find(({ record }) => record.reference.owner.name === named.name);
  if (held !== undefined) return nameCollision(named.locus, `${JSON.stringify(named.name)} is held by a cohort document.`);
  const lookup = await store.lookup({ kind: "slug", slug: SlugSchema.parse(named.name) });
  if (lookup.status === "refused") return lookup.refusal.code === "not-found" ? undefined : decomposeStoreRefusal(lookup.refusal);
  const holder = await store.read({ reference: lookup.result.reference });
  if (holder.status === "refused") return decomposeStoreRefusal(holder.refusal);
  if (holder.result.reference.owner.name !== named.name || holder.result.placement?.kind !== "completed") {
    return nameCollision(named.locus, `${JSON.stringify(named.name)} is held by ${holder.result.reference.owner.name === named.name
      ? "a live work item" : "a former slug"}.`);
  }
  return undefined;
}

function placementCohorts(placement: CutMap["authoring"]["placement"]): { path: string; locus: string }[] {
  if (placement.kind === "direct-member" || placement.kind === "at-cap") return [];
  const paths = placement.kind === "cohort" ? [placement.cohort] : [placement.cohort.split("/")[0] ?? placement.cohort, placement.cohort];
  return paths.map(path => ({ path, locus: "authoring.placement.cohort" }));
}

function nameCollision(locus: string, condition: string): DecomposeRefusal {
  return { status: "refused", reason: "name-collision", class: "recoverable", locus,
    message: condition, remedy: { text: "Choose another name at the named map locus, then retry." } };
}

/** Acquire the complete parsed cohort inventory without applying a consumer's admission policy. */
export async function acquireDecomposeCohortInventory(store: Store): Promise<DecomposeResult<DecomposeCohortObservation[]>> {
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
