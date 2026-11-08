/** Validate and replay a prepared content write inside the backend's atomic admission. */
import type { BatchInput, Mutation } from "../write.js";
import type { KindDefinition } from "../registry.js";
import type { KindId } from "../catalog.js";
import type { StoreRefusal } from "../refusal.js";
import type { WriteCheckInput } from "../write-check.js";
import type { RecordReference } from "../identity.js";
import { canonicalRecordObservations, checkRecordObservations } from "../record-observations.js";
import { isExcludedProjectionPath } from "./discovery-exclusions.js";
import { planProjectionWrite } from "./admission-planner.js";
import { matchesIndexedProjectionAddress } from "./admission-address.js";
import { projectionAdmissionConflict } from "./preparation-view.js";

/** Compare ready decisions against one captured before view without publishing anything. */
export async function checkProjectionAdmission(before: WriteCheckInput["before"], input: BatchInput,
  registry: Readonly<Record<KindId, KindDefinition>>, identity: string | null | undefined): Promise<StoreRefusal | undefined> {
  const request = input.projectionAdmission;
  if (!request) return undefined;
  const mutation = input.writes[0];
  const mismatchedAddress = request.selection.kind === "indexed"
    && !matchesIndexedProjectionAddress(request.local, request.selection.reference);
  if (!mutation || mutation.action !== "put" || input.writes.length !== 1 || identity !== request.editingIdentity || isExcludedProjectionPath(request.local.path) || mismatchedAddress) {
    return { code: "record-malformed", class: "recoverable", rule: "projection.admission",
      condition: "The prepared projection request does not match its projected address, one content put and configured editing identity.",
      remedy: { text: "Restore the projected path and record kind/key binding, configure the editing identity, then prepare this file again." } };
  }
  const observed = await checkRecordObservations(before, input.observations ?? []);
  if (observed.status === "refused") return projectionObservationRefusal(input, observed.refusal);
  const fresh = await planProjectionWrite(before, request, registry);
  if (fresh.status === "refused") return fresh.refusal.code === "record-malformed" && fresh.refusal.rule.startsWith("projection.")
    ? projectionAdmissionConflict(mutation.reference, fresh.refusal.condition) : fresh.refusal;
  if (stable(mutationEvidence(fresh.result.mutation)) !== stable(mutationEvidence(mutation))
    || stable(receiptEvidence(fresh.result.prepared)) !== stable(receiptEvidence(request.prepared))
    || stable(observationEvidence(fresh.result.observations)) !== stable(observationEvidence(input.observations ?? []))) {
    return projectionAdmissionConflict(mutation.reference, "Fresh preparation produces a different mutation, accepted-input basis or evidence.");
  }
  return undefined;
}

/** Tag only projection observation mismatches; preserve native read and namespace refusals. */
export function projectionObservationRefusal(input: BatchInput | undefined, refusal: StoreRefusal): StoreRefusal {
  return input?.projectionAdmission && refusal.code === "version-conflict"
    ? projectionAdmissionConflict(input.projectionAdmission.prepared.reference, refusal.condition, refusal.records) : refusal;
}

function mutationEvidence(mutation: Mutation): unknown {
  return { ...mutation, reference: referenceEvidence(mutation.reference),
    resolves: mutation.resolves?.map(referenceEvidence).sort() ?? [] };
}

function receiptEvidence(receipt: NonNullable<BatchInput["projectionAdmission"]>["prepared"]): unknown {
  return { ...receipt, reference: referenceEvidence(receipt.reference), historicalInputs: receipt.historicalInputs.map(each =>
    ({ ...each, reference: referenceEvidence(each.reference) })).sort((a, b) => Buffer.compare(Buffer.from(stable(a)), Buffer.from(stable(b)))) };
}

function referenceEvidence(reference: RecordReference): string {
  const owner = reference.owner;
  return stable([reference.kind, owner.type, owner.type === "person" ? owner.name : owner.uid ?? owner.name, reference.key ?? null]);
}

function stable(value: unknown): string {
  return JSON.stringify(value, (_key, child: unknown) => {
    if (child !== null && typeof child === "object" && !Array.isArray(child)) {
      return Object.fromEntries(Object.entries(child).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
    }
    return child;
  });
}


function observationEvidence(observations: readonly import("../write.js").RecordObservation[]): unknown {
  return canonicalRecordObservations(observations).map(each => ({ reference: referenceEvidence(each.reference),
    expected: each.expected === null ? null : { version: each.expected.version,
      conflicts: each.expected.conflicts.map(referenceEvidence).sort() } }));
}
