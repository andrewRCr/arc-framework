/** Prepare one selected stored map without deriving identity from mutable names. */
import type { Store, HistoryEntry } from "../store/contract.js";
import type { Mutation } from "../store/write.js";
import { recordReferences, OwnerIdentitySchema, type RecordReference } from "../store/identity.js";
import { compareStoredCutOwnerBirths, type StoredCutMap, type StoredCutOwnerBirth } from "../store/kinds/cut-map/schema.js";
import type { CutMap } from "./cut-map-schema.js";
import type { DecomposeResult, DecomposeRefusal } from "./refusal.js";
import { SlugSchema } from "../kernel/index.js";
import { acquireDecomposeMapHistory, deriveDecomposeBirthKey, resolveDecomposeOwnerBirth, unavailableDecomposeBirth } from "./owner-birth-history.js";
import { decomposeStoreRefusal } from "./refusal.js";

/** All cohort names still used by the selected placement, including a reused parent. */
export function decomposeSelectedCohortNames(map: CutMap): ReadonlySet<string> {
  return new Set(decomposeSelectedCohortPaths(map).flatMap(path => path.split("/").slice(-1)));
}

/** Full placement paths keep current eligibility independent of immutable birth names. */
export function decomposeSelectedCohortPaths(map: CutMap): readonly string[] {
  const placement = map.authoring.placement;
  const path = placement.kind === "direct-member" ? null : placement.kind === "at-cap" ? placement.parent : placement.cohort;
  return path?.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/")) ?? [];
}

/** Preserve retained keys and derive only fresh primary bindings from the acquired prior history. */
export async function prepareDecomposeStoredMap(store: Pick<Store, "history" | "read">, reference: RecordReference,
  map: CutMap, writes: readonly Mutation[], prior?: StoredCutMap): Promise<DecomposeResult<StoredCutMap>> {
  const history = await acquireDecomposeMapHistory(store, reference, true);
  if (history.status === "refused") return history;
  const cohorts = decomposeSelectedCohortNames(map);
  const members = new Set(map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []));
  const bindings = (prior?.ownerBirths ?? []).filter(birth => (birth.kind === "work-item/meta" ? members : cohorts).has(birth.name));
  const retained = await checkRetainedCohorts(store, bindings, history.result);
  if (retained !== undefined) return retained;
  const needed: Pick<StoredCutOwnerBirth, "kind" | "name">[] = [...members].map(name => ({ kind: "work-item/meta", name: SlugSchema.parse(name) }));
  for (const write of writes) {
    if (write.action === "put" && write.expected === null && write.reference.kind === "cohort/document") {
      needed.push({ kind: "cohort/document", name: write.reference.owner.name });
    }
  }
  for (const birth of needed) {
    if (bindings.some(binding => binding.kind === birth.kind && binding.name === birth.name)) continue;
    const key = deriveDecomposeBirthKey(reference, birth, history.result);
    if (key.status === "refused") return key;
    bindings.push({ ...birth, birthKey: key.result });
  }
  return { status: "ok", result: { schemaVersion: 1, map, ownerBirths: bindings.sort(compareStoredCutOwnerBirths) } };
}

async function checkRetainedCohorts(store: Pick<Store, "read">, bindings: readonly StoredCutOwnerBirth[],
  history: readonly HistoryEntry[]): Promise<DecomposeRefusal | undefined> {
  for (const binding of bindings) {
    if (binding.kind !== "cohort/document") continue;
    const birth = resolveDecomposeOwnerBirth(binding, history);
    if (birth.status === "refused") return birth;
    const selected = await store.read({ reference: recordReferences["cohort/document"](
      OwnerIdentitySchema.parse({ type: "cohort", name: binding.name, uid: birth.result })) });
    if (selected.status === "refused" && selected.refusal.code !== "not-found") return decomposeStoreRefusal(selected.refusal);
    if (selected.status === "refused" || selected.result.placement?.kind === "completed") {
      return unavailableDecomposeBirth(binding.name, "A retained cut-owned cohort generation is gone; drop its declaration before adding another generation in a later revision.");
    }
  }
  return undefined;
}
