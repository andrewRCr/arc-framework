/** Atomic admission of selected bindings against backend allocation evidence. */
import { CreatedOwnersSchema, type CreatedOwner } from "../../creation-receipt.js";
import { OwnerIdentitySchema, recordReferences } from "../../identity.js";
import type { Store, HistoryEntry } from "../../contract.js";
import type { WriteCheckInput, BrokenRule } from "../../write-check.js";
import type { StoredCutMap, StoredCutOwnerBirth } from "./schema.js";
import { cutMapBindingFailure } from "./observed-groups.js";
import { acquireDecomposeMapHistory, deriveDecomposeBirthKey, resolveDecomposeOwnerBirth,
  unavailableDecomposeBirth } from "../../../decompose/owner-birth-history.js";
import { decomposeSelectedCohortNames } from "../../../decompose/owner-birth-bindings.js";
import type { DecomposeResult, DecomposeRefusal } from "../../../decompose/refusal.js";

/** Require new bindings, fresh primaries and changed wrapper bytes to publish together. */
export async function checkStoredCutBirths(input: WriteCheckInput, store: Pick<Store, "history">,
  next: StoredCutMap, prior?: StoredCutMap): Promise<readonly BrokenRule[]> {
  const inventory = input.proposedCreatedOwners === undefined ? undefined : CreatedOwnersSchema.safeParse(input.proposedCreatedOwners);
  if (inventory?.success === false) return invalid(`Backend proposedCreatedOwners is malformed: ${inventory.error.message}`);
  const candidates = inventory?.success === true ? inventory.data : undefined;
  const coverage = checkBindingCoverage(next, prior, candidates);
  if (coverage !== undefined) return invalid(coverage);
  const history = await acquireDecomposeMapHistory(store, input.reference, true);
  if (history.status === "refused") return domainFailure(history);
  for (const binding of next.ownerBirths) {
    const old = prior?.ownerBirths.find(birth => birth.kind === binding.kind && birth.name === binding.name);
    const uid = bindingUid(input, binding, old, candidates, history.result);
    if (uid.status === "refused") return domainFailure(uid);
    const primary = await checkPrimary(input, binding, uid.result);
    if (primary.length > 0) return primary;
  }
  return [];
}

function checkBindingCoverage(next: StoredCutMap, prior: StoredCutMap | undefined,
  candidates: readonly CreatedOwner[] | undefined): string | undefined {
  const cohorts = decomposeSelectedCohortNames(next.map);
  const members = new Set(next.map.authoring.destinations.flatMap(destination => destination.kind === "new-member" ? [destination.slug] : []));
  for (const old of prior?.ownerBirths ?? []) {
    if (!(old.kind === "work-item/meta" ? members : cohorts).has(old.name)) continue;
    if (!next.ownerBirths.some(birth => birth.kind === old.kind && birth.name === old.name && birth.birthKey === old.birthKey)) {
      return `Retained cut-owned ${old.name} must preserve its exact birth binding.`;
    }
  }
  for (const candidate of candidates ?? []) {
    const relevant = candidate.kind === "cohort/document" ? cohorts.has(candidate.owner.name) : members.has(candidate.owner.name);
    if (relevant && !next.ownerBirths.some(birth => birth.kind === candidate.kind && birth.name === candidate.owner.name)) {
      return `Fresh cut owner ${candidate.owner.name} needs a matching stored binding.`;
    }
  }
  return undefined;
}

function bindingUid(input: WriteCheckInput, binding: StoredCutOwnerBirth, old: StoredCutOwnerBirth | undefined,
  candidates: readonly CreatedOwner[] | undefined, history: readonly HistoryEntry[]): DecomposeResult<string> {
  const fresh = candidates?.filter(birth => birth.kind === binding.kind && birth.owner.name === binding.name);
  if (old !== undefined) {
    if (fresh !== undefined && fresh.length > 0) return bindingFailure(binding, `Retained binding ${binding.name} cannot create another owner generation.`);
    return resolveDecomposeOwnerBirth(old, history);
  }
  if (fresh === undefined) return { ...unavailableDecomposeBirth(binding.name, "Backend proposedCreatedOwners is unavailable for new cut bindings."),
    remedy: { text: "Repair or upgrade this provider to supply complete proposedCreatedOwners, then prepare a fresh preview and obtain approval." } };
  const candidate = fresh[0];
  if (fresh.length !== 1 || candidate === undefined) return bindingFailure(binding, `New binding ${binding.name} needs exactly one backend candidate birth.`);
  const derived = deriveDecomposeBirthKey(input.reference, binding, history);
  if (derived.status === "refused") return derived;
  if (binding.birthKey !== derived.result || input.next?.content === undefined || input.next.content === input.prior?.content) {
    return bindingFailure(binding, `New binding ${binding.name} must use complete pinned before-history and change the stored wrapper.`);
  }
  return { status: "ok", result: candidate.owner.uid };
}

async function checkPrimary(input: WriteCheckInput, binding: StoredCutOwnerBirth, uid: string): Promise<readonly BrokenRule[]> {
  const owner = OwnerIdentitySchema.parse({ type: binding.kind === "cohort/document" ? "cohort" : "work-item", name: binding.name, uid });
  const primary = await input.after.read({ reference: recordReferences[binding.kind](owner) });
  if (primary.status === "refused") return cutMapBindingFailure(primary.refusal.condition, primary.refusal.remedy);
  if (primary.result.reference.kind !== binding.kind || primary.result.reference.owner.type === "person"
    || primary.result.reference.owner.uid !== uid || primary.result.placement?.kind === "completed") {
    return invalid(`Selected binding ${binding.name} does not name its proved live primary.`);
  }
  return [];
}

function bindingFailure(binding: StoredCutOwnerBirth, message: string): DecomposeRefusal {
  return { ...unavailableDecomposeBirth(binding.name, message), remedy: bindingRemedy };
}

const bindingRemedy = { text: "Preserve retained owner bindings, or drop the ended declaration before adding it in a later revision; prepare a fresh preview and obtain approval." };

function invalid(condition: string): readonly BrokenRule[] {
  return cutMapBindingFailure(condition, bindingRemedy);
}

function domainFailure(refusal: DecomposeRefusal): readonly BrokenRule[] {
  return cutMapBindingFailure(refusal.message ?? refusal.remedy.text, refusal.remedy);
}
