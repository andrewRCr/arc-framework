/** Record-scoped evidence from one read-only preparation over supplied immutable views. */
import type { Store, HistoryEntry } from "../contract.js";
import type { WriteCheckInput } from "../write-check.js";
import type { RecordObservation } from "../write.js";
import type { StoreRefusal, StoreResult } from "../refusal.js";
import { sameReference, type RecordReference } from "../identity.js";
import { canonicalRecordObservations } from "../record-observations.js";
import type { ProjectionAdmission } from "../projection-admission.js";
import { gitBlobId, type ObjectFormat } from "./blob-id.js";

type HistoryInput = ProjectionAdmission["prepared"]["historicalInputs"][number];

/** Captured reads and consumed historical bytes; unused inventory rows remain unobserved. */
export interface ProjectionPreparationView {
  readonly store: Store;
  observations(): RecordObservation[];
  historicalInputs(): HistoryInput[];
  failure(): StoreRefusal | undefined;
  nativeFailure(): StoreRefusal | undefined;
}

/** Preserve an exact prepared-decision conflict without invoking merge-base recovery. */
export function projectionAdmissionConflict(reference: RecordReference, condition: string,
  records: readonly RecordReference[] = []): StoreRefusal {
  const named = [reference, ...records.filter(other => !sameReference(other, reference))];
  return { code: "version-conflict", class: "recoverable", cause: "projection-admission", records: named,
    condition, remedy: { text: "Keep the edit and prepare it again at the next save or command after repairing the changed condition." } };
}

/** Expose only supplied reads while remembering their exact record and historical evidence. */
export function createProjectionPreparationView(before: WriteCheckInput["before"], format: ObjectFormat): ProjectionPreparationView {
  const observations: RecordObservation[] = [];
  const histories: HistoryInput[] = [];
  let failure: StoreRefusal | undefined;
  let nativeFailure: StoreRefusal | undefined;
  const retainFailure = <T>(result: StoreResult<T>): StoreResult<T> => {
    if (result.status === "refused" && result.refusal.code !== "not-found") nativeFailure ??= result.refusal;
    return result;
  };
  const remember = (observation: RecordObservation): void => {
    const existing = observations.find(each => sameReference(each.reference, observation.reference));
    if (existing === undefined) observations.push(observation);
    else if (JSON.stringify(canonicalRecordObservations([existing])) !== JSON.stringify(canonicalRecordObservations([observation]))) {
      failure ??= projectionAdmissionConflict(observation.reference, "Preparation read incompatible versions, presence or conflict sets.");
    }
  };
  const read: Store["read"] = async input => {
    const result = retainFailure(await before.read(input));
    if (input.asOf === undefined) {
      if (result.status === "ok") remember({ reference: result.result.reference,
        expected: { version: result.result.version, conflicts: [...result.result.conflicts] } });
      else if (result.refusal.code === "not-found" && exact(input.reference)) remember({ reference: input.reference, expected: null });
    }
    return failure ? { status: "refused", refusal: failure } : result;
  };
  const history: Store["history"] = async input => {
    const result = retainFailure(await before.history(input));
    return result.status === "refused" ? result : { status: "ok", result: result.result.map(entry =>
      observedHistory(entry, format, histories)) };
  };
  const unavailable = (): Promise<never> => Promise.reject(new Error("Preparation cannot mutate state or query a live state anchor"));
  const store: Store = { capabilities: { stateOffBranch: true }, read, history,
    list: async input => retainFailure(await before.list(input)), lookup: async input => {
      const found = retainFailure(await before.lookup(input));
      if (found.status === "refused") return found;
      const selected = await read({ reference: found.result.reference });
      return selected.status === "refused" ? selected : found;
    }, write: unavailable, batch: unavailable, version: unavailable, changes: unavailable,
    pull: unavailable, push: unavailable, maintain: unavailable };
  return { store, observations: () => canonicalRecordObservations(observations), failure: () => failure, nativeFailure: () => nativeFailure,
    historicalInputs: () => [...histories].sort((a, b) => Buffer.compare(Buffer.from(JSON.stringify(a)), Buffer.from(JSON.stringify(b)))) };
}

function exact(reference: RecordReference): boolean {
  return reference.owner.type === "person" || reference.owner.uid !== undefined;
}

function observedHistory(entry: HistoryEntry, format: ObjectFormat, inputs: HistoryInput[]): HistoryEntry {
  return new Proxy(entry, { get(target, property, receiver): unknown {
    if (property === "content" && target.version !== null && target.content !== null) {
      const observed = { reference: target.reference, version: target.version, blob: gitBlobId(target.content, format) };
      if (!inputs.some(each => sameReference(each.reference, observed.reference) && each.version === observed.version
        && each.blob === observed.blob)) inputs.push(observed);
    }
    return Reflect.get(target, property, receiver);
  } });
}
