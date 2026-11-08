/** Shared store-dependent preparation for live callers and atomic projection admission. */
import type { WriteCheckInput } from "../write-check.js";
import type { KindId } from "../catalog.js";
import type { KindDefinition } from "../registry.js";
import { StoreRefusalError, type StoreResult } from "../refusal.js";
import type { Store } from "../contract.js";
import { RetainedBaseUnavailable } from "./taken-in.js";
import type { Mutation, RecordObservation } from "../write.js";
import type { ProjectionAdmission } from "../projection-admission.js";
import { recordReferences, type RecordReference } from "../identity.js";
import { RecordEntrySchema } from "./index-schema.js";
import { readProjectionEditRights } from "./rights.js";
import { createProjectionPreparationView, projectionAdmissionConflict } from "./preparation-view.js";
import { selectProjectionAdmissionSubject, type ProjectionPreparationRequest } from "./admission-selection.js";
import { prepareCapturedWriteBack, type WriteBackContext } from "./write-back.js";
import { prepareAdoptedContent } from "./check-edit.js";
import { readBaseContent } from "./base-content.js";
import { gitBlobId } from "./blob-id.js";
import type { TakeInRequest } from "./take-in-port.js";

/** Ready submission and the exact decision evidence atomic admission must reproduce. */
export interface ProjectionWritePlan {
  readonly mutation: Extract<Mutation, { action: "put" }>;
  readonly prepared: ProjectionAdmission["prepared"];
  readonly observations: RecordObservation[];
}

/** Derive one content put entirely from frozen local data and the supplied before view. */
export async function planProjectionWrite(before: WriteCheckInput["before"], request: ProjectionPreparationRequest,
  registry: Readonly<Record<KindId, KindDefinition>>): Promise<StoreResult<ProjectionWritePlan>> {
  const view = createProjectionPreparationView(before, request.input.format);
  let selected: Awaited<ReturnType<typeof selectProjectionAdmissionSubject>>;
  try { selected = await selectProjectionAdmissionSubject(selectorStore(view.store), request); }
  catch (error) { if (error instanceof StoreRefusalError) return { status: "refused", refusal: error.refusal }; throw error; }
  if (selected.status === "refused") return selected;
  const reference = selected.result;
  const rights = await readProjectionEditRights({ store: view.store, reference, identity: request.editingIdentity, checkout: ".", local: request.local });
  if (rights.status === "refused") return rights;
  if (rights.result.kind !== "editable") return { status: "refused", refusal: projectionAdmissionConflict(reference,
    "The captured edit is protected under the current ownership, lifecycle or checkout claim.") };
  if (reference.owner.type === "project") {
    const project = await view.store.read({ reference: recordReferences["project-registry/identity"](reference.owner) });
    if (project.status === "refused") return project;
  }
  const context = preparationContext(view.store, request, registry);
  const planned = request.selection.kind === "unindexed" ? await planAdoption(context, request, reference)
    : await planIndexed(context, request);
  if (planned.status === "refused") return planned;
  const failure = view.failure();
  return failure ? { status: "refused", refusal: failure } : { status: "ok", result: { ...planned.result,
    prepared: { ...planned.result.prepared, historicalInputs: view.historicalInputs() }, observations: view.observations() } };
}

function preparationContext(store: WriteBackContext["store"], request: ProjectionPreparationRequest,
  registry: Readonly<Record<KindId, KindDefinition>>): WriteBackContext {
  return { store, registry, format: request.input.format, actor: request.editingIdentity,
    location: { gitDir: "", commonDir: "", stateDir: "", primary: false }, recoveringBase: request.input.recoveringBase,
    readCopy: name => {
      const copy = request.input.retainedBases.find(each => each.name === name);
      return copy ? Promise.resolve(copy.content)
        : Promise.reject(new RetainedBaseUnavailable(new Error(`Captured retained base ${name} is missing`)));
    } };
}

type PlanBody = Omit<ProjectionWritePlan, "observations">;

async function planAdoption(context: WriteBackContext, request: ProjectionPreparationRequest, reference: RecordReference): Promise<StoreResult<PlanBody>> {
  const current = await context.store.read({ reference });
  if (current.status === "ok") return { status: "refused", refusal: projectionAdmissionConflict(reference, "The adopted record already exists; attach it and prepare again.") };
  if (current.refusal.code !== "not-found") return current;
  if (["work-item/meta", "work-item/record", "cohort/document"].includes(reference.kind)) return { status: "refused", refusal: projectionAdmissionConflict(reference,
    "A content adoption cannot mint a primary or cohort owner.") };
  const checked = await prepareAdoptedContent(context, reference, request.input.file.content);
  const invalid = checked.refusals[0];
  if (invalid) return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference,
    rule: "projection.content", condition: invalid.reason, remedy: invalid.remedy } };
  return { status: "ok", result: { mutation: { action: "put", reference, expected: null, content: checked.content },
    prepared: { reference, selectedBase: { kind: "empty" }, stamp: null, takenIn: checked.content, retained: null, historicalInputs: [] } } };
}

async function planIndexed(context: WriteBackContext, input: ProjectionPreparationRequest): Promise<StoreResult<PlanBody>> {
  const basis = input.input.basis;
  if (!basis || !input.input.base) throw new Error("Validated indexed preparation lacks its captured basis");
  const { adoption, ...fields } = basis;
  const entry = RecordEntrySchema.parse({ ...fields, ...(adoption === null ? {} : { adoption }), kind: "record",
    stat: null, protected: false, changed: false, pending: false, withheld: false, refused: null });
  const request: TakeInRequest = { checkout: ".", path: input.local.path, copy: input.local.source === "aside" ? "captured-aside" : null,
    entry, base: input.input.base, observedEdit: true,
    ...(input.input.rendering === null ? {} : { rendering: input.input.rendering }),
    ...(input.input.resolution === null ? {} : { resolution: input.input.resolution }) };
  const file = input.input.file;
  const prepared = await prepareCapturedWriteBack(context, request, { kind: "read", content: file.content, stamp: file.stamp,
    read: { stat: { type: "file", size: BigInt(Buffer.byteLength(file.content)), ino: 0n, mtimeNs: BigInt(file.mtimeNs) },
      blob: gitBlobId(file.content, context.format) } });
  if (prepared.kind !== "ready") return { status: "refused", refusal: prepared.kind === "held" && prepared.refusal
    ? prepared.refusal : projectionAdmissionConflict(entry.reference, "Fresh preparation no longer produces a ready content write.") };
  const selected = prepared.selectedBase;
  const content = await readBaseContent(context, entry, selected);
  if (content.status === "refused") return content;
  const mutation = preparedMutation(prepared.write);
  return { status: "ok", result: { mutation, prepared: { reference: mutation.reference,
    selectedBase: selected.kind === "stored" ? { kind: "stored", version: selected.version, blob: gitBlobId(content.result, context.format) }
      : selected.kind === "copy" ? { kind: "copy", blob: gitBlobId(selected.content, context.format) } : { kind: "empty" },
    stamp: prepared.stamp, takenIn: prepared.takenIn, retained: prepared.retained ?? null, historicalInputs: [] } } };
}

function preparedMutation(write: Extract<Mutation, { action: "put" }>): Extract<Mutation, { action: "put" }> {
  return { action: write.action, reference: write.reference, content: write.content, expected: write.expected,
    ...(write.placement === undefined ? {} : { placement: write.placement }),
    ...(write.links === undefined ? {} : { links: write.links }),
    ...(write.resolves === undefined ? {} : { resolves: write.resolves }) };
}

function selectorStore(store: Store): Store {
  const checked = <T>(result: StoreResult<T>): StoreResult<T> => {
    if (result.status === "refused" && result.refusal.code !== "not-found") throw new StoreRefusalError(result.refusal);
    return result;
  };
  return { ...store, read: async input => checked(await store.read(input)),
    list: async input => checked(await store.list(input)), lookup: async input => checked(await store.lookup(input)) };
}
